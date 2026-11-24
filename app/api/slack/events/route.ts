import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { query, withUser } from '@/lib/db';

/**
 * Slack Events API webhook handler
 * Full implementation with security, deduplication, and deterministic answers
 */

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
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
  let eventId: string | null = null;
  
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
    eventId = payload.event_id;
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

    // 7. Resolve workspace from team_id using definer function
    if (!teamId) {
      console.error('No team_id in payload');
      return NextResponse.json({ ok: true });
    }

    const workspaceRows = await query<{ slack_resolve_team: string }>(
      'SELECT bureau.slack_resolve_team($1) as slack_resolve_team',
      [teamId]
    );

    if (workspaceRows.length === 0 || !workspaceRows[0].slack_resolve_team) {
      console.log(`No workspace found for team ${teamId}`);
      return NextResponse.json({ ok: true });
    }

    const workspaceId = workspaceRows[0].slack_resolve_team;

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

      // 9. Look up clone by handle in this workspace using definer function
      const cloneRows = await query<{ id: string; display_name: string; owner_user_id: string }>(
        `SELECT id, display_name, owner_user_id 
         FROM bureau.slack_find_clone($1, $2)`,
        [workspaceId, handle]
      );

      if (cloneRows.length === 0) {
        console.log(`Clone ${handle} not found in workspace ${workspaceId}`);
        return NextResponse.json({ ok: true });
      }

      const clone = cloneRows[0];

      // 10. Record question deterministically
      // Run with the clone owner's user context for RLS
      // FIX: Correct argument order for ask_question
      await withUser(clone.owner_user_id, '', async (client) => {
        await client.query(
          `SELECT bureau.ask_question($1, $2, NULL, $3, NULL, $4, $5, 'slack') as ask_question`,
          [
            workspaceId,       // p_workspace_id
            questionText,      // p_question_text
            `slack-${userId}`, // p_asker_name
            clone.id,          // p_target_clone_id (UUID, not string)
            ts                 // p_source_ref
          ]
        );
      });

      console.log(`Recorded Slack question for clone ${handle} in workspace ${workspaceId}`);

      // 11. Post deterministic answer from latest heartbeat
      if (SLACK_BOT_TOKEN) {
        try {
          // Get latest heartbeat
          const heartbeatRows = await query<{ content: any }>(
            `SELECT content FROM bureau.clone_heartbeats 
             WHERE clone_id = $1 
             ORDER BY date DESC 
             LIMIT 1`,
            [clone.id]
          );

          let answer = `I'm ${clone.display_name}. Ask me anything!`;
          if (heartbeatRows.length > 0 && heartbeatRows[0].content) {
            const hb = heartbeatRows[0].content;
            answer = `${hb.status || 'Working'} - ${hb.summary || 'Standing by'}`;
          }

          // Post threaded message via Slack API
          await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              channel: channel,
              thread_ts: ts,
              text: answer
            })
          });
        } catch (err) {
          console.error('Failed to post Slack answer:', err);
          // Don't fail the request if posting fails
        }
      }

      // Deterministic response
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Slack events error:', error);
    
    // If processing failed after event_id insert, delete it so retry can work
    if (eventId) {
      try {
        await query('DELETE FROM bureau.slack_event_ids WHERE event_id = $1', [eventId]);
      } catch (cleanupErr) {
        console.error('Failed to cleanup event_id:', cleanupErr);
      }
    }
    
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
