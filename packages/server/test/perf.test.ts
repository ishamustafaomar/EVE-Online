/**
 * Tick budget assertion (doc 13 §1): a 100-entity grid must tick well inside
 * budget. CI hardware varies, so the gate is 4× the 25 ms production budget —
 * it exists to catch algorithmic regressions, not to microbenchmark.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.js';
import { World } from '../src/world/world.js';

describe('cell tick budget', () => {
  it('ticks a 100-ship grid within 4× the 25 ms budget', { timeout: 120_000 }, () => {
    const world = new World({ ...DEFAULT_CONFIG, port: 0 });

    const ships: string[] = [];
    for (let i = 0; i < 100; i++) {
      const character = world.createCharacter(`Pilot ${i}`);
      const result = world.undock(character);
      expect(result.ok).toBe(true);
      ships.push(character.id as string);
    }

    // Give every ship a live movement order so the tick does real work.
    const characters = [...world.characters.values()];
    for (let i = 0; i < characters.length; i++) {
      const character = characters[i];
      const next = characters[(i + 1) % characters.length];
      if (!character || !next) continue;
      const ship = world.ship(character);
      const targetShip = next ? world.ship(next) : null;
      if (ship && targetShip) {
        world.cell(character.systemId).setMovementOrder(ship, {
          kind: 'orbit',
          targetId: targetShip.id,
          rangeM: 5_000,
        });
      }
    }

    // Warm up, then measure.
    for (let i = 0; i < 20; i++) world.tick(0.25);
    const started = performance.now();
    const TICKS = 200;
    for (let i = 0; i < TICKS; i++) world.tick(0.25);
    const avgMs = (performance.now() - started) / TICKS;

    // eslint-disable-next-line no-console
    console.log(`100-ship cell tick: avg ${avgMs.toFixed(3)} ms`);
    expect(avgMs).toBeLessThan(100);
  });
});
