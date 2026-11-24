import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

/**
 * POST /api/slack/events - Slack Events API handler
 * 
 * Features:
 * - Signature verification (HMAC SHA256)
 * - URL verification challenge
 * - app_mention event handling
 * - Route questions to clones based on handle mentions
 * 
 * Environment variables:
 * - SLACK_SIGNING_SECRET: Required for signature verification
 * - SLACK_BOT_TOKEN: Required for posting responses
 */

interface SlackEvent {
  type: string;
  event?: {
    type: string;
    text: string;
    user: string;
    channel: string;
    ts: string;
  };
  challenge?: string;
}

function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  // Verify timestamp is within 5 minutes
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp);
  if (Math.abs(now - requestTime) > 300) {
    return false;
  }

  // Compute expected signature
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(baseString);
  const expected = `v0=${hmac.digest('hex')}`;

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

export async function POST(request: NextRequest) {
  // Check if Slack integration is enabled
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const botToken = process.env.SLACK_BOT_TOKEN;

  if (!signingSecret || !botToken) {
    return NextResponse.json(
      { error: 'Slack integration not configured. Set SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN.' },
      { status: 503 }
    );
  }

  try {
    // Get raw body for signature verification
    const body = await request.text();
    const timestamp = request.headers.get('x-slack-request-timestamp') || '';
    const signature = request.headers.get('x-slack-signature') || '';

    // Verify signature
    if (!verifySlackSignature(signingSecret, timestamp, body, signature)) {
      console.error('Slack signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse event
    const event: SlackEvent = JSON.parse(body);

    // Handle URL verification challenge
    if (event.type === 'url_verification' && event.challenge) {
      return NextResponse.json({ challenge: event.challenge });
    }

    // Handle app_mention events
    if (event.type === 'event_callback' && event.event?.type === 'app_mention') {
      const { text, user, channel, ts } = event.event;

      // Extract mentioned clone handle from message
      // Expected format: "@Bureau ask @JacksBot what's blocking you?"
      const handleMatch = text.match(/@(\w+)/g);
      if (!handleMatch || handleMatch.length < 2) {
        await postSlackMessage(botToken, channel, ts, 
          'Please mention a clone handle, e.g.: @Bureau ask @JacksBot what\'s blocking you?'
        );
        return NextResponse.json({ ok: true });
      }

      const cloneHandle = handleMatch[1].substring(1); // Remove @
      const questionText = text.replace(/@\w+/g, '').replace(/ask/i, '').trim();

      if (!questionText) {
        await postSlackMessage(botToken, channel, ts,
          'Please provide a question after the clone handle.'
        );
        return NextResponse.json({ ok: true });
      }

      // Find clone by handle or slack_handle
      const clones = await query<{
        id: string;
        workspace_id: string;
        display_name: string;
        handle: string;
      }>(
        `SELECT id, workspace_id, display_name, handle
         FROM bureau.digital_clones
         WHERE handle ILIKE $1 OR slack_handle ILIKE $1
         LIMIT 1`,
        [cloneHandle]
      );

      if (clones.length === 0) {
        await postSlackMessage(botToken, channel, ts,
          `Clone @${cloneHandle} not found. Check the handle and try again.`
        );
        return NextResponse.json({ ok: true });
      }

      const clone = clones[0];

      // Get latest heartbeat for deterministic answer
      const heartbeats = await query<{
        top_priority: string;
        blocked: string[];
        active: string[];
      }>(
        `SELECT top_priority, blocked, active
         FROM bureau.clone_heartbeats
         WHERE clone_id = $1
         ORDER BY date DESC
         LIMIT 1`,
        [clone.id]
      );

      let answer = '';
      if (heartbeats.length > 0) {
        const h = heartbeats[0];
        
        // Deterministic answer from heartbeat data
        if (questionText.toLowerCase().includes('blocking') || questionText.toLowerCase().includes('blocked')) {
          if (h.blocked && h.blocked.length > 0) {
            answer = `Currently blocked on: ${h.blocked.join(', ')}`;
          } else {
            answer = 'No blockers right now!';
          }
        } else if (questionText.toLowerCase().includes('working on') || questionText.toLowerCase().includes('priority')) {
          answer = `Top priority: ${h.top_priority}`;
          if (h.active && h.active.length > 0) {
            answer += `\nAlso active on: ${h.active.join(', ')}`;
          }
        } else {
          // General status
          answer = `Top priority: ${h.top_priority}`;
          if (h.blocked && h.blocked.length > 0) {
            answer += `\nBlocked on: ${h.blocked.join(', ')}`;
          }
        }
      } else {
        // No heartbeat data - create question for routing
        const result = await query<{ ask_question: string }>(
          `SELECT bureau.ask_question($1, NULL, NULL, $2, $3, NULL, 'slack', $4) as ask_question`,
          [clone.workspace_id, user, clone.id, questionText]
        );

        answer = `I've routed your question to ${clone.display_name}. They'll respond when they can.`;
      }

      // Post response
      await postSlackMessage(botToken, channel, ts, answer);

      return NextResponse.json({ ok: true });
    }

    // Unhandled event type
    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('Slack event handler error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function postSlackMessage(
  token: string,
  channel: string,
  threadTs: string,
  text: string
): Promise<void> {
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel,
        thread_ts: threadTs,
        text
      })
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('Slack API error:', data.error);
    }
  } catch (error) {
    console.error('Failed to post Slack message:', error);
  }
}
