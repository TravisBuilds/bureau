import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest } from '@/lib/slack/verify';
import { slackSigningSecret } from '@/lib/slack/config';
import { isSlackResponseUrl } from '@/lib/slack/api';
import { cleanSlackText, parseCommand } from '@/lib/slack/commands';
import { helpReply } from '@/lib/slack/handler';
import { processSlash } from '@/lib/slack/dispatch';
import { runInBackground } from '@/lib/slack/background';

/**
 * /bureau slash command. Payload is application/x-www-form-urlencoded and signed like events.
 * We ack within 3 seconds with an ephemeral "Looking that up..." and post the real answer to the
 * command's response_url (only https://hooks.slack.com is accepted) after the response.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const check = verifySlackRequest({
    secret: slackSigningSecret(),
    rawBody,
    timestamp: request.headers.get('x-slack-request-timestamp'),
    signature: request.headers.get('x-slack-signature'),
  });
  if (!check.ok) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  const form = new URLSearchParams(rawBody);
  if (form.get('ssl_check') === '1') return new NextResponse(null, { status: 200 });

  const teamId = form.get('team_id') || '';
  const userId = form.get('user_id') || '';
  const channelId = form.get('channel_id') || '';
  const text = (form.get('text') || '').slice(0, 4000);
  const responseUrl = form.get('response_url') || '';
  const triggerId = form.get('trigger_id') || '';
  if (!/^[TE][A-Z0-9]+$/.test(teamId) || !/^[UW][A-Z0-9]+$/.test(userId)) {
    return NextResponse.json({ response_type: 'ephemeral', text: 'Bureau could not read this command.' });
  }

  if (parseCommand(cleanSlackText(text)).kind === 'help') {
    const r = helpReply(true);
    return NextResponse.json({ response_type: 'ephemeral', text: r.text, blocks: r.blocks });
  }
  if (!isSlackResponseUrl(responseUrl)) {
    return NextResponse.json({ response_type: 'ephemeral', text: 'Bureau could not read this command.' });
  }

  runInBackground(() => processSlash({ teamId, userId, channelId, text, responseUrl, triggerId }));
  return NextResponse.json({ response_type: 'ephemeral', text: 'Looking that up in Bureau\u2026' });
}
