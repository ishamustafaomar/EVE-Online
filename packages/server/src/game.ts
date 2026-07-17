/**
 * GameServer: composition root. Content → universe → world → services →
 * gateway, plus the fixed-tick loop (doc 09 §8: single-process dev topology
 * with the production seams in place).
 */

import { issueSessionToken } from './auth.js';
import { DEFAULT_CONFIG, RULES, type GameServerConfig } from './config.js';
import { Gateway } from './gateway/gateway.js';
import { captureWorld, restoreWorld, type SnapshotStore, type WorldSave } from './persistence/snapshot.js';
import { MarketService } from './services/market.js';
import { World } from './world/world.js';

export interface DevAccount {
  readonly accountId: string;
  readonly characterId: string;
  readonly name: string;
  readonly token: string;
}

export class GameServer {
  readonly world: World;
  readonly markets: MarketService;
  readonly gateway: Gateway;
  private loop: ReturnType<typeof setInterval> | null = null;

  private constructor(readonly config: GameServerConfig) {
    this.world = new World(config);
    this.markets = new MarketService(this.world, this.world.ledger, this.world.items);
    this.gateway = new Gateway(config, this.world, this.markets, () => Date.now());
  }

  static async start(overrides: Partial<GameServerConfig> = {}, snapshot?: SnapshotStore): Promise<GameServer> {
    const config: GameServerConfig = { ...DEFAULT_CONFIG, ...overrides };
    const server = new GameServer(config);
    const saved = snapshot?.load() ?? null;
    if (saved) {
      restoreWorld(server.world, server.markets, saved);
    } else {
      server.markets.seedNpcVendor();
    }
    server.loop = setInterval(() => server.tick(), config.tickIntervalMs);
    return server;
  }

  /** Advance the simulation one tick and flush replication. */
  tick(): void {
    this.world.tick(this.config.dtSec);
    this.gateway.flushReplication();
  }

  snapshot(): WorldSave {
    return captureWorld(this.world, this.markets);
  }

  saveTo(store: SnapshotStore): void {
    store.save(this.snapshot());
  }

  /** Dev/test provisioning (config.devMode): account + character + session token. */
  createDevAccount(name: string): DevAccount {
    if (!this.config.devMode) throw new Error('dev directory disabled');
    const character = this.world.createCharacter(name);
    const token = issueSessionToken(
      {
        accountId: character.accountId as string,
        characterId: character.id as string,
        expiresAtMs: Date.now() + RULES.sessionTtlMs,
      },
      this.config.sessionSecret,
    );
    return {
      accountId: character.accountId as string,
      characterId: character.id as string,
      name,
      token,
    };
  }

  get port(): number {
    return this.gateway.port;
  }

  async stop(): Promise<void> {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    await this.gateway.close();
  }
}
