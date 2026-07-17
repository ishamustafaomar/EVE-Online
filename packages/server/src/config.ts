/** Server configuration (composition root inputs). */

import type { UniverseConfig } from '@starweft/core';
import { TEST_REACH_PRESET } from '@starweft/core';

export interface GameServerConfig {
  /** TCP port for the WebSocket gateway; 0 = ephemeral (tests). */
  readonly port: number;
  /** Universe to generate at boot. */
  readonly universe: UniverseConfig;
  /** Wall-clock interval between sim ticks. Sim time is decoupled: each tick
   *  always advances the world by `dtSec` regardless of wall pacing, so tests
   *  can run the same deterministic sim faster than real time. */
  readonly tickIntervalMs: number;
  /** Simulation seconds per tick (4 Hz authoritative tick, doc 09). */
  readonly dtSec: number;
  /** HMAC secret for session tokens. */
  readonly sessionSecret: string;
  /** Grid interest radius (doc 10 §4). */
  readonly gridRadiusM: number;
  /** Enable the in-process dev directory (test/dev account provisioning). */
  readonly devMode: boolean;
}

export const DEFAULT_CONFIG: GameServerConfig = {
  port: 8777,
  universe: TEST_REACH_PRESET,
  tickIntervalMs: 250,
  dtSec: 0.25,
  sessionSecret: 'dev-secret-do-not-use-in-prod',
  gridRadiusM: 250_000,
  devMode: true,
};

/** Gameplay constants (content-data candidates; centralized for tuning). */
export const RULES = {
  dockRangeM: 2_500,
  /** Must exceed ARC_ARRIVAL_OFFSET_M so arcing to a terminus lands in range. */
  threadRangeM: 6_500,
  lootRangeM: 2_500,
  starterLumens: 50_000,
  stationRefineYield: 0.75,
  marketConfig: { brokerFeeRate: 0.01, salesTaxRate: 0.02 },
  /** Per-item survival probability when a ship is destroyed (doc 05 §9). */
  lootDropChance: 0.5,
  sessionTtlMs: 12 * 60 * 60 * 1000,
} as const;
