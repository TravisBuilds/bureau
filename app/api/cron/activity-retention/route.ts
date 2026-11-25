import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { query } from '@/lib/db';

/**
 * GET /api/cron/activity-retention - delete activity log entries past their 30-day expiry.
 * Called daily by Vercel Cron (vercel.json), which sends "Authorization: Bearer $CRON_SECRET".
 * Fails closed: without CRON_SECRET configured, nothing runs. Reads and the MCP tools already
 * ignore expired rows, so a missed run never exposes old entries.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  const header = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const ok = secret.length >= 16 && header.length === expected.length &&
    timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rows = await query<{ deleted: number }>(`SELECT bureau.purge_expired_activity() AS deleted`);
    return NextResponse.json({ deleted: rows[0]?.deleted ?? 0 });
  } catch (error) {
    console.error('Activity retention job failed:', error);
    return NextResponse.json({ error: 'Retention job failed' }, { status: 500 });
  }
}
