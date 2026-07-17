/**
 * Session tokens (doc 12 §3): HMAC-SHA256-signed, expiring, verified
 * statelessly by the gateway. Identity issues them; nothing else can mint a
 * valid token without the secret.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SessionClaims {
  readonly accountId: string;
  readonly characterId: string;
  readonly expiresAtMs: number;
}

function b64url(data: string | Buffer): string {
  return Buffer.from(data).toString('base64url');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueSessionToken(claims: SessionClaims, secret: string): string {
  const payload = b64url(JSON.stringify(claims));
  return `${payload}.${sign(payload, secret)}`;
}

export type VerifyResult =
  | { readonly ok: true; readonly claims: SessionClaims }
  | { readonly ok: false; readonly error: 'malformed' | 'bad-signature' | 'expired' };

export function verifySessionToken(token: string, secret: string, nowMs: number): VerifyResult {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return { ok: false, error: 'malformed' };
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(payload, secret);
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expected);
  if (macBuf.length !== expectedBuf.length || !timingSafeEqual(macBuf, expectedBuf)) {
    return { ok: false, error: 'bad-signature' };
  }
  let claims: SessionClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims;
  } catch {
    return { ok: false, error: 'malformed' };
  }
  if (
    typeof claims.accountId !== 'string' ||
    typeof claims.characterId !== 'string' ||
    typeof claims.expiresAtMs !== 'number'
  ) {
    return { ok: false, error: 'malformed' };
  }
  if (claims.expiresAtMs < nowMs) return { ok: false, error: 'expired' };
  return { ok: true, claims };
}
