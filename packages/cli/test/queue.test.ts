import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../src/queue.js';

describe('CommandQueue', () => {
  it('runs pushed tasks strictly in order, regardless of individual durations', async () => {
    const queue = new CommandQueue();
    const order: number[] = [];
    queue.push(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
    });
    queue.push(async () => {
      order.push(2);
    });
    queue.push(async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push(3);
    });
    await queue.drain();
    expect(order).toEqual([1, 2, 3]);
  });

  it('drain() waits for in-flight work — the exact bug this guards against', async () => {
    // Regression: readline's 'close' event can fire the instant piped/EOF
    // stdin is fully buffered, potentially before an in-flight async command
    // (e.g. "undock") has completed its network round trip. Calling
    // shutdown() immediately at that point used to cut the command off
    // mid-flight via process.exit(). drain() must not resolve until the
    // side effect below has actually happened.
    const queue = new CommandQueue();
    let sideEffectDone = false;
    queue.push(async () => {
      await new Promise((r) => setTimeout(r, 30));
      sideEffectDone = true;
    });
    await queue.drain();
    expect(sideEffectDone).toBe(true);
  });

  it('a task that throws does not stall or break subsequently pushed tasks', async () => {
    // main.ts's real usage always try/catches inside the pushed callback, so
    // push() itself is never expected to see a rejection — but the queue
    // must stay healthy even if a callback misbehaves.
    const queue = new CommandQueue();
    const order: string[] = [];
    queue.push(async () => {
      order.push('a');
      throw new Error('boom');
    });
    queue.push(async () => {
      order.push('b');
    });
    await queue.drain();
    expect(order).toEqual(['a', 'b']);
  });

  it('drain() on an empty queue resolves immediately', async () => {
    const queue = new CommandQueue();
    await expect(queue.drain()).resolves.toBeUndefined();
  });

  it('supports many rapid pushes without losing ordering (piped multi-line input)', async () => {
    const queue = new CommandQueue();
    const order: number[] = [];
    for (let i = 0; i < 50; i++) {
      queue.push(async () => {
        order.push(i);
      });
    }
    await queue.drain();
    expect(order).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });
});
