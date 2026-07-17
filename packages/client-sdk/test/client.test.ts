/**
 * SDK unit tests. The full command surface is exercised end-to-end by the
 * server integration suite (@starweft/server test/integration.test.ts);
 * these cover the SDK's own contract edges.
 */

import { describe, expect, it } from 'vitest';
import { CommandError, StarweftClient } from '../src/index.js';

describe('StarweftClient', () => {
  it('rejects commands before a connection exists', async () => {
    const client = new StarweftClient();
    await expect(client.enterWorld()).rejects.toThrow(CommandError);
    await expect(client.move({ kind: 'hold' })).rejects.toThrow(/not connected/);
  });

  it('starts with an empty, well-formed state', () => {
    const client = new StarweftClient();
    expect(client.state.characterId).toBeNull();
    expect(client.state.entities.size).toBe(0);
    expect(client.state.walletLM).toBe(0);
    expect(client.state.presence).toEqual([]);
    expect(client.events()).toEqual([]);
  });

  it('waitFor times out with a labeled error', async () => {
    const client = new StarweftClient();
    await expect(client.waitFor(() => false, 50, 'the impossible')).rejects.toThrow(
      /timeout waiting for the impossible/,
    );
  });

  it('waitFor resolves once the predicate holds', async () => {
    const client = new StarweftClient();
    let flag = false;
    setTimeout(() => {
      flag = true;
    }, 30);
    await client.waitFor(() => flag, 1000, 'flag');
    expect(flag).toBe(true);
  });

  it('connect rejects against a dead endpoint', async () => {
    const client = new StarweftClient();
    await expect(client.connect('ws://127.0.0.1:1')).rejects.toThrow();
  });
});
