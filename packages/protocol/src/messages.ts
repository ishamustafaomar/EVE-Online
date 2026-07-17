/**
 * Protocol v1 message catalog (doc 10 §3). Clients send intents; the server
 * streams facts. Every request-like C2S message is answered with an ACK
 * carrying `seq`; world state flows as SNAPSHOT/DELTA/EVENT.
 */

import type { Vec3Json } from './validation.js';
import {
  vArray,
  vEnum,
  vInt,
  vNumber,
  vObject,
  vOptional,
  vString,
  vTagged,
  vVec3,
  type Check,
} from './validation.js';

export const PROTOCOL_VERSION = 1;

// ─── Shared views ───────────────────────────────────────────────────────────

export type EntityKind = 'ship' | 'wreck' | 'asteroid' | 'station' | 'terminus' | 'beacon';

export interface EntityView {
  readonly id: string;
  readonly kind: EntityKind;
  readonly name: string;
  readonly pos: Vec3Json;
  readonly vel: Vec3Json;
  /** Ships only. */
  readonly hullId?: string;
  readonly owner?: string;
  readonly shieldFrac?: number;
  readonly armorFrac?: number;
  readonly hullFrac?: number;
  readonly signature?: number;
  /** Asteroids only. */
  readonly oreId?: string;
  readonly unitsRemaining?: number;
}

export interface EntityDeltaView {
  readonly id: string;
  readonly pos?: Vec3Json;
  readonly vel?: Vec3Json;
  readonly shieldFrac?: number;
  readonly armorFrac?: number;
  readonly hullFrac?: number;
  readonly unitsRemaining?: number;
}

export interface BeaconView {
  readonly id: string;
  readonly kind: 'station' | 'belt' | 'terminus' | 'planet';
  readonly name: string;
  readonly pos: Vec3Json;
  /** Termini: destination system name. */
  readonly toSystemName?: string;
}

export interface OrderView {
  readonly id: string;
  readonly side: 'buy' | 'sell';
  readonly typeId: string;
  readonly price: number;
  readonly remaining: number;
  readonly stationId: string;
  readonly mine: boolean;
}

export interface ItemStackView {
  readonly typeId: string;
  readonly qty: number;
}

export interface JobView {
  readonly id: string;
  readonly blueprintId: string;
  readonly outputTypeId: string;
  readonly outputQty: number;
  readonly readyAtTick: number;
  readonly collected: boolean;
}

export interface FitLoadoutJson {
  readonly hullId: string;
  readonly hardpoints: readonly string[];
  readonly auxiliary: readonly string[];
  readonly core: readonly string[];
  readonly weaves: readonly string[];
}

export type SlotRow = 'hardpoint' | 'auxiliary' | 'core';

// ─── Client → Server ────────────────────────────────────────────────────────

export type C2S =
  | { t: 'HELLO'; d: { proto: number } }
  | { t: 'LOGIN'; d: { token: string } }
  | { t: 'ENTER_WORLD'; d: Record<string, never> }
  | { t: 'MOVE'; d: MoveOrderJson }
  | { t: 'ARC_TO'; d: { dest: Vec3Json } }
  | { t: 'THREAD'; d: { terminusId: string } }
  | { t: 'DOCK'; d: { stationId: string } }
  | { t: 'UNDOCK'; d: Record<string, never> }
  | { t: 'LOCK'; d: { targetId: string } }
  | { t: 'UNLOCK'; d: { targetId: string } }
  | { t: 'ACTIVATE'; d: { slot: SlotRow; index: number; targetId?: string } }
  | { t: 'DEACTIVATE'; d: { slot: SlotRow; index: number } }
  | { t: 'FIT_SHIP'; d: { loadout: FitLoadoutJson } }
  | { t: 'MARKET_PLACE'; d: { side: 'buy' | 'sell'; typeId: string; price: number; qty: number } }
  | { t: 'MARKET_CANCEL'; d: { orderId: string } }
  | { t: 'MARKET_BOOK'; d: { typeId: string } }
  | { t: 'HANGAR_MOVE'; d: { direction: 'toCargo' | 'toHangar'; typeId: string; qty: number } }
  | { t: 'REFINE'; d: { oreId: string; units: number } }
  | { t: 'MANUFACTURE'; d: { blueprintId: string; runs: number } }
  | { t: 'JOB_COLLECT'; d: { jobId: string } }
  | { t: 'LOOT'; d: { wreckId: string } }
  | { t: 'CHAT_SEND'; d: { channel: string; text: string } }
  | { t: 'PING'; d: { nonce: number } };

export type MoveOrderJson =
  | { kind: 'hold' }
  | { kind: 'moveTo'; dest: Vec3Json }
  | { kind: 'approach'; targetId: string }
  | { kind: 'orbit'; targetId: string; rangeM: number };

export type C2SType = C2S['t'];

export interface C2SEnvelope {
  readonly v: number;
  readonly seq: number;
  readonly t: C2SType;
  readonly d: unknown;
}

// ─── Server → Client ────────────────────────────────────────────────────────

export type GameEvent =
  | { kind: 'volley'; from: string; to: string; total: number; hit: boolean; destroyed: boolean }
  | { kind: 'destroyed'; entityId: string; wreckId?: string }
  | { kind: 'mined'; oreId: string; units: number }
  | { kind: 'cycleFailed'; slot: SlotRow; index: number; reason: string }
  | { kind: 'docked'; stationId: string }
  | { kind: 'undocked'; systemId: string }
  | { kind: 'arcStart'; etaTicks: number }
  | { kind: 'arcDone' }
  | { kind: 'arcBlocked'; reason: string }
  | { kind: 'threaded'; systemId: string; systemName: string }
  | { kind: 'lockAcquired'; targetId: string }
  | { kind: 'lockLost'; targetId: string; reason: string };

export type S2C =
  | { t: 'ACK'; d: { seq: number; ok: boolean; error?: string; data?: unknown } }
  | {
      t: 'WELCOME';
      d: {
        characterId: string;
        name: string;
        systemId: string;
        systemName: string;
        dockedAt: string | null;
        walletLM: number;
        skills: Record<string, number>;
        contentVersion: string;
        universeSeed: string;
      };
    }
  | {
      t: 'SNAPSHOT';
      d: {
        systemId: string;
        systemName: string;
        tick: number;
        selfId: string | null;
        entities: EntityView[];
        beacons: BeaconView[];
      };
    }
  | { t: 'DELTA'; d: { tick: number; updates: EntityDeltaView[]; removed: string[]; added: EntityView[] } }
  | { t: 'EVENT'; d: GameEvent }
  | { t: 'WALLET'; d: { balanceLM: number } }
  | { t: 'CARGO'; d: { items: ItemStackView[]; usedM3: number; capacityM3: number; oreHoldUsedM3: number; oreHoldCapacityM3: number } }
  | { t: 'HANGAR'; d: { stationId: string; items: ItemStackView[] } }
  | { t: 'ORDERS'; d: { typeId: string; buys: OrderView[]; sells: OrderView[] } }
  | { t: 'JOBS'; d: { jobs: JobView[] } }
  | { t: 'CHAT'; d: { channel: string; from: string; fromName: string; text: string } }
  | { t: 'PRESENCE'; d: { channel: string; members: Array<{ id: string; name: string }> } }
  | { t: 'PONG'; d: { nonce: number } };

export type S2CType = S2C['t'];

export interface S2CEnvelope {
  readonly v: number;
  readonly t: S2CType;
  readonly d: unknown;
  readonly tick?: number;
}

// ─── C2S validators ─────────────────────────────────────────────────────────

const idString = vString({ min: 1, max: 128 });

const vMoveOrder: Check<MoveOrderJson> = vTagged<MoveOrderJson>({
  hold: vObject({ kind: vEnum('hold') }),
  moveTo: vObject({ kind: vEnum('moveTo'), dest: vVec3 }),
  approach: vObject({ kind: vEnum('approach'), targetId: idString }),
  orbit: vObject({ kind: vEnum('orbit'), targetId: idString, rangeM: vNumber({ min: 100, max: 1e6 }) }),
});

const vLoadout: Check<FitLoadoutJson> = vObject({
  hullId: idString,
  hardpoints: vArray(idString, { max: 12 }),
  auxiliary: vArray(idString, { max: 12 }),
  core: vArray(idString, { max: 12 }),
  weaves: vArray(idString, { max: 6 }),
});

const vEmpty = vObject({});
const vSlotRow = vEnum('hardpoint', 'auxiliary', 'core');

/** Payload validators per C2S type. Every inbound message must pass its check. */
export const C2S_VALIDATORS: { [K in C2SType]: Check<Extract<C2S, { t: K }>['d']> } = {
  HELLO: vObject({ proto: vInt({ min: 1, max: 1000 }) }),
  LOGIN: vObject({ token: vString({ min: 16, max: 2048 }) }),
  ENTER_WORLD: vEmpty as Check<Record<string, never>>,
  MOVE: vMoveOrder,
  ARC_TO: vObject({ dest: vVec3 }),
  THREAD: vObject({ terminusId: idString }),
  DOCK: vObject({ stationId: idString }),
  UNDOCK: vEmpty as Check<Record<string, never>>,
  LOCK: vObject({ targetId: idString }),
  UNLOCK: vObject({ targetId: idString }),
  ACTIVATE: vObject({ slot: vSlotRow, index: vInt({ min: 0, max: 11 }), targetId: vOptional(idString) }),
  DEACTIVATE: vObject({ slot: vSlotRow, index: vInt({ min: 0, max: 11 }) }),
  FIT_SHIP: vObject({ loadout: vLoadout }),
  MARKET_PLACE: vObject({
    side: vEnum('buy', 'sell'),
    typeId: idString,
    price: vInt({ min: 1, max: 1e12 }),
    qty: vInt({ min: 1, max: 1e9 }),
  }),
  MARKET_CANCEL: vObject({ orderId: idString }),
  MARKET_BOOK: vObject({ typeId: idString }),
  HANGAR_MOVE: vObject({
    direction: vEnum('toCargo', 'toHangar'),
    typeId: idString,
    qty: vInt({ min: 1, max: 1e9 }),
  }),
  REFINE: vObject({ oreId: idString, units: vInt({ min: 1, max: 1e9 }) }),
  MANUFACTURE: vObject({ blueprintId: idString, runs: vInt({ min: 1, max: 1000 }) }),
  JOB_COLLECT: vObject({ jobId: idString }),
  LOOT: vObject({ wreckId: idString }),
  CHAT_SEND: vObject({ channel: vString({ min: 1, max: 128 }), text: vString({ min: 1, max: 2000 }) }),
  PING: vObject({ nonce: vInt({ min: 0, max: Number.MAX_SAFE_INTEGER }) }),
};

export const MAX_MESSAGE_BYTES = 64 * 1024;

export type ParseResult =
  | { readonly ok: true; readonly seq: number; readonly msg: C2S }
  | { readonly ok: false; readonly seq: number | null; readonly error: string };

/** Parse and validate a raw inbound frame (gateway trust boundary). */
export function parseC2S(raw: string): ParseResult {
  if (raw.length > MAX_MESSAGE_BYTES) return { ok: false, seq: null, error: 'message too large' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, seq: null, error: 'invalid JSON' };
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { ok: false, seq: null, error: 'envelope must be an object' };
  }
  const env = json as Record<string, unknown>;
  const seq = typeof env['seq'] === 'number' && Number.isInteger(env['seq']) && (env['seq'] as number) >= 0
    ? (env['seq'] as number)
    : null;
  if (env['v'] !== PROTOCOL_VERSION) return { ok: false, seq, error: 'unsupported protocol version' };
  if (seq === null) return { ok: false, seq: null, error: 'missing seq' };
  const t = env['t'];
  if (typeof t !== 'string' || !(t in C2S_VALIDATORS)) {
    return { ok: false, seq, error: `unknown message type ${String(t)}` };
  }
  const extra = Object.keys(env).filter((k) => !['v', 'seq', 't', 'd'].includes(k));
  if (extra.length > 0) return { ok: false, seq, error: `unknown envelope field ${extra[0]}` };
  try {
    const validator = C2S_VALIDATORS[t as C2SType] as Check<unknown>;
    const d = validator(env['d'], 'd');
    return { ok: true, seq, msg: { t, d } as C2S };
  } catch (err) {
    return { ok: false, seq, error: err instanceof Error ? err.message : 'validation failed' };
  }
}

/** Serialize a server→client message. */
export function encodeS2C(msg: S2C, tick?: number): string {
  return JSON.stringify(tick === undefined ? { v: PROTOCOL_VERSION, ...msg } : { v: PROTOCOL_VERSION, tick, ...msg });
}

/** Parse a server frame on the client (lenient on payload, strict on shape). */
export function parseS2C(raw: string): { ok: true; msg: S2C; tick?: number } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid JSON' };
  }
  if (typeof json !== 'object' || json === null) return { ok: false, error: 'not an object' };
  const env = json as Record<string, unknown>;
  if (env['v'] !== PROTOCOL_VERSION) return { ok: false, error: 'unsupported protocol version' };
  if (typeof env['t'] !== 'string') return { ok: false, error: 'missing type' };
  const result: { ok: true; msg: S2C; tick?: number } = {
    ok: true,
    msg: { t: env['t'], d: env['d'] } as S2C,
  };
  if (typeof env['tick'] === 'number') result.tick = env['tick'];
  return result;
}

/** Serialize a client→server message. */
export function encodeC2S(msg: C2S, seq: number): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, seq, ...msg });
}
