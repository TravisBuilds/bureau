import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { query, withUser } from '@/lib/db';

/**
 * Slack Events API webhook handler
 * Full implementation with security, deduplication, and deterministic answers
 */

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';
const FIVE_MINUTES = 5 * 60; // seconds

function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string
): boolean {
  if (!SLACK_SIGNING_SECRET) {
    console.error('SLACK_SIGNING_SECRET not configured');
    return false;
  }

  // Reject missing or non-numeric timestamp
  if (!timestamp || isNaN(parseInt(timestamp, 10))) {
    console.error('Missing or invalid timestamp');
    return false;
  }

  // Reject old timestamps (>5 minutes)
  const timestampNum = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampNum) > FIVE_MINUTES) {
    console.error('Timestamp too old or in future');
    return false;
  }

  const hmac = createHmac('sha256', SLACK_SIGNING_SECRET);
  const sigBasestring = `v0:${timestamp}:${body}`;
  hmac.update(sigBasestring);
  const mySignature = `v0=${hmac.digest('hex')}`;

  // Length mismatch check before timingSafeEqual (avoids RangeError)
  if (mySignature.length !== signature.length) {
    console.error('Signature length mismatch');
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(mySignature, 'utf8'),
      Buffer.from(signature, 'utf8')
    );
  } catch (e) {
    console.error('timingSafeEqual failed:', e);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Check for retry header - ignore with 200
    const retryNum = request.headers.get('x-slack-retry-num');
    if (retryNum && parseInt(retryNum, 10) > 0) {
      console.log(`Ignoring Slack retry #${retryNum}`);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // 2. Verify signature
    const body = await request.text();
    const timestamp = request.headers.get('x-slack-request-timestamp') || '';
    const signature = request.headers.get('x-slack-signature') || '';

    if (!verifySlackSignature(body, timestamp, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 3. Parse payload
    const payload = JSON.parse(body);

    // 4. Handle URL verification
    if (payload.type === 'url_verification') {
      return NextResponse.json({ challenge: payload.challenge });
    }

    // 5. Handle events
    if (payload.type !== 'event_callback') {
      return NextResponse.json({ ok: true });
    }

    const event = payload.event;
    const eventId = payload.event_id;
    const teamId = payload.team_id;

    // 6. Dedupe: INSERT ... ON CONFLICT DO NOTHING before any side effects
    if (eventId) {
      try {
        await query(
          'INSERT INTO bureau.slack_event_ids (event_id) VALUES ($1)',
          [eventId]
        );
      } catch (e: any) {
        // Duplicate key = already processed
        if (e.code === '23505') {
          console.log(`Duplicate event ${eventId}, ignoring`);
          return NextResponse.json({ ok: true }, { status: 200 });
        }
        throw e;
      }
    }

    // 7. Resolve workspace from team_id
    if (!teamId) {
      console.error('No team_id in payload');
      return NextResponse.json({ ok: true });
    }

    const workspaceRows = await query<{ workspace_id: string }>(
      'SELECT workspace_id FROM bureau.slack_installations WHERE team_id = $1',
      [teamId]
    );

    if (workspaceRows.length === 0) {
      console.log(`No workspace found for team ${teamId}`);
      return NextResponse.json({ ok: true });
    }

    const workspaceId = workspaceRows[0].workspace_id;

    // 8. Handle app_mention events
    if (event.type === 'app_mention') {
      const text = event.text || '';
      const userId = event.user;
      const channel = event.channel;
      const ts = event.ts;

      // Remove bot mention tags (<@BOTID>)
      const cleanText = text.replace(/<@[A-Z0-9]+>/g, '').trim();

      let handle: string | null = null;
      let questionText: string | null = null;

      // Parse '@Bureau ask <handle> <question>'
      const bureauAskMatch = cleanText.match(/^ask\s+(@?\w+)\s+(.+)$/i);
      if (bureauAskMatch) {
        handle = bureauAskMatch[1].replace('@', '');
        questionText = bureauAskMatch[2];
      } else {
        // Parse '@<handle> <question>' (direct mention)
        const directMatch = cleanText.match(/^@?(\w+)\s+(.+)$/);
        if (directMatch) {
          handle = directMatch[1];
          questionText = directMatch[2];
        }
      }

      if (!handle || !questionText) {
        console.log('Could not parse question format');
        return NextResponse.json({ ok: true });
      }

      // 9. Look up clone by handle in this workspace only
      const cloneRows = await query<{ id: string; display_name: string; owner_user_id: string }>(
        `SELECT id, display_name, owner_user_id 
         FROM bureau.digital_clones 
         WHERE workspace_id = $1 AND handle = $2
         LIMIT 1`,
        [workspaceId, handle]
      );

      if (cloneRows.length === 0) {
        console.log(`Clone ${handle} not found in workspace ${workspaceId}`);
        return NextResponse.json({ ok: true });
      }

      const clone = cloneRows[0];

      // 10. Record question deterministically (no LLM, no async processing)
      // Run with the clone owner's user context for RLS
      await withUser(clone.owner_user_id, '', async () => {
        await query(
          `SELECT bureau.ask_question($1, $2, NULL, $3, $4, $5, $6, 'slack') as ask_question`,
          [
            workspaceId,
            questionText,
            `slack-${userId}`,
            channel,
            clone.id,
            ts
          ]
        );
      });

      console.log(`Recorded Slack question for clone ${handle} in workspace ${workspaceId}`);

      // Deterministic response (no LLM call, no posting back to Slack in webhook)
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Slack events error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
