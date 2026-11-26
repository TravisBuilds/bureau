import { NextRequest, NextResponse } from 'next/server';
import { handleWebhook } from '@/lib/ground-truth/ingest';
import { WEBHOOK_PROVIDERS, type Provider } from '@/lib/ground-truth/types';

/**
 * POST /api/webhooks/{github|vercel|linear|sentry}/{integrationId}
 * Public (vendors can't sign in); every delivery must carry a valid signature made with this
 * integration's secret. Unattributable or unconsented events are dropped, never stored.
 */
const MAX_BODY = 1_000_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADERS = ['x-hub-signature-256', 'x-github-event', 'x-github-delivery', 'x-vercel-signature', 'linear-signature', 'linear-delivery', 'linear-event', 'sentry-hook-signature', 'sentry-hook-resource', 'sentry-hook-timestamp', 'request-id'];

export async function POST(request: NextRequest, ctx: { params: Promise<{ provider: string; integrationId: string }> }) {
  const { provider, integrationId } = await ctx.params;
  if (!WEBHOOK_PROVIDERS.includes(provider as Provider) || !UUID_RE.test(integrationId)) {
    return NextResponse.json({ error: 'Unknown webhook' }, { status: 404 });
  }
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  const headers: Record<string, string | null> = {};
  for (const h of HEADERS) headers[h] = request.headers.get(h);
  try {
    const out = await handleWebhook(provider as Provider, integrationId, headers, raw);
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
    return NextResponse.json({ ok: true, ...out.summary });
  } catch (error) {
    console.error('Webhook processing failed:', provider, error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
