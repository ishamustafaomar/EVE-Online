/**
 * SystemCell: the authoritative simulation of one solar system (doc 09 §2).
 * Fixed-tick; every mutation is validated against server state; clients only
 * ever expressed intents to get here.
 */

import {
  applyDamage,
  arcArrivalPos,
  arcSpoolSec,
  ARC_MIN_DISTANCE_M,
  angularVelocity,
  canArc,
  dist,
  Locations,
  regenFlux,
  regenShield,
  resolveJam,
  resolveTurretVolley,
  rngStream,
  stepMovement,
  sub,
  tryConsumeFlux,
  vec,
  type CharacterId,
  type ContentRegistry,
  type DamageVector,
  type DefenseProfile,
  type EntityId,
  type FittedShip,
  type ItemStore,
  type MovementOrder,
  type SolarSystem,
  type Vec3,
} from '@starweft/core';
import { entityId } from '@starweft/core';
import type { GameEvent } from '@starweft/protocol';
import { RULES } from '../config.js';
import type {
  AsteroidEntity,
  CellEntity,
  ModuleRuntime,
  ShipEntity,
  SlotRow,
  WreckEntity,
} from './state.js';
import { ShipLocations } from './state.js';

export interface CellDeps {
  readonly registry: ContentRegistry;
  readonly items: ItemStore;
  readonly seed: string;
  readonly nextEntityId: () => EntityId;
  /** Deliver an event to one character's session (if connected). */
  readonly sendEvent: (to: CharacterId, event: GameEvent) => void;
  /** Broadcast an event to every character with a ship in this cell. */
  readonly broadcastEvent: (event: GameEvent) => void;
  /** A ship was destroyed: world layer handles respawn bookkeeping. */
  readonly onShipDestroyed: (owner: CharacterId) => void;
}

interface PendingWarhead {
  readonly arrivalTick: number;
  readonly attackerId: EntityId;
  readonly targetId: EntityId;
  readonly damage: DamageVector;
  readonly blastRadiusM: number;
}

export class SystemCell {
  readonly ships = new Map<EntityId, ShipEntity>();
  readonly asteroids = new Map<EntityId, AsteroidEntity>();
  readonly wrecks = new Map<EntityId, WreckEntity>();
  private readonly warheads: PendingWarhead[] = [];

  constructor(
    readonly system: SolarSystem,
    private readonly deps: CellDeps,
  ) {
    // Materialize asteroid nodes from the immutable pack; depletion is cell state.
    for (const belt of system.belts) {
      for (const node of belt.nodes) {
        const id = entityId(`ast.${belt.id}.${node.index}`);
        this.asteroids.set(id, {
          kind: 'asteroid',
          id,
          name: `${belt.name} node ${node.index + 1}`,
          pos: {
            x: belt.pos.x + node.offset.x,
            y: belt.pos.y + node.offset.y,
            z: belt.pos.z + node.offset.z,
          },
          oreId: node.oreId,
          unitsRemaining: node.units,
          dirty: false,
        });
      }
    }
  }

  entity(id: EntityId): CellEntity | undefined {
    return this.ships.get(id) ?? this.asteroids.get(id) ?? this.wrecks.get(id);
  }

  entityPos(id: EntityId): Vec3 | undefined {
    return this.entity(id)?.pos;
  }

  // ── Ship lifecycle ──────────────────────────────────────────────────────

  spawnShip(owner: CharacterId, name: string, fitted: FittedShip, pos: Vec3): ShipEntity {
    const ship: ShipEntity = {
      kind: 'ship',
      id: this.deps.nextEntityId(),
      owner,
      name,
      fitted,
      defense: { shield: fitted.stats.shieldHp, armor: fitted.stats.armorHp, hull: fitted.stats.hullHp },
      flux: { flux: fitted.stats.fluxCapacity },
      pos,
      vel: vec(0, 0, 0),
      order: { kind: 'hold' },
      modules: buildModuleRuntimes(this.deps.registry, fitted),
      locks: new Set(),
      arc: null,
      snares: new Map(),
      stasis: new Map(),
      paints: new Map(),
      propulsion: null,
    };
    this.ships.set(ship.id, ship);
    return ship;
  }

  removeShip(id: EntityId): void {
    this.ships.delete(id);
    for (const other of this.ships.values()) {
      other.locks.delete(id);
      other.snares.delete(id);
      other.stasis.delete(id);
      other.paints.delete(id);
      for (const m of other.modules) {
        if (m.targetId === id) {
          m.targetId = null;
          if (m.def.active?.requiresTarget) m.state = 'idle';
        }
      }
    }
  }

  // ── Command surface (called by gateway after protocol validation) ───────

  setMovementOrder(ship: ShipEntity, order: MovementOrder): { ok: boolean; error?: string } {
    if (ship.arc) return { ok: false, error: 'arc drive spooling' };
    if (order.kind === 'orbit' || order.kind === 'approach') {
      if (!this.entity(order.targetId)) return { ok: false, error: 'unknown target' };
    }
    ship.order = order;
    return { ok: true };
  }

  requestArc(ship: ShipEntity, dest: Vec3, tick: number): { ok: boolean; error?: string } {
    if (ship.arc) return { ok: false, error: 'already spooling' };
    if (!canArc(ship.pos, dest)) {
      return { ok: false, error: `arc requires ${ARC_MIN_DISTANCE_M / 1000} km minimum` };
    }
    if (this.isSnared(ship, tick)) return { ok: false, error: 'arc drive inhibited (snare)' };
    const spoolTicks = Math.ceil(arcSpoolSec(ship.fitted.stats.agility) / 0.25);
    ship.arc = { destPos: dest, endTick: tick + spoolTicks };
    ship.order = { kind: 'hold' };
    this.deps.sendEvent(ship.owner, { kind: 'arcStart', etaTicks: spoolTicks });
    return { ok: true };
  }

  lockTarget(ship: ShipEntity, targetId: EntityId): { ok: boolean; error?: string } {
    const target = this.entity(targetId);
    if (!target || target.kind === 'wreck') return { ok: false, error: 'cannot lock that' };
    if (targetId === ship.id) return { ok: false, error: 'cannot lock yourself' };
    if (ship.locks.size >= ship.fitted.stats.maxLockedTargets) {
      return { ok: false, error: 'lock capacity reached' };
    }
    if (dist(ship.pos, target.pos) > ship.fitted.stats.lockRange) {
      return { ok: false, error: 'out of lock range' };
    }
    ship.locks.add(targetId);
    this.deps.sendEvent(ship.owner, { kind: 'lockAcquired', targetId: targetId as string });
    return { ok: true };
  }

  unlockTarget(ship: ShipEntity, targetId: EntityId): void {
    ship.locks.delete(targetId);
    for (const m of ship.modules) {
      if (m.targetId === targetId) {
        m.targetId = null;
        if (m.def.active?.requiresTarget) m.state = 'idle';
      }
    }
  }

  activateModule(
    ship: ShipEntity,
    slot: SlotRow,
    index: number,
    targetId: EntityId | undefined,
    tick: number,
  ): { ok: boolean; error?: string } {
    const module = ship.modules.find((m) => m.slot === slot && m.index === index);
    if (!module) return { ok: false, error: 'no module in that slot' };
    const active = module.def.active;
    if (!active) return { ok: false, error: 'module is passive' };
    if (module.state === 'cycling') return { ok: false, error: 'already cycling' };

    if (active.requiresTarget) {
      if (!targetId) return { ok: false, error: 'target required' };
      const isMining = active.effect.kind === 'extractor';
      const target = this.entity(targetId);
      if (!target) return { ok: false, error: 'unknown target' };
      if (isMining && target.kind !== 'asteroid') return { ok: false, error: 'extractors target asteroids' };
      if (!isMining && target.kind !== 'ship') return { ok: false, error: 'weapons target ships' };
      if (!isMining && !ship.locks.has(targetId)) return { ok: false, error: 'target not locked' };
      if (active.rangeM !== undefined && dist(ship.pos, target.pos) > active.rangeM) {
        return { ok: false, error: 'out of range' };
      }
      module.targetId = targetId;
    }

    if (!this.consumeCycleInputs(ship, module)) {
      return { ok: false, error: 'insufficient flux or munitions' };
    }
    module.state = 'cycling';
    module.repeat = true;
    module.cycleEndTick = tick + Math.max(1, Math.round(active.cycleSec / 0.25));
    if (active.effect.kind === 'propulsion') {
      ship.propulsion = {
        velocityMul: active.effect.velocityMul,
        sigMul: active.effect.sigMul,
        untilTick: module.cycleEndTick + 1,
      };
    }
    return { ok: true };
  }

  deactivateModule(ship: ShipEntity, slot: SlotRow, index: number): { ok: boolean; error?: string } {
    const module = ship.modules.find((m) => m.slot === slot && m.index === index);
    if (!module) return { ok: false, error: 'no module in that slot' };
    module.repeat = false;
    return { ok: true };
  }

  // ── Effect state queries ────────────────────────────────────────────────

  isSnared(ship: ShipEntity, tick: number): boolean {
    for (const effect of ship.snares.values()) if (effect.untilTick >= tick) return true;
    return false;
  }

  private stasisMul(ship: ShipEntity, tick: number): number {
    let mul = 1;
    for (const effect of ship.stasis.values()) {
      if (effect.untilTick >= tick) mul *= effect.value;
    }
    return Math.max(0.1, mul);
  }

  private effectiveSignature(ship: ShipEntity, tick: number): number {
    let sig = ship.fitted.stats.signature;
    if (ship.propulsion && ship.propulsion.untilTick >= tick) sig *= ship.propulsion.sigMul;
    for (const effect of ship.paints.values()) {
      if (effect.untilTick >= tick) sig *= effect.value;
    }
    return sig;
  }

  // ── Tick ────────────────────────────────────────────────────────────────

  tick(tick: number, dtSec: number): void {
    // 1. Arc drives.
    for (const ship of this.ships.values()) {
      if (!ship.arc) continue;
      if (this.isSnared(ship, tick)) {
        ship.arc = null;
        this.deps.sendEvent(ship.owner, { kind: 'arcBlocked', reason: 'snared during spool' });
      } else if (tick >= ship.arc.endTick) {
        ship.pos = arcArrivalPos(ship.pos, ship.arc.destPos);
        ship.vel = vec(0, 0, 0);
        ship.arc = null;
        this.deps.sendEvent(ship.owner, { kind: 'arcDone' });
      }
    }

    // 2. Movement.
    for (const ship of this.ships.values()) {
      if (ship.arc) continue;
      const velocityMul =
        this.stasisMul(ship, tick) *
        (ship.propulsion && ship.propulsion.untilTick >= tick ? ship.propulsion.velocityMul : 1);
      stepMovement(
        ship,
        ship.order,
        { maxVelocity: ship.fitted.stats.maxVelocity, agility: ship.fitted.stats.agility, velocityMul },
        dtSec,
        (id) => this.entityPos(id),
      );
    }

    // 3. Module cycle completions.
    for (const ship of this.ships.values()) {
      for (const module of ship.modules) {
        if (module.state === 'cycling' && tick >= module.cycleEndTick) {
          this.completeCycle(ship, module, tick);
        }
      }
    }

    // 4. Warhead arrivals.
    for (let i = this.warheads.length - 1; i >= 0; i--) {
      const shot = this.warheads[i] as PendingWarhead;
      if (tick >= shot.arrivalTick) {
        this.warheads.splice(i, 1);
        const target = this.ships.get(shot.targetId);
        const attacker = this.ships.get(shot.attackerId);
        if (target) {
          const sig = this.effectiveSignature(target, tick);
          const scale = Math.min(1, sig / shot.blastRadiusM);
          this.dealDamage(attacker ?? null, target, scaleDamage(shot.damage, scale), tick);
        }
      }
    }

    // 5. Regen.
    for (const ship of this.ships.values()) {
      regenShield(ship.defense, profileOf(ship.fitted), dtSec);
      regenFlux(ship.flux, ship.fitted.stats.fluxCapacity, ship.fitted.stats.fluxRechargeSec, dtSec);
    }

    // 6. Expire hostile effects.
    for (const ship of this.ships.values()) {
      for (const map of [ship.snares, ship.stasis, ship.paints]) {
        for (const [source, effect] of map) {
          if (effect.untilTick < tick) map.delete(source);
        }
      }
      if (ship.propulsion && ship.propulsion.untilTick < tick) ship.propulsion = null;
    }
  }

  // ── Cycle resolution ────────────────────────────────────────────────────

  /** Pay flux (and ammo for munition weapons). All-or-nothing. */
  private consumeCycleInputs(ship: ShipEntity, module: ModuleRuntime): boolean {
    const active = module.def.active;
    if (!active) return false;
    const fx = active.effect;
    const munitionFamily =
      fx.kind === 'turret' ? fx.munitionFamily : fx.kind === 'launcher' ? fx.munitionFamily : undefined;
    if (munitionFamily) {
      if (!this.findMunition(ship, munitionFamily)) return false;
    }
    if (!tryConsumeFlux(ship.flux, active.fluxPerCycle)) return false;
    if (munitionFamily) {
      const munitionId = this.findMunition(ship, munitionFamily);
      if (munitionId) {
        this.deps.items.burn(ShipLocations.cargo(ship.owner), munitionId, 1, 'destroy');
      }
    }
    return true;
  }

  private findMunition(ship: ShipEntity, family: string): import('@starweft/core').ItemTypeId | null {
    for (const stack of this.deps.items.contents(ShipLocations.cargo(ship.owner))) {
      const def = this.deps.registry.tryItem(stack.typeId);
      if (def?.category === 'munition' && def.family === family) return stack.typeId;
    }
    return null;
  }

  private completeCycle(ship: ShipEntity, module: ModuleRuntime, tick: number): void {
    const active = module.def.active;
    if (!active) return;
    const fail = (reason: string): void => {
      module.state = 'idle';
      this.deps.sendEvent(ship.owner, { kind: 'cycleFailed', slot: module.slot, index: module.index, reason });
    };

    const fx = active.effect;
    let target: CellEntity | undefined;
    if (active.requiresTarget) {
      target = module.targetId ? this.entity(module.targetId) : undefined;
      if (!target) return fail('target lost');
      if (active.rangeM !== undefined && dist(ship.pos, target.pos) > active.rangeM) {
        return fail('out of range');
      }
      if (fx.kind !== 'extractor' && target.kind === 'ship' && !ship.locks.has(target.id)) {
        return fail('lock lost');
      }
    }

    switch (fx.kind) {
      case 'turret': {
        if (target?.kind !== 'ship') return fail('invalid target');
        const rel = sub(target.pos, ship.pos);
        const relVel = sub(target.vel, ship.vel);
        const weapon = ship.fitted.weapons.find(
          (w) => w.slotIndex === module.index && w.module.id === module.def.id,
        );
        if (!weapon) return fail('weapon stats missing');
        const rng = rngStream(this.deps.seed, 'volley', this.system.id, ship.id, tick, module.index);
        const hit = resolveTurretVolley(
          rng,
          {
            tracking: weapon.tracking ?? 0.1,
            optimalM: weapon.optimalM ?? 1000,
            attenuationM: weapon.attenuationM ?? 1000,
            caliberSig: weapon.caliberSig ?? 100,
          },
          dist(ship.pos, target.pos),
          angularVelocity(rel, relVel),
          this.effectiveSignature(target, tick),
        );
        if (hit.hit) {
          this.dealDamage(ship, target, scaleDamage(weapon.volley, hit.damageScale), tick);
        } else {
          this.deps.broadcastEvent({
            kind: 'volley', from: ship.id as string, to: target.id as string,
            total: 0, hit: false, destroyed: false,
          });
        }
        break;
      }
      case 'launcher': {
        if (target?.kind !== 'ship') return fail('invalid target');
        const weapon = ship.fitted.weapons.find(
          (w) => w.slotIndex === module.index && w.module.id === module.def.id,
        );
        if (!weapon) return fail('weapon stats missing');
        const distance = dist(ship.pos, target.pos);
        const flightTicks = Math.max(1, Math.ceil(distance / fx.flightSpeed / 0.25));
        if (flightTicks * 0.25 > fx.maxFlightSec) return fail('target beyond warhead endurance');
        const munition = this.deps.registry
          .allMunitions()
          .find((m) => m.family === fx.munitionFamily);
        this.warheads.push({
          arrivalTick: tick + flightTicks,
          attackerId: ship.id,
          targetId: target.id,
          damage: weapon.volley,
          blastRadiusM: munition?.blastRadiusM ?? 50,
        });
        break;
      }
      case 'extractor': {
        if (target?.kind !== 'asteroid') return fail('invalid target');
        const extractor = ship.fitted.extractors.find((e) => e.slotIndex === module.index);
        if (!extractor) return fail('extractor stats missing');
        const ore = this.deps.registry.ore(target.oreId);
        const holdLoc =
          ship.fitted.stats.oreHold > 0 ? ShipLocations.oreHold(ship.owner) : ShipLocations.cargo(ship.owner);
        const capacity = ship.fitted.stats.oreHold > 0 ? ship.fitted.stats.oreHold : ship.fitted.stats.cargo;
        const usedM3 = this.deps.items
          .contents(holdLoc)
          .reduce((acc, s) => acc + s.qty * this.deps.registry.item(s.typeId).volume, 0);
        const freeM3 = Math.max(0, capacity - usedM3);
        const units = Math.min(
          Math.floor(extractor.yieldM3 / ore.volume),
          target.unitsRemaining,
          Math.floor(freeM3 / ore.volume),
        );
        if (units <= 0) return fail(target.unitsRemaining <= 0 ? 'node depleted' : 'hold full');
        target.unitsRemaining -= units;
        target.dirty = true;
        this.deps.items.mint(holdLoc, target.oreId, units, 'mining');
        this.deps.sendEvent(ship.owner, { kind: 'mined', oreId: target.oreId as string, units });
        if (target.unitsRemaining <= 0) this.asteroids.delete(target.id);
        break;
      }
      case 'shieldBoost': {
        ship.defense.shield = Math.min(ship.fitted.stats.shieldHp, ship.defense.shield + fx.hp);
        break;
      }
      case 'armorMend': {
        ship.defense.armor = Math.min(ship.fitted.stats.armorHp, ship.defense.armor + fx.hp);
        break;
      }
      case 'snare': {
        if (target?.kind !== 'ship') return fail('invalid target');
        target.snares.set(ship.id, { untilTick: tick + cycleTicks(active.cycleSec), value: 1 });
        break;
      }
      case 'stasis': {
        if (target?.kind !== 'ship') return fail('invalid target');
        target.stasis.set(ship.id, { untilTick: tick + cycleTicks(active.cycleSec), value: fx.velocityMul });
        break;
      }
      case 'paint': {
        if (target?.kind !== 'ship') return fail('invalid target');
        target.paints.set(ship.id, { untilTick: tick + cycleTicks(active.cycleSec), value: fx.sigMul });
        break;
      }
      case 'jam': {
        if (target?.kind !== 'ship') return fail('invalid target');
        const rng = rngStream(this.deps.seed, 'jam', this.system.id, ship.id, tick, module.index);
        if (resolveJam(rng, fx.strength, target.fitted.stats.sensorStrength)) {
          for (const lockedId of [...target.locks]) {
            target.locks.delete(lockedId);
            this.deps.sendEvent(target.owner, {
              kind: 'lockLost', targetId: lockedId as string, reason: 'sensors jammed',
            });
          }
          for (const m of target.modules) {
            if (m.def.active?.requiresTarget && m.def.active.effect.kind !== 'extractor') {
              m.targetId = null;
              m.state = 'idle';
            }
          }
        }
        break;
      }
      case 'propulsion': {
        ship.propulsion = {
          velocityMul: fx.velocityMul,
          sigMul: fx.sigMul,
          untilTick: tick + cycleTicks(active.cycleSec) + 1,
        };
        break;
      }
      case 'fluxDrain': {
        if (target?.kind !== 'ship') return fail('invalid target');
        target.flux.flux = Math.max(0, target.flux.flux - fx.amountGJ);
        break;
      }
      case 'sound':
      case 'veil': {
        // Sounding resolution and veils land in Milestone B (docs 08, 15);
        // cycling them is legal but has no grid effect yet.
        break;
      }
    }

    // Auto-repeat while the pilot hasn't deactivated and inputs remain.
    if (module.repeat && this.consumeCycleInputs(ship, module)) {
      module.cycleEndTick = tick + cycleTicks(active.cycleSec);
    } else {
      module.state = 'idle';
    }
  }

  private dealDamage(attacker: ShipEntity | null, target: ShipEntity, dmg: DamageVector, tick: number): void {
    const result = applyDamage(target.defense, profileOf(target.fitted), dmg);
    this.deps.broadcastEvent({
      kind: 'volley',
      from: (attacker?.id ?? 'environment') as string,
      to: target.id as string,
      total: Math.round((result.toShield + result.toArmor + result.toHull) * 10) / 10,
      hit: true,
      destroyed: result.destroyed,
    });
    if (result.destroyed) this.destroyShip(target, tick);
  }

  private destroyShip(ship: ShipEntity, tick: number): void {
    const wreckId = this.deps.nextEntityId();
    const wreck: WreckEntity = {
      kind: 'wreck',
      id: wreckId,
      name: `Wreck of ${ship.name}`,
      pos: ship.pos,
      lootLocation: Locations.wreck(wreckId),
    };
    this.wrecks.set(wreckId, wreck);

    // Loot rolls: each cargo/module stack survives at 50% per item (doc 05 §9).
    const rng = rngStream(this.deps.seed, 'loot', this.system.id, ship.id, tick);
    const sources = [ShipLocations.cargo(ship.owner), ShipLocations.oreHold(ship.owner), ShipLocations.modules(ship.owner)];
    for (const source of sources) {
      for (const stack of this.deps.items.contents(source)) {
        let surviving = 0;
        for (let i = 0; i < stack.qty; i++) {
          if (rng.chance(RULES.lootDropChance)) surviving++;
        }
        if (surviving > 0) this.deps.items.move(source, wreck.lootLocation, stack.typeId, surviving);
        const destroyed = stack.qty - surviving;
        if (destroyed > 0) this.deps.items.burn(source, stack.typeId, destroyed, 'destroy');
      }
    }
    // The hull never survives.
    const hullLoc = ShipLocations.hull(ship.owner);
    for (const stack of this.deps.items.contents(hullLoc)) {
      this.deps.items.burn(hullLoc, stack.typeId, stack.qty, 'destroy');
    }

    this.deps.broadcastEvent({ kind: 'destroyed', entityId: ship.id as string, wreckId: wreckId as string });
    this.removeShip(ship.id);
    this.deps.onShipDestroyed(ship.owner);
  }
}

function cycleTicks(cycleSec: number): number {
  return Math.max(1, Math.round(cycleSec / 0.25));
}

function buildModuleRuntimes(registry: ContentRegistry, fitted: FittedShip): ModuleRuntime[] {
  const rows: ReadonlyArray<readonly [SlotRow, readonly import('@starweft/core').ItemTypeId[]]> = [
    ['hardpoint', fitted.loadout.hardpoints],
    ['auxiliary', fitted.loadout.auxiliary],
    ['core', fitted.loadout.core],
  ];
  const out: ModuleRuntime[] = [];
  for (const [slot, moduleIds] of rows) {
    moduleIds.forEach((moduleId, index) => {
      out.push({
        slot,
        index,
        def: registry.module(moduleId),
        state: 'idle',
        cycleEndTick: 0,
        targetId: null,
        repeat: false,
      });
    });
  }
  return out;
}

function profileOf(fitted: FittedShip): DefenseProfile {
  return {
    shieldMax: fitted.stats.shieldHp,
    shieldRechargeSec: fitted.stats.shieldRechargeSec,
    armorMax: fitted.stats.armorHp,
    hullMax: fitted.stats.hullHp,
    shieldResists: fitted.stats.shieldResists,
    armorResists: fitted.stats.armorResists,
    structureResists: fitted.stats.structureResists,
  };
}

function scaleDamage(d: DamageVector, mul: number): DamageVector {
  return { kinetic: d.kinetic * mul, thermal: d.thermal * mul, ion: d.ion * mul, breach: d.breach * mul };
}
