/**
 * Persistence: repository seam for Milestone A (doc 09 §3). The world
 * serializes to a WorldSave; stores are pluggable (in-memory for tests,
 * JSON file for dev durability, PostgreSQL mapping in docs/sql/schema.sql).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CharacterId, JobId, SystemId } from '@starweft/core';
import { characterId, entityId, jobId, systemId } from '@starweft/core';
import type { World } from '../world/world.js';
import type { MarketService } from '../services/market.js';
import type { CharacterState, Job } from '../world/state.js';

export interface WorldSave {
  readonly version: 1;
  readonly tickNumber: number;
  readonly universeSeed: string;
  readonly characters: Array<Omit<CharacterState, 'shipEntityId'>>;
  readonly ledger: ReturnType<World['ledger']['snapshot']>;
  readonly items: ReturnType<World['items']['snapshot']>;
  readonly jobs: Job[];
  readonly asteroidDepletion: Array<[string, string, number]>;
  readonly markets: Array<[string, { seq: number; orders: unknown[] }]>;
}

export interface SnapshotStore {
  save(data: WorldSave): void;
  load(): WorldSave | null;
}

export class MemorySnapshotStore implements SnapshotStore {
  private data: WorldSave | null = null;
  save(data: WorldSave): void {
    this.data = JSON.parse(JSON.stringify(data)) as WorldSave;
  }
  load(): WorldSave | null {
    return this.data;
  }
}

export class JsonFileSnapshotStore implements SnapshotStore {
  constructor(private readonly path: string) {}
  save(data: WorldSave): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(data));
  }
  load(): WorldSave | null {
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as WorldSave;
    } catch {
      return null;
    }
  }
}

export function captureWorld(world: World, markets: MarketService): WorldSave {
  const asteroidDepletion: Array<[string, string, number]> = [];
  for (const cell of world.activeCells()) {
    for (const asteroid of cell.asteroids.values()) {
      asteroidDepletion.push([cell.system.id as string, asteroid.id as string, asteroid.unitsRemaining]);
    }
  }
  return {
    version: 1,
    tickNumber: world.tickNumber,
    universeSeed: world.pack.seed,
    characters: [...world.characters.values()].map(({ shipEntityId: _ship, ...rest }) => rest),
    ledger: world.ledger.snapshot(),
    items: world.items.snapshot(),
    jobs: [...world.jobs.values()],
    asteroidDepletion,
    markets: [...markets.allMarkets().entries()].map(([regionId, market]) => [
      regionId as string,
      market.snapshot() as { seq: number; orders: unknown[] },
    ]),
  };
}

/** Restore a save into a freshly booted world (same universe seed required). */
export function restoreWorld(world: World, markets: MarketService, save: WorldSave): void {
  if (save.universeSeed !== world.pack.seed) {
    throw new Error(`snapshot seed ${save.universeSeed} does not match universe ${world.pack.seed}`);
  }
  world.tickNumber = save.tickNumber;
  world.ledger.restore(save.ledger);
  world.items.restore(save.items);
  world.characters.clear();
  for (const c of save.characters) {
    const restored: CharacterState = {
      ...c,
      id: characterId(c.id as string),
      systemId: systemId(c.systemId as string),
      dockedAt: c.dockedAt,
      shipEntityId: null,
    };
    world.characters.set(restored.id, restored);
  }
  world.jobs.clear();
  for (const job of save.jobs) {
    world.jobs.set(jobId(job.id) as JobId, job);
  }
  for (const [sysIdStr, astIdStr, units] of save.asteroidDepletion) {
    const cell = world.cell(systemId(sysIdStr) as SystemId);
    const asteroid = cell.asteroids.get(entityId(astIdStr));
    if (asteroid) {
      if (units <= 0) cell.asteroids.delete(asteroid.id);
      else asteroid.unitsRemaining = units;
    }
  }
  // Depleted nodes absent from the save were fully mined: remove them.
  const savedBySystem = new Map<string, Set<string>>();
  for (const [sysIdStr, astIdStr] of save.asteroidDepletion) {
    let set = savedBySystem.get(sysIdStr);
    if (!set) {
      set = new Set();
      savedBySystem.set(sysIdStr, set);
    }
    set.add(astIdStr);
  }
  for (const [sysIdStr, saved] of savedBySystem) {
    const cell = world.cell(systemId(sysIdStr) as SystemId);
    for (const asteroid of [...cell.asteroids.values()]) {
      if (!saved.has(asteroid.id as string)) cell.asteroids.delete(asteroid.id);
    }
  }
  for (const [regionIdStr, marketSave] of save.markets) {
    const market = markets.marketForRegion(regionIdStr as never);
    market.restore(marketSave as Parameters<typeof market.restore>[0]);
  }
  // Counters must clear restored IDs so new characters/jobs can't collide.
  let maxChar = -1;
  for (const c of save.characters) {
    const match = /^char\.(\d+)$/.exec(c.id as string);
    if (match) maxChar = Math.max(maxChar, Number(match[1]));
  }
  let maxJob = -1;
  for (const job of save.jobs) {
    const match = /^job\.(\d+)$/.exec(job.id);
    if (match) maxJob = Math.max(maxJob, Number(match[1]));
  }
  world.setCounters(maxChar + 1, maxJob + 1);
}
