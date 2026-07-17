/**
 * Combat resolution (doc 05): layered damage with resistances and cascade,
 * the turret tracking/range/signature hit model, and regen ticks. Pure
 * functions over explicit state; all randomness comes from injected streams.
 */

import type { Rng } from '../kernel/rng.js';
import type { DamageVector, ResistProfile } from '../content/types.js';

export interface DefenseState {
  shield: number;
  armor: number;
  hull: number;
}

export interface DefenseProfile {
  readonly shieldMax: number;
  readonly shieldRechargeSec: number;
  readonly armorMax: number;
  readonly hullMax: number;
  readonly shieldResists: ResistProfile;
  readonly armorResists: ResistProfile;
  readonly structureResists: ResistProfile;
}

export interface DamageBreakdown {
  readonly toShield: number;
  readonly toArmor: number;
  readonly toHull: number;
  readonly destroyed: boolean;
}

const CHANNELS = ['kinetic', 'thermal', 'ion', 'breach'] as const;

/**
 * Apply a damage vector to layered defenses. Damage hits the outermost
 * non-empty layer; overflow cascades within the same hit (doc 05 §1).
 * Mutates `state`; returns the applied breakdown.
 */
export function applyDamage(
  state: DefenseState,
  profile: DefenseProfile,
  dmg: DamageVector,
): DamageBreakdown {
  let toShield = 0;
  let toArmor = 0;
  let toHull = 0;

  for (const channel of CHANNELS) {
    let remaining = dmg[channel];
    if (remaining <= 0) continue;

    if (state.shield > 0) {
      const effective = remaining * (1 - profile.shieldResists[channel]);
      const absorbed = Math.min(state.shield, effective);
      state.shield -= absorbed;
      toShield += absorbed;
      // Overflow fraction carries through at raw strength.
      remaining = effective > 0 ? remaining * (1 - absorbed / effective) : remaining;
      if (absorbed < effective) state.shield = 0;
      else continue;
    }

    if (state.armor > 0 && remaining > 0) {
      const effective = remaining * (1 - profile.armorResists[channel]);
      const absorbed = Math.min(state.armor, effective);
      state.armor -= absorbed;
      toArmor += absorbed;
      remaining = effective > 0 ? remaining * (1 - absorbed / effective) : remaining;
      if (absorbed < effective) state.armor = 0;
      else continue;
    }

    if (remaining > 0) {
      const effective = remaining * (1 - profile.structureResists[channel]);
      const absorbed = Math.min(state.hull, effective);
      state.hull -= absorbed;
      toHull += absorbed;
    }
  }

  return { toShield, toArmor, toHull, destroyed: state.hull <= 0 };
}

export interface TurretParams {
  readonly tracking: number;
  readonly optimalM: number;
  readonly attenuationM: number;
  readonly caliberSig: number;
}

export interface HitResult {
  readonly hit: boolean;
  readonly rake: boolean;
  /** Damage multiplier for this volley (0 on miss). */
  readonly damageScale: number;
  readonly hitQuality: number;
}

/**
 * Turret hit model (doc 05 §2):
 *   angularFactor = clamp01(tracking / (targetAngular + ε))
 *   rangeFactor   = 1 inside optimal, gaussian attenuation beyond
 *   sizeFactor    = clamp01(targetSig / caliberSig)
 *   hitQuality    = product; roll to hit; damage 0.5+q/2; 2% rake ×1.5 at q>0.9
 */
export function resolveTurretVolley(
  rng: Rng,
  turret: TurretParams,
  distanceM: number,
  targetAngularRadS: number,
  targetSignatureM: number,
): HitResult {
  const angularFactor = clamp01(turret.tracking / (targetAngularRadS + 1e-6));
  const over = distanceM - turret.optimalM;
  const rangeFactor = over <= 0 ? 1 : Math.exp(-((over / turret.attenuationM) ** 2));
  const sizeFactor = clamp01(targetSignatureM / turret.caliberSig);
  const hitQuality = angularFactor * rangeFactor * sizeFactor;

  const roll = rng.float();
  if (roll > hitQuality) return { hit: false, rake: false, damageScale: 0, hitQuality };

  const rake = hitQuality > 0.9 && rng.float() < 0.02;
  const damageScale = (0.5 + hitQuality / 2) * (rake ? 1.5 : 1);
  return { hit: true, rake, damageScale, hitQuality };
}

export interface WarheadParams {
  readonly blastRadiusM: number;
}

/**
 * Warhead mitigation (doc 05 §3): damage scaled by min(1, sig/blastRadius).
 * (Velocity mitigation is a Milestone C refinement; painters already interact
 * through signature.)
 */
export function warheadDamageScale(warhead: WarheadParams, targetSignatureM: number): number {
  return Math.min(1, targetSignatureM / warhead.blastRadiusM);
}

/** Shield linear regen per tick (doc 05 §1). */
export function regenShield(state: DefenseState, profile: DefenseProfile, dtSec: number): void {
  if (state.shield < profile.shieldMax && profile.shieldRechargeSec > 0) {
    state.shield = Math.min(
      profile.shieldMax,
      state.shield + (profile.shieldMax / profile.shieldRechargeSec) * dtSec,
    );
  }
}

export interface FluxState {
  flux: number;
}

/** Flux linear regen per tick (doc 05 §4). */
export function regenFlux(state: FluxState, capacity: number, rechargeSec: number, dtSec: number): void {
  if (state.flux < capacity && rechargeSec > 0) {
    state.flux = Math.min(capacity, state.flux + (capacity / rechargeSec) * dtSec);
  }
}

/**
 * Attempt to pay a module's cycle cost. Deterministic: either the full cost
 * is reserved or the cycle fails — no partial cycles (doc 05 §4).
 */
export function tryConsumeFlux(state: FluxState, cost: number): boolean {
  if (state.flux < cost) return false;
  state.flux -= cost;
  return true;
}

/**
 * Jam resolution (doc 05 §5): chance per cycle = jammerStrength / sensorStrength,
 * capped at 95%. Deterministic given the caller's stream.
 */
export function resolveJam(rng: Rng, jamStrength: number, sensorStrength: number): boolean {
  if (sensorStrength <= 0) return true;
  return rng.float() < Math.min(0.95, jamStrength / sensorStrength);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
