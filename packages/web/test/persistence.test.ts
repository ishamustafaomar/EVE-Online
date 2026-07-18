/**
 * Solo save/restore: capture → restore round trip through localStorage-shaped
 * JSON (mirrors packages/server/test/persistence.test.ts, but for the
 * in-browser SoloWorld path — same invariants, no WebSocket in the loop).
 */

import { describe, expect, it } from 'vitest';
import { LedgerAccounts, Locations, itemTypeId } from '@starweft/core';
import { ShipLocations } from '@starweft/server/state';
import { MemorySoloStore } from '../src/engine/persistence.js';
import { SoloWorld } from '../src/engine/soloWorld.js';

describe('solo snapshot round trip', () => {
  it('restores wallet, hangar, market orders, and belt depletion', () => {
    const store = new MemorySoloStore();
    const soloA = SoloWorld.boot(store);
    const character = soloA.world.characters.get(soloA.playerId);
    expect(character).toBeDefined();
    if (!character) return;

    soloA.world.ledger.burn(LedgerAccounts.character(character.id), 7_000, 'job-fee');

    const cell = soloA.world.cell(character.systemId);
    const asteroid = [...cell.asteroids.values()][0];
    expect(asteroid).toBeDefined();
    if (!asteroid) return;
    asteroid.unitsRemaining = 123;

    soloA.world.items.move(
      ShipLocations.cargo(character.id),
      Locations.hangar(character.id, character.homeStationId),
      itemTypeId('ammo.ferro-slug'),
      400,
    );
    const market = soloA.markets.marketForStation(character.homeStationId);
    expect(market).toBeDefined();
    const placed = market?.placeOrder({
      side: 'sell',
      typeId: itemTypeId('ammo.ferro-slug'),
      price: 15,
      qty: 100,
      stationId: character.homeStationId,
      character: character.id,
    });
    expect(placed?.ok).toBe(true);

    const walletBefore = soloA.world.ledger.balance(LedgerAccounts.character(character.id));
    soloA.save(store);

    // Reboot into a fresh SoloWorld from the saved JSON (round-tripped
    // through MemorySoloStore's JSON.parse(JSON.stringify(...)), same as
    // localStorage would).
    const soloB = SoloWorld.boot(store);
    const restored = soloB.world.characters.get(soloA.playerId);
    expect(restored).toBeDefined();
    expect(restored?.name).toBe(character.name);
    expect(restored?.dockedAt).toBe(character.homeStationId);
    expect(soloB.world.ledger.balance(LedgerAccounts.character(character.id))).toBe(walletBefore);

    const cellB = soloB.world.cell(character.systemId);
    const asteroidB = cellB.asteroids.get(asteroid.id);
    expect(asteroidB?.unitsRemaining).toBe(123);

    const marketB = soloB.markets.marketForStation(character.homeStationId);
    const book = marketB?.ordersFor(itemTypeId('ammo.ferro-slug'));
    expect(book?.sells.some((o) => o.owner === character.id && o.remaining === 100)).toBe(true);

    expect(soloB.world.ledger.audit().conserved).toBe(true);
    expect(soloB.world.items.audit().conserved).toBe(true);
  });
});
