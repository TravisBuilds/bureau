/**
 * Webhook signature verification (constant-time). Each scheme follows the vendor's docs:
 *  - GitHub:  X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(secret, raw body) hex
 *             https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 *  - Vercel:  x-vercel-signature  = HMAC-SHA1(secret, raw body) hex
 *             https://vercel.com/docs/webhooks/webhooks-api (Securing webhooks)
 *  - Linear:  Linear-Signature    = HMAC-SHA256(secret, raw body) hex; body.webhookTimestamp within 60 s
 *             https://linear.app/developers/webhooks (Securing Webhooks)
 *  - Sentry:  Sentry-Hook-Signature = HMAC-SHA256(client secret, raw body) hex
 *             https://docs.sentry.io/organization/integrations/integration-platform/webhooks/
 */
import { createHmac, timingSafeEqual } from 'crypto';

const hmacHex = (alg: 'sha256' | 'sha1', secret: string, body: string | Buffer) =>
  createHmac(alg, secret).update(body).digest('hex');

export function safeEqualHex(expectedHex: string, given: string | null | undefined): boolean {
  if (typeof given !== 'string' || !/^[0-9a-f]+$/i.test(given)) return false;
  const a = Buffer.from(expectedHex.toLowerCase(), 'utf8');
  const b = Buffer.from(given.toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyGithub(secret: string, body: string, header: string | null): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  return safeEqualHex(hmacHex('sha256', secret, body), header.slice(7));
}

export const verifyVercel = (secret: string, body: string, header: string | null) =>
  safeEqualHex(hmacHex('sha1', secret, body), header);

export const verifyLinear = (secret: string, body: string, header: string | null) =>
  safeEqualHex(hmacHex('sha256', secret, body), header);

export const verifySentry = (secret: string, body: string, header: string | null) =>
  safeEqualHex(hmacHex('sha256', secret, body), header);

/** Linear recommends rejecting deliveries whose webhookTimestamp (ms) is more than 60 s off. */
export const LINEAR_MAX_SKEW_MS = 60_000;
