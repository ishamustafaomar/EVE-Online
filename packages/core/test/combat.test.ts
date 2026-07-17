import { describe, expect, it } from 'vitest';
import {
  applyDamage,
  regenFlux,
  regenShield,
  resolveJam,
  resolveTurretVolley,
  rngStream,
  tryConsumeFlux,
  warheadDamageScale,
  type DefenseProfile,
  type DefenseState,
} from '../src/index.js';

const flat = (v: number) => ({ kinetic: v, thermal: v, ion: v, breach: v });

const profile: DefenseProfile = {
  shieldMax: 100,
  shieldRechargeSec: 100,
  armorMax: 100,
  hullMax: 100,
  shieldResists: { kinetic: 0.5, thermal: 0, ion: 0, breach: 0 },
  armorResists: { kinetic: 0, thermal: 0.5, ion: 0, breach: 0 },
  structureResists: flat(0),
};

describe('layered damage with resistances', () => {
  it('applies resistances per channel on the receiving layer', () => {
    const state: DefenseState = { shield: 100, armor: 100, hull: 100 };
    const result = applyDamage(state, profile, { kinetic: 40, thermal: 0, ion: 0, breach: 0 });
    expect(result.toShield).toBe(20); // 50% kinetic resist on shields
    expect(state.shield).toBe(80);
    expect(state.armor).toBe(100);
  });

  it('cascades overflow within one hit', () => {
    const state: DefenseState = { shield: 10, armor: 100, hull: 100 };
    // 40 thermal: shields (0% resist) absorb 10, 75% of the raw volley remains,
    // armor takes 30 × 0.5 = 15.
    const result = applyDamage(state, profile, { kinetic: 0, thermal: 40, ion: 0, breach: 0 });
    expect(state.shield).toBe(0);
    expect(result.toShield).toBe(10);
    expect(result.toArmor).toBeCloseTo(15, 5);
    expect(state.hull).toBe(100);
  });

  it('destroys when hull reaches zero and reports it', () => {
    const state: DefenseState = { shield: 0, armor: 0, hull: 30 };
    const result = applyDamage(state, profile, flat(20));
    expect(result.destroyed).toBe(true);
    expect(state.hull).toBeLessThanOrEqual(0);
  });

  it('is deterministic across runs (no hidden randomness)', () => {
    const run = (): number => {
      const s: DefenseState = { shield: 100, armor: 100, hull: 100 };
      for (let i = 0; i < 20; i++) applyDamage(s, profile, flat(7));
      return s.hull + s.armor + s.shield;
    };
    expect(run()).toBe(run());
  });
});

describe('turret hit model', () => {
  const turret = { tracking: 0.1, optimalM: 10_000, attenuationM: 5000, caliberSig: 130 };

  it('hits reliably inside optimal against a slow big target', () => {
    const rng = rngStream('turret-1');
    let hits = 0;
    for (let i = 0; i < 200; i++) {
      if (resolveTurretVolley(rng, turret, 8000, 0.001, 400).hit) hits++;
    }
    expect(hits).toBeGreaterThan(190);
  });

  it('misses fast close orbiters (angular velocity beats tracking)', () => {
    const rng = rngStream('turret-2');
    let hits = 0;
    for (let i = 0; i < 200; i++) {
      // 300 m/s tangential at 1 km ⇒ 0.3 rad/s vs 0.1 tracking.
      if (resolveTurretVolley(rng, turret, 1000, 0.3, 40).hit) hits++;
    }
    expect(hits / 200).toBeLessThan(0.25);
  });

  it('attenuation band: hit chance decays smoothly past optimal', () => {
    const at = (dist: number): number => {
      const rng = rngStream('turret-3', dist);
      let hits = 0;
      for (let i = 0; i < 500; i++) {
        if (resolveTurretVolley(rng, turret, dist, 0.001, 400).hit) hits++;
      }
      return hits / 500;
    };
    expect(at(10_000)).toBeGreaterThan(at(14_000));
    expect(at(14_000)).toBeGreaterThan(at(20_000));
    expect(at(30_000)).toBeLessThan(0.05);
  });

  it('small signatures blunt big guns', () => {
    const rng = rngStream('turret-4');
    const result = resolveTurretVolley(rng, { ...turret, caliberSig: 400 }, 5000, 0.001, 40);
    expect(result.hitQuality).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it('is exactly reproducible from the same stream', () => {
    const seq = (): string =>
      JSON.stringify(
        Array.from({ length: 50 }, (_, i) =>
          resolveTurretVolley(rngStream('turret-repro', i), turret, 9000, 0.05, 130),
        ),
      );
    expect(seq()).toBe(seq());
  });
});

describe('warheads, flux, and EW', () => {
  it('warhead damage scales by signature vs blast radius', () => {
    expect(warheadDamageScale({ blastRadiusM: 50 }, 400)).toBe(1);
    expect(warheadDamageScale({ blastRadiusM: 50 }, 25)).toBe(0.5);
  });

  it('shield and flux regen approach max and never overshoot', () => {
    const s: DefenseState = { shield: 0, armor: 0, hull: 1 };
    for (let i = 0; i < 1000; i++) regenShield(s, profile, 0.25);
    expect(s.shield).toBe(profile.shieldMax);

    const f = { flux: 0 };
    for (let i = 0; i < 1000; i++) regenFlux(f, 300, 90, 0.25);
    expect(f.flux).toBe(300);
  });

  it('module cycles are all-or-nothing on flux', () => {
    const f = { flux: 10 };
    expect(tryConsumeFlux(f, 12)).toBe(false);
    expect(f.flux).toBe(10);
    expect(tryConsumeFlux(f, 10)).toBe(true);
    expect(f.flux).toBe(0);
  });

  it('jam chance follows strength/sensor ratio', () => {
    const rng = rngStream('jam-check');
    let jams = 0;
    for (let i = 0; i < 2000; i++) {
      if (resolveJam(rng, 6, 12)) jams++;
    }
    expect(jams / 2000).toBeGreaterThan(0.45);
    expect(jams / 2000).toBeLessThan(0.55);
  });
});
