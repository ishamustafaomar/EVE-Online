import { describe, expect, it } from 'vitest';
import { SessionRateLimiter, TokenBucket } from '../src/ratelimit.js';

describe('token bucket', () => {
  it('allows bursts up to capacity then refuses', () => {
    let now = 0;
    const bucket = new TokenBucket(5, 1, now);
    for (let i = 0; i < 5; i++) expect(bucket.tryTake(now)).toBe(true);
    expect(bucket.tryTake(now)).toBe(false);
  });

  it('refills over time', () => {
    let now = 0;
    const bucket = new TokenBucket(5, 2, now);
    for (let i = 0; i < 5; i++) bucket.tryTake(now);
    expect(bucket.tryTake(now)).toBe(false);
    now += 1000; // +2 tokens
    expect(bucket.tryTake(now)).toBe(true);
    expect(bucket.tryTake(now)).toBe(true);
    expect(bucket.tryTake(now)).toBe(false);
  });

  it('never exceeds capacity after a long idle', () => {
    let now = 0;
    const bucket = new TokenBucket(3, 10, now);
    now += 100_000;
    expect(bucket.tryTake(now)).toBe(true);
    expect(bucket.tryTake(now)).toBe(true);
    expect(bucket.tryTake(now)).toBe(true);
    expect(bucket.tryTake(now)).toBe(false);
  });
});

describe('session rate limiter', () => {
  it('limits chat quickly but leaves movement budget intact', () => {
    let now = 0;
    const limiter = new SessionRateLimiter(() => now);
    let chatLimited = 0;
    for (let i = 0; i < 10; i++) {
      if (limiter.check('CHAT_SEND') === 'limited') chatLimited++;
    }
    expect(chatLimited).toBeGreaterThan(0);
    expect(limiter.check('MOVE')).toBe('ok');
  });

  it('escalates to disconnect on sustained abuse', () => {
    let now = 0;
    const limiter = new SessionRateLimiter(() => now);
    let verdict: string = 'ok';
    for (let i = 0; i < 200; i++) verdict = limiter.check('CHAT_SEND');
    expect(verdict).toBe('disconnect');
  });
});
