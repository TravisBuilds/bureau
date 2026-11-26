import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifySlackRequest } from '@/lib/slack/verify';
import { slackSigningSecret } from '@/lib/slack/config';
import { routeEvent } from '@/lib/slack/events';
import { processEvent } from '@/lib/slack/dispatch';
import { runInBackground } from '@/lib/slack/background';

/**
 * Slack Events API (https://docs.slack.dev/apis/events-api/).
 *
 * 1. Verify the signing secret (HMAC-SHA256, 5-minute replay window, constant-time compare).
 * 2. Answer url_verification.
 * 3. Dedupe on event_id (INSERT before any side effect). Slack retries (x-slack-retry-num) are
 *    processed like any delivery; the event_id table makes them idempotent.
 * 4. Ack 200 right away; the real work (lookups, Bureau data, chat.postMessage) runs after the
 *    response via next/server after(), well inside Slack's 3-second window.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const check = verifySlackRequest({
    secret: slackSigningSecret(),
    rawBody,
    timestamp: request.headers.get('x-slack-request-timestamp'),
    signature: request.headers.get('x-slack-signature'),
  });
  if (!check.ok) {
    if (check.reason === 'no_secret') console.error('[slack] SLACK_SIGNING_SECRET is not configured');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const route = routeEvent(payload);
  if (route.action === 'url_verification') return NextResponse.json({ challenge: route.challenge });
  if (route.action === 'ignore') return NextResponse.json({ ok: true });

  if (route.eventId) {
    try {
      const rows = await query<{ event_id: string }>(
        'INSERT INTO bureau.slack_event_ids (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
        [route.eventId]
      );
      if (rows.length === 0) return NextResponse.json({ ok: true, duplicate: true });
    } catch (err) {
      console.error('[slack] event dedupe failed:', err instanceof Error ? err.message : 'error');
      // Non-2xx lets Slack retry this delivery later.
      return NextResponse.json({ error: 'Temporarily unavailable' }, { status: 503 });
    }
  }

  runInBackground(() => processEvent(route));
  return NextResponse.json({ ok: true });
}
