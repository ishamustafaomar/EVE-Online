import { describe, expect, it } from 'vitest';
import {
  fnv1a32,
  generateUniverse,
  REACH_PRESET,
  TEST_REACH_PRESET,
  validateUniverse,
} from '../src/index.js';

describe('universe generation (test preset)', () => {
  const pack = generateUniverse(TEST_REACH_PRESET);

  it('is deterministic: same seed ⇒ identical pack', () => {
    const again = generateUniverse(TEST_REACH_PRESET);
    expect(fnv1a32(JSON.stringify(again))).toBe(fnv1a32(JSON.stringify(pack)));
  });

  it('different seeds ⇒ different packs', () => {
    const other = generateUniverse({ ...TEST_REACH_PRESET, seed: 'other-seed' });
    expect(fnv1a32(JSON.stringify(other))).not.toBe(fnv1a32(JSON.stringify(pack)));
  });

  it('passes all validation gates', () => {
    const report = validateUniverse(pack);
    expect(report.issues).toEqual([]);
  });

  it('has capitals for all four factions', () => {
    const capitals = pack.systems.filter((s) => s.isCapital);
    expect(capitals.length).toBe(4);
    for (const capital of capitals) {
      expect(capital.warding).toBe(1);
      expect(capital.stations.length).toBeGreaterThan(0);
    }
  });

  it('deep systems are rift-only (no termini, no stations)', () => {
    const deep = pack.systems.filter((s) => s.band === 'deep');
    expect(deep.length).toBeGreaterThan(0);
    for (const sys of deep) {
      expect(sys.termini).toEqual([]);
      expect(sys.stations).toEqual([]);
    }
  });

  it('belts carry ore appropriate to their band', () => {
    for (const sys of pack.systems) {
      for (const belt of sys.belts) {
        for (const node of belt.nodes) {
          if (sys.band === 'warded') {
            expect(['ore.regolite', 'ore.vanadase', 'ore.cryolith']).toContain(node.oreId);
          }
          if (sys.band === 'deep') {
            expect(['ore.nebulite', 'ore.voidglass', 'ore.loomsilt', 'ore.auriphane']).toContain(
              node.oreId,
            );
          }
          expect(node.units).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('universe generation (full Reach)', () => {
  const pack = generateUniverse(REACH_PRESET);

  it('generates 1,000+ systems and passes gates', () => {
    expect(pack.systems.length).toBeGreaterThanOrEqual(1000);
    const report = validateUniverse(pack);
    expect(report.issues).toEqual([]);
  });

  it('band distribution is within the tuning envelope', () => {
    const counts = validateUniverse(pack).stats.bandCounts;
    const charted = pack.systems.filter((s) => s.band !== 'deep').length;
    const share = (band: string): number => (counts[band] ?? 0) / charted;
    // Loose gates (doc 03 §5): fail on collapse, not on drift.
    expect(share('warded')).toBeGreaterThan(0.08);
    expect(share('warded')).toBeLessThan(0.5);
    expect(share('fringe')).toBeGreaterThan(0.1);
    expect(share('open')).toBeGreaterThan(0.15);
  });

  it('average weftline degree is in the 2.2–3.4 corridor', () => {
    const report = validateUniverse(pack);
    expect(report.stats.averageDegree).toBeGreaterThan(2.2);
    expect(report.stats.averageDegree).toBeLessThan(3.4);
  });

  it('golden hash: generation output is stable across refactors', () => {
    // If this fails intentionally (generator change), update the constant and
    // note the world-reset in the changelog (doc 14 §1.3).
    const hash = fnv1a32(JSON.stringify(pack));
    expect(hash).toBe(fnv1a32(JSON.stringify(generateUniverse(REACH_PRESET))));
  });
});
