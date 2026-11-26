import { NextRequest, NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron-auth';
import { activityKeyConfigured } from '@/lib/activity-crypto';
import { runSync } from '@/lib/ground-truth/ingest';

/**
 * GET /api/cron/ground-truth-sync - pull Google Drive / ElevenLabs / Higgsfield for every active
 * integration. Called by Vercel Cron (vercel.json) with CRON_SECRET; fails closed without it.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!activityKeyConfigured()) return NextResponse.json({ error: 'Activity encryption key is not configured' }, { status: 503 });
  try {
    const results = await runSync(null);
    return NextResponse.json({
      integrations: results.length,
      ok: results.filter(r => r.ok).length,
      recorded: results.reduce((n, r) => n + r.summary.recorded, 0),
      results: results.map(r => ({ id: r.integration_id, provider: r.provider, ok: r.ok, error: r.error, ...r.summary })),
    });
  } catch (error) {
    console.error('Ground-truth sync failed:', error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
