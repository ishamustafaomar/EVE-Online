import { describe, expect, it } from 'vitest';
import { bar, fmtBeacon, fmtDistance, fmtEntity, fmtItemStack, fmtLumens, fmtOrder } from '../src/format.js';

describe('bar', () => {
  it('renders full and empty gauges', () => {
    expect(bar(1, 10)).toBe('[##########]');
    expect(bar(0, 10)).toBe('[----------]');
  });

  it('renders a partial gauge proportionally', () => {
    expect(bar(0.5, 10)).toBe('[#####-----]');
  });

  it('clamps out-of-range and non-finite input', () => {
    expect(bar(-1, 4)).toBe('[----]');
    expect(bar(2, 4)).toBe('[####]');
    expect(bar(Number.NaN, 4)).toBe('[----]');
  });
});

describe('fmtDistance', () => {
  it('scales units by magnitude', () => {
    expect(fmtDistance(50)).toBe('50 m');
    expect(fmtDistance(1500)).toBe('1.5 km');
    expect(fmtDistance(2_500_000)).toBe('2.50 Mm');
  });
});

describe('fmtLumens', () => {
  it('adds thousands separators', () => {
    expect(fmtLumens(50000)).toBe('50,000 LM');
    expect(fmtLumens(0)).toBe('0 LM');
  });
});

describe('fmtBeacon / fmtEntity', () => {
  const selfPos = { x: 0, y: 0, z: 0 };

  it('includes distance from self when given a position', () => {
    const beacon = { id: 'b', kind: 'station' as const, name: 'Ashlos Spindle I', pos: { x: 1000, y: 0, z: 0 } };
    expect(fmtBeacon(beacon, 1, selfPos)).toContain('b1');
    expect(fmtBeacon(beacon, 1, selfPos)).toContain('1.0 km');
    expect(fmtBeacon(beacon, 1, null)).not.toContain('km');
  });

  it('shows a terminus destination', () => {
    const beacon = {
      id: 't', kind: 'terminus' as const, name: 'Weftline', pos: { x: 0, y: 0, z: 0 }, toSystemName: 'Kess-Varn',
    };
    expect(fmtBeacon(beacon, 2, null)).toContain('→ Kess-Varn');
  });

  it('shows ship health bars', () => {
    const ship = {
      id: 'e', kind: 'ship' as const, name: 'Verge', pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
      shieldFrac: 1, armorFrac: 0.5, hullFrac: 0,
    };
    const line = fmtEntity(ship, 1, selfPos);
    expect(line).toContain('[ship]');
    expect(line).toContain('Verge');
  });

  it('shows asteroid ore and remaining units', () => {
    const ast = {
      id: 'a', kind: 'asteroid' as const, name: 'Belt node', pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
      oreId: 'ore.regolite', unitsRemaining: 250,
    };
    const line = fmtEntity(ast, 2, null);
    expect(line).toContain('ore.regolite');
    expect(line).toContain('250 units');
  });
});

describe('fmtItemStack / fmtOrder', () => {
  it('formats a stack', () => {
    expect(fmtItemStack({ typeId: 'ammo.ferro-slug', qty: 400 })).toContain('ammo.ferro-slug');
    expect(fmtItemStack({ typeId: 'ammo.ferro-slug', qty: 400 })).toContain('400');
  });

  it('formats buy and sell orders, flagging your own', () => {
    const sell = { id: 'o1', side: 'sell' as const, typeId: 'x', price: 20, remaining: 100, stationId: 's', mine: false };
    const buy = { id: 'o2', side: 'buy' as const, typeId: 'x', price: 18, remaining: 50, stationId: 's', mine: true };
    expect(fmtOrder(sell)).toContain('SELL');
    expect(fmtOrder(sell)).not.toContain('(yours)');
    expect(fmtOrder(buy)).toContain('BUY');
    expect(fmtOrder(buy)).toContain('(yours)');
  });
});
