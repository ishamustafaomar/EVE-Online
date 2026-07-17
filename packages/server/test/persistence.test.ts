/**
 * Persistence: capture → restore round trip (doc 09 §3). Inventory, wallets,
 * market books, jobs, and asteroid depletion must survive a reboot; the
 * universe regenerates deterministically from its seed.
 */

import { describe, expect, it } from 'vitest';
import { LedgerAccounts, Locations, itemTypeId } from '@starweft/core';
import { GameServer, MemorySnapshotStore } from '../src/index.js';

describe('world snapshot round trip', () => {
  it('restores characters, wallets, hangars, orders, and belt depletion', { timeout: 60_000 }, async () => {
    const store = new MemorySnapshotStore();
    const serverA = await GameServer.start({ port: 0, tickIntervalMs: 1000 });
    try {
      const account = serverA.createDevAccount('Persistent Pat');
      const character = serverA.world.characters.get(account.characterId as never);
      expect(character).toBeDefined();
      if (!character) return;

      // Mutate the world: spend lumens, deplete an asteroid, place an order.
      serverA.world.ledger.burn(
        LedgerAccounts.character(character.id), 7_000, 'job-fee',
      );
      const cell = serverA.world.cell(character.systemId);
      const asteroid = [...cell.asteroids.values()][0];
      expect(asteroid).toBeDefined();
      if (!asteroid) return;
      asteroid.unitsRemaining = 123;

      const market = serverA.markets.marketForStation(character.homeStationId);
      expect(market).toBeDefined();
      const placed = market?.placeOrder({
        side: 'sell',
        typeId: itemTypeId('ammo.ferro-slug'),
        price: 15,
        qty: 100,
        stationId: character.homeStationId,
        character: character.id,
      });
      // Starter cargo has the slugs but they must be in the hangar to list.
      expect(placed?.ok).toBe(false);
      serverA.world.items.move(
        (await import('../src/index.js')).ShipLocations.cargo(character.id),
        Locations.hangar(character.id, character.homeStationId),
        itemTypeId('ammo.ferro-slug'),
        400,
      );
      const placed2 = market?.placeOrder({
        side: 'sell',
        typeId: itemTypeId('ammo.ferro-slug'),
        price: 15,
        qty: 100,
        stationId: character.homeStationId,
        character: character.id,
      });
      expect(placed2?.ok).toBe(true);

      const walletBefore = serverA.world.ledger.balance(LedgerAccounts.character(character.id));
      serverA.saveTo(store);

      // Reboot into a fresh server from the snapshot.
      const serverB = await GameServer.start({ port: 0, tickIntervalMs: 1000 }, store);
      try {
        const restored = serverB.world.characters.get(account.characterId as never);
        expect(restored).toBeDefined();
        expect(restored?.name).toBe('Persistent Pat');
        expect(restored?.dockedAt).toBe(character.homeStationId);
        expect(serverB.world.ledger.balance(LedgerAccounts.character(character.id))).toBe(walletBefore);

        // Asteroid depletion survived.
        const cellB = serverB.world.cell(character.systemId);
        const asteroidB = cellB.asteroids.get(asteroid.id);
        expect(asteroidB?.unitsRemaining).toBe(123);

        // Market order survived with escrowed items intact.
        const marketB = serverB.markets.marketForStation(character.homeStationId);
        const book = marketB?.ordersFor(itemTypeId('ammo.ferro-slug'));
        expect(book?.sells.some((o) => o.owner === character.id && o.remaining === 100)).toBe(true);

        // Conservation invariants hold after restore.
        expect(serverB.world.ledger.audit().conserved).toBe(true);
        expect(serverB.world.items.audit().conserved).toBe(true);

        // New characters get fresh, collision-free IDs.
        const newAccount = serverB.createDevAccount('Newcomer');
        expect(newAccount.characterId).not.toBe(account.characterId);
      } finally {
        await serverB.stop();
      }
    } finally {
      await serverA.stop();
    }
  });
});
