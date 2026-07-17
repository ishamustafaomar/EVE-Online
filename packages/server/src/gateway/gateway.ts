/**
 * Gateway (docs 09, 10, 12): WebSocket termination, session state machine
 * (connected → hello → authenticated → in-world), protocol validation, rate
 * limiting, command routing, and interest-managed replication.
 */

import { WebSocketServer, type WebSocket } from 'ws';
import {
  entityId,
  itemTypeId,
  LedgerAccounts,
  orderId as mkOrderId,
  stationId as mkStationId,
  type CharacterId,
  type EntityId,
  type SystemId,
} from '@starweft/core';
import {
  encodeS2C,
  parseC2S,
  PROTOCOL_VERSION,
  type C2S,
  type GameEvent,
  type OrderView,
  type S2C,
} from '@starweft/protocol';
import { verifySessionToken } from '../auth.js';
import type { GameServerConfig } from '../config.js';
import { SessionRateLimiter } from '../ratelimit.js';
import type { MarketService } from '../services/market.js';
import { ShipLocations, type CharacterState } from '../world/state.js';
import type { World } from '../world/world.js';
import { entityView, gridEntities, shipDelta, systemBeacons } from './views.js';
import { Locations } from '@starweft/core';

type SessionPhase = 'connected' | 'hello' | 'authed' | 'inWorld';

interface Session {
  readonly socket: WebSocket;
  phase: SessionPhase;
  characterId: CharacterId | null;
  readonly limiter: SessionRateLimiter;
  /** Entity IDs this session currently knows about (delta baseline). */
  known: Set<EntityId>;
  knownSystem: SystemId | null;
}

export class Gateway {
  private readonly wss: WebSocketServer;
  private readonly sessions = new Set<Session>();
  private readonly byCharacter = new Map<CharacterId, Session>();

  constructor(
    private readonly config: GameServerConfig,
    private readonly world: World,
    private readonly markets: MarketService,
    private readonly nowMs: () => number,
  ) {
    this.wss = new WebSocketServer({ port: config.port });
    this.wss.on('connection', (socket) => this.onConnection(socket));
    world.setOutbound({
      sendEvent: (to, event) => {
        this.sendTo(to, { t: 'EVENT', d: event });
        // Mining mutates cargo server-side; keep the client's hold view live.
        if (event.kind === 'mined') {
          const session = this.byCharacter.get(to);
          if (session) this.pushCargo(session);
        }
      },
      broadcastEvent: (systemId, event) => this.broadcastToSystem(systemId, event),
      gridChanged: (character) => this.onGridChanged(character),
    });
  }

  get port(): number {
    const addr = this.wss.address();
    return typeof addr === 'object' && addr !== null ? addr.port : this.config.port;
  }

  async close(): Promise<void> {
    for (const session of this.sessions) session.socket.close();
    await new Promise<void>((resolve, reject) => {
      this.wss.close((e) => (e ? reject(e) : resolve()));
    });
  }

  // ── Outbound ────────────────────────────────────────────────────────────

  private send(session: Session, msg: S2C): void {
    if (session.socket.readyState === session.socket.OPEN) {
      session.socket.send(encodeS2C(msg, this.world.tickNumber));
    }
  }

  sendTo(character: CharacterId, msg: S2C): void {
    const session = this.byCharacter.get(character);
    if (session) this.send(session, msg);
  }

  private broadcastToSystem(systemId: SystemId, event: GameEvent): void {
    for (const [charId, session] of this.byCharacter) {
      const character = this.world.characters.get(charId);
      if (character && character.systemId === systemId && character.shipEntityId) {
        this.send(session, { t: 'EVENT', d: event });
      }
    }
  }

  private onGridChanged(characterId: CharacterId): void {
    const session = this.byCharacter.get(characterId);
    if (session) {
      session.known = new Set();
      session.knownSystem = null;
      this.pushSnapshot(session);
      this.pushWallet(session);
      this.pushCargo(session);
    }
    this.broadcastPresence();
  }

  /** Local presence lists (doc 07 §4): who is in your system right now.
   *  Deep Weft systems are exempt by design — no lists in the Dark (doc 01 §4). */
  private broadcastPresence(): void {
    const bySystem = new Map<SystemId, Array<{ id: string; name: string }>>();
    for (const [charId] of this.byCharacter) {
      const character = this.world.characters.get(charId);
      if (!character) continue;
      const list = bySystem.get(character.systemId) ?? [];
      list.push({ id: charId as string, name: character.name });
      bySystem.set(character.systemId, list);
    }
    for (const [charId, session] of this.byCharacter) {
      if (session.phase !== 'inWorld') continue;
      const character = this.world.characters.get(charId);
      if (!character) continue;
      const system = this.world.system(character.systemId);
      if (!system || system.band === 'deep') continue;
      this.send(session, {
        t: 'PRESENCE',
        d: { channel: `sys:${character.systemId}`, members: bySystem.get(character.systemId) ?? [] },
      });
    }
  }

  /** Per-tick replication: SNAPSHOT on grid entry, DELTA while on grid (doc 10 §4). */
  flushReplication(): void {
    for (const session of this.byCharacter.values()) {
      if (session.phase !== 'inWorld' || !session.characterId) continue;
      const character = this.world.characters.get(session.characterId);
      if (!character || !character.shipEntityId) continue;
      const cell = this.world.cell(character.systemId);
      const ship = cell.ships.get(character.shipEntityId);
      if (!ship) continue;

      if (session.knownSystem !== character.systemId) {
        this.pushSnapshot(session);
        continue;
      }

      const visible = gridEntities(cell, ship.pos, this.config.gridRadiusM);
      const visibleIds = new Set<EntityId>(visible.map((e) => e.id));
      const added = visible.filter((e) => !session.known.has(e.id)).map(entityView);
      const removed = [...session.known].filter((id) => !visibleIds.has(id)).map((id) => id as string);
      const updates = visible.flatMap((e) => {
        if (e.kind === 'ship') return [shipDelta(e)];
        if (e.kind === 'asteroid' && e.dirty) {
          return [{ id: e.id as string, unitsRemaining: e.unitsRemaining }];
        }
        return [];
      });
      session.known = visibleIds;
      if (added.length > 0 || removed.length > 0 || updates.length > 0) {
        this.send(session, { t: 'DELTA', d: { tick: this.world.tickNumber, updates, removed, added } });
      }
    }
    // Reset per-tick dirty flags after all sessions were served.
    for (const cell of this.world.activeCells()) {
      for (const asteroid of cell.asteroids.values()) asteroid.dirty = false;
    }
  }

  // ── Session handling ────────────────────────────────────────────────────

  private onConnection(socket: WebSocket): void {
    const session: Session = {
      socket,
      phase: 'connected',
      characterId: null,
      limiter: new SessionRateLimiter(this.nowMs),
      known: new Set(),
      knownSystem: null,
    };
    this.sessions.add(session);
    socket.on('message', (raw: Buffer | string) => this.onMessage(session, raw.toString()));
    socket.on('close', () => {
      this.sessions.delete(session);
      if (session.characterId) {
        this.byCharacter.delete(session.characterId);
        this.broadcastPresence();
      }
    });
  }

  private ack(session: Session, seq: number, ok: boolean, error?: string, data?: unknown): void {
    this.send(session, {
      t: 'ACK',
      d: { seq, ok, ...(error !== undefined ? { error } : {}), ...(data !== undefined ? { data } : {}) },
    });
  }

  private onMessage(session: Session, raw: string): void {
    const parsed = parseC2S(raw);
    if (!parsed.ok) {
      if (parsed.seq !== null) this.ack(session, parsed.seq, false, parsed.error);
      else session.socket.close(1002, 'protocol violation');
      return;
    }
    const verdict = session.limiter.check(parsed.msg.t);
    if (verdict === 'disconnect') {
      session.socket.close(1008, 'rate limit abuse');
      return;
    }
    if (verdict === 'limited') {
      this.ack(session, parsed.seq, false, 'rate limited');
      return;
    }
    try {
      this.dispatch(session, parsed.seq, parsed.msg);
    } catch (error) {
      // A handler bug must never take down the gateway; fail the command.
      this.ack(session, parsed.seq, false, error instanceof Error ? error.message : 'internal error');
    }
  }

  private requireCharacter(session: Session): CharacterState | null {
    if (!session.characterId) return null;
    return this.world.characters.get(session.characterId) ?? null;
  }

  private dispatch(session: Session, seq: number, msg: C2S): void {
    switch (msg.t) {
      case 'HELLO': {
        if (msg.d.proto !== PROTOCOL_VERSION) {
          return this.ack(session, seq, false, `server speaks protocol ${PROTOCOL_VERSION}`);
        }
        session.phase = session.phase === 'connected' ? 'hello' : session.phase;
        return this.ack(session, seq, true, undefined, { proto: PROTOCOL_VERSION });
      }
      case 'LOGIN': {
        if (session.phase === 'connected') return this.ack(session, seq, false, 'HELLO first');
        const verdict = verifySessionToken(msg.d.token, this.config.sessionSecret, this.nowMs());
        if (!verdict.ok) return this.ack(session, seq, false, `auth failed: ${verdict.error}`);
        const charId = verdict.claims.characterId as CharacterId;
        const character = this.world.characters.get(charId);
        if (!character) return this.ack(session, seq, false, 'unknown character');
        const existing = this.byCharacter.get(charId);
        if (existing && existing !== session) existing.socket.close(1000, 'session superseded');
        session.characterId = charId;
        session.phase = 'authed';
        this.byCharacter.set(charId, session);
        return this.ack(session, seq, true);
      }
      case 'PING':
        return this.send(session, { t: 'PONG', d: { nonce: msg.d.nonce } });
      default:
        break;
    }

    const character = this.requireCharacter(session);
    if (!character || session.phase === 'connected' || session.phase === 'hello') {
      return this.ack(session, seq, false, 'not authenticated');
    }

    switch (msg.t) {
      case 'ENTER_WORLD': {
        session.phase = 'inWorld';
        const system = this.world.system(character.systemId);
        this.send(session, {
          t: 'WELCOME',
          d: {
            characterId: character.id as string,
            name: character.name,
            systemId: character.systemId as string,
            systemName: system?.name ?? 'unknown',
            dockedAt: character.dockedAt as string | null,
            walletLM: this.world.ledger.balance(LedgerAccounts.character(character.id)),
            skills: character.skills as Record<string, number>,
            contentVersion: this.world.registry.version,
            universeSeed: this.world.pack.seed,
          },
        });
        if (character.dockedAt) this.pushHangar(session, character);
        else this.pushSnapshot(session);
        this.pushCargo(session);
        this.broadcastPresence();
        return this.ack(session, seq, true);
      }
      case 'UNDOCK': {
        const result = this.world.undock(character);
        return this.ack(session, seq, result.ok, result.ok ? undefined : result.error);
      }
      case 'DOCK': {
        const result = this.world.dock(character, mkStationId(msg.d.stationId));
        if (result.ok) {
          session.known = new Set();
          session.knownSystem = null;
          this.pushHangar(session, character);
          this.pushWallet(session);
          this.pushCargo(session);
        }
        return this.ack(session, seq, result.ok, result.ok ? undefined : result.error);
      }
      case 'THREAD': {
        const result = this.world.thread(character, msg.d.terminusId);
        return this.ack(session, seq, result.ok, result.ok ? undefined : result.error);
      }
      case 'MOVE': {
        const ship = this.world.ship(character);
        if (!ship) return this.ack(session, seq, false, 'not in space');
        const order =
          msg.d.kind === 'moveTo'
            ? { kind: 'moveTo' as const, dest: msg.d.dest }
            : msg.d.kind === 'orbit'
              ? { kind: 'orbit' as const, targetId: entityId(msg.d.targetId), rangeM: msg.d.rangeM }
              : msg.d.kind === 'approach'
                ? { kind: 'approach' as const, targetId: entityId(msg.d.targetId) }
                : { kind: 'hold' as const };
        const result = this.world.cell(character.systemId).setMovementOrder(ship, order);
        return this.ack(session, seq, result.ok, result.error);
      }
      case 'ARC_TO': {
        const ship = this.world.ship(character);
        if (!ship) return this.ack(session, seq, false, 'not in space');
        const result = this.world
          .cell(character.systemId)
          .requestArc(ship, msg.d.dest, this.world.tickNumber);
        return this.ack(session, seq, result.ok, result.error);
      }
      case 'LOCK': {
        const ship = this.world.ship(character);
        if (!ship) return this.ack(session, seq, false, 'not in space');
        const result = this.world.cell(character.systemId).lockTarget(ship, entityId(msg.d.targetId));
        return this.ack(session, seq, result.ok, result.error);
      }
      case 'UNLOCK': {
        const ship = this.world.ship(character);
        if (!ship) return this.ack(session, seq, false, 'not in space');
        this.world.cell(character.systemId).unlockTarget(ship, entityId(msg.d.targetId));
        return this.ack(session, seq, true);
      }
      case 'ACTIVATE': {
        const ship = this.world.ship(character);
        if (!ship) return this.ack(session, seq, false, 'not in space');
        const result = this.world
          .cell(character.systemId)
          .activateModule(
            ship,
            msg.d.slot,
            msg.d.index,
            msg.d.targetId !== undefined ? entityId(msg.d.targetId) : undefined,
            this.world.tickNumber,
          );
        return this.ack(session, seq, result.ok, result.error);
      }
      case 'DEACTIVATE': {
        const ship = this.world.ship(character);
        if (!ship) return this.ack(session, seq, false, 'not in space');
        const result = this.world.cell(character.systemId).deactivateModule(ship, msg.d.slot, msg.d.index);
        return this.ack(session, seq, result.ok, result.error);
      }
      case 'LOOT': {
        const result = this.world.lootWreck(character, msg.d.wreckId);
        if (result.ok) this.pushCargo(session);
        return this.ack(session, seq, result.ok, result.ok ? undefined : result.error);
      }
      case 'FIT_SHIP': {
        const loadout = {
          hullId: itemTypeId(msg.d.loadout.hullId),
          hardpoints: msg.d.loadout.hardpoints.map(itemTypeId),
          auxiliary: msg.d.loadout.auxiliary.map(itemTypeId),
          core: msg.d.loadout.core.map(itemTypeId),
          weaves: msg.d.loadout.weaves.map(itemTypeId),
        };
        const result = this.world.fitShip(character, loadout);
        if (result.ok) {
          this.pushHangar(session, character);
          this.pushCargo(session);
        }
        return this.ack(session, seq, result.ok, result.ok ? undefined : result.error);
      }
      case 'HANGAR_MOVE': {
        const result = this.world.hangarMove(character, msg.d.direction, itemTypeId(msg.d.typeId), msg.d.qty);
        if (result.ok) {
          this.pushHangar(session, character);
          this.pushCargo(session);
        }
        return this.ack(session, seq, result.ok, result.ok ? undefined : result.error);
      }
      case 'REFINE': {
        const result = this.world.refineOre(character, itemTypeId(msg.d.oreId), msg.d.units);
        if (result.ok) this.pushHangar(session, character);
        return this.ack(session, seq, result.ok, result.ok ? undefined : result.error, result.ok ? result.data : undefined);
      }
      case 'MANUFACTURE': {
        const result = this.world.startManufactureJob(character, itemTypeId(msg.d.blueprintId), msg.d.runs);
        if (result.ok) {
          this.pushHangar(session, character);
          this.pushWallet(session);
          this.pushJobs(session, character);
        }
        return this.ack(session, seq, result.ok, result.ok ? undefined : result.error, result.ok ? result.data : undefined);
      }
      case 'JOB_COLLECT': {
        const result = this.world.collectJob(character, msg.d.jobId);
        if (result.ok) {
          this.pushHangar(session, character);
          this.pushJobs(session, character);
        }
        return this.ack(session, seq, result.ok, result.ok ? undefined : result.error);
      }
      case 'MARKET_PLACE': {
        if (!character.dockedAt) return this.ack(session, seq, false, 'must be docked at a market');
        const market = this.markets.marketForStation(character.dockedAt);
        if (!market) return this.ack(session, seq, false, 'no market at this station');
        const result = market.placeOrder({
          side: msg.d.side,
          typeId: itemTypeId(msg.d.typeId),
          price: msg.d.price,
          qty: msg.d.qty,
          stationId: character.dockedAt,
          character: character.id,
        });
        if (!result.ok) return this.ack(session, seq, false, result.error);
        this.pushWallet(session);
        this.pushHangar(session, character);
        for (const trade of result.trades) {
          const counterparty = trade.buyer === character.id ? trade.seller : trade.buyer;
          const other = this.byCharacter.get(counterparty);
          if (other && other.characterId) {
            this.pushWallet(other);
            const otherChar = this.world.characters.get(other.characterId);
            if (otherChar) this.pushHangar(other, otherChar);
          }
        }
        return this.ack(session, seq, true, undefined, {
          trades: result.trades.map((t) => ({ price: t.price, qty: t.qty, deliveredAt: t.deliveredAt as string })),
          restingOrderId: result.restingOrder ? (result.restingOrder.id as string) : null,
        });
      }
      case 'MARKET_CANCEL': {
        const market = this.markets.findOrderRegion(mkOrderId(msg.d.orderId));
        if (!market) return this.ack(session, seq, false, 'unknown order');
        const result = market.cancelOrder(mkOrderId(msg.d.orderId), character.id);
        if (result.ok) {
          this.pushWallet(session);
          this.pushHangar(session, character);
        }
        return this.ack(session, seq, result.ok, result.error);
      }
      case 'MARKET_BOOK': {
        if (!character.dockedAt) return this.ack(session, seq, false, 'must be docked at a market');
        const market = this.markets.marketForStation(character.dockedAt);
        if (!market) return this.ack(session, seq, false, 'no market at this station');
        const book = market.ordersFor(itemTypeId(msg.d.typeId));
        const view = (o: (typeof book.buys)[number]): OrderView => ({
          id: o.id as string,
          side: o.side,
          typeId: o.typeId as string,
          price: o.price,
          remaining: o.remaining,
          stationId: o.stationId as string,
          mine: o.owner === character.id,
        });
        this.send(session, {
          t: 'ORDERS',
          d: { typeId: msg.d.typeId, buys: book.buys.map(view), sells: book.sells.map(view) },
        });
        return this.ack(session, seq, true);
      }
      case 'CHAT_SEND': {
        const channel = msg.d.channel;
        const systemChannel = `sys:${character.systemId}`;
        if (channel === 'system' || channel === systemChannel) {
          for (const [charId, other] of this.byCharacter) {
            const otherChar = this.world.characters.get(charId);
            if (otherChar && otherChar.systemId === character.systemId) {
              this.send(other, {
                t: 'CHAT',
                d: { channel: systemChannel, from: character.id as string, fromName: character.name, text: msg.d.text },
              });
            }
          }
          return this.ack(session, seq, true);
        }
        if (channel.startsWith('dm:')) {
          const target = channel.slice(3) as CharacterId;
          const targetSession = this.byCharacter.get(target);
          if (!targetSession) return this.ack(session, seq, false, 'recipient offline');
          const dm: S2C = {
            t: 'CHAT',
            d: { channel: `dm:${character.id}`, from: character.id as string, fromName: character.name, text: msg.d.text },
          };
          this.send(targetSession, dm);
          this.send(session, dm);
          return this.ack(session, seq, true);
        }
        return this.ack(session, seq, false, 'unknown channel');
      }
      default: {
        // Exhaustiveness guard: a new C2S type must be handled above.
        const never: never = msg;
        return this.ack(session, seq, false, `unhandled message ${JSON.stringify(never)}`);
      }
    }
  }

  // ── State pushes ────────────────────────────────────────────────────────

  private pushSnapshot(session: Session): void {
    const character = this.requireCharacter(session);
    if (!character) return;
    const system = this.world.system(character.systemId);
    if (!system) return;
    const cell = this.world.cell(character.systemId);
    const ship = character.shipEntityId ? cell.ships.get(character.shipEntityId) : undefined;
    const entities = ship ? gridEntities(cell, ship.pos, this.config.gridRadiusM) : [];
    session.known = new Set(entities.map((e) => e.id));
    session.knownSystem = character.systemId;
    this.send(session, {
      t: 'SNAPSHOT',
      d: {
        systemId: character.systemId as string,
        systemName: system.name,
        tick: this.world.tickNumber,
        selfId: (character.shipEntityId as string | null) ?? null,
        entities: entities.map(entityView),
        beacons: systemBeacons(this.world, system),
      },
    });
  }

  private pushWallet(session: Session): void {
    const character = this.requireCharacter(session);
    if (!character) return;
    this.send(session, {
      t: 'WALLET',
      d: { balanceLM: this.world.ledger.balance(LedgerAccounts.character(character.id)) },
    });
  }

  private pushCargo(session: Session): void {
    const character = this.requireCharacter(session);
    if (!character) return;
    const fittedStats = (() => {
      try {
        const ship = this.world.ship(character);
        if (ship) return ship.fitted.stats;
        return null;
      } catch {
        return null;
      }
    })();
    const cargoItems = this.world.items.contents(ShipLocations.cargo(character.id));
    const oreItems = this.world.items.contents(ShipLocations.oreHold(character.id));
    this.send(session, {
      t: 'CARGO',
      d: {
        items: [...cargoItems, ...oreItems].map((s) => ({ typeId: s.typeId as string, qty: s.qty })),
        usedM3: this.world.cargoUsedM3(character.id),
        capacityM3: fittedStats?.cargo ?? 0,
        oreHoldUsedM3: this.world.cargoUsedM3(character.id, ShipLocations.oreHold(character.id)),
        oreHoldCapacityM3: fittedStats?.oreHold ?? 0,
      },
    });
  }

  private pushHangar(session: Session, character: CharacterState): void {
    if (!character.dockedAt) return;
    const items = this.world.items.contents(Locations.hangar(character.id, character.dockedAt));
    this.send(session, {
      t: 'HANGAR',
      d: {
        stationId: character.dockedAt as string,
        items: items.map((s) => ({ typeId: s.typeId as string, qty: s.qty })),
      },
    });
  }

  private pushJobs(session: Session, character: CharacterState): void {
    const jobs = [...this.world.jobs.values()]
      .filter((j) => j.owner === character.id)
      .map((j) => ({
        id: j.id,
        blueprintId: j.blueprintId as string,
        outputTypeId: j.outputTypeId as string,
        outputQty: j.outputQty,
        readyAtTick: j.readyAtTick,
        collected: j.collected,
      }));
    this.send(session, { t: 'JOBS', d: { jobs } });
  }
}
