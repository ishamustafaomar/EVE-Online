/**
 * Entry point for the solo browser sandbox (public/play). Boots SoloWorld +
 * SoloClient (the real simulation, in-process, no network), builds the page,
 * and wires the same command language the terminal client uses.
 */

import { REACH_PRESET, STARTER_FIT_MATTOCK, STARTER_FIT_VERGE, TEST_REACH_PRESET } from '@starweft/core';
import type { GameEvent } from '@starweft/protocol';
import { SoloWorld } from './engine/soloWorld.js';
import { SoloClient, CommandError } from './engine/soloClient.js';
import { LocalStorageSoloStore } from './engine/persistence.js';
import { chooseTravelMode, resolveCommand, CommandUsageError, type ViewRefs } from './ui/commands.js';
import { toLoadoutJson } from './ui/loadout.js';
import { button, el, fmtLumens } from './ui/format.js';
import {
  renderBeacons,
  renderEntities,
  renderHeader,
  renderItemPanel,
  renderJobs,
  renderOrders,
  renderShipStatus,
} from './ui/panels.js';

const root = document.getElementById('app');
if (!root) throw new Error('missing #app root element');

// ── Static layout ───────────────────────────────────────────────────────

const headerSlot = el('div', { className: 'header-slot' });
const shipSlot = el('div', { className: 'slot' });
const beaconsSlot = el('div', { className: 'slot' });
const entitiesSlot = el('div', { className: 'slot' });
const jobsSlot = el('div', { className: 'slot' });
const cargoSlot = el('div', { className: 'slot' });
const hangarSlot = el('div', { className: 'slot' });
const marketSlot = el('div', { className: 'panel' });

const colLeft = el('div', { className: 'col' });
colLeft.append(shipSlot, beaconsSlot);
const colMid = el('div', { className: 'col' });
colMid.append(entitiesSlot, jobsSlot);
const colRight = el('div', { className: 'col' });
colRight.append(cargoSlot, hangarSlot, marketSlot);

const grid = el('div', { className: 'main-grid' });
grid.append(colLeft, colMid, colRight);

const logPanel = el('div', { className: 'log' });
const cmdInput = el('input', { className: 'cmd-input', attrs: { autocomplete: 'off', placeholder: 'type a command — try "help"' } }) as HTMLInputElement;
const cmdForm = el('form', { className: 'cmd-form' });
const sendBtn = el('button', { text: 'Send', attrs: { type: 'submit' } });
cmdForm.append(cmdInput, sendBtn);
const consoleWrap = el('div', { className: 'console' });
consoleWrap.append(logPanel, cmdForm);

const quickBar = el('div', { className: 'quickbar' });

root.append(headerSlot, quickBar, grid, consoleWrap);

// ── Market form ──────────────────────────────────────────────────────────

const marketTypeInput = el('input', { className: 'mkt-input', attrs: { placeholder: 'item type id, e.g. ore.regolite' } }) as HTMLInputElement;
const marketPriceInput = el('input', { className: 'mkt-input mkt-num', attrs: { placeholder: 'price', type: 'number', min: '1' } }) as HTMLInputElement;
const marketQtyInput = el('input', { className: 'mkt-input mkt-num', attrs: { placeholder: 'qty', type: 'number', min: '1' } }) as HTMLInputElement;
const marketOrdersHost = el('div', { className: 'orders-host' });

function buildMarketPanel(): void {
  marketSlot.replaceChildren();
  marketSlot.appendChild(el('h3', { text: 'Market' }));
  const row1 = el('div', { className: 'mkt-row' });
  row1.append(marketTypeInput, button('Query', () => void execute(`market ${marketTypeInput.value.trim()}`)));
  const row2 = el('div', { className: 'mkt-row' });
  row2.append(
    marketPriceInput,
    marketQtyInput,
    button('Buy', () => void execute(`buy ${marketTypeInput.value.trim()} ${marketPriceInput.value} ${marketQtyInput.value}`)),
    button('Sell', () => void execute(`sell ${marketTypeInput.value.trim()} ${marketPriceInput.value} ${marketQtyInput.value}`)),
  );
  marketSlot.append(row1, row2, marketOrdersHost);
}

// ── Log ──────────────────────────────────────────────────────────────────

function logLine(text: string, cls = ''): void {
  const line = el('div', { className: `log-line ${cls}`.trim(), text });
  logPanel.appendChild(line);
  logPanel.scrollTop = logPanel.scrollHeight;
  while (logPanel.childElementCount > 300) logPanel.removeChild(logPanel.firstChild as Node);
}

function printEvent(e: GameEvent): void {
  switch (e.kind) {
    case 'volley':
      logLine(e.hit ? `[combat] hit for ${e.total} dmg${e.destroyed ? ' — destroyed!' : ''}` : '[combat] shot missed', 'combat');
      break;
    case 'destroyed':
      logLine(`[combat] ${e.entityId} destroyed${e.wreckId ? ' — wreck left behind' : ''}`, 'combat');
      break;
    case 'mined':
      logLine(`[mining] +${e.units} × ${e.oreId}`, 'mining');
      break;
    case 'cycleFailed':
      logLine(`[module] ${e.slot} #${e.index + 1} failed: ${e.reason}`, 'warn');
      break;
    case 'docked':
      logLine(`[nav] docked`, 'nav');
      break;
    case 'undocked':
      logLine('[nav] undocked', 'nav');
      break;
    case 'arcStart':
      logLine(`[nav] arc drive spooling (${e.etaTicks} ticks)`, 'nav');
      break;
    case 'arcDone':
      logLine('[nav] arc complete', 'nav');
      break;
    case 'arcBlocked':
      logLine(`[nav] arc blocked: ${e.reason}`, 'warn');
      break;
    case 'threaded':
      logLine(`[nav] arrived in ${e.systemName}`, 'nav');
      break;
    case 'lockAcquired':
      logLine('[targeting] locked target', 'nav');
      break;
    case 'lockLost':
      logLine(`[targeting] lock lost: ${e.reason}`, 'warn');
      break;
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────

const params = new URLSearchParams(location.search);
const universePreset = params.get('universe') === 'full' ? REACH_PRESET : TEST_REACH_PRESET;

const store = new LocalStorageSoloStore();
const solo = SoloWorld.boot(store, { universe: universePreset });
const client = new SoloClient(solo);
client.onEvent(printEvent);

function currentView(): ViewRefs {
  return {
    beacons: client.state.beacons,
    entities: [...client.state.entities.values()].filter((e) => e.id !== client.state.selfId),
  };
}

async function execute(line: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const action = resolveCommand(trimmed, currentView());
    await runAction(action);
  } catch (err) {
    if (err instanceof CommandUsageError) logLine(`usage: ${err.message}`, 'warn');
    else if (err instanceof CommandError) logLine(`error: ${err.message}`, 'warn');
    else logLine(`error: ${err instanceof Error ? err.message : String(err)}`, 'warn');
  }
  render();
}

async function runAction(action: ReturnType<typeof resolveCommand>): Promise<void> {
  switch (action.type) {
    case 'help':
      logLine('Click panel buttons, or type commands: look, goto bN, undock, dock bN, thread bN, move hold|approach N|orbit N r, lock N, fire h# N, mine h# N, fit combat|mining, refine oreId units, build bpId runs, collect jobId, market typeId, buy/sell typeId price qty, cancel orderId, loot N, load/unload typeId qty.', 'info');
      return;
    case 'quit':
      logLine('This is a browser tab — just close it. Your progress is saved automatically.', 'info');
      return;
    case 'look':
    case 'status':
      return;
    case 'wallet':
      logLine(fmtLumens(client.state.walletLM));
      return;
    case 'cargoView':
    case 'hangarView':
    case 'jobsView':
      return;
    case 'who':
      logLine('Solo sandbox — just you and the training dummy.', 'info');
      return;

    case 'goto': {
      const beacon = client.state.beacons.find((b) => b.id === action.beaconId);
      if (!beacon) return logLine('unknown beacon — try again', 'warn');
      const self = client.state.selfId ? client.state.entities.get(client.state.selfId) : undefined;
      if (!self) return logLine('undock first', 'warn');
      const mode = chooseTravelMode(self.pos, beacon.pos);
      if (mode === 'arc') {
        await client.arcTo(beacon.pos);
        logLine(`Arcing toward ${beacon.name}…`, 'nav');
      } else {
        await client.move({ kind: 'moveTo', dest: beacon.pos });
        logLine(`Burning toward ${beacon.name}…`, 'nav');
      }
      return;
    }
    case 'moveHold':
      await client.move({ kind: 'hold' });
      return;
    case 'moveApproach':
      await client.move({ kind: 'approach', targetId: action.targetId });
      return;
    case 'moveOrbit':
      await client.move({ kind: 'orbit', targetId: action.targetId, rangeM: action.rangeM });
      return;

    case 'undock':
      await client.undock();
      return;
    case 'dock':
      await client.dock(action.stationId);
      return;
    case 'thread':
      await client.thread(action.terminusId);
      return;

    case 'lock':
      await client.lock(action.targetId);
      return;
    case 'unlock':
      await client.unlock(action.targetId);
      return;
    case 'activate':
      await (action.targetId !== undefined
        ? client.activate(action.slot, action.index, action.targetId)
        : client.activate(action.slot, action.index));
      return;
    case 'deactivate':
      await client.deactivate(action.slot, action.index);
      return;

    case 'fitPreset': {
      const loadout = toLoadoutJson(action.preset === 'combat' ? STARTER_FIT_VERGE : STARTER_FIT_MATTOCK);
      await client.fitShip(loadout);
      logLine(`Refit to the ${action.preset === 'combat' ? 'combat Verge' : 'mining Mattock'}.`, 'info');
      return;
    }

    case 'refine': {
      const result = await client.refine(action.oreId, action.units);
      logLine(`Refined into: ${result.outputs.map((o) => `${o.qty} × ${o.typeId}`).join(', ') || '(nothing)'}`, 'info');
      return;
    }
    case 'build': {
      const result = await client.manufacture(action.blueprintId, action.runs);
      logLine(`Job started (${result.jobId}), ready at tick ${result.readyAtTick}.`, 'info');
      return;
    }
    case 'collect':
      await client.collectJob(action.jobId);
      logLine('Collected.', 'info');
      return;

    case 'market':
      await client.marketBook(action.typeId);
      return;
    case 'buy': {
      const r = await client.placeOrder('buy', action.typeId, action.price, action.qty);
      logLine(r.trades.length > 0 ? `filled ${r.trades.map((t) => `${t.qty}@${t.price}`).join(', ')}` : 'order resting.', 'info');
      return;
    }
    case 'sell': {
      const r = await client.placeOrder('sell', action.typeId, action.price, action.qty);
      logLine(r.trades.length > 0 ? `filled ${r.trades.map((t) => `${t.qty}@${t.price}`).join(', ')}` : 'order resting.', 'info');
      return;
    }
    case 'cancel':
      await client.cancelOrder(action.orderId);
      logLine('Order cancelled.', 'info');
      return;

    case 'loot':
      await client.loot(action.targetId);
      return;

    case 'unload':
      await client.hangarMove('toHangar', action.typeId, action.qty);
      return;
    case 'load':
      await client.hangarMove('toCargo', action.typeId, action.qty);
      return;

    case 'say':
    case 'tell':
      try {
        await client.chat('system', action.text);
      } catch (err) {
        logLine(err instanceof Error ? err.message : String(err), 'info');
      }
      return;
  }
}

// ── Render ───────────────────────────────────────────────────────────────

function render(): void {
  headerSlot.replaceChildren(renderHeader(client.state));
  shipSlot.replaceChildren(renderShipStatus(client.state));
  beaconsSlot.replaceChildren(renderBeacons(client.state, (line) => void execute(line)));
  entitiesSlot.replaceChildren(renderEntities(client.state, (line) => void execute(line)));
  jobsSlot.replaceChildren(renderJobs(client.state, (jobId) => void execute(`collect ${jobId}`)));
  cargoSlot.replaceChildren(
    renderItemPanel('Cargo hold', client.state.cargo, 'Empty.', 'Unload', (typeId, qty) =>
      void execute(`unload ${typeId} ${qty}`),
    ),
  );
  hangarSlot.replaceChildren(
    renderItemPanel(
      client.state.hangarStation ? 'Hangar' : 'Hangar (dock to view)',
      client.state.hangar,
      client.state.dockedAt ? 'Empty.' : 'Not docked.',
      client.state.dockedAt ? 'Load' : null,
      client.state.dockedAt ? (typeId, qty) => void execute(`load ${typeId} ${qty}`) : null,
      (typeId) =>
        typeId.startsWith('ore.')
          ? [button('Refine', () => void execute(`refine ${typeId} 100`), 'btn-mini btn-alt')]
          : typeId.startsWith('bp.')
            ? [button('Build', () => void execute(`build ${typeId} 1`), 'btn-mini btn-alt')]
            : [],
    ),
  );
  if (client.state.orders) marketOrdersHost.replaceChildren(renderOrders(client.state.orders.typeId, client.state.orders.buys, client.state.orders.sells));

  quickBar.replaceChildren(
    ...(client.state.dockedAt
      ? [
          button('Undock', () => void execute('undock'), 'btn'),
          button('Fit: Combat', () => void execute('fit combat'), 'btn'),
          button('Fit: Mining', () => void execute('fit mining'), 'btn'),
        ]
      : [button('Status', () => void execute('look'), 'btn')]),
  );
}

async function boot(): Promise<void> {
  buildMarketPanel();
  logLine('Booting solo universe…', 'info');
  await client.enterWorld();
  logLine(`Universe "${solo.world.pack.seed}" (${solo.world.pack.systems.length} systems). Welcome, ${client.state.name}.`, 'info');
  render();
  solo.start();
  setInterval(() => {
    client.refreshTick();
    render();
  }, 500);
  setInterval(() => solo.save(store), 10_000);
  window.addEventListener('beforeunload', () => solo.save(store));

  cmdForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const line = cmdInput.value;
    cmdInput.value = '';
    void execute(line);
  });
}

void boot();
