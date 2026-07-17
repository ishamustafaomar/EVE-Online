/** Fitting types (doc 04 §3). */

import type { DisciplineId, ItemTypeId } from '../kernel/ids.js';
import type { DamageVector, HullDef, ModuleDef, ResistProfile } from '../content/types.js';

/** A ship loadout: hull plus module type ids per slot row. */
export interface FitLoadout {
  readonly hullId: ItemTypeId;
  readonly hardpoints: readonly ItemTypeId[];
  readonly auxiliary: readonly ItemTypeId[];
  readonly core: readonly ItemTypeId[];
  readonly weaves: readonly ItemTypeId[];
}

/** Trained Discipline levels, keyed by DisciplineId. Missing = untrained. */
export type SkillLevels = Readonly<Record<string, number>>;

export type FitErrorCode =
  | 'unknown-hull'
  | 'unknown-module'
  | 'wrong-slot'
  | 'slot-overflow'
  | 'budget-power'
  | 'budget-compute'
  | 'group-limit'
  | 'discipline';

export interface FitError {
  readonly code: FitErrorCode;
  readonly message: string;
}

export interface WeaponStat {
  readonly slotIndex: number;
  readonly module: ModuleDef;
  readonly kind: 'turret' | 'launcher';
  /** Full volley including reference munition, after all modifiers. */
  readonly volley: DamageVector;
  readonly volleyTotal: number;
  readonly dps: number;
  readonly cycleSec: number;
  readonly fluxPerCycle: number;
  readonly tracking?: number;
  readonly optimalM?: number;
  readonly attenuationM?: number;
  readonly caliberSig?: number;
}

export interface ExtractorStat {
  readonly slotIndex: number;
  readonly module: ModuleDef;
  readonly yieldM3: number;
  readonly cycleSec: number;
  readonly fluxPerCycle: number;
  readonly rangeM: number;
}

export interface FittedStats {
  readonly maxVelocity: number;
  readonly agility: number;
  readonly signature: number;
  readonly cargo: number;
  readonly oreHold: number;
  readonly shieldHp: number;
  readonly shieldRechargeSec: number;
  readonly armorHp: number;
  readonly hullHp: number;
  readonly fluxCapacity: number;
  readonly fluxRechargeSec: number;
  readonly lockRange: number;
  readonly sensorStrength: number;
  readonly maxLockedTargets: number;
  readonly shieldResists: ResistProfile;
  readonly armorResists: ResistProfile;
  readonly structureResists: ResistProfile;
}

export interface FittedShip {
  readonly hull: HullDef;
  readonly loadout: FitLoadout;
  readonly powerUsed: number;
  readonly computeUsed: number;
  readonly stats: FittedStats;
  readonly weapons: readonly WeaponStat[];
  readonly extractors: readonly ExtractorStat[];
  /** Effective HP against an even damage spread. */
  readonly ehp: number;
  readonly dpsTotal: number;
  /** Regen/drain ratio with every active module cycling; ≥1 is flux-stable. */
  readonly fluxStability: number;
}

export interface DisciplineCheck {
  readonly id: DisciplineId;
  readonly required: number;
  readonly actual: number;
}
