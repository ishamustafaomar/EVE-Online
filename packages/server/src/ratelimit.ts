/**
 * Token-bucket rate limiting per message class (doc 12 §3). Movement intents
 * get a generous budget; market and chat are tighter. Violations produce
 * typed errors first, disconnection on sustained abuse (gateway policy).
 */

import type { C2SType } from '@starweft/protocol';

export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    nowMs: number,
  ) {
    this.tokens = capacity;
    this.lastRefillMs = nowMs;
  }

  tryTake(nowMs: number): boolean {
    const elapsed = (nowMs - this.lastRefillMs) / 1000;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
      this.lastRefillMs = nowMs;
    }
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export type MessageClass = 'movement' | 'combat' | 'economy' | 'social' | 'meta';

const CLASS_OF: Record<C2SType, MessageClass> = {
  HELLO: 'meta',
  LOGIN: 'meta',
  DEV_LOGIN: 'meta',
  ENTER_WORLD: 'meta',
  PING: 'meta',
  MOVE: 'movement',
  ARC_TO: 'movement',
  THREAD: 'movement',
  DOCK: 'movement',
  UNDOCK: 'movement',
  LOCK: 'combat',
  UNLOCK: 'combat',
  ACTIVATE: 'combat',
  DEACTIVATE: 'combat',
  LOOT: 'combat',
  FIT_SHIP: 'economy',
  MARKET_PLACE: 'economy',
  MARKET_CANCEL: 'economy',
  MARKET_BOOK: 'economy',
  HANGAR_MOVE: 'economy',
  REFINE: 'economy',
  MANUFACTURE: 'economy',
  JOB_COLLECT: 'economy',
  CHAT_SEND: 'social',
};

const BUDGETS: Record<MessageClass, { capacity: number; refillPerSec: number }> = {
  movement: { capacity: 20, refillPerSec: 10 },
  combat: { capacity: 20, refillPerSec: 8 },
  economy: { capacity: 10, refillPerSec: 3 },
  social: { capacity: 5, refillPerSec: 1 },
  meta: { capacity: 10, refillPerSec: 2 },
};

export class SessionRateLimiter {
  private readonly buckets = new Map<MessageClass, TokenBucket>();
  private violations = 0;

  constructor(private readonly nowMs: () => number) {}

  /** Returns 'ok', 'limited' (typed error), or 'disconnect' (sustained abuse). */
  check(type: C2SType): 'ok' | 'limited' | 'disconnect' {
    const cls = CLASS_OF[type];
    let bucket = this.buckets.get(cls);
    if (!bucket) {
      const budget = BUDGETS[cls];
      bucket = new TokenBucket(budget.capacity, budget.refillPerSec, this.nowMs());
      this.buckets.set(cls, bucket);
    }
    if (bucket.tryTake(this.nowMs())) return 'ok';
    this.violations++;
    return this.violations > 50 ? 'disconnect' : 'limited';
  }
}
