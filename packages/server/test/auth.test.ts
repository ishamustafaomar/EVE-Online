import { describe, expect, it } from 'vitest';
import { issueSessionToken, verifySessionToken } from '../src/auth.js';

const SECRET = 'test-secret';
const NOW = 1_700_000_000_000;

describe('session tokens', () => {
  const claims = { accountId: 'acct.1', characterId: 'char.1', expiresAtMs: NOW + 60_000 };

  it('round-trips valid tokens', () => {
    const token = issueSessionToken(claims, SECRET);
    const verdict = verifySessionToken(token, SECRET, NOW);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.claims).toEqual(claims);
  });

  it('rejects expired tokens', () => {
    const token = issueSessionToken(claims, SECRET);
    const verdict = verifySessionToken(token, SECRET, claims.expiresAtMs + 1);
    expect(verdict).toEqual({ ok: false, error: 'expired' });
  });

  it('rejects tampered payloads', () => {
    const token = issueSessionToken(claims, SECRET);
    const [payload, mac] = token.split('.') as [string, string];
    const forged = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as typeof claims;
    forged.characterId = 'char.999';
    const tampered = `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${mac}`;
    expect(verifySessionToken(tampered, SECRET, NOW).ok).toBe(false);
  });

  it('rejects tokens signed with a different secret', () => {
    const token = issueSessionToken(claims, 'other-secret');
    expect(verifySessionToken(token, SECRET, NOW)).toEqual({ ok: false, error: 'bad-signature' });
  });

  it('rejects garbage', () => {
    expect(verifySessionToken('nonsense', SECRET, NOW).ok).toBe(false);
    expect(verifySessionToken('a.b', SECRET, NOW).ok).toBe(false);
    expect(verifySessionToken('', SECRET, NOW).ok).toBe(false);
  });
});
