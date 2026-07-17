/** @starweft/server — authoritative server foundation. */

export { GameServer, type DevAccount } from './game.js';
export { DEFAULT_CONFIG, RULES, type GameServerConfig } from './config.js';
export { issueSessionToken, verifySessionToken, type SessionClaims } from './auth.js';
export { SessionRateLimiter, TokenBucket } from './ratelimit.js';
export {
  JsonFileSnapshotStore,
  MemorySnapshotStore,
  captureWorld,
  restoreWorld,
  type SnapshotStore,
  type WorldSave,
} from './persistence/snapshot.js';
export { World } from './world/world.js';
export { SystemCell } from './world/cell.js';
export { MarketService, NPC_VENDOR } from './services/market.js';
export { ShipLocations } from './world/state.js';
export type { CharacterState, ShipEntity } from './world/state.js';
