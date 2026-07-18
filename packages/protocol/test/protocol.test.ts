import { describe, expect, it } from 'vitest';
import {
  encodeC2S,
  encodeS2C,
  parseC2S,
  parseS2C,
  PROTOCOL_VERSION,
  type C2S,
  type S2C,
} from '../src/index.js';

describe('C2S parsing at the trust boundary', () => {
  const valid = (msg: C2S, seq = 1): string => encodeC2S(msg, seq);

  it('round-trips every implemented message type', () => {
    const messages: C2S[] = [
      { t: 'HELLO', d: { proto: 1 } },
      { t: 'LOGIN', d: { token: 'x'.repeat(32) } },
      { t: 'DEV_LOGIN', d: { name: 'Wanderer' } },
      { t: 'ENTER_WORLD', d: {} },
      { t: 'MOVE', d: { kind: 'hold' } },
      { t: 'MOVE', d: { kind: 'moveTo', dest: { x: 1, y: 2, z: 3 } } },
      { t: 'MOVE', d: { kind: 'orbit', targetId: 'ent.1', rangeM: 5000 } },
      { t: 'MOVE', d: { kind: 'approach', targetId: 'ent.1' } },
      { t: 'ARC_TO', d: { dest: { x: 1e9, y: 0, z: 0 } } },
      { t: 'THREAD', d: { terminusId: 'term.weft.0001-0002.sys.0001' } },
      { t: 'DOCK', d: { stationId: 'sys.0001.station.1' } },
      { t: 'UNDOCK', d: {} },
      { t: 'LOCK', d: { targetId: 'ent.2' } },
      { t: 'UNLOCK', d: { targetId: 'ent.2' } },
      { t: 'ACTIVATE', d: { slot: 'hardpoint', index: 0, targetId: 'ent.2' } },
      { t: 'ACTIVATE', d: { slot: 'auxiliary', index: 1 } },
      { t: 'DEACTIVATE', d: { slot: 'hardpoint', index: 0 } },
      {
        t: 'FIT_SHIP',
        d: { loadout: { hullId: 'hull.verge', hardpoints: ['mod.arc-projector1-l'], auxiliary: [], core: [], weaves: [] } },
      },
      { t: 'MARKET_PLACE', d: { side: 'sell', typeId: 'ore.regolite', price: 10, qty: 100 } },
      { t: 'MARKET_CANCEL', d: { orderId: 'order.1' } },
      { t: 'MARKET_BOOK', d: { typeId: 'ore.regolite' } },
      { t: 'HANGAR_MOVE', d: { direction: 'toCargo', typeId: 'ammo.ferro-slug', qty: 500 } },
      { t: 'REFINE', d: { oreId: 'ore.regolite', units: 1000 } },
      { t: 'MANUFACTURE', d: { blueprintId: 'bp.ammo.ferro-slug', runs: 2 } },
      { t: 'JOB_COLLECT', d: { jobId: 'job.1' } },
      { t: 'CHAT_SEND', d: { channel: 'system', text: 'o7' } },
      { t: 'PING', d: { nonce: 42 } },
    ];
    for (const msg of messages) {
      const parsed = parseC2S(valid(msg, 7));
      expect(parsed.ok, `${msg.t} should parse`).toBe(true);
      if (parsed.ok) {
        expect(parsed.seq).toBe(7);
        expect(parsed.msg).toEqual(msg);
      }
    }
  });

  it('rejects unknown message types', () => {
    const parsed = parseC2S(JSON.stringify({ v: 1, seq: 1, t: 'GIVE_ME_LUMENS', d: {} }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/unknown message type/);
  });

  it('rejects unknown payload fields (strict schemas)', () => {
    const parsed = parseC2S(
      JSON.stringify({ v: 1, seq: 1, t: 'DOCK', d: { stationId: 's', adminOverride: true } }),
    );
    expect(parsed.ok).toBe(false);
  });

  it('rejects wrong protocol versions', () => {
    const parsed = parseC2S(JSON.stringify({ v: 99, seq: 1, t: 'PING', d: { nonce: 1 } }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/protocol version/);
  });

  it('rejects malformed JSON, missing seq, and oversized frames', () => {
    expect(parseC2S('{not json').ok).toBe(false);
    expect(parseC2S(JSON.stringify({ v: 1, t: 'PING', d: { nonce: 1 } })).ok).toBe(false);
    expect(parseC2S('x'.repeat(70 * 1024)).ok).toBe(false);
  });

  it('rejects out-of-range values (negative prices, huge orbits)', () => {
    expect(parseC2S(valid({ t: 'MARKET_PLACE', d: { side: 'buy', typeId: 'x', price: -5 as number, qty: 1 } })).ok).toBe(false);
    expect(parseC2S(valid({ t: 'MOVE', d: { kind: 'orbit', targetId: 'e', rangeM: 1e9 as number } })).ok).toBe(false);
    expect(parseC2S(valid({ t: 'MARKET_PLACE', d: { side: 'buy', typeId: 'x', price: 1.5 as number, qty: 1 } })).ok).toBe(false);
  });

  it('rejects non-finite coordinates', () => {
    const raw = JSON.stringify({ v: 1, seq: 1, t: 'ARC_TO', d: { dest: { x: null, y: 0, z: 0 } } });
    expect(parseC2S(raw).ok).toBe(false);
  });
});

describe('S2C encoding', () => {
  it('round-trips server messages with optional tick', () => {
    const msg: S2C = { t: 'WALLET', d: { balanceLM: 5000 } };
    const parsed = parseS2C(encodeS2C(msg, 123));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.msg).toEqual(msg);
      expect(parsed.tick).toBe(123);
    }
  });

  it('stamps the protocol version', () => {
    const raw = encodeS2C({ t: 'PONG', d: { nonce: 1 } });
    expect(JSON.parse(raw).v).toBe(PROTOCOL_VERSION);
  });
});
