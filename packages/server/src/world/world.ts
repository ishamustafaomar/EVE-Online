/**
 * World service: universe pack, system cells, character lifecycle, and every
 * station-side verb (dock, fit, hangar, refine, manufacture). All inventory
 * and wallet mutations route through the core ledger APIs (doc 12 §2).
 */

import {
  accountId as mkAccountId,
  buildContentV1,
  characterId as mkCharacterId,
  computeFit,
  dist,
  fnv1a32,
  generateUniverse,
  jobId as mkJobId,
  LedgerAccounts,
  Locations,
  quoteManufactureJob,
  refine as refineMath,
  STARTER_FIT_VERGE,
  STARTER_SKILLS,
  validateFit,
  type AccountId,
  type CharacterId,
  type ContentRegistry,
  type EntityId,
  type FitLoadout,
  type FittedStats,
  type ItemTypeId,
  type JobId,
  type LocationId,
  type SolarSystem,
  type Station,
  type StationId,
  type SystemId,
  type UniversePack,
  type Vec3,
} from '@starweft/core';
import { entityId, ItemStore, itemTypeId, LumenLedger } from '@starweft/core';
import type { GameEvent } from '@starweft/protocol';
import type { GameServerConfig } from '../config.js';
import { RULES } from '../config.js';
import { SystemCell } from './cell.js';
import { ShipLocations, type CharacterState, type Job, type ShipEntity } from './state.js';

export interface WorldOutbound {
  sendEvent(to: CharacterId, event: GameEvent): void;
  broadcastEvent(systemId: SystemId, event: GameEvent): void;
  /** Character changed grids (undock/thread/respawn): session needs a SNAPSHOT. */
  gridChanged(character: CharacterId): void;
}

export type Result<T = undefined> =
  | { readonly ok: true; readonly data?: T }
  | { readonly ok: false; readonly error: string };

const err = (error: string): { ok: false; error: string } => ({ ok: false, error });
const ok = <T>(data?: T): { ok: true; data?: T } => ({ ok: true, ...(data !== undefined ? { data } : {}) });

export class World {
  readonly registry: ContentRegistry;
  readonly pack: UniversePack;
  readonly ledger = new LumenLedger();
  readonly items = new ItemStore();
  readonly characters = new Map<CharacterId, CharacterState>();
  readonly jobs = new Map<JobId, Job>();
  private readonly cells = new Map<SystemId, SystemCell>();
  private readonly systemsById = new Map<SystemId, SolarSystem>();
  private readonly stationIndex = new Map<StationId, { station: Station; system: SolarSystem }>();
  readonly starterSystem: SolarSystem;
  readonly starterStation: Station;
  tickNumber = 0;
  private entityCounter = 0;
  private characterCounter = 0;
  private jobCounter = 0;
  private outbound: WorldOutbound = {
    sendEvent: () => undefined,
    broadcastEvent: () => undefined,
    gridChanged: () => undefined,
  };

  constructor(private readonly config: GameServerConfig) {
    this.registry = buildContentV1();
    const contentIssues = this.registry.validate();
    if (contentIssues.length > 0) {
      throw new Error(`content pack invalid: ${contentIssues.join('; ')}`);
    }
    this.pack = generateUniverse(config.universe);
    for (const system of this.pack.systems) {
      this.systemsById.set(system.id, system);
      for (const station of system.stations) {
        this.stationIndex.set(station.id, { station, system });
      }
    }
    // Starter home: a warded full-service station whose system has a belt.
    const starter = this.pack.systems.find(
      (s) =>
        s.band === 'warded' &&
        s.belts.length > 0 &&
        s.stations.some((st) => st.services.market && st.services.industry && st.services.refinery),
    );
    if (!starter) throw new Error('universe has no viable starter system');
    this.starterSystem = starter;
    this.starterStation = starter.stations.find(
      (st) => st.services.market && st.services.industry && st.services.refinery,
    ) as Station;
  }

  setOutbound(outbound: WorldOutbound): void {
    this.outbound = outbound;
  }

  /** Used by snapshot restore to keep ID allocation collision-free. */
  setCounters(characterCounter: number, jobCounter: number): void {
    this.characterCounter = characterCounter;
    this.jobCounter = jobCounter;
  }

  system(id: SystemId): SolarSystem | undefined {
    return this.systemsById.get(id);
  }

  stationInfo(id: StationId): { station: Station; system: SolarSystem } | undefined {
    return this.stationIndex.get(id);
  }

  /** Cells activate on first use and stay active (hibernation is Milestone B). */
  cell(systemId: SystemId): SystemCell {
    let cell = this.cells.get(systemId);
    if (!cell) {
      const system = this.systemsById.get(systemId);
      if (!system) throw new Error(`unknown system ${systemId}`);
      cell = new SystemCell(system, {
        registry: this.registry,
        items: this.items,
        seed: this.pack.seed,
        nextEntityId: () => entityId(`ent.${this.entityCounter++}`),
        sendEvent: (to, event) => this.outbound.sendEvent(to, event),
        broadcastEvent: (event) => this.outbound.broadcastEvent(systemId, event),
        onShipDestroyed: (owner) => this.handleShipDestroyed(owner),
      });
      this.cells.set(systemId, cell);
    }
    return cell;
  }

  activeCells(): IterableIterator<SystemCell> {
    return this.cells.values();
  }

  tick(dtSec: number): void {
    this.tickNumber++;
    for (const cell of this.cells.values()) {
      cell.tick(this.tickNumber, dtSec);
    }
  }

  // ── Characters ──────────────────────────────────────────────────────────

  findCharacterByName(name: string): CharacterState | undefined {
    for (const character of this.characters.values()) {
      if (character.name === name) return character;
    }
    return undefined;
  }

  /** Idempotent by name: re-connecting as the same name reconnects to the
   *  same character instead of spawning a fresh one (dev/CLI convenience). */
  getOrCreateCharacter(name: string): CharacterState {
    return this.findCharacterByName(name) ?? this.createCharacter(name);
  }

  createCharacter(name: string): CharacterState {
    const charId = mkCharacterId(`char.${this.characterCounter}`);
    const account: AccountId = mkAccountId(`acct.${this.characterCounter}`);
    this.characterCounter++;
    const character: CharacterState = {
      id: charId,
      accountId: account,
      name,
      systemId: this.starterSystem.id,
      dockedAt: this.starterStation.id,
      homeStationId: this.starterStation.id,
      loadout: STARTER_FIT_VERGE,
      skills: STARTER_SKILLS,
      shipEntityId: null,
    };
    this.characters.set(charId, character);
    this.provisionStarterKit(character);
    return character;
  }

  /** Starter kit (docs 02 §7, 06 §2): wallet faucet + hull, fittings, spares. */
  private provisionStarterKit(character: CharacterState): void {
    this.ledger.mint(LedgerAccounts.character(character.id), RULES.starterLumens, 'mint-starter');
    this.mintLoadout(character, character.loadout);
    // Spares in the home hangar: a mining hull with its tools, a kinetic
    // gun rack for the slugs below, and a first blueprint.
    const hangar = Locations.hangar(character.id, character.homeStationId);
    this.items.mint(hangar, itemTypeId('hull.mattock'), 1, 'spawn-starter');
    this.items.mint(hangar, itemTypeId('mod.burrower1'), 1, 'spawn-starter');
    this.items.mint(hangar, itemTypeId('mod.surveyor-lens1'), 1, 'spawn-starter');
    this.items.mint(hangar, itemTypeId('mod.slugthrower1-l'), 3, 'spawn-starter');
    this.items.mint(hangar, itemTypeId('mod.bulwark-extender1'), 1, 'spawn-starter');
    this.items.mint(hangar, itemTypeId('mod.flux-relay1'), 1, 'spawn-starter');
    this.items.mint(hangar, itemTypeId('bp.ammo.ferro-slug'), 1, 'spawn-starter');
    this.items.mint(ShipLocations.cargo(character.id), itemTypeId('ammo.ferro-slug'), 400, 'spawn-starter');
  }

  private mintLoadout(character: CharacterState, loadout: FitLoadout): void {
    this.items.mint(ShipLocations.hull(character.id), loadout.hullId, 1, 'spawn-starter');
    const mods = [...loadout.hardpoints, ...loadout.auxiliary, ...loadout.core, ...loadout.weaves];
    for (const moduleId of mods) {
      this.items.mint(ShipLocations.modules(character.id), moduleId, 1, 'spawn-starter');
    }
  }

  /** Destruction aftermath: respawn docked at home with a fresh starter hull
   *  (insurance-MVP faucet, doc 15; real insurance lands in Milestone B). */
  private handleShipDestroyed(owner: CharacterId): void {
    const character = this.characters.get(owner);
    if (!character) return;
    character.shipEntityId = null;
    character.systemId = this.stationIndex.get(character.homeStationId)?.system.id ?? character.systemId;
    character.dockedAt = character.homeStationId;
    character.loadout = STARTER_FIT_VERGE;
    this.mintLoadout(character, character.loadout);
    this.outbound.gridChanged(owner);
  }

  ship(character: CharacterState): ShipEntity | null {
    if (!character.shipEntityId) return null;
    const cell = this.cells.get(character.systemId);
    return (cell?.ships.get(character.shipEntityId) as ShipEntity | undefined) ?? null;
  }

  /** Derived stats (cargo/oreHold capacity, etc.) for the character's current
   *  fit, whether or not a live ship entity exists — docked pilots still
   *  have a hold size, they just aren't in space to prove it. */
  fittedStats(character: CharacterState): FittedStats {
    const ship = this.ship(character);
    if (ship) return ship.fitted.stats;
    return computeFit(this.registry, character.loadout, character.skills).stats;
  }

  // ── Docking / undocking / threading ─────────────────────────────────────

  undock(character: CharacterState): Result {
    if (!character.dockedAt) return err('not docked');
    const info = this.stationIndex.get(character.dockedAt);
    if (!info) return err('unknown station');
    const fitErrors = validateFit(this.registry, character.loadout, character.skills);
    if (fitErrors.length > 0) return err(`illegal fit: ${fitErrors[0]?.message}`);
    const fitted = computeFit(this.registry, character.loadout, character.skills);
    const cell = this.cell(info.system.id);
    // Deterministic per-character undock scatter: ships must never stack at
    // one exact point (degenerate distance/angular math, doc 05 §2).
    const scatter = fnv1a32(character.id as string);
    const undockPos: Vec3 = {
      x: info.station.pos.x + 2600 + (scatter % 700),
      y: info.station.pos.y + 1200 + ((scatter >>> 10) % 700),
      z: info.station.pos.z + ((scatter >>> 20) % 300),
    };
    const ship = cell.spawnShip(character.id, character.name, fitted, undockPos);
    character.dockedAt = null;
    character.shipEntityId = ship.id;
    this.outbound.sendEvent(character.id, { kind: 'undocked', systemId: character.systemId as string });
    this.outbound.gridChanged(character.id);
    return ok();
  }

  dock(character: CharacterState, stationId: StationId): Result {
    const ship = this.ship(character);
    if (!ship) return err('not in space');
    const info = this.stationIndex.get(stationId);
    if (!info || info.system.id !== character.systemId) return err('station not in this system');
    if (dist(ship.pos, info.station.pos) > RULES.dockRangeM) return err('too far from station');
    this.cell(character.systemId).removeShip(ship.id);
    character.dockedAt = stationId;
    character.shipEntityId = null;
    this.outbound.sendEvent(character.id, { kind: 'docked', stationId: stationId as string });
    return ok();
  }

  thread(character: CharacterState, terminusId: string): Result {
    const ship = this.ship(character);
    if (!ship) return err('not in space');
    const system = this.systemsById.get(character.systemId);
    if (!system) return err('unknown system');
    const terminus = system.termini.find((t) => (t.id as string) === terminusId);
    if (!terminus) return err('no such terminus here');
    if (dist(ship.pos, terminus.pos) > RULES.threadRangeM) return err('too far from terminus');
    const destSystem = this.systemsById.get(terminus.toSystemId);
    if (!destSystem) return err('destination unknown');
    const arrival = destSystem.termini.find((t) => t.weftlineId === terminus.weftlineId);
    if (!arrival) return err('weftline terminus missing on far side');

    const fitted = ship.fitted;
    this.cell(character.systemId).removeShip(ship.id);
    character.systemId = destSystem.id;
    const destCell = this.cell(destSystem.id);
    const newShip = destCell.spawnShip(character.id, character.name, fitted, {
      x: arrival.pos.x + 2000,
      y: arrival.pos.y + 1000,
      z: arrival.pos.z,
    });
    // Defense/flux state carries through the thread.
    newShip.defense = ship.defense;
    newShip.flux = ship.flux;
    character.shipEntityId = newShip.id;
    this.outbound.sendEvent(character.id, {
      kind: 'threaded',
      systemId: destSystem.id as string,
      systemName: destSystem.name,
    });
    this.outbound.gridChanged(character.id);
    return ok();
  }

  // ── Station services ────────────────────────────────────────────────────

  /** Refit while docked. Swapping hulls is allowed if the hangar holds the new
   *  hull; removed weaves are destroyed (doc 04 §1). */
  fitShip(character: CharacterState, loadout: FitLoadout): Result {
    if (!character.dockedAt) return err('must be docked to refit');
    const fitErrors = validateFit(this.registry, loadout, character.skills);
    if (fitErrors.length > 0) return err(fitErrors[0]?.message ?? 'illegal fit');

    const hangar = Locations.hangar(character.id, character.dockedAt);
    const hullLoc = ShipLocations.hull(character.id);
    const modsLoc = ShipLocations.modules(character.id);
    const current = character.loadout;

    // Availability check: hangar + current ship must cover the new loadout.
    const available = new Map<string, number>();
    const bump = (map: Map<string, number>, key: string, delta: number): void => {
      map.set(key, (map.get(key) ?? 0) + delta);
    };
    for (const stack of this.items.contents(hangar)) bump(available, stack.typeId as string, stack.qty);
    bump(available, current.hullId as string, 1);
    for (const m of [...current.hardpoints, ...current.auxiliary, ...current.core, ...current.weaves]) {
      bump(available, m as string, 1);
    }
    const needed = new Map<string, number>();
    bump(needed, loadout.hullId as string, 1);
    for (const m of [...loadout.hardpoints, ...loadout.auxiliary, ...loadout.core, ...loadout.weaves]) {
      bump(needed, m as string, 1);
    }
    for (const [typeId, qty] of needed) {
      if ((available.get(typeId) ?? 0) < qty) return err(`missing ${typeId} in hangar`);
    }

    // Strip current ship to hangar; removed weaves are destroyed below.
    this.items.moveAll(hullLoc, hangar);
    this.items.moveAll(modsLoc, hangar);

    // Weave destruction: weaves from the old fit not reused in the new one.
    const reuse = new Map<string, number>();
    for (const w of loadout.weaves) bump(reuse, w as string, 1);
    for (const w of current.weaves) {
      const keep = reuse.get(w as string) ?? 0;
      if (keep > 0) reuse.set(w as string, keep - 1);
      else this.items.burn(hangar, w, 1, 'destroy');
    }

    // Assemble the new ship.
    this.items.move(hangar, hullLoc, loadout.hullId, 1);
    for (const m of [...loadout.hardpoints, ...loadout.auxiliary, ...loadout.core, ...loadout.weaves]) {
      this.items.move(hangar, modsLoc, m, 1);
    }
    character.loadout = loadout;
    return ok();
  }

  hangarMove(
    character: CharacterState,
    direction: 'toCargo' | 'toHangar',
    typeId: ItemTypeId,
    qty: number,
  ): Result {
    if (!character.dockedAt) return err('must be docked');
    if (!this.registry.tryItem(typeId)) return err('unknown item type');
    const hangar = Locations.hangar(character.id, character.dockedAt);
    const cargo = ShipLocations.cargo(character.id);
    if (direction === 'toHangar') {
      // Unload from the cargo hold first, then the ore hold.
      const oreHold = ShipLocations.oreHold(character.id);
      const inCargo = this.items.quantity(cargo, typeId);
      const inOreHold = this.items.quantity(oreHold, typeId);
      if (inCargo + inOreHold < qty) return err('not enough on ship');
      const fromCargo = Math.min(qty, inCargo);
      if (fromCargo > 0) this.items.move(cargo, hangar, typeId, fromCargo);
      if (qty - fromCargo > 0) this.items.move(oreHold, hangar, typeId, qty - fromCargo);
      return ok();
    }
    if (this.items.quantity(hangar, typeId) < qty) return err('not enough in hangar');
    const fitted = computeFit(this.registry, character.loadout, character.skills);
    const used = this.cargoUsedM3(character.id);
    const volume = this.registry.item(typeId).volume * qty;
    if (used + volume > fitted.stats.cargo) return err('cargo hold too small');
    this.items.move(hangar, cargo, typeId, qty);
    return ok();
  }

  cargoUsedM3(character: CharacterId, location?: LocationId): number {
    const loc = location ?? ShipLocations.cargo(character);
    return this.items
      .contents(loc)
      .reduce((acc, s) => acc + s.qty * this.registry.item(s.typeId).volume, 0);
  }

  refineOre(character: CharacterState, oreId: ItemTypeId, units: number): Result<{ outputs: Array<{ typeId: string; qty: number }> }> {
    if (!character.dockedAt) return err('must be docked');
    const info = this.stationIndex.get(character.dockedAt);
    if (!info?.station.services.refinery) return err('no refinery at this station');
    const oreDef = this.registry.tryItem(oreId);
    if (!oreDef || oreDef.category !== 'ore') return err('not an ore');
    const hangar = Locations.hangar(character.id, character.dockedAt);
    const held = this.items.quantity(hangar, oreId);
    if (held < units) return err('not enough ore in hangar');
    const mastery = character.skills['disc.refining'] ?? 0;
    const result = refineMath(this.registry, oreId, units, RULES.stationRefineYield, mastery);
    if (result.batches === 0) return err(`refining needs batches of ${oreDef.batchSize}`);
    this.items.burn(hangar, oreId, result.consumedUnits, 'refine');
    for (const output of result.outputs) {
      this.items.mint(hangar, output.typeId, output.qty, 'refine');
    }
    return ok({ outputs: result.outputs.map((o) => ({ typeId: o.typeId as string, qty: o.qty })) });
  }

  startManufactureJob(character: CharacterState, blueprintId: ItemTypeId, runs: number): Result<{ jobId: string; readyAtTick: number }> {
    if (!character.dockedAt) return err('must be docked');
    const info = this.stationIndex.get(character.dockedAt);
    if (!info?.station.services.industry) return err('no industry bays at this station');
    const bpDef = this.registry.tryItem(blueprintId);
    if (!bpDef || bpDef.category !== 'blueprint') return err('not a blueprint');
    const hangar = Locations.hangar(character.id, character.dockedAt);
    if (this.items.quantity(hangar, blueprintId) < 1) return err('blueprint not in hangar');

    const quote = quoteManufactureJob(this.registry, blueprintId, 0, 0, runs);
    for (const input of quote.inputs) {
      if (this.items.quantity(hangar, input.typeId) < input.qty) {
        return err(`missing input ${input.typeId} × ${input.qty}`);
      }
    }
    const wallet = LedgerAccounts.character(character.id);
    if (this.ledger.balance(wallet) < quote.jobFeeLM) return err('cannot afford job fee');

    const id = mkJobId(`job.${this.jobCounter++}`);
    this.ledger.burn(wallet, quote.jobFeeLM, 'job-fee');
    for (const input of quote.inputs) {
      this.items.move(hangar, Locations.jobInput(id), input.typeId, input.qty);
    }
    const readyAtTick = this.tickNumber + Math.max(1, Math.ceil(quote.timeSec / 0.25));
    const job: Job = {
      id: id as string,
      owner: character.id,
      stationId: character.dockedAt,
      blueprintId,
      outputTypeId: quote.output.typeId,
      outputQty: quote.output.qty,
      inputs: quote.inputs,
      readyAtTick,
      collected: false,
    };
    this.jobs.set(id, job);
    return ok({ jobId: id as string, readyAtTick });
  }

  collectJob(character: CharacterState, jobIdStr: string): Result {
    const job = this.jobs.get(mkJobId(jobIdStr));
    if (!job || job.owner !== character.id) return err('unknown job');
    if (job.collected) return err('already collected');
    if (this.tickNumber < job.readyAtTick) return err('job still running');
    if (character.dockedAt !== job.stationId) return err('collect at the job station');
    const escrow = Locations.jobInput(mkJobId(job.id));
    for (const input of job.inputs) {
      this.items.burn(escrow, input.typeId, input.qty, 'manufacture');
    }
    this.items.mint(Locations.hangar(character.id, job.stationId), job.outputTypeId, job.outputQty, 'manufacture');
    job.collected = true;
    return ok();
  }

  lootWreck(character: CharacterState, wreckIdStr: string): Result {
    const ship = this.ship(character);
    if (!ship) return err('not in space');
    const cell = this.cell(character.systemId);
    const wreck = cell.wrecks.get(entityId(wreckIdStr));
    if (!wreck) return err('no such wreck');
    if (dist(ship.pos, wreck.pos) > RULES.lootRangeM) return err('too far from wreck');
    const cargo = ShipLocations.cargo(character.id);
    const capacity = ship.fitted.stats.cargo;
    for (const stack of this.items.contents(wreck.lootLocation)) {
      const free = capacity - this.cargoUsedM3(character.id);
      const volume = this.registry.item(stack.typeId).volume;
      const movable = Math.min(stack.qty, Math.floor(free / volume));
      if (movable > 0) this.items.move(wreck.lootLocation, cargo, stack.typeId, movable);
    }
    if (this.items.contents(wreck.lootLocation).length === 0) {
      cell.wrecks.delete(wreck.id);
    }
    return ok();
  }
}
