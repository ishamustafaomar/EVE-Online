#!/usr/bin/env node
/**
 * `pnpm play` — the terminal client. Connects to a running STARWEFT server,
 * or (when no --url is given and nothing answers on the default port) hosts
 * one right here so a single command is enough to start playing. Run it a
 * second time from another terminal with a different --name to join the
 * same universe and actually meet another pilot in space.
 */

import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import {
  REACH_PRESET,
  STARTER_FIT_MATTOCK,
  STARTER_FIT_VERGE,
  TEST_REACH_PRESET,
  type UniverseConfig,
} from '@starweft/core';
import { StarweftClient } from '@starweft/client-sdk';
import type { GameEvent, OrderView } from '@starweft/protocol';
import { GameServer, JsonFileSnapshotStore, type SnapshotStore } from '@starweft/server';
import { chooseTravelMode, resolveCommand, CommandUsageError, type ViewRefs } from './commands.js';
import { bar, fmtBeacon, fmtDistance, fmtEntity, fmtItemStack, fmtLumens, fmtOrder } from './format.js';
import { toLoadoutJson } from './loadout.js';
import { CommandQueue } from './queue.js';

const { values: rawArgv } = parseArgs({
  options: {
    name: { type: 'string' },
    url: { type: 'string' },
    port: { type: 'string' },
    universe: { type: 'string' },
  },
  strict: false,
});
// Under strict:false the return type widens to string|boolean for safety;
// our four options are all declared type:'string', so this narrowing is sound.
const argv = rawArgv as { name?: string; url?: string; port?: string; universe?: string };

const name = argv.name ?? `Pilot-${process.pid}`;
const port = Number(argv.port ?? process.env['STARWEFT_PORT'] ?? 8777);
const url = argv.url ?? `ws://127.0.0.1:${port}`;
const autoHostAllowed = argv.url === undefined;
const universePreset: UniverseConfig = argv.universe === 'full' ? REACH_PRESET : TEST_REACH_PRESET;

let hostedServer: GameServer | null = null;
let snapshotStore: SnapshotStore | null = null;
let client: StarweftClient;

function tryConnect(probe: StarweftClient, target: string, timeoutMs: number): Promise<boolean> {
  return Promise.race([
    probe.connect(target).then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

async function connectOrHost(): Promise<void> {
  const probe = new StarweftClient();
  const connected = await tryConnect(probe, url, 1200);
  if (connected) {
    client = probe;
    return;
  }
  probe.close();
  if (!autoHostAllowed) {
    console.error(`Could not connect to ${url}. Is a STARWEFT server running there?`);
    process.exit(1);
  }
  console.log(`No server found at ${url} — hosting a new universe right here.`);
  snapshotStore = new JsonFileSnapshotStore('.starweft-data/world.json');
  hostedServer = await GameServer.start({ port, universe: universePreset }, snapshotStore);
  console.log(
    `Universe "${hostedServer.world.pack.seed}": ${hostedServer.world.pack.systems.length} systems. ` +
      `Starter system: ${hostedServer.world.starterSystem.name}.`,
  );
  console.log(
    'This terminal is hosting — closing it ends the session for everyone currently playing. ' +
      'State is saved to .starweft-data/world.json and resumes automatically next time.',
  );
  client = new StarweftClient();
  await client.connect(url);
}

function selfEntity() {
  return client.state.selfId ? (client.state.entities.get(client.state.selfId) ?? null) : null;
}

function currentView(): ViewRefs {
  return {
    beacons: client.state.beacons,
    entities: [...client.state.entities.values()].filter((e) => e.id !== client.state.selfId),
  };
}

function printHelp(): void {
  console.log(`
Navigation      look (l) | status (st) | goto <bN> | move hold|approach <N>|orbit <N> <rangeM>
                undock | dock <bN> | thread <bN>
Combat          lock <N> | unlock <N> | fire <hardpoint#> <N> | activate <slot> <#> [target]
                deactivate <slot> <#> | stop <slot> <#>
Mining          mine <hardpoint#> <asteroid#>
Fitting         fit combat | fit mining
Inventory       cargo | hangar | load <typeId> <qty> | unload <typeId> <qty>
Industry        refine <oreId> <units> | build <blueprintId> <runs> | collect <jobId> | jobs
Market          market <typeId> | buy <typeId> <price> <qty> | sell <typeId> <price> <qty> | cancel <orderId>
Loot            loot <wreck#>
Social          who | say <text> | tell <name> <text>
Other           wallet | help (?) | quit

Beacons are "b1", "b2", ... from the last "look". Ships/asteroids/wrecks are bare numbers "1", "2", ....
`);
}

function printLook(): void {
  const s = client.state;
  console.log(`\n== ${s.systemName ?? '?'} ==  ${s.dockedAt ? `docked at ${s.dockedAt}` : 'in space'}`);
  const self = selfEntity();
  if (self) {
    console.log(
      `You: ${self.name}  shield${bar(self.shieldFrac ?? 0)} armor${bar(self.armorFrac ?? 0)} hull${bar(self.hullFrac ?? 0)}`,
    );
  } else if (s.dockedAt) {
    console.log('Docked — "undock" to fly, or use cargo/hangar/market/refine/build here.');
  }
  if (s.beacons.length > 0) {
    console.log('Beacons:');
    s.beacons.forEach((b, i) => console.log(fmtBeacon(b, i + 1, self?.pos ?? null)));
  }
  const others = currentView().entities;
  if (others.length > 0) {
    console.log('Nearby:');
    others.forEach((e, i) => console.log(fmtEntity(e, i + 1, self?.pos ?? null)));
  }
}

function printStatus(): void {
  const self = selfEntity();
  console.log(`${client.state.name ?? '?'}  ${fmtLumens(client.state.walletLM)}`);
  console.log(
    client.state.dockedAt
      ? `Docked at ${client.state.dockedAt}`
      : `In space, system ${client.state.systemName ?? '?'}`,
  );
  if (self) {
    console.log(
      `Shield ${bar(self.shieldFrac ?? 0)}  Armor ${bar(self.armorFrac ?? 0)}  Hull ${bar(self.hullFrac ?? 0)}`,
    );
  }
  console.log(
    `Cargo ${client.state.cargoUsedM3.toFixed(1)} / ${client.state.cargoCapacityM3.toFixed(1)} m³`,
  );
}

function printCargo(): void {
  if (client.state.cargo.length === 0) return console.log('Cargo hold is empty.');
  console.log(`Cargo (${client.state.cargoUsedM3.toFixed(1)} / ${client.state.cargoCapacityM3.toFixed(1)} m³):`);
  client.state.cargo.forEach((stack) => console.log(fmtItemStack(stack)));
}

function printHangar(): void {
  if (!client.state.hangarStation) return console.log('Not docked yet — dock at a station first.');
  if (client.state.hangar.length === 0) return console.log('Hangar is empty.');
  console.log(`Hangar at ${client.state.hangarStation}:`);
  client.state.hangar.forEach((stack) => console.log(fmtItemStack(stack)));
}

function printWho(): void {
  if (client.state.presence.length === 0) return console.log('No one else in this system right now.');
  console.log('In this system:');
  client.state.presence.forEach((p) =>
    console.log(`  ${p.name}${p.id === client.state.characterId ? ' (you)' : ''}`),
  );
}

function printJobs(): void {
  if (client.state.jobs.length === 0) return console.log('No industry jobs yet — start one with "build".');
  client.state.jobs.forEach((j) => {
    const status = j.collected
      ? 'collected'
      : client.state.tick >= j.readyAtTick
        ? `ready — "collect ${j.id}"`
        : `running (ready @ tick ${j.readyAtTick})`;
    console.log(`  ${j.id}  ${j.outputQty} × ${j.outputTypeId} — ${status}`);
  });
}

function printOrders(typeId: string): void {
  const o = client.state.orders;
  if (!o || o.typeId !== typeId) return console.log('No order book data for that item yet.');
  console.log(`Market: ${typeId}`);
  const printSide = (label: string, orders: readonly OrderView[]): void => {
    console.log(` ${label}:`);
    if (orders.length === 0) console.log('   (none)');
    else orders.forEach((order) => console.log(fmtOrder(order)));
  };
  printSide('Sells', o.sells);
  printSide('Buys', o.buys);
}

function printTradeResult(result: {
  trades: Array<{ price: number; qty: number; deliveredAt: string }>;
  restingOrderId: string | null;
}): void {
  if (result.trades.length === 0) console.log('No immediate match — order is resting on the book.');
  else result.trades.forEach((t) => console.log(`  filled ${t.qty} @ ${t.price} LM (delivered at ${t.deliveredAt})`));
  if (result.restingOrderId) console.log(`  resting order: ${result.restingOrderId}`);
}

function printEvent(e: GameEvent): void {
  switch (e.kind) {
    case 'volley':
      console.log(e.hit ? `[combat] hit for ${e.total} dmg${e.destroyed ? ' — target destroyed!' : ''}` : '[combat] shot missed');
      break;
    case 'destroyed':
      console.log(`[combat] ${e.entityId} destroyed${e.wreckId ? ` — wreck ${e.wreckId}` : ''}`);
      break;
    case 'mined':
      console.log(`[mining] +${e.units} × ${e.oreId}`);
      break;
    case 'cycleFailed':
      console.log(`[module] ${e.slot} #${e.index + 1} failed: ${e.reason}`);
      break;
    case 'docked':
      console.log(`[nav] docked at ${e.stationId}`);
      break;
    case 'undocked':
      console.log('[nav] undocked');
      break;
    case 'arcStart':
      console.log(`[nav] arc drive spooling (${e.etaTicks} ticks)`);
      break;
    case 'arcDone':
      console.log('[nav] arc complete');
      break;
    case 'arcBlocked':
      console.log(`[nav] arc blocked: ${e.reason}`);
      break;
    case 'threaded':
      console.log(`[nav] arrived in ${e.systemName}`);
      break;
    case 'lockAcquired':
      console.log(`[targeting] locked ${e.targetId}`);
      break;
    case 'lockLost':
      console.log(`[targeting] lost lock on ${e.targetId}: ${e.reason}`);
      break;
  }
}

async function execute(line: string): Promise<void> {
  const action = resolveCommand(line, currentView());
  switch (action.type) {
    case 'help':
      return printHelp();
    case 'quit':
      return shutdown();
    case 'look':
      return printLook();
    case 'status':
      return printStatus();
    case 'wallet':
      return console.log(fmtLumens(client.state.walletLM));
    case 'cargoView':
      return printCargo();
    case 'hangarView':
      return printHangar();
    case 'who':
      return printWho();
    case 'jobsView':
      return printJobs();

    case 'goto': {
      const beacon = client.state.beacons.find((b) => b.id === action.beaconId);
      if (!beacon) return console.log('error: unknown beacon — run "look" again');
      const self = selfEntity();
      if (!self) return console.log('error: not in space — undock first');
      const mode = chooseTravelMode(self.pos, beacon.pos);
      if (mode === 'arc') {
        await client.arcTo(beacon.pos);
        console.log(`Arcing toward ${beacon.name} (${fmtDistance(Math.hypot(beacon.pos.x - self.pos.x, beacon.pos.y - self.pos.y, beacon.pos.z - self.pos.z))})…`);
      } else {
        await client.move({ kind: 'moveTo', dest: beacon.pos });
        console.log(`Burning toward ${beacon.name}…`);
      }
      return;
    }
    case 'moveHold':
      await client.move({ kind: 'hold' });
      return console.log('Holding position.');
    case 'moveApproach':
      await client.move({ kind: 'approach', targetId: action.targetId });
      return console.log('Approaching.');
    case 'moveOrbit':
      await client.move({ kind: 'orbit', targetId: action.targetId, rangeM: action.rangeM });
      return console.log(`Orbiting at ${fmtDistance(action.rangeM)}.`);

    case 'undock':
      await client.undock();
      return console.log('Undocking…');
    case 'dock':
      await client.dock(action.stationId);
      return console.log('Docking…');
    case 'thread':
      await client.thread(action.terminusId);
      return console.log('Threading the weftline…');

    case 'lock':
      await client.lock(action.targetId);
      return console.log('Locking target…');
    case 'unlock':
      await client.unlock(action.targetId);
      return console.log('Target unlocked.');

    case 'activate':
      await (action.targetId !== undefined
        ? client.activate(action.slot, action.index, action.targetId)
        : client.activate(action.slot, action.index));
      return console.log('Activated.');
    case 'deactivate':
      await client.deactivate(action.slot, action.index);
      return console.log('Deactivated.');

    case 'fitPreset': {
      const loadout = toLoadoutJson(action.preset === 'combat' ? STARTER_FIT_VERGE : STARTER_FIT_MATTOCK);
      await client.fitShip(loadout);
      return console.log(`Refit to the ${action.preset === 'combat' ? 'combat Verge' : 'mining Mattock'}.`);
    }

    case 'refine': {
      const result = await client.refine(action.oreId, action.units);
      console.log('Refined into:');
      result.outputs.forEach((o) => console.log(`  ${o.qty} × ${o.typeId}`));
      return;
    }
    case 'build': {
      const result = await client.manufacture(action.blueprintId, action.runs);
      return console.log(`Job started (${result.jobId}), ready at tick ${result.readyAtTick}.`);
    }
    case 'collect':
      await client.collectJob(action.jobId);
      return console.log('Collected.');

    case 'market':
      await client.marketBook(action.typeId);
      return printOrders(action.typeId);
    case 'buy':
      return printTradeResult(await client.placeOrder('buy', action.typeId, action.price, action.qty));
    case 'sell':
      return printTradeResult(await client.placeOrder('sell', action.typeId, action.price, action.qty));
    case 'cancel':
      await client.cancelOrder(action.orderId);
      return console.log('Order cancelled.');

    case 'loot':
      await client.loot(action.targetId);
      return console.log('Looted.');

    case 'unload':
      await client.hangarMove('toHangar', action.typeId, action.qty);
      return console.log('Unloaded to hangar.');
    case 'load':
      await client.hangarMove('toCargo', action.typeId, action.qty);
      return console.log('Loaded into cargo.');

    case 'say':
      return void (await client.chat('system', action.text));
    case 'tell': {
      const target = client.state.presence.find((p) => p.name.toLowerCase() === action.name.toLowerCase());
      if (!target) return console.log(`error: no pilot named "${action.name}" nearby — see "who"`);
      return void (await client.chat(`dm:${target.id}`, action.text));
    }
  }
}

const commandQueue = new CommandQueue();

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  rl.close();
  client.close();
  if (hostedServer && snapshotStore) {
    hostedServer.saveTo(snapshotStore);
    await hostedServer.stop();
  }
  process.exit(0);
}

let rl: ReturnType<typeof createInterface>;

async function main(): Promise<void> {
  await connectOrHost();

  try {
    await client.devLogin(name);
  } catch (err) {
    console.error(`Could not join as "${name}": ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  await client.enterWorld();

  client.onEvent(printEvent);
  client.onChat((m) => console.log(`[chat:${m.channel}] ${m.fromName}: ${m.text}`));

  console.log(`\nWelcome, ${name}. Wallet: ${fmtLumens(client.state.walletLM)}.`);
  console.log('Type "help" for commands.');
  printLook();

  rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();
  // Serialize command execution: readline emits 'line' for every buffered
  // line before an async handler's promise settles, so fast/piped/pasted
  // multi-line input would otherwise race (e.g. "undock" and "look"
  // executing concurrently, before undock's ACK+SNAPSHOT land).
  rl.on('line', (line) => {
    commandQueue.push(async () => {
      if (line.trim().length > 0) {
        try {
          await execute(line);
        } catch (err) {
          if (err instanceof CommandUsageError) console.log(`usage: ${err.message}`);
          else console.log(`error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (!shuttingDown) rl.prompt();
    });
  });
  rl.on('close', () => {
    // On piped/EOF input, 'close' can fire the instant all lines are
    // buffered — well before an in-flight command's network round trip
    // finishes. Let the queue drain first so e.g. "undock" isn't cut off
    // mid-request by an immediate process.exit.
    if (!shuttingDown) void commandQueue.drain().then(() => shutdown());
  });
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();
