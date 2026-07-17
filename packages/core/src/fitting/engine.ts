/**
 * Fitting engine (doc 04 §3): legality validation and derived-stat
 * computation. This single implementation is the authority on the server and
 * the preview on the client — one code path, no drift.
 */

import type { ContentRegistry } from '../content/registry.js';
import type {
  DamageVector,
  HullDef,
  ModuleDef,
  MunitionDef,
  ResistProfile,
  SlotKind,
  StatKey,
  StatMod,
} from '../content/types.js';
import type {
  ExtractorStat,
  FitError,
  FitLoadout,
  FittedShip,
  FittedStats,
  SkillLevels,
  WeaponStat,
} from './types.js';

/**
 * Interference falloff (stacking penalty analog, doc 04 §3): the i-th
 * strongest same-stat multiplier (0-based) is damped by exp(-(i/2.22)²).
 */
export function interferenceFalloff(index: number): number {
  return Math.exp(-((index / 2.22) ** 2));
}

const RESIST_CAP = 0.85;

/** Stats that are pure scalars with base 1.0 (weapon/yield multipliers). */
const SCALAR_STATS: ReadonlySet<StatKey> = new Set<StatKey>([
  'turretDamage',
  'turretTracking',
  'turretOptimal',
  'turretAttenuation',
  'launcherDamage',
  'miningYield',
]);

interface ModAccumulator {
  adds: number;
  muls: number[];
  resists: number[];
  /** Hull-bonus multipliers are interference-exempt. */
  exemptMuls: number[];
}

class StatTable {
  private readonly table = new Map<StatKey, ModAccumulator>();

  private acc(stat: StatKey): ModAccumulator {
    let a = this.table.get(stat);
    if (!a) {
      a = { adds: 0, muls: [], resists: [], exemptMuls: [] };
      this.table.set(stat, a);
    }
    return a;
  }

  addMod(mod: StatMod, exempt: boolean): void {
    const a = this.acc(mod.stat);
    if (mod.op === 'add') a.adds += mod.value;
    else if (mod.op === 'mul') (exempt ? a.exemptMuls : a.muls).push(mod.value);
    else a.resists.push(mod.value);
  }

  /** Resolve a regular stat from its base value. */
  resolve(stat: StatKey, base: number): number {
    const a = this.table.get(stat);
    if (!a) return base;
    let value = base + a.adds;
    const sorted = [...a.muls].sort((x, y) => Math.abs(y - 1) - Math.abs(x - 1));
    sorted.forEach((mul, i) => {
      value *= 1 + (mul - 1) * interferenceFalloff(i);
    });
    for (const mul of a.exemptMuls) value *= mul;
    return value;
  }

  /** Resolve a resist channel: diminishing bonuses over the hull base. */
  resolveResist(stat: StatKey, base: number): number {
    const a = this.table.get(stat);
    if (!a) return Math.min(base, RESIST_CAP);
    let remaining = 1 - base;
    const sorted = [...a.resists].sort((x, y) => y - x);
    sorted.forEach((r, i) => {
      remaining *= 1 - r * interferenceFalloff(i);
    });
    return Math.min(1 - remaining, RESIST_CAP);
  }
}

function slotOf(loadout: FitLoadout, kind: SlotKind): readonly import('../kernel/ids.js').ItemTypeId[] {
  switch (kind) {
    case 'hardpoint':
      return loadout.hardpoints;
    case 'auxiliary':
      return loadout.auxiliary;
    case 'core':
      return loadout.core;
    case 'weave':
      return loadout.weaves;
  }
}

const SLOT_KINDS: readonly SlotKind[] = ['hardpoint', 'auxiliary', 'core', 'weave'];

function skillLevel(skills: SkillLevels, id: string): number {
  const level = skills[id];
  return typeof level === 'number' ? level : 0;
}

/** Validate loadout legality. Empty array = legal fit (server gates undock on this). */
export function validateFit(
  registry: ContentRegistry,
  loadout: FitLoadout,
  skills: SkillLevels,
): FitError[] {
  const errors: FitError[] = [];
  const hullDef = registry.tryItem(loadout.hullId);
  if (!hullDef || hullDef.category !== 'hull') {
    return [{ code: 'unknown-hull', message: `unknown hull ${loadout.hullId}` }];
  }
  const hull: HullDef = hullDef;

  for (const req of hull.disciplines) {
    const actual = skillLevel(skills, req.id);
    if (actual < req.level) {
      errors.push({
        code: 'discipline',
        message: `${hull.name} requires ${req.id} ${req.level} (have ${actual})`,
      });
    }
  }

  let power = 0;
  let compute = 0;
  const groupCounts = new Map<string, number>();

  for (const kind of SLOT_KINDS) {
    const fitted = slotOf(loadout, kind);
    if (fitted.length > hull.slots[kind]) {
      errors.push({
        code: 'slot-overflow',
        message: `${kind} slots: ${fitted.length} fitted, ${hull.slots[kind]} available`,
      });
    }
    for (const moduleId of fitted) {
      const def = registry.tryItem(moduleId);
      if (!def || def.category !== 'module') {
        errors.push({ code: 'unknown-module', message: `unknown module ${moduleId}` });
        continue;
      }
      const module: ModuleDef = def;
      if (module.slot !== kind) {
        errors.push({
          code: 'wrong-slot',
          message: `${module.name} is a ${module.slot} module, fitted to ${kind}`,
        });
      }
      power += module.powerMW;
      compute += module.computeTF;
      groupCounts.set(module.groupKey, (groupCounts.get(module.groupKey) ?? 0) + 1);
      if (module.maxPerFit !== undefined && (groupCounts.get(module.groupKey) ?? 0) > module.maxPerFit) {
        errors.push({
          code: 'group-limit',
          message: `${module.name}: at most ${module.maxPerFit} of group ${module.groupKey}`,
        });
      }
      for (const req of module.disciplines) {
        const actual = skillLevel(skills, req.id);
        if (actual < req.level) {
          errors.push({
            code: 'discipline',
            message: `${module.name} requires ${req.id} ${req.level} (have ${actual})`,
          });
        }
      }
    }
  }

  if (power > hull.power) {
    errors.push({
      code: 'budget-power',
      message: `power ${power.toFixed(1)} MW exceeds ${hull.power} MW`,
    });
  }
  if (compute > hull.compute) {
    errors.push({
      code: 'budget-compute',
      message: `compute ${compute.toFixed(1)} TF exceeds ${hull.compute} TF`,
    });
  }

  return errors;
}

function scaleDamage(d: DamageVector, mul: number): DamageVector {
  return {
    kinetic: d.kinetic * mul,
    thermal: d.thermal * mul,
    ion: d.ion * mul,
    breach: d.breach * mul,
  };
}

function addDamage(a: DamageVector, b: DamageVector): DamageVector {
  return {
    kinetic: a.kinetic + b.kinetic,
    thermal: a.thermal + b.thermal,
    ion: a.ion + b.ion,
    breach: a.breach + b.breach,
  };
}

function damageTotal(d: DamageVector): number {
  return d.kinetic + d.thermal + d.ion + d.breach;
}

/** Reference munition for preview stats: first of family in the registry. */
function referenceMunition(registry: ContentRegistry, family: string): MunitionDef | undefined {
  return registry.allMunitions().find((m) => m.family === family);
}

/**
 * Compute derived stats for a legal loadout. Throws if the fit is illegal —
 * call {@link validateFit} first at trust boundaries.
 */
export function computeFit(
  registry: ContentRegistry,
  loadout: FitLoadout,
  skills: SkillLevels,
): FittedShip {
  const errors = validateFit(registry, loadout, skills);
  if (errors.length > 0) {
    throw new Error(`illegal fit: ${errors.map((e) => e.message).join('; ')}`);
  }
  const hull = registry.hull(loadout.hullId);

  const table = new StatTable();
  let powerUsed = 0;
  let computeUsed = 0;
  const fittedModules: Array<{ module: ModuleDef; slotKind: SlotKind; slotIndex: number }> = [];

  for (const kind of SLOT_KINDS) {
    slotOf(loadout, kind).forEach((moduleId, slotIndex) => {
      const module = registry.module(moduleId);
      powerUsed += module.powerMW;
      computeUsed += module.computeTF;
      fittedModules.push({ module, slotKind: kind, slotIndex });
      for (const mod of module.passiveMods ?? []) table.addMod(mod, false);
    });
  }

  // Hull bonuses scale per trained mastery level and are interference-exempt.
  for (const b of hull.bonuses) {
    const level = skillLevel(skills, b.disciplineId);
    if (level > 0) {
      table.addMod({ stat: b.stat, op: 'mul', value: 1 + b.mulPerLevel * level }, true);
    }
  }

  const resist = (layer: 'shieldResist' | 'armorResist', base: ResistProfile): ResistProfile => ({
    kinetic: table.resolveResist(`${layer}.kinetic` as StatKey, base.kinetic),
    thermal: table.resolveResist(`${layer}.thermal` as StatKey, base.thermal),
    ion: table.resolveResist(`${layer}.ion` as StatKey, base.ion),
    breach: table.resolveResist(`${layer}.breach` as StatKey, base.breach),
  });

  const stats: FittedStats = {
    maxVelocity: table.resolve('maxVelocity', hull.maxVelocity),
    agility: table.resolve('agility', hull.agility),
    signature: table.resolve('signature', hull.signature),
    cargo: table.resolve('cargo', hull.cargo),
    oreHold: table.resolve('oreHold', hull.oreHold ?? 0),
    shieldHp: table.resolve('shieldHp', hull.shield.hp),
    shieldRechargeSec: table.resolve('shieldRechargeSec', hull.shield.rechargeSec),
    armorHp: table.resolve('armorHp', hull.armor.hp),
    hullHp: table.resolve('hullHp', hull.structure.hp),
    fluxCapacity: table.resolve('fluxCapacity', hull.flux.capacity),
    fluxRechargeSec: table.resolve('fluxRechargeSec', hull.flux.rechargeSec),
    lockRange: table.resolve('lockRange', hull.lockRange),
    sensorStrength: table.resolve('sensorStrength', hull.sensorStrength),
    maxLockedTargets: table.resolve('maxLockedTargets', hull.maxLockedTargets),
    shieldResists: resist('shieldResist', hull.shield.resists),
    armorResists: resist('armorResist', hull.armor.resists),
    structureResists: hull.structure.resists,
  };

  const turretDamageMul = table.resolve('turretDamage', 1);
  const turretTrackingMul = table.resolve('turretTracking', 1);
  const turretOptimalMul = table.resolve('turretOptimal', 1);
  const turretAttenuationMul = table.resolve('turretAttenuation', 1);
  const launcherDamageMul = table.resolve('launcherDamage', 1);
  const miningYieldMul = table.resolve('miningYield', 1);

  const weapons: WeaponStat[] = [];
  const extractors: ExtractorStat[] = [];
  let activeFluxPerSec = 0;

  for (const { module, slotIndex } of fittedModules) {
    const active = module.active;
    if (!active) continue;
    activeFluxPerSec += active.fluxPerCycle / active.cycleSec;
    const fx = active.effect;
    if (fx.kind === 'turret') {
      const munition = fx.munitionFamily ? referenceMunition(registry, fx.munitionFamily) : undefined;
      const raw = munition ? addDamage(fx.damage, munition.damage) : fx.damage;
      const volley = scaleDamage(raw, turretDamageMul);
      weapons.push({
        slotIndex,
        module,
        kind: 'turret',
        volley,
        volleyTotal: damageTotal(volley),
        dps: damageTotal(volley) / active.cycleSec,
        cycleSec: active.cycleSec,
        fluxPerCycle: active.fluxPerCycle,
        tracking: fx.tracking * turretTrackingMul,
        optimalM: fx.optimalM * turretOptimalMul,
        attenuationM: fx.attenuationM * turretAttenuationMul,
        caliberSig: fx.caliberSig,
      });
    } else if (fx.kind === 'launcher') {
      const munition = referenceMunition(registry, fx.munitionFamily);
      const volley = scaleDamage(munition ? munition.damage : { kinetic: 0, thermal: 0, ion: 0, breach: 0 }, launcherDamageMul);
      weapons.push({
        slotIndex,
        module,
        kind: 'launcher',
        volley,
        volleyTotal: damageTotal(volley),
        dps: damageTotal(volley) / active.cycleSec,
        cycleSec: active.cycleSec,
        fluxPerCycle: active.fluxPerCycle,
      });
    } else if (fx.kind === 'extractor') {
      extractors.push({
        slotIndex,
        module,
        yieldM3: fx.yieldM3 * miningYieldMul,
        cycleSec: active.cycleSec,
        fluxPerCycle: active.fluxPerCycle,
        rangeM: active.rangeM ?? 0,
      });
    }
  }

  const avg = (r: ResistProfile): number => (r.kinetic + r.thermal + r.ion + r.breach) / 4;
  const ehp =
    stats.shieldHp / (1 - avg(stats.shieldResists)) +
    stats.armorHp / (1 - avg(stats.armorResists)) +
    stats.hullHp / (1 - avg(stats.structureResists));

  const regenPerSec = stats.fluxCapacity / stats.fluxRechargeSec;
  const fluxStability = activeFluxPerSec === 0 ? Infinity : regenPerSec / activeFluxPerSec;

  return {
    hull,
    loadout,
    powerUsed,
    computeUsed,
    stats,
    weapons,
    extractors,
    ehp,
    dpsTotal: weapons.reduce((acc, w) => acc + w.dps, 0),
    fluxStability,
  };
}
