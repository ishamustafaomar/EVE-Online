import { describe, expect, it } from 'vitest';
import {
  ALL_REFERENCE_FITS,
  buildContentV1,
  computeFit,
  STARTER_SKILLS,
  validateFit,
  type HullDef,
} from '../src/index.js';

const registry = buildContentV1();

describe('content pack v1', () => {
  it('passes every validation gate', () => {
    expect(registry.validate()).toEqual([]);
  });

  it('ships the full roster: 19 hulls across all professions', () => {
    const hulls = registry.allHulls();
    expect(hulls.length).toBe(19);
    const classes = new Set(hulls.map((h) => h.shipClass));
    for (const cls of ['frigate', 'destroyer', 'cruiser', 'battleship', 'barge', 'hauler']) {
      expect(classes).toContain(cls);
    }
    // Every faction fields ships.
    for (const faction of ['accord', 'combine', 'covenant', 'freeholds']) {
      expect(hulls.some((h) => h.faction === faction)).toBe(true);
    }
  });

  it('module catalog covers all doctrine roles', () => {
    const groups = new Set(registry.allModules().map((m) => m.groupKey));
    for (const g of [
      'turret', 'launcher', 'extractor', 'sounder', 'shield-boost', 'shield-extend',
      'armor-mend', 'armor-plate', 'propulsion', 'snare', 'stasis', 'jam', 'paint',
      'veil', 'flux-relay', 'flux-battery', 'cargo',
    ]) {
      expect(groups, `missing module group ${g}`).toContain(g);
    }
    expect(registry.allModules().length).toBeGreaterThanOrEqual(40);
  });

  it('every ore refines into known minerals and every mineral is reachable', () => {
    const reachable = new Set<string>();
    for (const ore of registry.allOres()) {
      for (const y of ore.yields) reachable.add(y.mineralId);
    }
    // All 8 minerals must come from some ore (no orphan minerals).
    expect(reachable.size).toBe(8);
  });

  it('manufacturing chains close: blueprint inputs are all refinable minerals', () => {
    const mineralIds = new Set(registry.allItems().filter((i) => i.category === 'mineral').map((i) => i.id as string));
    for (const bp of registry.allBlueprints()) {
      for (const input of bp.inputs) {
        expect(mineralIds.has(input.typeId as string), `${bp.id} input ${input.typeId}`).toBe(true);
      }
    }
  });
});

describe('balance envelopes (doc 04 §6)', () => {
  const envelope: Record<string, { ehp: [number, number]; vel: [number, number] }> = {
    frigate: { ehp: [1000, 4000], vel: [250, 520] },
    destroyer: { ehp: [2200, 7000], vel: [200, 300] },
    cruiser: { ehp: [8000, 25_000], vel: [150, 280] },
    battleship: { ehp: [28_000, 90_000], vel: [90, 160] },
    barge: { ehp: [5000, 16_000], vel: [80, 140] },
    hauler: { ehp: [6000, 20_000], vel: [100, 170] },
  };

  const maxSkills = Object.fromEntries(
    ['spaceframes', 'gunnery', 'warheads', 'engineering', 'shields', 'armaturics',
      'navigation', 'subterfuge', 'extraction', 'refining', 'industry', 'trade',
      'sounding', 'command'].map((d) => [`disc.${d}`, 5]),
  );

  it('every hull sits inside its class envelope (bare hull, max skills)', () => {
    for (const hull of registry.allHulls() as readonly HullDef[]) {
      const band = envelope[hull.shipClass];
      if (!band) continue;
      const fitted = computeFit(
        registry,
        { hullId: hull.id, hardpoints: [], auxiliary: [], core: [], weaves: [] },
        maxSkills,
      );
      expect(fitted.ehp, `${hull.name} EHP ${fitted.ehp.toFixed(0)}`).toBeGreaterThanOrEqual(band.ehp[0]);
      expect(fitted.ehp, `${hull.name} EHP ${fitted.ehp.toFixed(0)}`).toBeLessThanOrEqual(band.ehp[1]);
      expect(fitted.stats.maxVelocity, `${hull.name} velocity`).toBeGreaterThanOrEqual(band.vel[0]);
      expect(fitted.stats.maxVelocity, `${hull.name} velocity`).toBeLessThanOrEqual(band.vel[1]);
    }
  });

  it('all reference fits are legal with starter skills', () => {
    for (const { name, fit } of ALL_REFERENCE_FITS) {
      expect(validateFit(registry, fit, STARTER_SKILLS), name).toEqual([]);
    }
  });
});
