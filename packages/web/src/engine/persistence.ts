/**
 * Solo save/restore. Structurally mirrors @starweft/server's
 * persistence/snapshot.ts (capture/restoreWorld), but that file imports
 * node:fs (for JsonFileSnapshotStore) which doesn't exist in a browser — so
 * this is a small, self-contained duplicate rather than a shared import,
 * keeping the browser bundle free of any Node-only module graph.
 */

import { characterId, entityId, jobId, systemId, type CharacterId } from '@starweft/core';
import type { World } from '@starweft/server/world';
import type { MarketService } from '@starweft/server/market';
import type { CharacterState, Job } from '@starweft/server/state';

export interface SoloSave {
  readonly version: 1;
  readonly tickNumber: number;
  readonly universeSeed: string;
  readonly playerId: string;
  readonly characters: Array<Omit<CharacterState, 'shipEntityId'>>;
  readonly ledger: ReturnType<World['ledger']['snapshot']>;
  readonly items: ReturnType<World['items']['snapshot']>;
  readonly jobs: Job[];
  readonly asteroidDepletion: Array<[string, string, number]>;
  readonly markets: Array<[string, { seq: number; orders: unknown[] }]>;
}

export function captureSolo(world: World, markets: MarketService, playerId: CharacterId): SoloSave {
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
    playerId: playerId as string,
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

/** Restores into a freshly booted World (same universe seed required). Returns the player CharacterId. */
export function restoreSolo(world: World, markets: MarketService, save: SoloSave): CharacterId {
  if (save.universeSeed !== world.pack.seed) {
    throw new Error(`save seed "${save.universeSeed}" does not match universe "${world.pack.seed}"`);
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
      shipEntityId: null,
    };
    world.characters.set(restored.id, restored);
  }

  world.jobs.clear();
  for (const job of save.jobs) {
    world.jobs.set(jobId(job.id), job);
  }

  for (const [sysIdStr, astIdStr, units] of save.asteroidDepletion) {
    const cell = world.cell(systemId(sysIdStr));
    const asteroid = cell.asteroids.get(entityId(astIdStr));
    if (asteroid) {
      if (units <= 0) cell.asteroids.delete(asteroid.id);
      else asteroid.unitsRemaining = units;
    }
  }
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
    const cell = world.cell(systemId(sysIdStr));
    for (const asteroid of [...cell.asteroids.values()]) {
      if (!saved.has(asteroid.id as string)) cell.asteroids.delete(asteroid.id);
    }
  }

  for (const [regionIdStr, marketSave] of save.markets) {
    const market = markets.marketForRegion(regionIdStr as never);
    market.restore(marketSave as Parameters<typeof market.restore>[0]);
  }

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

  return characterId(save.playerId);
}

export interface SoloStore {
  save(data: SoloSave): void;
  load(): SoloSave | null;
  clear(): void;
}

const STORAGE_KEY = 'starweft-solo-save-v1';

/** localStorage-backed store — the only browser-specific piece here. */
export class LocalStorageSoloStore implements SoloStore {
  save(data: SoloSave): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable (private browsing) — solo play still
      // works, it just won't survive a reload. Not worth surfacing as an error.
    }
  }

  load(): SoloSave | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SoloSave) : null;
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/** In-memory store for tests / non-browser environments. */
export class MemorySoloStore implements SoloStore {
  private data: SoloSave | null = null;
  save(data: SoloSave): void {
    this.data = JSON.parse(JSON.stringify(data)) as SoloSave;
  }
  load(): SoloSave | null {
    return this.data;
  }
  clear(): void {
    this.data = null;
  }
}
