/**
 * OAuth "state" for Add to Slack: binds the callback to the Bureau user + workspace that started
 * the install, expires after 10 minutes, and is tied to the browser by a nonce cookie (so a state
 * value lifted from one browser can't complete an install in another).
 *
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(key, payload)).
 * Key: HMAC of a fixed label under SLACK_CLIENT_SECRET (no extra env var). Fails closed without it.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const STATE_TTL_SECONDS = 10 * 60;
export const STATE_COOKIE = 'bureau_slack_oauth';

export interface StatePayload {
  w: string; // Bureau workspace id
  u: string; // Bureau user id
  n: string; // nonce (also in the httpOnly cookie)
  e: number; // expiry, unix seconds
}

const b64url = (b: Buffer) => b.toString('base64url');

function stateKey(secret: string): Buffer {
  if (!secret || secret.length < 16) throw new Error('Slack OAuth is not configured');
  return createHmac('sha256', secret).update('bureau-slack-oauth-state-v1').digest();
}

export function signState(secret: string, p: { workspaceId: string; userId: string; nonce?: string; nowSeconds?: number }): { state: string; nonce: string } {
  const nonce = p.nonce || b64url(randomBytes(18));
  const now = p.nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload: StatePayload = { w: p.workspaceId, u: p.userId, n: nonce, e: now + STATE_TTL_SECONDS };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const mac = b64url(createHmac('sha256', stateKey(secret)).update(body).digest());
  return { state: `${body}.${mac}`, nonce };
}

export type StateCheck =
  | { ok: true; payload: StatePayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'nonce_mismatch' | 'not_configured' };

export function verifyState(secret: string, state: string | null | undefined, cookieNonce: string | null | undefined, nowSeconds?: number): StateCheck {
  let key: Buffer;
  try { key = stateKey(secret); } catch { return { ok: false, reason: 'not_configured' }; }
  const s = String(state || '');
  const dot = s.indexOf('.');
  if (dot <= 0 || dot !== s.lastIndexOf('.') || s.length > 2000) return { ok: false, reason: 'malformed' };
  const body = s.slice(0, dot);
  const given = Buffer.from(s.slice(dot + 1), 'utf8');
  const expected = Buffer.from(b64url(createHmac('sha256', key).update(body).digest()), 'utf8');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad_signature' };
  let payload: StatePayload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'malformed' }; }
  if (!payload || typeof payload.w !== 'string' || typeof payload.u !== 'string' || typeof payload.n !== 'string' || typeof payload.e !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (now > payload.e) return { ok: false, reason: 'expired' };
  const c = Buffer.from(String(cookieNonce || ''), 'utf8');
  const n = Buffer.from(payload.n, 'utf8');
  if (c.length !== n.length || !timingSafeEqual(c, n)) return { ok: false, reason: 'nonce_mismatch' };
  return { ok: true, payload };
}
