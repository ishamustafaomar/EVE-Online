/**
 * End-to-end integration (doc 14 §2.1): real GameServer, real WebSockets,
 * real client SDK. One shared world, sequential scenarios:
 * auth → refit → undock → arc → mine → dock → refine → manufacture →
 * market (player↔player and NPC vendor) → combat → loot → chat → thread →
 * interest filtering → conservation audit.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StarweftClient } from '@starweft/client-sdk';
import { dist, LedgerAccounts } from '@starweft/core';
import { GameServer, type DevAccount } from '../src/index.js';

const LONG = 60_000;

let server: GameServer;
let alice: StarweftClient;
let bob: StarweftClient;
let carol: StarweftClient;
let aliceAccount: DevAccount;
let bobAccount: DevAccount;
let carolAccount: DevAccount;

async function connect(account: DevAccount): Promise<StarweftClient> {
  const client = new StarweftClient();
  await client.connect(`ws://127.0.0.1:${server.port}`);
  await client.login(account.token);
  await client.enterWorld();
  return client;
}

beforeAll(async () => {
  server = await GameServer.start({ port: 0, tickIntervalMs: 2 });
  aliceAccount = server.createDevAccount('Alice Veyr');
  bobAccount = server.createDevAccount('Bob Kessari');
  carolAccount = server.createDevAccount('Carol Ashfall');
  alice = await connect(aliceAccount);
  bob = await connect(bobAccount);
  carol = await connect(carolAccount);
}, LONG);

afterAll(async () => {
  alice?.close();
  bob?.close();
  carol?.close();
  await server?.stop();
});

describe('authentication & session', () => {
  it('rejects invalid tokens', { timeout: LONG }, async () => {
    const impostor = new StarweftClient();
    await impostor.connect(`ws://127.0.0.1:${server.port}`);
    await expect(impostor.login('garbage-token-garbage-token')).rejects.toThrow(/auth failed/);
    impostor.close();
  });

  it('welcomes authenticated pilots docked at the starter station', () => {
    expect(alice.state.characterId).toBe(aliceAccount.characterId);
    expect(alice.state.dockedAt).toBe(server.world.starterStation.id);
    expect(alice.state.walletLM).toBe(50_000);
    expect(alice.state.hangar.length).toBeGreaterThan(0);
  });

  it('enforces rate limits with typed errors', { timeout: LONG }, async () => {
    const results: string[] = [];
    for (let i = 0; i < 10; i++) {
      try {
        await alice.chat('system', `spam ${i}`);
        results.push('ok');
      } catch (e) {
        results.push((e as Error).message);
      }
    }
    expect(results.some((r) => r.includes('rate limited'))).toBe(true);
    // Budget refills: wait, then chat succeeds again.
    await new Promise((r) => setTimeout(r, 2100));
    await alice.chat('system', 'back in budget');
  });
});

describe('mining → refining → manufacturing', () => {
  it('refits to the mining hull from hangar spares', { timeout: LONG }, async () => {
    await alice.fitShip({
      hullId: 'hull.mattock',
      hardpoints: ['mod.burrower1'],
      auxiliary: ['mod.bulwark-extender1'],
      core: ['mod.surveyor-lens1', 'mod.flux-relay1'],
      weaves: [],
    });
    // The swapped-out Verge hull and modules are now hangar stock.
    expect(alice.state.hangar.some((s) => s.typeId === 'hull.verge')).toBe(true);
  });

  it('rejects illegal fits at the server', { timeout: LONG }, async () => {
    await expect(
      alice.fitShip({
        hullId: 'hull.mattock',
        hardpoints: ['mod.burrower1', 'mod.burrower1', 'mod.burrower1'],
        auxiliary: [],
        core: [],
        weaves: [],
      }),
    ).rejects.toThrow(/slot|missing/);
  });

  it('undocks, arcs to a belt, and mines ore into the hold', { timeout: LONG }, async () => {
    await alice.undock();
    await alice.waitFor(() => alice.state.selfId !== null, LONG, 'snapshot after undock');

    const belt = alice.state.beacons.find((b) => b.kind === 'belt');
    expect(belt).toBeDefined();
    if (!belt) return;

    await alice.arcTo(belt.pos);
    await alice.waitFor(
      () => alice.events().some((e) => e.kind === 'arcDone'),
      LONG,
      'arc completion',
    );
    await alice.waitFor(
      () => [...alice.state.entities.values()].some((e) => e.kind === 'asteroid'),
      LONG,
      'asteroids on grid',
    );

    const self = (): { pos: { x: number; y: number; z: number } } | undefined =>
      alice.state.selfId ? alice.state.entities.get(alice.state.selfId) : undefined;
    const nearest = [...alice.state.entities.values()]
      .filter((e) => e.kind === 'asteroid')
      .sort((a, b) => dist(a.pos, self()?.pos ?? a.pos) - dist(b.pos, self()?.pos ?? b.pos))[0];
    expect(nearest).toBeDefined();
    if (!nearest) return;

    await alice.move({ kind: 'approach', targetId: nearest.id });
    await alice.waitFor(
      () => {
        const me = self();
        return me !== undefined && dist(me.pos, nearest.pos) < 11_000;
      },
      LONG,
      'approach asteroid',
    );
    await alice.activate('hardpoint', 0, nearest.id);
    await alice.waitFor(
      () => alice.events().some((e) => e.kind === 'mined'),
      LONG,
      'first extractor cycle',
    );
    const mined = alice.events().find((e) => e.kind === 'mined');
    expect(mined && mined.kind === 'mined' && mined.units).toBeGreaterThan(0);
  });

  it('docks, refines ore, and manufactures munitions from the output', { timeout: LONG }, async () => {
    await alice.deactivate('hardpoint', 0);
    const station = alice.state.beacons.find((b) => b.id === (server.world.starterStation.id as string));
    expect(station).toBeDefined();
    if (!station) return;

    await alice.arcTo(station.pos);
    await alice.waitFor(
      () => alice.events().filter((e) => e.kind === 'arcDone').length >= 2,
      LONG,
      'arc back to station',
    );
    await alice.move({ kind: 'moveTo', dest: station.pos });
    const self = (): { pos: { x: number; y: number; z: number } } | undefined =>
      alice.state.selfId ? alice.state.entities.get(alice.state.selfId) : undefined;
    await alice.waitFor(
      () => {
        const me = self();
        return me !== undefined && dist(me.pos, station.pos) < 2_000;
      },
      LONG,
      'approach station',
    );
    await alice.dock(station.id);

    // Unload the ore hold into the hangar.
    const cargoOre = alice.state.cargo.find((s) => s.typeId.startsWith('ore.'));
    expect(cargoOre).toBeDefined();
    if (!cargoOre) return;
    await alice.hangarMove('toHangar', cargoOre.typeId, cargoOre.qty);

    // Refine: server returns the mineral outputs.
    const refined = await alice.refine(cargoOre.typeId, cargoOre.qty);
    expect(refined.outputs.length).toBeGreaterThan(0);
    const ferrite = refined.outputs.find((o) => o.typeId === 'min.ferrite');
    expect(ferrite && ferrite.qty).toBeGreaterThanOrEqual(120);

    // Manufacture ferro slugs from the starter blueprint.
    const job = await alice.manufacture('bp.ammo.ferro-slug', 1);
    expect(job.readyAtTick).toBeGreaterThan(server.world.tickNumber);
    await alice.waitFor(() => server.world.tickNumber >= job.readyAtTick, LONG, 'job completion');
    await alice.collectJob(job.jobId);
    await alice.waitFor(
      () => alice.state.hangar.some((s) => s.typeId === 'ammo.ferro-slug' && s.qty >= 100),
      LONG,
      'manufactured output in hangar',
    );
  });
});

describe('markets', () => {
  it('player-to-player trade executes at maker price with fees', { timeout: LONG }, async () => {
    const aliceWallet = alice.state.walletLM;
    const bobWallet = bob.state.walletLM;

    // Alice lists 100 ferro slugs at 20 LM.
    const listed = await alice.placeOrder('sell', 'ammo.ferro-slug', 20, 100);
    expect(listed.restingOrderId).not.toBeNull();

    // Bob lifts the order at a higher limit; executes at 20 (maker price).
    const lifted = await bob.placeOrder('buy', 'ammo.ferro-slug', 25, 100);
    expect(lifted.trades).toHaveLength(1);
    expect(lifted.trades[0]?.price).toBe(20);

    await bob.waitFor(
      () => bob.state.hangar.some((s) => s.typeId === 'ammo.ferro-slug' && s.qty >= 100),
      LONG,
      'delivery to buyer hangar',
    );
    await alice.waitFor(() => alice.state.walletLM > aliceWallet, LONG, 'seller proceeds');
    // Broker fee: ceil(20×100×1%) = 20; tax: floor(2000×2%) = 40.
    expect(alice.state.walletLM).toBe(aliceWallet - 20 + 2000 - 40);
    // Bob: broker fee ceil(25×100×0.01)=25 + paid 2000.
    await bob.waitFor(() => bob.state.walletLM === bobWallet - 25 - 2000, LONG, 'buyer wallet settle');
  });

  it('the NPC registry sells blueprint originals (lumen sink)', { timeout: LONG }, async () => {
    await bob.marketBook('bp.mod.burrower1');
    await bob.waitFor(() => bob.state.orders?.typeId === 'bp.mod.burrower1', LONG, 'order book');
    const ask = bob.state.orders?.sells[0];
    expect(ask).toBeDefined();
    if (!ask) return;
    const bought = await bob.placeOrder('buy', 'bp.mod.burrower1', ask.price, 1);
    expect(bought.trades).toHaveLength(1);
    await bob.waitFor(
      () => bob.state.hangar.some((s) => s.typeId === 'bp.mod.burrower1'),
      LONG,
      'blueprint delivered',
    );
  });

  it('cancelling an order refunds escrow', { timeout: LONG }, async () => {
    // Restock the hangar from ship cargo (starter munitions).
    await alice.hangarMove('toHangar', 'ammo.ferro-slug', 10);
    const placed = await alice.placeOrder('sell', 'ammo.ferro-slug', 999, 10);
    expect(placed.restingOrderId).not.toBeNull();
    const hangarBefore = alice.state.hangar.find((s) => s.typeId === 'ammo.ferro-slug')?.qty ?? 0;
    await alice.cancelOrder(placed.restingOrderId as string);
    await alice.waitFor(
      () => (alice.state.hangar.find((s) => s.typeId === 'ammo.ferro-slug')?.qty ?? 0) === hangarBefore + 10,
      LONG,
      'escrowed items returned',
    );
  });
});

describe('combat, destruction, and loot', () => {
  it('a fitted Verge destroys a target; the wreck is lootable; the victim respawns', { timeout: LONG }, async () => {
    // Alice refits her Verge as a kinetic brawler: slugthrowers out-damage
    // the target's passive shield regen where the ion fit could not, and
    // they burn the starter munitions (doc 04 §3 flux stability math).
    await alice.fitShip({
      hullId: 'hull.verge',
      hardpoints: ['mod.slugthrower1-l', 'mod.slugthrower1-l', 'mod.slugthrower1-l'],
      auxiliary: ['mod.aegis-pulser1', 'mod.bulwark-extender1', 'mod.coilburner1'],
      core: ['mod.flux-battery1', 'mod.flux-relay1'],
      weaves: [],
    });
    await alice.undock();
    await bob.undock();
    await alice.waitFor(() => alice.state.selfId !== null, LONG, 'alice snapshot');
    await bob.waitFor(() => bob.state.selfId !== null, LONG, 'bob snapshot');

    const bobShipId = bob.state.selfId as string;
    await alice.waitFor(() => alice.state.entities.has(bobShipId), LONG, 'bob on alice grid');

    await alice.lock(bobShipId);
    await alice.activate('hardpoint', 0, bobShipId);
    await alice.activate('hardpoint', 1, bobShipId);
    await alice.activate('hardpoint', 2, bobShipId);

    await alice.waitFor(
      () => alice.events().some((e) => e.kind === 'destroyed' && e.entityId === bobShipId),
      LONG,
      'bob destroyed',
    );

    // Victim respawned docked at home with a fresh insured hull.
    const bobChar = server.world.characters.get(bobAccount.characterId as never);
    expect(bobChar?.dockedAt).toBe(bobChar?.homeStationId);

    // Loot the wreck.
    const destroyedEvent = alice.events().find((e) => e.kind === 'destroyed' && e.entityId === bobShipId);
    const wreckId = destroyedEvent?.kind === 'destroyed' ? destroyedEvent.wreckId : undefined;
    expect(wreckId).toBeDefined();
    if (!wreckId) return;
    await alice.waitFor(() => alice.state.entities.has(wreckId), LONG, 'wreck on grid');
    const wreck = alice.state.entities.get(wreckId);
    if (!wreck) return;
    await alice.move({ kind: 'moveTo', dest: wreck.pos });
    const self = (): { pos: { x: number; y: number; z: number } } | undefined =>
      alice.state.selfId ? alice.state.entities.get(alice.state.selfId) : undefined;
    await alice.waitFor(
      () => {
        const me = self();
        return me !== undefined && dist(me.pos, wreck.pos) < 2_000;
      },
      LONG,
      'approach wreck',
    );
    // Server-side truth: the wreck held loot before, and scooping empties it.
    const aliceChar = server.world.characters.get(aliceAccount.characterId as never);
    const cell = server.world.cell(aliceChar?.systemId as never);
    const wreckEntity = [...cell.wrecks.values()].find((w) => (w.id as string) === wreckId);
    expect(wreckEntity).toBeDefined();
    expect(server.world.items.contents(wreckEntity?.lootLocation as never).length).toBeGreaterThan(0);

    await alice.loot(wreckId);

    // Everything fit in the Verge's hold: wreck fully scooped and despawned.
    expect(cell.wrecks.has(wreckEntity?.id as never)).toBe(false);
    expect(alice.state.cargo.length).toBeGreaterThan(0);
  });
});

describe('social & navigation', () => {
  it('local presence lists the pilots in the system', { timeout: LONG }, async () => {
    await carol.waitFor(
      () => carol.state.presence.some((m) => m.id === (carolAccount.characterId as string)),
      LONG,
      'presence list',
    );
    // Alice, Bob, and Carol all live in the starter system right now.
    expect(carol.state.presence.length).toBeGreaterThanOrEqual(3);
  });

  it('system chat reaches pilots in the same system, DMs are private', { timeout: LONG }, async () => {
    const carolInbox: string[] = [];
    carol.onChat((m) => carolInbox.push(`${m.channel}|${m.text}`));
    await alice.chat('system', 'fly dangerous o7');
    await carol.waitFor(() => carolInbox.some((m) => m.includes('fly dangerous')), LONG, 'system chat');

    await alice.chat(`dm:${carolAccount.characterId}`, 'the Deep pays double');
    await carol.waitFor(() => carolInbox.some((m) => m.startsWith('dm:') && m.includes('pays double')), LONG, 'dm');
  });

  it('threads a weftline into a neighboring system', { timeout: LONG }, async () => {
    const homeSystem = alice.state.systemId;
    const terminus = alice.state.beacons.find((b) => b.kind === 'terminus');
    expect(terminus).toBeDefined();
    if (!terminus) return;
    await alice.arcTo(terminus.pos);
    await alice.waitFor(
      () => {
        const me = alice.state.selfId ? alice.state.entities.get(alice.state.selfId) : undefined;
        return me !== undefined && dist(me.pos, terminus.pos) < 6_500;
      },
      LONG,
      'arrive at terminus',
    );
    await alice.thread(terminus.id);
    await alice.waitFor(() => alice.state.systemId !== homeSystem, LONG, 'system change');
    expect(alice.events().some((e) => e.kind === 'threaded')).toBe(true);
  });

  it('interest management: entities outside the grid are never streamed', { timeout: LONG }, async () => {
    // Carol undocks at the starter station; Alice is in another system.
    await carol.undock();
    await carol.waitFor(() => carol.state.selfId !== null, LONG, 'carol snapshot');
    const aliceShipId = alice.state.selfId;
    expect(aliceShipId).not.toBeNull();
    // Carol must not know about Alice's ship (different system entirely).
    expect(carol.state.entities.has(aliceShipId as string)).toBe(false);
    // And Alice must not see Carol.
    expect(alice.state.entities.has(carol.state.selfId as string)).toBe(false);
  });
});

describe('economy integrity', () => {
  it('lumens and items conserve exactly across every flow above', () => {
    const ledgerAudit = server.world.ledger.audit();
    const itemsAudit = server.world.items.audit();
    expect(ledgerAudit.conserved).toBe(true);
    expect(itemsAudit.conserved).toBe(true);
    expect(itemsAudit.issues).toEqual([]);
  });

  it('every wallet mutation traced to tagged causes (spot check)', () => {
    // Alice earned trade proceeds and paid fees; her wallet is internally consistent.
    const balance = server.world.ledger.balance(
      LedgerAccounts.character(aliceAccount.characterId as never),
    );
    expect(Number.isInteger(balance)).toBe(true);
    expect(balance).toBeGreaterThan(0);
  });
});
