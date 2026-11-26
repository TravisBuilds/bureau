/**
 * Slack request signing (https://docs.slack.dev/authentication/verifying-requests-from-slack):
 *   basestring = "v0:" + X-Slack-Request-Timestamp + ":" + raw body
 *   signature  = "v0=" + hex(HMAC-SHA256(signing secret, basestring))
 * Requests older (or newer) than 5 minutes are rejected (replay window). Comparison is constant-time.
 */
import { createHmac, timingSafeEqual } from 'crypto';

export const REPLAY_WINDOW_SECONDS = 5 * 60;

export type VerifyResult = { ok: true } | { ok: false; reason: 'no_secret' | 'bad_timestamp' | 'stale' | 'bad_signature' };

export function computeSlackSignature(secret: string, timestamp: string, rawBody: string): string {
  return 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex');
}

export function verifySlackRequest(opts: {
  secret: string;
  rawBody: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  nowSeconds?: number;
}): VerifyResult {
  const secret = opts.secret || '';
  if (!secret) return { ok: false, reason: 'no_secret' };
  const ts = String(opts.timestamp || '');
  if (!/^\d{1,12}$/.test(ts)) return { ok: false, reason: 'bad_timestamp' };
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts, 10)) > REPLAY_WINDOW_SECONDS) return { ok: false, reason: 'stale' };
  const expected = Buffer.from(computeSlackSignature(secret, ts, opts.rawBody), 'utf8');
  const given = Buffer.from(String(opts.signature || ''), 'utf8');
  if (given.length !== expected.length) return { ok: false, reason: 'bad_signature' };
  return timingSafeEqual(given, expected) ? { ok: true } : { ok: false, reason: 'bad_signature' };
}
