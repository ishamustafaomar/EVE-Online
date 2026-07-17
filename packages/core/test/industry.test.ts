import { describe, expect, it } from 'vitest';
import { buildContentV1, itemTypeId, quoteManufactureJob, refine } from '../src/index.js';

const registry = buildContentV1();
const t = itemTypeId;

describe('refining', () => {
  it('refines whole batches at the effective yield', () => {
    // Regolite: batch 100 → 300 ferrite at 100% yield.
    const result = refine(registry, t('ore.regolite'), 250, 0.75, 0);
    expect(result.batches).toBe(2);
    expect(result.consumedUnits).toBe(200);
    expect(result.outputs).toEqual([{ typeId: t('min.ferrite'), qty: Math.floor(600 * 0.75) }]);
  });

  it('mastery improves yield, capped at 100%', () => {
    const low = refine(registry, t('ore.vanadase'), 100, 0.75, 0);
    const high = refine(registry, t('ore.vanadase'), 100, 0.75, 5);
    const sum = (r: typeof low): number => r.outputs.reduce((acc, o) => acc + o.qty, 0);
    expect(sum(high)).toBeGreaterThan(sum(low));
    expect(refine(registry, t('ore.regolite'), 100, 0.99, 10).effectiveYield).toBe(1);
  });

  it('returns nothing for sub-batch quantities', () => {
    const result = refine(registry, t('ore.regolite'), 99, 0.75, 0);
    expect(result.batches).toBe(0);
    expect(result.consumedUnits).toBe(0);
    expect(result.outputs).toEqual([]);
  });
});

describe('manufacturing quotes', () => {
  it('scales inputs by ME and time by TE', () => {
    const base = quoteManufactureJob(registry, t('bp.ammo.ferro-slug'), 0, 0, 1);
    const improved = quoteManufactureJob(registry, t('bp.ammo.ferro-slug'), 10, 10, 1);
    expect(base.inputs[0]?.qty).toBe(120);
    expect(improved.inputs[0]?.qty).toBe(Math.ceil(120 * 0.9));
    expect(improved.timeSec).toBeCloseTo(base.timeSec * 0.8, 5);
    expect(base.output).toEqual({ typeId: t('ammo.ferro-slug'), qty: 100 });
  });

  it('scales linearly with runs', () => {
    const one = quoteManufactureJob(registry, t('bp.hull.verge'), 0, 0, 1);
    const three = quoteManufactureJob(registry, t('bp.hull.verge'), 0, 0, 3);
    expect(three.output.qty).toBe(3 * one.output.qty);
    expect(three.jobFeeLM).toBe(3 * one.jobFeeLM);
    expect(three.inputs[0]?.qty).toBe(3 * (one.inputs[0]?.qty ?? 0));
  });

  it('rejects invalid runs', () => {
    expect(() => quoteManufactureJob(registry, t('bp.hull.verge'), 0, 0, 0)).toThrow();
  });
});
