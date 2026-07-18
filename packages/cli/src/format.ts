/** Pure terminal-formatting helpers — no I/O, fully unit-testable. */

import { dist, type Vec3 } from '@starweft/core';
import type { BeaconView, EntityView, ItemStackView, OrderView } from '@starweft/protocol';

/** ASCII gauge: `[########--]` for a 0..1 fraction. */
export function bar(frac: number, width = 10): string {
  const clamped = Number.isFinite(frac) ? Math.max(0, Math.min(1, frac)) : 0;
  const filled = Math.round(clamped * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

export function fmtDistance(m: number): string {
  if (m >= 1_000_000) return `${(m / 1_000_000).toFixed(2)} Mm`;
  if (m >= 1_000) return `${(m / 1_000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

export function fmtLumens(n: number): string {
  return `${n.toLocaleString('en-US')} LM`;
}

const BEACON_LABEL: Record<BeaconView['kind'], string> = {
  station: 'station',
  belt: 'belt',
  terminus: 'weftline',
  planet: 'planet',
};

export function fmtBeacon(b: BeaconView, index: number, selfPos: Vec3 | null): string {
  const d = selfPos ? ` — ${fmtDistance(dist(selfPos, b.pos))}` : '';
  const extra = b.kind === 'terminus' && b.toSystemName ? ` → ${b.toSystemName}` : '';
  return `  b${index}  [${BEACON_LABEL[b.kind]}] ${b.name}${extra}${d}`;
}

export function fmtEntity(e: EntityView, index: number, selfPos: Vec3 | null): string {
  const d = selfPos ? ` — ${fmtDistance(dist(selfPos, e.pos))}` : '';
  if (e.kind === 'ship') {
    const hp = ` sh${bar(e.shieldFrac ?? 0, 6)} ar${bar(e.armorFrac ?? 0, 6)} hu${bar(e.hullFrac ?? 0, 6)}`;
    return `  ${index}   [ship] ${e.name}${hp}${d}`;
  }
  if (e.kind === 'asteroid') {
    return `  ${index}   [asteroid] ${e.name} (${e.oreId}, ${e.unitsRemaining ?? 0} units)${d}`;
  }
  return `  ${index}   [wreck] ${e.name}${d}`;
}

export function fmtItemStack(s: ItemStackView): string {
  return `  ${s.qty.toString().padStart(6)}  ${s.typeId}`;
}

export function fmtOrder(o: OrderView): string {
  const mine = o.mine ? ' (yours)' : '';
  return `  ${o.side === 'buy' ? 'BUY ' : 'SELL'}  ${o.remaining.toString().padStart(6)} @ ${o.price} LM  ${o.id}${mine}`;
}

export function fmtVec3(v: Vec3): string {
  return `(${v.x.toFixed(0)}, ${v.y.toFixed(0)}, ${v.z.toFixed(0)})`;
}
