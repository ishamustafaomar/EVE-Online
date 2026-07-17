import { describe, expect, it } from 'vitest';
import {
  buildContentV1,
  computeFit,
  interferenceFalloff,
  itemTypeId,
  STARTER_FIT_VERGE,
  STARTER_SKILLS,
  validateFit,
  type FitLoadout,
} from '../src/index.js';

const registry = buildContentV1();
const t = itemTypeId;

const bare = (hullId: string): FitLoadout => ({
  hullId: t(hullId),
  hardpoints: [],
  auxiliary: [],
  core: [],
  weaves: [],
});

describe('fit validation', () => {
  it('rejects unknown hulls and modules', () => {
    expect(validateFit(registry, bare('hull.nope'), STARTER_SKILLS)[0]?.code).toBe('unknown-hull');
    const fit = { ...bare('hull.verge'), hardpoints: [t('mod.nope')] };
    expect(validateFit(registry, fit, STARTER_SKILLS).some((e) => e.code === 'unknown-module')).toBe(true);
  });

  it('rejects slot overflow', () => {
    const fit = {
      ...bare('hull.verge'),
      hardpoints: [t('mod.arc-projector1-l'), t('mod.arc-projector1-l'), t('mod.arc-projector1-l'), t('mod.arc-projector1-l')],
    };
    expect(validateFit(registry, fit, STARTER_SKILLS).some((e) => e.code === 'slot-overflow')).toBe(true);
  });

  it('rejects wrong-slot modules', () => {
    const fit = { ...bare('hull.verge'), hardpoints: [t('mod.coilburner1')] };
    expect(validateFit(registry, fit, STARTER_SKILLS).some((e) => e.code === 'wrong-slot')).toBe(true);
  });

  it('rejects power budget overruns', () => {
    // Heavy battleship guns on a frigate blow the power budget long before slots.
    const fit = { ...bare('hull.verge'), hardpoints: [t('mod.slugthrower1-h')] };
    const errors = validateFit(registry, fit, { ...STARTER_SKILLS, 'disc.gunnery': 5 });
    expect(errors.some((e) => e.code === 'budget-power')).toBe(true);
  });

  it('rejects group-limit violations (two propulsion modules)', () => {
    const fit = { ...bare('hull.verge'), auxiliary: [t('mod.coilburner1'), t('mod.afterplume1')] };
    expect(validateFit(registry, fit, STARTER_SKILLS).some((e) => e.code === 'group-limit')).toBe(true);
  });

  it('rejects untrained discipline requirements', () => {
    const fit = { ...bare('hull.verge'), auxiliary: [t('mod.duskveil1')] }; // needs subterfuge 3
    expect(validateFit(registry, fit, STARTER_SKILLS).some((e) => e.code === 'discipline')).toBe(true);
  });

  it('accepts the starter fits', () => {
    expect(validateFit(registry, STARTER_FIT_VERGE, STARTER_SKILLS)).toEqual([]);
  });
});

describe('derived stats', () => {
  it('interference falloff: first module full effect, later ones damped', () => {
    expect(interferenceFalloff(0)).toBe(1);
    expect(interferenceFalloff(1)).toBeLessThan(1);
    expect(interferenceFalloff(2)).toBeLessThan(interferenceFalloff(1));
    expect(interferenceFalloff(5)).toBeLessThan(0.1);
  });

  it('two Hold Optimizers give less than 44% total cargo (interference)', () => {
    const one = computeFit(registry, { ...bare('hull.sumpter'), core: [t('mod.hold-optimizer1')] }, STARTER_SKILLS);
    const two = computeFit(
      registry,
      { ...bare('hull.sumpter'), core: [t('mod.hold-optimizer1'), t('mod.hold-optimizer1')] },
      STARTER_SKILLS,
    );
    const hullCargoWithBonus = computeFit(registry, bare('hull.sumpter'), STARTER_SKILLS).stats.cargo;
    expect(one.stats.cargo / hullCargoWithBonus).toBeCloseTo(1.2, 5);
    const twoGain = two.stats.cargo / hullCargoWithBonus;
    expect(twoGain).toBeGreaterThan(1.2);
    expect(twoGain).toBeLessThan(1.44);
  });

  it('hull bonuses scale with mastery and are interference-exempt', () => {
    const low = computeFit(registry, bare('hull.verge'), { 'disc.spaceframes': 2 });
    const high = computeFit(registry, bare('hull.verge'), { 'disc.spaceframes': 5 });
    expect(high.stats.shieldHp).toBeGreaterThan(low.stats.shieldHp);
    // +4%/level shield bonus: 5 levels vs 2 levels.
    expect(high.stats.shieldHp / low.stats.shieldHp).toBeCloseTo(1.2 / 1.08, 3);
  });

  it('resist modules apply diminishing bonuses and respect the 85% cap', () => {
    const fit = computeFit(
      registry,
      { ...bare('hull.verge'), auxiliary: [t('mod.ion-ward-screen1')] },
      { ...STARTER_SKILLS, 'disc.shields': 3 },
    );
    const base = registry.hull(t('hull.verge')).shield.resists.ion;
    const boosted = fit.stats.shieldResists.ion;
    expect(boosted).toBeCloseTo(1 - (1 - base) * (1 - 0.3), 5);
    expect(boosted).toBeLessThanOrEqual(0.85);
  });

  it('weapons report DPS including reference munitions', () => {
    const fitted = computeFit(
      registry,
      { ...bare('hull.harrier'), hardpoints: [t('mod.slugthrower1-l')] },
      STARTER_SKILLS,
    );
    expect(fitted.weapons.length).toBe(1);
    const gun = fitted.weapons[0];
    expect(gun?.kind).toBe('turret');
    // Module (8 kin + 1 breach) + ferro slug (10 kin + 2 breach) = 21 raw,
    // times Harrier hull bonus (+3%/level × spaceframes 2 = 1.06).
    expect(gun?.volleyTotal).toBeCloseTo(21 * 1.06, 3);
    expect(fitted.dpsTotal).toBeGreaterThan(0);
  });

  it('flux stability reflects active module load', () => {
    const idle = computeFit(registry, bare('hull.verge'), STARTER_SKILLS);
    expect(idle.fluxStability).toBe(Infinity);
    const loaded = computeFit(registry, STARTER_FIT_VERGE, STARTER_SKILLS);
    expect(Number.isFinite(loaded.fluxStability)).toBe(true);
    expect(loaded.fluxStability).toBeGreaterThan(0);
  });

  it('computeFit throws on illegal fits (server gate)', () => {
    const fit = { ...bare('hull.verge'), hardpoints: [t('mod.slugthrower1-h')] };
    expect(() => computeFit(registry, fit, STARTER_SKILLS)).toThrow(/illegal fit/);
  });
});
