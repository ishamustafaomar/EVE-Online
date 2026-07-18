/** Pure DOM-oriented formatting helpers — no innerHTML string interpolation
 *  of any dynamic values, everything goes through textContent/attributes. */

import { dist, type Vec3 } from '@starweft/core';

export function bar(frac: number): string {
  const clamped = Number.isFinite(frac) ? Math.max(0, Math.min(1, frac)) : 0;
  const width = 10;
  const filled = Math.round(clamped * width);
  return `${'#'.repeat(filled)}${'-'.repeat(width - filled)}`;
}

export function fmtDistance(m: number): string {
  if (m >= 1_000_000) return `${(m / 1_000_000).toFixed(2)} Mm`;
  if (m >= 1_000) return `${(m / 1_000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

export function fmtLumens(n: number): string {
  return `${n.toLocaleString('en-US')} LM`;
}

export function distanceFrom(selfPos: Vec3 | null, pos: Vec3): string | null {
  return selfPos ? fmtDistance(dist(selfPos, pos)) : null;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { className?: string; text?: string; attrs?: Record<string, string> } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  return node;
}

export function button(label: string, onClick: () => void, className = 'btn-mini'): HTMLButtonElement {
  const b = el('button', { className, text: label, attrs: { type: 'button' } });
  b.addEventListener('click', onClick);
  return b;
}
