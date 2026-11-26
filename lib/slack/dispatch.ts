/**
 * Shared post-ack pipeline for mentions, DMs and /bureau:
 * installation -> bot token -> requester (Slack user -> Bureau member) -> command -> reply.
 */
import { getInstallation, botToken, resolveRequester, markUninstalled, type Installation } from './store';
import { parseCommand, cleanSlackText } from './commands';
import { commandText, type EventRoute } from './events';
import { executeCommand, helpReply, notLinkedReply, notInstalledReply, type Surface } from './handler';
import { slackApi, postToResponseUrl } from './api';
import { reply, section, type SlackReply } from './blocks';

const errorReply = () => reply('Something went wrong on the Bureau side. Please try again.', [section('Something went wrong on the Bureau side. Please try again in a minute.')], true);

export async function buildReply(inst: Installation, token: string, opts: {
  slackUserId: string; text: string; surface: Surface; conversationRef: string;
}): Promise<{ reply: SlackReply; logged?: string }> {
  const parsed = parseCommand(opts.text);
  if (parsed.kind === 'help') return { reply: helpReply(opts.surface !== 'dm') };
  const req = await resolveRequester(inst.teamId, opts.slackUserId, token);
  if (!req || req.workspaceId !== inst.workspaceId) return { reply: notLinkedReply() };
  const out = await executeCommand(req, {
    teamId: inst.teamId, slackUserId: opts.slackUserId, surface: opts.surface,
    rawText: opts.text, conversationRef: opts.conversationRef,
  }, parsed);
  return out;
}

async function postEventReply(token: string, ev: Extract<EventRoute, { action: 'command' }>, r: SlackReply): Promise<void> {
  const thread = ev.surface === 'mention' ? (ev.threadTs || ev.ts) : ev.threadTs;
  if (r.ephemeral && ev.surface === 'mention') {
    await slackApi('chat.postEphemeral', { token, json: { channel: ev.channel, user: ev.user, text: r.text, blocks: r.blocks, ...(thread ? { thread_ts: thread } : {}) } });
    return;
  }
  await slackApi('chat.postMessage', { token, json: { channel: ev.channel, text: r.text, blocks: r.blocks, unfurl_links: false, ...(thread ? { thread_ts: thread } : {}) } });
}

/** Events API work after the 200 ack. */
export async function processEvent(ev: Exclude<EventRoute, { action: 'url_verification' } | { action: 'ignore' }>): Promise<void> {
  const inst = await getInstallation(ev.teamId);
  if (!inst) return;

  if (ev.action === 'uninstalled') {
    await markUninstalled(ev.teamId, 'uninstalled');
    return;
  }
  if (ev.action === 'tokens_revoked') {
    if (inst.botUserId && ev.botUserIds.includes(inst.botUserId)) await markUninstalled(ev.teamId, 'revoked');
    return;
  }

  const token = botToken(inst);
  if (!token) return; // not active, or the token can't be decrypted: stay silent
  if (inst.botUserId && ev.user === inst.botUserId) return;

  const text = ev.surface === 'mention' ? commandText(ev.text, inst.botUserId) : cleanSlackText(ev.text, inst.botUserId);
  let r: SlackReply;
  try {
    r = (await buildReply(inst, token, {
      slackUserId: ev.user, text, surface: ev.surface,
      conversationRef: `slack:${ev.teamId}:${ev.channel}:${ev.ts}`,
    })).reply;
  } catch (err) {
    console.error('[slack] command failed:', err instanceof Error ? err.message : 'error');
    r = errorReply();
  }
  await postEventReply(token, ev, r);
}

/** Slash command work after the ack: reply through Slack's response_url. */
export async function processSlash(p: { teamId: string; userId: string; channelId: string; text: string; responseUrl: string; triggerId: string }): Promise<void> {
  const inst = await getInstallation(p.teamId);
  const token = botToken(inst);
  let r: SlackReply;
  if (!inst || !token) {
    r = notInstalledReply();
  } else {
    try {
      r = (await buildReply(inst, token, {
        slackUserId: p.userId, text: cleanSlackText(p.text), surface: 'slash',
        conversationRef: `slack:${p.teamId}:${p.channelId}:slash:${p.triggerId.slice(0, 60)}`,
      })).reply;
    } catch (err) {
      console.error('[slack] slash command failed:', err instanceof Error ? err.message : 'error');
      r = errorReply();
    }
  }
  await postToResponseUrl(p.responseUrl, { response_type: 'ephemeral', replace_original: true, text: r.text, blocks: r.blocks });
}
