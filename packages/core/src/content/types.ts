/**
 * Content type definitions. Content is data: rules code interprets these
 * shapes, designers edit the data files, and `validate()` (registry.ts)
 * enforces referential and balance integrity in CI.
 */

import type { DisciplineId, ItemTypeId } from '../kernel/ids.js';

export type DamageType = 'kinetic' | 'thermal' | 'ion' | 'breach';

export interface DamageVector {
  readonly kinetic: number;
  readonly thermal: number;
  readonly ion: number;
  readonly breach: number;
}

export const ZERO_DAMAGE: DamageVector = Object.freeze({
  kinetic: 0,
  thermal: 0,
  ion: 0,
  breach: 0,
});

/** Resistances, 0..1 fraction of damage prevented per channel. */
export interface ResistProfile {
  readonly kinetic: number;
  readonly thermal: number;
  readonly ion: number;
  readonly breach: number;
}

export type ShipClass =
  | 'frigate'
  | 'destroyer'
  | 'cruiser'
  | 'battleship'
  | 'barge'
  | 'hauler'
  | 'carrier';

export type FactionKey = 'accord' | 'combine' | 'covenant' | 'freeholds' | 'none';

export type SlotKind = 'hardpoint' | 'auxiliary' | 'core' | 'weave';

export type ItemCategory =
  | 'hull'
  | 'module'
  | 'munition'
  | 'ore'
  | 'mineral'
  | 'blueprint'
  | 'commodity';

export interface DisciplineReq {
  readonly id: DisciplineId;
  readonly level: 1 | 2 | 3 | 4 | 5;
}

export interface ItemTypeBase {
  readonly id: ItemTypeId;
  readonly name: string;
  readonly description: string;
  /** m³ per unit (packaged volume for hulls). */
  readonly volume: number;
  readonly category: ItemCategory;
}

/**
 * Stats addressable by modifiers. Fitting resolves modifiers against these
 * keys; resist keys use the diminishing 'resist' op (see fitting/engine.ts).
 */
export type StatKey =
  | 'maxVelocity'
  | 'agility'
  | 'signature'
  | 'cargo'
  | 'oreHold'
  | 'shieldHp'
  | 'shieldRechargeSec'
  | 'armorHp'
  | 'hullHp'
  | 'fluxCapacity'
  | 'fluxRechargeSec'
  | 'lockRange'
  | 'sensorStrength'
  | 'maxLockedTargets'
  | 'turretDamage'
  | 'turretTracking'
  | 'turretOptimal'
  | 'turretAttenuation'
  | 'launcherDamage'
  | 'miningYield'
  | 'shieldResist.kinetic'
  | 'shieldResist.thermal'
  | 'shieldResist.ion'
  | 'shieldResist.breach'
  | 'armorResist.kinetic'
  | 'armorResist.thermal'
  | 'armorResist.ion'
  | 'armorResist.breach';

export type StatModOp =
  /** Flat addition, applied before multipliers. */
  | 'add'
  /** Multiplier; same-stat multipliers beyond the first suffer interference falloff. */
  | 'mul'
  /** Diminishing resist bonus: effective = 1 - (1-a)(1-b)... */
  | 'resist';

export interface StatMod {
  readonly stat: StatKey;
  readonly op: StatModOp;
  readonly value: number;
}

/** Per-mastery-level hull bonus (multiplier compounds per trained level). */
export interface HullBonus {
  readonly disciplineId: DisciplineId;
  readonly stat: StatKey;
  readonly mulPerLevel: number;
  readonly note: string;
}

export interface HullDef extends ItemTypeBase {
  readonly category: 'hull';
  readonly shipClass: ShipClass;
  readonly faction: FactionKey;
  readonly role: string;
  /** tonnes */
  readonly mass: number;
  readonly cargo: number;
  readonly oreHold?: number;
  readonly power: number;
  readonly compute: number;
  readonly flux: { readonly capacity: number; readonly rechargeSec: number };
  readonly shield: {
    readonly hp: number;
    readonly rechargeSec: number;
    readonly resists: ResistProfile;
  };
  readonly armor: { readonly hp: number; readonly resists: ResistProfile };
  readonly structure: { readonly hp: number; readonly resists: ResistProfile };
  /** m/s */
  readonly maxVelocity: number;
  /** Inertia time constant, seconds — lower is nimbler. */
  readonly agility: number;
  readonly lockRange: number;
  readonly sensorStrength: number;
  readonly maxLockedTargets: number;
  /** Signature profile, meters. */
  readonly signature: number;
  readonly slots: {
    readonly hardpoint: number;
    readonly auxiliary: number;
    readonly core: number;
    readonly weave: number;
  };
  readonly bonuses: readonly HullBonus[];
  readonly disciplines: readonly DisciplineReq[];
}

/** Active effect payloads (what a cycling module does on cycle completion). */
export type ActiveEffect =
  | {
      readonly kind: 'turret';
      readonly damage: DamageVector;
      /** rad/s the turret can track at hit quality 1. */
      readonly tracking: number;
      readonly optimalM: number;
      readonly attenuationM: number;
      /** Signature (m) at which sizeFactor reaches 1. */
      readonly caliberSig: number;
      /** Munition family consumed per cycle, if any. */
      readonly munitionFamily?: MunitionFamily;
    }
  | {
      readonly kind: 'launcher';
      readonly munitionFamily: MunitionFamily;
      /** Warhead flight speed m/s. */
      readonly flightSpeed: number;
      readonly maxFlightSec: number;
    }
  | { readonly kind: 'extractor'; readonly yieldM3: number }
  | { readonly kind: 'shieldBoost'; readonly hp: number }
  | { readonly kind: 'armorMend'; readonly hp: number }
  | { readonly kind: 'snare' }
  | { readonly kind: 'stasis'; readonly velocityMul: number }
  | { readonly kind: 'jam'; readonly strength: number }
  | {
      /** Sounding pulse: emits a scan event resolved by the scanning service. */
      readonly kind: 'sound';
      readonly strength: number;
    }
  | { readonly kind: 'paint'; readonly sigMul: number }
  | { readonly kind: 'fluxDrain'; readonly amountGJ: number }
  | { readonly kind: 'propulsion'; readonly velocityMul: number; readonly sigMul: number }
  | { readonly kind: 'veil' };

export interface ActiveSpec {
  readonly cycleSec: number;
  readonly fluxPerCycle: number;
  /** Max activation range (m) for targeted effects. */
  readonly rangeM?: number;
  readonly requiresTarget: boolean;
  readonly effect: ActiveEffect;
}

export interface ModuleDef extends ItemTypeBase {
  readonly category: 'module';
  readonly slot: SlotKind;
  /** Tech tier (meta level). */
  readonly meta: 1 | 2;
  readonly powerMW: number;
  readonly computeTF: number;
  /** Same-group fitting cap (e.g. one propulsion module per ship). */
  readonly groupKey: string;
  readonly maxPerFit?: number;
  readonly passiveMods?: readonly StatMod[];
  readonly active?: ActiveSpec;
  readonly disciplines: readonly DisciplineReq[];
}

export type MunitionFamily = 'slug' | 'javelin';

export interface MunitionDef extends ItemTypeBase {
  readonly category: 'munition';
  readonly family: MunitionFamily;
  readonly damage: DamageVector;
  /** Warheads only: blast radius (m) for signature mitigation. */
  readonly blastRadiusM?: number;
}

export interface OreDef extends ItemTypeBase {
  readonly category: 'ore';
  /** Units consumed per refine batch. */
  readonly batchSize: number;
  /** Minerals produced per batch at 100% yield. */
  readonly yields: ReadonlyArray<{ readonly mineralId: ItemTypeId; readonly qty: number }>;
  /** Relative value density used by generation/balance tooling. */
  readonly grade: number;
}

export interface MineralDef extends ItemTypeBase {
  readonly category: 'mineral';
}

export interface CommodityDef extends ItemTypeBase {
  readonly category: 'commodity';
}

export interface BlueprintDef extends ItemTypeBase {
  readonly category: 'blueprint';
  readonly output: { readonly typeId: ItemTypeId; readonly qty: number };
  readonly inputs: ReadonlyArray<{ readonly typeId: ItemTypeId; readonly qty: number }>;
  readonly baseTimeSec: number;
  /** Lumen job fee (sink), before station multipliers. */
  readonly jobFeeLM: number;
}

export type AnyItemDef =
  | HullDef
  | ModuleDef
  | MunitionDef
  | OreDef
  | MineralDef
  | CommodityDef
  | BlueprintDef;

export interface DisciplineDef {
  readonly id: DisciplineId;
  readonly name: string;
  readonly description: string;
}
