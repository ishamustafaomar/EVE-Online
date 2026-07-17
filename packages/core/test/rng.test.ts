import { describe, expect, it } from 'vitest';
import { fnv1a32, rngStream } from '../src/index.js';

describe('deterministic RNG kernel', () => {
  it('same (seed, path) yields identical sequences', () => {
    const a = rngStream('seed-1', 'combat', 42);
    const b = rngStream('seed-1', 'combat', 42);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('different paths yield different sequences', () => {
    const a = rngStream('seed-1', 'combat', 42);
    const b = rngStream('seed-1', 'combat', 43);
    const matches = Array.from({ length: 100 }, () => (a.nextU32() === b.nextU32() ? 1 : 0));
    expect(matches.reduce((x: number, y: number) => x + y, 0)).toBeLessThan(5);
  });

  it('float() stays in [0,1) and is roughly uniform', () => {
    const rng = rngStream('uniform-check');
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      const f = rng.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      sum += f;
    }
    expect(sum / 10_000).toBeGreaterThan(0.48);
    expect(sum / 10_000).toBeLessThan(0.52);
  });

  it('int() respects bounds and covers the range', () => {
    const rng = rngStream('int-check');
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(9);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('weightedPick follows weights approximately', () => {
    const rng = rngStream('weighted-check');
    let heavy = 0;
    for (let i = 0; i < 10_000; i++) {
      if (rng.weightedPick([['heavy', 0.9], ['light', 0.1]] as const) === 'heavy') heavy++;
    }
    expect(heavy / 10_000).toBeGreaterThan(0.87);
    expect(heavy / 10_000).toBeLessThan(0.93);
  });

  it('shuffle is a permutation', () => {
    const rng = rngStream('shuffle-check');
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = rng.shuffle(input);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // input untouched
  });

  it('fnv1a32 is stable (golden values)', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('starweft')).toBe(fnv1a32('starweft'));
    expect(fnv1a32('starweft')).not.toBe(fnv1a32('starwefT'));
  });
});
