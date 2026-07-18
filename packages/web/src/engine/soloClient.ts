/**
 * SoloClient: same public surface as @starweft/client-sdk's StarweftClient
 * (method names, `.state` shape) but backed by direct in-process calls into
 * SoloWorld instead of a WebSocket round trip. This lets the UI layer reuse
 * the CLI's already-tested command parser and formatters (packages/cli)
 * essentially unchanged — the "network" here is just a function call.
 */

import {
  entityId,
  itemTypeId,
  orderId as mkOrderId,
  stationId as mkStationId,
  LedgerAccounts,
  Locations,
} from '@starweft/core';
import { ShipLocations } from '@starweft/server/state';
import { entityView, gridEntities, shipDelta, systemBeacons } from '@starweft/server/views';
import type {
  BeaconView,
  EntityView,
  GameEvent,
  ItemStackView,
  JobView,
  MoveOrderJson,
  OrderView,
} from '@starweft/protocol';
import type { SoloWorld } from './soloWorld.js';

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
  presence: Array<{ id: string; name: string }>;
}

type EventHandler = (event: GameEvent) => void;

const GRID_RADIUS_M = 250_000;

export class SoloClient {
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
  private readonly eventLog: GameEvent[] = [];

  constructor(private readonly solo: SoloWorld) {
    solo.setHandlers({
      onEvent: (event, to) => {
        if (to !== null && to !== this.solo.playerId) return;
        this.eventLog.push(event);
        if (event.kind === 'docked') {
          this.state.dockedAt = event.stationId;
          this.state.selfId = null;
          this.state.entities.clear();
        }
        if (event.kind === 'undocked') this.state.dockedAt = null;
        for (const h of this.eventHandlers) h(event);
        if (event.kind === 'mined') this.pushCargo();
      },
      onGridChanged: () => {
        this.pushSnapshot();
        this.pushWallet();
        this.pushCargo();
      },
    });
  }

  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  events(): readonly GameEvent[] {
    return this.eventLog;
  }

  private character() {
    const c = this.solo.world.characters.get(this.solo.playerId);
    if (!c) throw new CommandError('no active character');
    return c;
  }

  private tick(): number {
    return this.solo.world.tickNumber;
  }

  async enterWorld(): Promise<void> {
    const c = this.character();
    const system = this.solo.world.system(c.systemId);
    this.state.characterId = c.id as string;
    this.state.name = c.name;
    this.state.systemId = c.systemId as string;
    this.state.systemName = system?.name ?? 'unknown';
    this.state.dockedAt = c.dockedAt as string | null;
    this.pushWallet();
    if (c.dockedAt) this.pushHangar();
    else this.pushSnapshot();
    this.pushCargo();
  }

  async move(order: MoveOrderJson): Promise<void> {
    const ship = this.requireShip();
    const resolved =
      order.kind === 'moveTo'
        ? { kind: 'moveTo' as const, dest: order.dest }
        : order.kind === 'orbit'
          ? { kind: 'orbit' as const, targetId: entityId(order.targetId), rangeM: order.rangeM }
          : order.kind === 'approach'
            ? { kind: 'approach' as const, targetId: entityId(order.targetId) }
            : { kind: 'hold' as const };
    const result = this.solo.world.cell(this.character().systemId).setMovementOrder(ship, resolved);
    if (!result.ok) throw new CommandError(result.error ?? 'move failed');
  }

  async arcTo(dest: { x: number; y: number; z: number }): Promise<void> {
    const ship = this.requireShip();
    const result = this.solo.world.cell(this.character().systemId).requestArc(ship, dest, this.tick());
    if (!result.ok) throw new CommandError(result.error ?? 'arc failed');
  }

  async thread(terminusId: string): Promise<void> {
    const result = this.solo.world.thread(this.character(), terminusId);
    if (!result.ok) throw new CommandError(result.error ?? 'thread failed');
    this.refreshLocationHeader();
  }

  async dock(stationId: string): Promise<void> {
    const result = this.solo.world.dock(this.character(), mkStationId(stationId));
    if (!result.ok) throw new CommandError(result.error ?? 'dock failed');
    this.refreshLocationHeader();
    this.pushHangar();
    this.pushWallet();
    this.pushCargo();
  }

  async undock(): Promise<void> {
    const result = this.solo.world.undock(this.character());
    if (!result.ok) throw new CommandError(result.error ?? 'undock failed');
    this.refreshLocationHeader();
  }

  async lock(targetId: string): Promise<void> {
    const ship = this.requireShip();
    const result = this.solo.world.cell(this.character().systemId).lockTarget(ship, entityId(targetId));
    if (!result.ok) throw new CommandError(result.error ?? 'lock failed');
  }

  async unlock(targetId: string): Promise<void> {
    const ship = this.requireShip();
    this.solo.world.cell(this.character().systemId).unlockTarget(ship, entityId(targetId));
  }

  async activate(slot: 'hardpoint' | 'auxiliary' | 'core', index: number, targetId?: string): Promise<void> {
    const ship = this.requireShip();
    const result = this.solo.world
      .cell(this.character().systemId)
      .activateModule(ship, slot, index, targetId !== undefined ? entityId(targetId) : undefined, this.tick());
    if (!result.ok) throw new CommandError(result.error ?? 'activate failed');
  }

  async deactivate(slot: 'hardpoint' | 'auxiliary' | 'core', index: number): Promise<void> {
    const ship = this.requireShip();
    const result = this.solo.world.cell(this.character().systemId).deactivateModule(ship, slot, index);
    if (!result.ok) throw new CommandError(result.error ?? 'deactivate failed');
  }

  async loot(wreckId: string): Promise<void> {
    const result = this.solo.world.lootWreck(this.character(), wreckId);
    if (!result.ok) throw new CommandError(result.error ?? 'loot failed');
    this.pushCargo();
  }

  async fitShip(loadout: {
    hullId: string;
    hardpoints: string[];
    auxiliary: string[];
    core: string[];
    weaves: string[];
  }): Promise<void> {
    const result = this.solo.world.fitShip(this.character(), {
      hullId: itemTypeId(loadout.hullId),
      hardpoints: loadout.hardpoints.map(itemTypeId),
      auxiliary: loadout.auxiliary.map(itemTypeId),
      core: loadout.core.map(itemTypeId),
      weaves: loadout.weaves.map(itemTypeId),
    });
    if (!result.ok) throw new CommandError(result.error ?? 'refit failed');
    this.pushHangar();
    this.pushCargo();
  }

  async hangarMove(direction: 'toCargo' | 'toHangar', typeId: string, qty: number): Promise<void> {
    const result = this.solo.world.hangarMove(this.character(), direction, itemTypeId(typeId), qty);
    if (!result.ok) throw new CommandError(result.error ?? 'move failed');
    this.pushHangar();
    this.pushCargo();
  }

  async refine(oreId: string, units: number): Promise<{ outputs: Array<{ typeId: string; qty: number }> }> {
    const result = this.solo.world.refineOre(this.character(), itemTypeId(oreId), units);
    if (!result.ok) throw new CommandError(result.error ?? 'refine failed');
    this.pushHangar();
    return { outputs: result.data?.outputs ?? [] };
  }

  async manufacture(blueprintId: string, runs: number): Promise<{ jobId: string; readyAtTick: number }> {
    const result = this.solo.world.startManufactureJob(this.character(), itemTypeId(blueprintId), runs);
    if (!result.ok) throw new CommandError(result.error ?? 'manufacture failed');
    if (!result.data) throw new CommandError('manufacture succeeded but returned no job data');
    this.pushHangar();
    this.pushWallet();
    this.pushJobs();
    return result.data;
  }

  async collectJob(jobIdStr: string): Promise<void> {
    const result = this.solo.world.collectJob(this.character(), jobIdStr);
    if (!result.ok) throw new CommandError(result.error ?? 'collect failed');
    this.pushHangar();
    this.pushJobs();
  }

  async placeOrder(
    side: 'buy' | 'sell',
    typeId: string,
    price: number,
    qty: number,
  ): Promise<{ trades: Array<{ price: number; qty: number; deliveredAt: string }>; restingOrderId: string | null }> {
    const c = this.character();
    if (!c.dockedAt) throw new CommandError('must be docked at a market');
    const market = this.solo.markets.marketForStation(c.dockedAt);
    if (!market) throw new CommandError('no market at this station');
    const result = market.placeOrder({
      side,
      typeId: itemTypeId(typeId),
      price,
      qty,
      stationId: c.dockedAt,
      character: c.id,
    });
    if (!result.ok) throw new CommandError(result.error);
    this.pushWallet();
    this.pushHangar();
    return {
      trades: result.trades.map((t) => ({ price: t.price, qty: t.qty, deliveredAt: t.deliveredAt as string })),
      restingOrderId: result.restingOrder ? (result.restingOrder.id as string) : null,
    };
  }

  async cancelOrder(orderIdStr: string): Promise<void> {
    const id = mkOrderId(orderIdStr);
    const market = this.solo.markets.findOrderRegion(id);
    if (!market) throw new CommandError('unknown order');
    const result = market.cancelOrder(id, this.character().id);
    if (!result.ok) throw new CommandError(result.error ?? 'cancel failed');
    this.pushWallet();
    this.pushHangar();
  }

  async marketBook(typeId: string): Promise<void> {
    const c = this.character();
    if (!c.dockedAt) throw new CommandError('must be docked at a market');
    const market = this.solo.markets.marketForStation(c.dockedAt);
    if (!market) throw new CommandError('no market at this station');
    const book = market.ordersFor(itemTypeId(typeId));
    const view = (o: (typeof book.buys)[number]): OrderView => ({
      id: o.id as string,
      side: o.side,
      typeId: o.typeId as string,
      price: o.price,
      remaining: o.remaining,
      stationId: o.stationId as string,
      mine: o.owner === c.id,
    });
    this.state.orders = { typeId, buys: book.buys.map(view), sells: book.sells.map(view) };
  }

  async chat(_channel: string, _text: string): Promise<void> {
    // No other players exist solo — chat is a documented no-op here rather
    // than a fake echo, so the UI can say so honestly.
    throw new CommandError('no one else is in this universe — chat has nothing to reach (solo mode)');
  }

  async waitFor(predicate: () => boolean, timeoutMs = 5000, label = 'condition'): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new CommandError(`timeout waiting for ${label}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // ── internal state refresh, mirroring gateway.ts's push* methods ────────

  private requireShip() {
    const c = this.character();
    const ship = this.solo.world.ship(c);
    if (!ship) throw new CommandError('not in space');
    return ship;
  }

  private refreshLocationHeader(): void {
    const c = this.character();
    const system = this.solo.world.system(c.systemId);
    this.state.systemId = c.systemId as string;
    this.state.systemName = system?.name ?? 'unknown';
    this.state.dockedAt = c.dockedAt as string | null;
    this.state.tick = this.tick();
  }

  private pushSnapshot(): void {
    const c = this.character();
    const system = this.solo.world.system(c.systemId);
    if (!system) return;
    const cell = this.solo.world.cell(c.systemId);
    const ship = c.shipEntityId ? cell.ships.get(c.shipEntityId) : undefined;
    const entities = ship ? gridEntities(cell, ship.pos, GRID_RADIUS_M).map(entityView) : [];
    this.state.systemId = c.systemId as string;
    this.state.systemName = system.name;
    this.state.selfId = (c.shipEntityId as string | null) ?? null;
    this.state.entities = new Map(entities.map((e) => [e.id, e]));
    this.state.beacons = systemBeacons(this.solo.world, system);
    this.state.dockedAt = c.dockedAt as string | null;
    this.state.tick = this.tick();
  }

  private pushWallet(): void {
    this.state.walletLM = this.solo.world.ledger.balance(LedgerAccounts.character(this.character().id));
  }

  private pushCargo(): void {
    const c = this.character();
    const fitted = this.solo.world.fittedStats(c);
    const cargoItems = this.solo.world.items.contents(ShipLocations.cargo(c.id));
    const oreItems = this.solo.world.items.contents(ShipLocations.oreHold(c.id));
    this.state.cargo = [...cargoItems, ...oreItems].map((s) => ({ typeId: s.typeId as string, qty: s.qty }));
    this.state.cargoUsedM3 = this.solo.world.cargoUsedM3(c.id) + this.solo.world.cargoUsedM3(c.id, ShipLocations.oreHold(c.id));
    this.state.cargoCapacityM3 = fitted.cargo + fitted.oreHold;
  }

  private pushHangar(): void {
    const c = this.character();
    if (!c.dockedAt) return;
    const items = this.solo.world.items.contents(Locations.hangar(c.id, c.dockedAt));
    this.state.hangar = items.map((s) => ({ typeId: s.typeId as string, qty: s.qty }));
    this.state.hangarStation = c.dockedAt as string;
  }

  private pushJobs(): void {
    const c = this.character();
    this.state.jobs = [...this.solo.world.jobs.values()]
      .filter((j) => j.owner === c.id)
      .map((j) => ({
        id: j.id,
        blueprintId: j.blueprintId as string,
        outputTypeId: j.outputTypeId as string,
        outputQty: j.outputQty,
        readyAtTick: j.readyAtTick,
        collected: j.collected,
      }));
  }

  /** Live entity refresh for the render loop (deltas aren't worth it solo — just re-read). */
  refreshTick(): void {
    const c = this.character();
    this.state.tick = this.tick();
    if (!c.shipEntityId) return;
    const cell = this.solo.world.cell(c.systemId);
    const ship = cell.ships.get(c.shipEntityId);
    if (!ship) return;
    const entities = gridEntities(cell, ship.pos, GRID_RADIUS_M).map(entityView);
    this.state.entities = new Map(entities.map((e) => [e.id, e]));
  }
}
