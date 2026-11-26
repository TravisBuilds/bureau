import { timingSafeEqual } from 'crypto';

/** Vercel Cron sends "Authorization: Bearer $CRON_SECRET". Fails closed without a 16+ char secret. */
export function cronAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET || '';
  const h = header || '';
  const expected = `Bearer ${secret}`;
  return secret.length >= 16 && h.length === expected.length && timingSafeEqual(Buffer.from(h), Buffer.from(expected));
}
