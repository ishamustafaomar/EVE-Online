/**
 * Panel builders: pure(ish) DOM construction from ClientState slices. Split
 * out from main.ts to keep the boot/wiring file readable. Each function
 * returns a fresh element tree; main.ts swaps it into the layout on render.
 */

import type { BeaconView, EntityView, ItemStackView, OrderView } from '@starweft/protocol';
import type { ClientState } from '../engine/soloClient.js';
import { button, distanceFrom, el, fmtDistance, fmtLumens } from './format.js';

const BEACON_LABEL: Record<BeaconView['kind'], string> = {
  station: 'station',
  belt: 'belt',
  terminus: 'weftline',
  planet: 'planet',
};

export function renderHeader(state: ClientState): HTMLElement {
  const wrap = el('div', { className: 'header' });
  const title = el('div', { className: 'header-title' });
  title.appendChild(el('span', { className: 'pilot-name', text: state.name ?? '—' }));
  title.appendChild(el('span', { className: 'wallet', text: fmtLumens(state.walletLM) }));
  wrap.appendChild(title);
  const loc = el('div', { className: 'header-loc' });
  loc.textContent = state.dockedAt
    ? `${state.systemName ?? '?'} — docked at ${state.hangarStation === state.dockedAt ? 'station' : state.dockedAt}`
    : `${state.systemName ?? '?'} — in space`;
  wrap.appendChild(loc);
  return wrap;
}

export function renderShipStatus(state: ClientState): HTMLElement {
  const wrap = el('div', { className: 'panel ship-status' });
  wrap.appendChild(el('h3', { text: 'Ship' }));
  const self = state.selfId ? state.entities.get(state.selfId) : undefined;
  if (!self) {
    wrap.appendChild(el('p', { className: 'dim', text: 'Docked. Undock to take command.' }));
    return wrap;
  }
  wrap.appendChild(gauge('Shield', self.shieldFrac ?? 0));
  wrap.appendChild(gauge('Armor', self.armorFrac ?? 0));
  wrap.appendChild(gauge('Hull', self.hullFrac ?? 0));
  wrap.appendChild(
    el('p', { className: 'dim', text: `Cargo ${state.cargoUsedM3.toFixed(1)} / ${state.cargoCapacityM3.toFixed(1)} m³` }),
  );
  return wrap;
}

function gauge(label: string, frac: number): HTMLElement {
  const row = el('div', { className: 'gauge' });
  row.appendChild(el('span', { className: 'gauge-label', text: label }));
  const track = el('div', { className: 'gauge-track' });
  const fill = el('div', { className: `gauge-fill gauge-${label.toLowerCase()}` });
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
  track.appendChild(fill);
  row.appendChild(track);
  row.appendChild(el('span', { className: 'gauge-pct', text: `${Math.round(frac * 100)}%` }));
  return row;
}

export function renderBeacons(
  state: ClientState,
  onAction: (line: string) => void,
): HTMLElement {
  const wrap = el('div', { className: 'panel' });
  wrap.appendChild(el('h3', { text: 'Beacons' }));
  if (state.beacons.length === 0) {
    wrap.appendChild(el('p', { className: 'dim', text: state.dockedAt ? 'Undock to see the system.' : 'Nothing charted here.' }));
    return wrap;
  }
  const self = state.selfId ? state.entities.get(state.selfId) : undefined;
  const list = el('div', { className: 'list' });
  state.beacons.forEach((b, i) => {
    const row = el('div', { className: 'row' });
    const idx = `b${i + 1}`;
    row.appendChild(el('span', { className: 'row-idx', text: idx }));
    const label = el('span', { className: 'row-label' });
    label.appendChild(el('span', { className: 'tag', text: BEACON_LABEL[b.kind] }));
    label.appendChild(document.createTextNode(` ${b.name}`));
    if (b.kind === 'terminus' && b.toSystemName) {
      label.appendChild(el('span', { className: 'dim', text: ` → ${b.toSystemName}` }));
    }
    row.appendChild(label);
    const d = distanceFrom(self?.pos ?? null, b.pos);
    if (d) row.appendChild(el('span', { className: 'row-dist', text: d }));
    const actions = el('div', { className: 'row-actions' });
    if (self) actions.appendChild(button('Go', () => onAction(`goto ${idx}`)));
    if (b.kind === 'station') actions.appendChild(button('Dock', () => onAction(`dock ${idx}`)));
    if (b.kind === 'terminus') actions.appendChild(button('Thread', () => onAction(`thread ${idx}`)));
    row.appendChild(actions);
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

export function renderEntities(state: ClientState, onAction: (line: string) => void): HTMLElement {
  const wrap = el('div', { className: 'panel' });
  wrap.appendChild(el('h3', { text: 'Nearby' }));
  const self = state.selfId ? state.entities.get(state.selfId) : undefined;
  const others = [...state.entities.values()].filter((e) => e.id !== state.selfId);
  if (!self) {
    wrap.appendChild(el('p', { className: 'dim', text: '' }));
    return wrap;
  }
  if (others.length === 0) {
    wrap.appendChild(el('p', { className: 'dim', text: 'Nothing else on grid.' }));
    return wrap;
  }
  const list = el('div', { className: 'list' });
  others.forEach((e, i) => {
    const idx = String(i + 1);
    const row = el('div', { className: 'row' });
    row.appendChild(el('span', { className: 'row-idx', text: idx }));
    const label = el('span', { className: 'row-label' });
    label.appendChild(el('span', { className: 'tag', text: e.kind }));
    label.appendChild(document.createTextNode(` ${e.name}`));
    row.appendChild(label);
    if (e.kind === 'ship') row.appendChild(shipMiniHealth(e));
    const d = distanceFrom(self.pos, e.pos);
    if (d) row.appendChild(el('span', { className: 'row-dist', text: d }));
    const actions = el('div', { className: 'row-actions' });
    actions.appendChild(button('Approach', () => onAction(`move approach ${idx}`)));
    if (e.kind === 'ship') {
      actions.appendChild(button('Lock', () => onAction(`lock ${idx}`)));
      actions.appendChild(button('Fire H1', () => onAction(`fire 1 ${idx}`)));
    } else if (e.kind === 'asteroid') {
      actions.appendChild(button('Mine H1', () => onAction(`mine 1 ${idx}`)));
    } else if (e.kind === 'wreck') {
      actions.appendChild(button('Loot', () => onAction(`loot ${idx}`)));
    }
    row.appendChild(actions);
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

function shipMiniHealth(e: EntityView): HTMLElement {
  const pct = (frac: number | undefined): number => Math.round((frac ?? 0) * 100);
  return el('span', {
    className: 'mini-health',
    text: `sh${pct(e.shieldFrac)}% ar${pct(e.armorFrac)}% hu${pct(e.hullFrac)}%`,
  });
}

export function renderItemPanel(
  title: string,
  items: readonly ItemStackView[],
  emptyText: string,
  actionLabel: string | null,
  onAction: ((typeId: string, qty: number) => void) | null,
  extra?: (typeId: string, qty: number) => HTMLElement[],
): HTMLElement {
  const wrap = el('div', { className: 'panel' });
  wrap.appendChild(el('h3', { text: title }));
  if (items.length === 0) {
    wrap.appendChild(el('p', { className: 'dim', text: emptyText }));
    return wrap;
  }
  const list = el('div', { className: 'list' });
  for (const stack of items) {
    const row = el('div', { className: 'row' });
    row.appendChild(el('span', { className: 'row-qty', text: String(stack.qty) }));
    row.appendChild(el('span', { className: 'row-label mono', text: stack.typeId }));
    const actions = el('div', { className: 'row-actions' });
    if (actionLabel && onAction) {
      actions.appendChild(button(actionLabel, () => onAction(stack.typeId, stack.qty)));
    }
    if (extra) for (const node of extra(stack.typeId, stack.qty)) actions.appendChild(node);
    row.appendChild(actions);
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

export function renderOrders(typeId: string, buys: readonly OrderView[], sells: readonly OrderView[]): HTMLElement {
  const wrap = el('div', { className: 'orders' });
  wrap.appendChild(el('h4', { text: `Sells — ${typeId}` }));
  wrap.appendChild(orderList(sells));
  wrap.appendChild(el('h4', { text: `Buys — ${typeId}` }));
  wrap.appendChild(orderList(buys));
  return wrap;
}

function orderList(orders: readonly OrderView[]): HTMLElement {
  if (orders.length === 0) return el('p', { className: 'dim', text: '(none)' });
  const list = el('div', { className: 'list' });
  for (const o of orders) {
    const row = el('div', { className: 'row' });
    row.appendChild(el('span', { className: 'row-qty', text: String(o.remaining) }));
    row.appendChild(el('span', { className: 'row-label', text: `@ ${fmtLumens(o.price)}` }));
    if (o.mine) row.appendChild(el('span', { className: 'tag', text: 'yours' }));
    list.appendChild(row);
  }
  return list;
}

export function renderJobs(state: ClientState, onCollect: (jobId: string) => void): HTMLElement {
  const wrap = el('div', { className: 'panel' });
  wrap.appendChild(el('h3', { text: 'Industry jobs' }));
  if (state.jobs.length === 0) {
    wrap.appendChild(el('p', { className: 'dim', text: 'No jobs running.' }));
    return wrap;
  }
  const list = el('div', { className: 'list' });
  for (const j of state.jobs) {
    const row = el('div', { className: 'row' });
    const ready = state.tick >= j.readyAtTick;
    row.appendChild(
      el('span', { className: 'row-label', text: `${j.outputQty} × ${j.outputTypeId}` }),
    );
    row.appendChild(
      el('span', {
        className: 'dim',
        text: j.collected ? 'collected' : ready ? 'ready' : `tick ${j.readyAtTick}`,
      }),
    );
    if (!j.collected && ready) {
      const actions = el('div', { className: 'row-actions' });
      actions.appendChild(button('Collect', () => onCollect(j.id)));
      row.appendChild(actions);
    }
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

export { fmtDistance };
