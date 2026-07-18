/**
 * SoloWorld: the real simulation running in-process in this browser tab.
 * Reuses @starweft/server's World/SystemCell/MarketService verbatim — same
 * rules, same math, same content pack — just driven locally instead of over
 * a WebSocket. There's exactly one real player; a stationary "training
 * dummy" ship stands in for PvE combat until NPC AI (Milestone C) exists.
 */

import { characterId, computeFit, DISCIPLINES, itemTypeId, vec, type CharacterId, type FitLoadout } from '@starweft/core';
import { World } from '@starweft/server/world';
import { MarketService } from '@starweft/server/market';
import { DEFAULT_CONFIG, type GameServerConfig } from '@starweft/server/config';
import type { GameEvent } from '@starweft/protocol';
import { captureSolo, restoreSolo, type SoloSave, type SoloStore } from './persistence.js';

export const DUMMY_ID: CharacterId = characterId('npc.training-dummy');
export const PLAYER_NAME = 'Pilot';

export interface SoloWorldHandlers {
  /** `to === null` means broadcast (combat, etc.) rather than addressed to one character. */
  onEvent(event: GameEvent, to: CharacterId | null): void;
  onGridChanged(): void;
}

/** All Discipline masteries at 5 — used only for the target dummy's fit, never the player's. */
function maxSkills(): Record<string, number> {
  return Object.fromEntries(DISCIPLINES.map((d) => [d.id, 5]));
}

const DUMMY_LOADOUT: FitLoadout = {
  hullId: itemTypeId('hull.underwriter'),
  hardpoints: [],
  auxiliary: [itemTypeId('mod.bulwark-extender1-g'), itemTypeId('mod.bulwark-extender1-g')],
  core: [itemTypeId('mod.ferrite-wrap1-g'), itemTypeId('mod.ferrite-wrap1-g'), itemTypeId('mod.ferrite-wrap1-g')],
  weaves: [],
};

export class SoloWorld {
  readonly world: World;
  readonly markets: MarketService;
  playerId: CharacterId;
  private handlers: SoloWorldHandlers | null = null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  private constructor(world: World, markets: MarketService, playerId: CharacterId) {
    this.world = world;
    this.markets = markets;
    this.playerId = playerId;
  }

  /** Boot fresh, or restore from a prior save if one exists and matches this universe. */
  static boot(store: SoloStore, config: Partial<GameServerConfig> = {}): SoloWorld {
    const world = new World({ ...DEFAULT_CONFIG, ...config });
    const markets = new MarketService(world, world.ledger, world.items);

    const saved = store.load();
    let playerId: CharacterId;
    if (saved && saved.universeSeed === world.pack.seed) {
      playerId = restoreSolo(world, markets, saved);
    } else {
      markets.seedNpcVendor();
      playerId = world.createCharacter(PLAYER_NAME).id;
    }
    spawnTrainingDummyIfAbsent(world);

    const solo = new SoloWorld(world, markets, playerId);
    return solo;
  }

  setHandlers(h: SoloWorldHandlers): void {
    this.handlers = h;
    this.world.setOutbound({
      sendEvent: (to, event) => this.handlers?.onEvent(event, to),
      broadcastEvent: (_systemId, event) => this.handlers?.onEvent(event, null),
      gridChanged: () => this.handlers?.onGridChanged(),
    });
  }

  // Module cycle lengths (mining, refining, combat volleys, ...) are counted
  // in ticks assuming dtSec === 0.25 (see cell.ts's cycleTicks); keep dtSec
  // fixed at that value and vary intervalMs instead. Shrinking intervalMs
  // below the real-time 250ms the multiplayer server uses fast-forwards the
  // whole simulation uniformly (travel, mining, regen, combat all scale
  // together) without touching any of that tick-counting math — appropriate
  // here since this is a single-player local instance, not a synchronized
  // multiplayer clock. 50ms is a 5x fast-forward: a 60s mining cycle takes
  // 12 real seconds, a reasonable pace for a browser demo.
  start(dtSec = 0.25, intervalMs = 50): void {
    if (this.tickHandle) return;
    this.tickHandle = setInterval(() => {
      this.world.tick(dtSec);
      // The dummy has no AI driving it and no player owns it — re-spawn it
      // if a determined player destroyed it, so the range stays usable.
      spawnTrainingDummyIfAbsent(this.world);
    }, intervalMs);
  }

  stop(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.tickHandle = null;
  }

  snapshot(): SoloSave {
    return captureSolo(this.world, this.markets, this.playerId);
  }

  save(store: SoloStore): void {
    store.save(this.snapshot());
  }
}

function spawnTrainingDummyIfAbsent(world: World): void {
  const cell = world.cell(world.starterSystem.id);
  for (const ship of cell.ships.values()) {
    if (ship.owner === DUMMY_ID) return;
  }
  const station = world.starterStation;
  const pos = vec(station.pos.x + 6000, station.pos.y + 3000, station.pos.z);
  const fitted = computeFit(world.registry, DUMMY_LOADOUT, maxSkills());
  cell.spawnShip(DUMMY_ID, 'Rustflag Training Dummy', fitted, pos);
}
