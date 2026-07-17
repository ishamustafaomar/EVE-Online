/**
 * StarweftClient: typed client over protocol v1 (docs 10, 11 §3). Commands
 * return promises resolved by the server's ACK; world state arrives as a
 * normalized event stream feeding a small client-side store — the same
 * contract the game UI builds on, and what integration tests and load bots
 * drive.
 */

import WebSocket from 'ws';
import {
  encodeC2S,
  parseS2C,
  PROTOCOL_VERSION,
  type BeaconView,
  type C2S,
  type EntityView,
  type GameEvent,
  type ItemStackView,
  type JobView,
  type MoveOrderJson,
  type OrderView,
  type S2C,
  type Vec3Json,
} from '@starweft/protocol';

export interface AckError {
  readonly error: string;
}

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

export interface ClientState {
  characterId: string | null;
  name: string | null;
  systemId: string | null;
  systemName: string | null;
  dockedAt: string | null;
  walletLM: number;
  selfId: string | null;
  tick: number;
  entities: Map<string, EntityView>;
  beacons: BeaconView[];
  cargo: ItemStackView[];
  cargoUsedM3: number;
  cargoCapacityM3: number;
  hangar: ItemStackView[];
  hangarStation: string | null;
  orders: { typeId: string; buys: OrderView[]; sells: OrderView[] } | null;
  jobs: JobView[];
  /** Local presence list for the current system channel. */
  presence: Array<{ id: string; name: string }>;
}

type EventHandler = (event: GameEvent) => void;
type ChatHandler = (msg: { channel: string; from: string; fromName: string; text: string }) => void;

export class StarweftClient {
  private socket: WebSocket | null = null;
  private seq = 0;
  private readonly pending = new Map<number, { resolve: (data: unknown) => void; reject: (e: Error) => void }>();
  readonly state: ClientState = {
    characterId: null,
    name: null,
    systemId: null,
    systemName: null,
    dockedAt: null,
    walletLM: 0,
    selfId: null,
    tick: 0,
    entities: new Map(),
    beacons: [],
    cargo: [],
    cargoUsedM3: 0,
    cargoCapacityM3: 0,
    hangar: [],
    hangarStation: null,
    orders: null,
    jobs: [],
    presence: [],
  };
  private readonly eventHandlers: EventHandler[] = [];
  private readonly chatHandlers: ChatHandler[] = [];
  private readonly eventLog: GameEvent[] = [];

  async connect(url: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.on('open', () => resolve());
      socket.on('error', (e: Error) => reject(e));
      socket.on('message', (raw: Buffer | string) => this.onMessage(raw.toString()));
      socket.on('close', () => {
        for (const p of this.pending.values()) p.reject(new CommandError('connection closed'));
        this.pending.clear();
      });
    });
    await this.request({ t: 'HELLO', d: { proto: PROTOCOL_VERSION } });
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }

  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  onChat(handler: ChatHandler): void {
    this.chatHandlers.push(handler);
  }

  /** All game events received so far (test/debug aid). */
  events(): readonly GameEvent[] {
    return this.eventLog;
  }

  // ── Command surface ─────────────────────────────────────────────────────

  async login(token: string): Promise<void> {
    await this.request({ t: 'LOGIN', d: { token } });
  }

  async enterWorld(): Promise<void> {
    await this.request({ t: 'ENTER_WORLD', d: {} });
  }

  async move(order: MoveOrderJson): Promise<void> {
    await this.request({ t: 'MOVE', d: order });
  }

  async arcTo(dest: Vec3Json): Promise<void> {
    await this.request({ t: 'ARC_TO', d: { dest } });
  }

  async thread(terminusId: string): Promise<void> {
    await this.request({ t: 'THREAD', d: { terminusId } });
  }

  async dock(stationId: string): Promise<void> {
    await this.request({ t: 'DOCK', d: { stationId } });
  }

  async undock(): Promise<void> {
    await this.request({ t: 'UNDOCK', d: {} });
  }

  async lock(targetId: string): Promise<void> {
    await this.request({ t: 'LOCK', d: { targetId } });
  }

  async unlock(targetId: string): Promise<void> {
    await this.request({ t: 'UNLOCK', d: { targetId } });
  }

  async activate(slot: 'hardpoint' | 'auxiliary' | 'core', index: number, targetId?: string): Promise<void> {
    await this.request({
      t: 'ACTIVATE',
      d: { slot, index, ...(targetId !== undefined ? { targetId } : {}) },
    });
  }

  async deactivate(slot: 'hardpoint' | 'auxiliary' | 'core', index: number): Promise<void> {
    await this.request({ t: 'DEACTIVATE', d: { slot, index } });
  }

  async loot(wreckId: string): Promise<void> {
    await this.request({ t: 'LOOT', d: { wreckId } });
  }

  async fitShip(loadout: {
    hullId: string;
    hardpoints: string[];
    auxiliary: string[];
    core: string[];
    weaves: string[];
  }): Promise<void> {
    await this.request({ t: 'FIT_SHIP', d: { loadout } });
  }

  async hangarMove(direction: 'toCargo' | 'toHangar', typeId: string, qty: number): Promise<void> {
    await this.request({ t: 'HANGAR_MOVE', d: { direction, typeId, qty } });
  }

  async refine(oreId: string, units: number): Promise<{ outputs: Array<{ typeId: string; qty: number }> }> {
    return (await this.request({ t: 'REFINE', d: { oreId, units } })) as {
      outputs: Array<{ typeId: string; qty: number }>;
    };
  }

  async manufacture(blueprintId: string, runs: number): Promise<{ jobId: string; readyAtTick: number }> {
    return (await this.request({ t: 'MANUFACTURE', d: { blueprintId, runs } })) as {
      jobId: string;
      readyAtTick: number;
    };
  }

  async collectJob(jobId: string): Promise<void> {
    await this.request({ t: 'JOB_COLLECT', d: { jobId } });
  }

  async placeOrder(
    side: 'buy' | 'sell',
    typeId: string,
    price: number,
    qty: number,
  ): Promise<{ trades: Array<{ price: number; qty: number; deliveredAt: string }>; restingOrderId: string | null }> {
    return (await this.request({ t: 'MARKET_PLACE', d: { side, typeId, price, qty } })) as {
      trades: Array<{ price: number; qty: number; deliveredAt: string }>;
      restingOrderId: string | null;
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.request({ t: 'MARKET_CANCEL', d: { orderId } });
  }

  async marketBook(typeId: string): Promise<void> {
    await this.request({ t: 'MARKET_BOOK', d: { typeId } });
  }

  async chat(channel: string, text: string): Promise<void> {
    await this.request({ t: 'CHAT_SEND', d: { channel, text } });
  }

  /** Wait until a predicate over client state holds (test/bot utility). */
  async waitFor(predicate: () => boolean, timeoutMs = 10_000, label = 'condition'): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new CommandError(`timeout waiting for ${label}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // ── Wire handling ───────────────────────────────────────────────────────

  private request(msg: C2S): Promise<unknown> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new CommandError('not connected'));
    }
    const seq = this.seq++;
    return new Promise((resolve, reject) => {
      this.pending.set(seq, { resolve, reject });
      socket.send(encodeC2S(msg, seq));
    });
  }

  private onMessage(raw: string): void {
    const parsed = parseS2C(raw);
    if (!parsed.ok) return;
    if (parsed.tick !== undefined) this.state.tick = parsed.tick;
    this.apply(parsed.msg);
  }

  private apply(msg: S2C): void {
    switch (msg.t) {
      case 'ACK': {
        const pending = this.pending.get(msg.d.seq);
        if (pending) {
          this.pending.delete(msg.d.seq);
          if (msg.d.ok) pending.resolve(msg.d.data);
          else pending.reject(new CommandError(msg.d.error ?? 'command failed'));
        }
        break;
      }
      case 'WELCOME': {
        this.state.characterId = msg.d.characterId;
        this.state.name = msg.d.name;
        this.state.systemId = msg.d.systemId;
        this.state.systemName = msg.d.systemName;
        this.state.dockedAt = msg.d.dockedAt;
        this.state.walletLM = msg.d.walletLM;
        break;
      }
      case 'SNAPSHOT': {
        this.state.systemId = msg.d.systemId;
        this.state.systemName = msg.d.systemName;
        this.state.selfId = msg.d.selfId;
        this.state.entities = new Map(msg.d.entities.map((e) => [e.id, e]));
        this.state.beacons = msg.d.beacons;
        break;
      }
      case 'DELTA': {
        for (const added of msg.d.added) this.state.entities.set(added.id, added);
        for (const removedId of msg.d.removed) this.state.entities.delete(removedId);
        for (const update of msg.d.updates) {
          const current = this.state.entities.get(update.id);
          if (current) this.state.entities.set(update.id, { ...current, ...update });
        }
        break;
      }
      case 'EVENT': {
        const event = msg.d;
        this.eventLog.push(event);
        if (event.kind === 'docked') {
          this.state.dockedAt = event.stationId;
          this.state.selfId = null;
          this.state.entities.clear();
        }
        if (event.kind === 'undocked') this.state.dockedAt = null;
        for (const handler of this.eventHandlers) handler(event);
        break;
      }
      case 'WALLET':
        this.state.walletLM = msg.d.balanceLM;
        break;
      case 'CARGO':
        this.state.cargo = msg.d.items;
        this.state.cargoUsedM3 = msg.d.usedM3 + msg.d.oreHoldUsedM3;
        this.state.cargoCapacityM3 = msg.d.capacityM3 + msg.d.oreHoldCapacityM3;
        break;
      case 'HANGAR':
        this.state.hangar = msg.d.items;
        this.state.hangarStation = msg.d.stationId;
        break;
      case 'ORDERS':
        this.state.orders = msg.d;
        break;
      case 'JOBS':
        this.state.jobs = msg.d.jobs;
        break;
      case 'CHAT':
        for (const handler of this.chatHandlers) handler(msg.d);
        break;
      case 'PRESENCE':
        this.state.presence = msg.d.members;
        break;
      case 'PONG':
        break;
    }
  }
}
