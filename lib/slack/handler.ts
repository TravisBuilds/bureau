/**
 * Execute a parsed Slack command for a linked Bureau member and build the reply. Everything is
 * read under withUser(requester) so the requester's RLS view applies, and every answer is built
 * from Bureau data (check-ins, questions, work units). No LLM is called.
 *
 * The request is then logged as the requester's activity (source 'slack') under the existing
 * consent rules: only when they have accepted the current notice; scrubbed and encrypted.
 */
import { withUser } from '../db';
import { lookupClone, formatCandidates, type CloneLookupResult, type LookupResponse } from '../clone-lookup';
import { latestCheckin, type LatestCheckin } from '../clone-status';
import { canReadTeam, canReadActivity } from '../oauth-scopes';
import { logActivity } from '../activity-log';
import { activityKeyConfigured } from '../activity-crypto';
import { teamBoard, buildDigest, type WorkUnit } from '../ground-truth/work-events';
import { HELP_LINES, mentionedUserId, type SlackCommand } from './commands';
import { memberForSlackUser, type Requester } from './store';
import { appUrl } from './config';
import { reply, section, context, openInBureau, esc, clip, type SlackReply } from './blocks';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pg PoolClient-compatible
type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

export type Surface = 'mention' | 'dm' | 'slash';

export interface CommandContext {
  teamId: string;
  slackUserId: string;
  slackUserName?: string | null;
  surface: Surface;
  rawText: string;           // what the person typed (logged, scrubbed + encrypted)
  conversationRef: string;   // slack:<team>:<channel>:<ts>
}

export interface CommandOutcome { reply: SlackReply; logged: 'logged' | 'consent_required' | 'skipped' | 'not_configured' }

const PRIVATE_IN_CHANNEL = new Set<SlackCommand['kind']>(['questions', 'answer', 'board', 'digest', 'usage', 'unknown']);

export function helpReply(ephemeral = true): SlackReply {
  return reply('Bureau commands: status, ask, questions, answer, board, digest', [
    section('*Bureau* answers from your team\'s Bureau data (check-ins, questions and work). Try:'),
    section(HELP_LINES.map(l => `\u2022 ${l}`).join('\n')),
    context('Use `@Bureau <command>` in a channel, DM me, or type `/bureau <command>`. Who can be a name, handle, email or @mention.'),
  ], ephemeral);
}

export function notLinkedReply(): SlackReply {
  return reply("I don't know who you are in Bureau yet.", [
    section("I don't know who you are in Bureau yet, so I can't answer. Sign in to Bureau with the same email address as your Slack account, or ask a Bureau owner to link you under *Settings \u2192 Team \u2192 Slack*."),
    openInBureau('/settings/team', 'Open Bureau'),
  ], true);
}

export function notInstalledReply(): SlackReply {
  return reply('Bureau is not connected to this Slack workspace.', [
    section('Bureau is not connected to this Slack workspace (or it was disconnected). A Bureau owner can reconnect it under *Settings \u2192 Team \u2192 Slack*.'),
  ], true);
}

const daysOld = (c: LatestCheckin) => (c.days_old > 1 ? ` (${c.days_old} days old)` : c.days_old === 1 ? ' (yesterday)' : '');
const list = (xs: string[] | null | undefined, n = 3) => (xs && xs.length ? xs.slice(0, n).map(x => esc(clip(x, 140))).join('; ') + (xs.length > n ? ` (+${xs.length - n} more)` : '') : '');

function checkinLines(c: LatestCheckin | null): string {
  if (!c) return '_No check-in yet._';
  const out = [`*Top priority:* ${c.top_priority ? esc(clip(c.top_priority, 300)) : 'n/a'}`];
  if (c.active?.length) out.push(`*Active:* ${list(c.active)}`);
  if (c.blocked?.length) out.push(`*Blocked:* ${list(c.blocked)}`);
  if (c.shipped_since_last?.length) out.push(`*Shipped:* ${list(c.shipped_since_last)}`);
  if (c.out_of_office) out.push('*Out of office*');
  out.push(`_Check-in from ${c.date}${daysOld(c)}_`);
  return out.join('\n');
}

const who = (c: CloneLookupResult) => `*${esc(c.display_name)}* (@${esc(c.handle)})`;

function notFound(whoText: string, m: Exclude<LookupResponse, { status: 'found' }>): SlackReply {
  if (m.status === 'ambiguous') {
    return reply(`"${clip(whoText, 60)}" matches more than one person`, [
      section(`"${esc(clip(whoText, 60))}" matches more than one person: ${esc(formatCandidates(m.candidates))}. Try their handle.`),
    ], true);
  }
  return reply(`No one called "${clip(whoText, 60)}" in Bureau`, [
    section(`I couldn't find anyone called "${esc(clip(whoText, 60))}" in this Bureau workspace. Try their handle or email, or \`status\` to see everyone.`),
  ], true);
}

/** Resolve "who": a Slack @mention (via the Slack link) or a name/handle/email. */
async function resolveWho(client: Client, req: Requester, teamId: string, whoText: string): Promise<LookupResponse> {
  const slackId = mentionedUserId(whoText);
  if (slackId) {
    const m = await memberForSlackUser(teamId, slackId);
    if (!m || m.workspaceId !== req.workspaceId) return { status: 'not_found', query: whoText };
    return lookupClone(client, req.workspaceId, m.email);
  }
  return lookupClone(client, req.workspaceId, whoText.replace(/^@/, ''));
}

const denied = (what: string) => reply(`${what} is only for Bureau owners and admins.`, [section(`${esc(what)} is only for Bureau owners and admins.`)], true);

function unitLine(u: WorkUnit): string {
  const person = (u.email || 'someone').split('@')[0];
  const title = u.hidden ? '(personal)' : esc(clip(u.title || u.task_type || 'work', 120));
  const link = u.artifact_link && /^https:\/\//.test(u.artifact_link) && !u.hidden ? ` <${u.artifact_link.replace(/[<>|]/g, '')}|link>` : '';
  return `\u2022 ${esc(person)}: ${title} _(${esc(u.project)})_${link}${u.blocker ? ` \u2014 blocked: ${esc(clip(u.blocker, 100))}` : ''}`;
}

async function run(client: Client, req: Requester, ctx: CommandContext, cmd: SlackCommand): Promise<{ reply: SlackReply; detail: string | null }> {
  switch (cmd.kind) {
    case 'help':
      return { reply: helpReply(ctx.surface !== 'dm'), detail: null };
    case 'usage':
      return {
        reply: reply(`Usage: ${cmd.command}`, [section(cmd.command === 'ask' ? 'Usage: `ask <who> <question>`, e.g. `ask jack is the release on track?`' : 'Usage: `answer <id> <text>` (the id is shown by `questions`)')], true),
        detail: null,
      };
    case 'unknown':
      return {
        reply: reply("I didn't understand that.", [section("I didn't understand that. I only answer from Bureau data, with these commands:"), section(HELP_LINES.map(l => `\u2022 ${l}`).join('\n'))], true),
        detail: 'Bureau did not recognise the command',
      };

    case 'status': {
      if (!canReadTeam(req.role)) return { reply: denied('Team status'), detail: 'denied' };
      if (cmd.who) {
        const m = await resolveWho(client, req, ctx.teamId, cmd.who);
        if (m.status !== 'found') return { reply: notFound(cmd.who, m), detail: `Looked up ${cmd.who}: not found` };
        const c = await latestCheckin(client, m.clone.id);
        const others = m.other_clones_of_same_person.length ? `Also: ${m.other_clones_of_same_person.map(o => `@${esc(o.handle)}`).join(', ')}` : '';
        return {
          reply: reply(`${m.clone.display_name}: ${c?.top_priority || 'no check-in yet'}`, [
            section(`${who(m.clone)}\n${checkinLines(c)}`),
            ...(others ? [context(others)] : []),
            openInBureau('/team-health'),
          ]),
          detail: `Showed ${m.clone.handle}'s latest check-in`,
        };
      }
      const rows = (await client.query('SELECT * FROM bureau.get_team_health($1)', [req.workspaceId])).rows;
      if (!rows.length) return { reply: reply('No one has connected an AI to Bureau yet.', [section('No one has connected an AI to Bureau yet.')]), detail: 'Showed team status (empty)' };
      const lines = rows.slice(0, 15).map((r: { display_name: string; handle: string; is_stale: boolean; latest_heartbeat: { top_priority?: string; blocked?: string[]; date?: string } | null }) => {
        const hb = r.latest_heartbeat;
        const prio = hb?.top_priority ? esc(clip(hb.top_priority, 120)) : '_no check-in yet_';
        const blocked = hb?.blocked?.length ? ` \u2014 :warning: blocked: ${list(hb.blocked, 1)}` : '';
        return `\u2022 *${esc(r.display_name)}* (@${esc(r.handle)}): ${prio}${blocked}${r.is_stale ? ' _(stale)_' : ''}`;
      });
      return {
        reply: reply(`Team status: ${rows.length} AI${rows.length === 1 ? '' : 's'}`, [
          section(`*Team status* (latest check-ins)\n${lines.join('\n')}`),
          ...(rows.length > 15 ? [context(`+${rows.length - 15} more in Bureau`)] : []),
          openInBureau('/team-health'),
        ]),
        detail: 'Showed team status',
      };
    }

    case 'ask': {
      if (!canReadTeam(req.role)) return { reply: denied('Asking teammates'), detail: 'denied' };
      const m = await resolveWho(client, req, ctx.teamId, cmd.who);
      if (m.status !== 'found') return { reply: notFound(cmd.who, m), detail: `Tried to ask ${cmd.who}: not found` };
      const asked = await client.query(
        `SELECT bureau.ask_question($1, $2, $3, $4, $5, $6, NULL, 'slack') AS id`,
        [req.workspaceId, cmd.question, req.userId, ctx.slackUserName ? clip(ctx.slackUserName, 100) : req.email, ctx.slackUserId, m.clone.id]
      );
      const qid = String(asked.rows[0].id);
      const c = await latestCheckin(client, m.clone.id);
      return {
        reply: reply(`Asked ${m.clone.display_name}. ${c ? `Latest check-in: ${c.top_priority || 'n/a'}` : 'No check-in yet.'}`, [
          section(`:speech_balloon: Asked ${who(m.clone)}: \u201c${esc(clip(cmd.question, 500))}\u201d`),
          section(c ? `*From their latest check-in*\n${checkinLines(c)}` : 'No check-in yet. Their AI will see the question the next time it checks in.'),
          context(`Question \`${qid.slice(0, 8)}\`. Their AI answers at its next check-in; see answers with \`questions ${m.clone.handle}\`.`),
          openInBureau('/questions'),
        ]),
        detail: `Asked ${m.clone.handle} a question (${qid.slice(0, 8)})`,
      };
    }

    case 'questions': {
      if (cmd.who) {
        if (!canReadTeam(req.role)) return { reply: denied('Reading teammates\u2019 questions'), detail: 'denied' };
        const m = await resolveWho(client, req, ctx.teamId, cmd.who);
        if (m.status !== 'found') return { reply: notFound(cmd.who, m), detail: `Looked up questions for ${cmd.who}: not found` };
        const rows = (await client.query(
          `SELECT id::text AS id, question_text, answer_text, status::text AS status, asked_at
             FROM bureau.questions WHERE workspace_id = $1 AND target_clone_id = $2
            ORDER BY asked_at DESC LIMIT 8`,
          [req.workspaceId, m.clone.id]
        )).rows;
        const lines = rows.map((r: { id: string; question_text: string; answer_text: string | null; status: string }) =>
          `\u2022 \`${r.id.slice(0, 8)}\` ${esc(clip(r.question_text, 160))} \u2014 _${esc(r.status)}_${r.answer_text ? `\n    \u21b3 ${esc(clip(r.answer_text, 300))}` : ''}`);
        return {
          reply: reply(`${rows.length} recent question(s) for ${m.clone.display_name}`, [
            section(`*Questions asked of* ${who(m.clone)}\n${lines.join('\n') || '_None yet._'}`),
            openInBureau('/questions'),
          ], true),
          detail: `Read questions asked of ${m.clone.handle}`,
        };
      }
      const rows = (await client.query(
        `SELECT q.id::text AS id, q.question_text, q.asked_at, COALESCE(q.asker_name, wm.email) AS asker, dc.handle
           FROM bureau.questions q
           JOIN bureau.digital_clones dc ON dc.id = q.target_clone_id
           LEFT JOIN bureau.workspace_members wm ON wm.workspace_id = q.workspace_id AND wm.user_id = q.asker_user_id
          WHERE q.workspace_id = $1 AND dc.owner_user_id = $2 AND q.status = 'open'
          ORDER BY q.asked_at DESC LIMIT 10`,
        [req.workspaceId, req.userId]
      )).rows;
      const lines = rows.map((r: { id: string; question_text: string; asker: string | null; handle: string }) =>
        `\u2022 \`${r.id.slice(0, 8)}\` ${esc(clip(r.question_text, 200))} _(from ${esc(r.asker || 'someone')}, to @${esc(r.handle)})_`);
      return {
        reply: reply(`${rows.length} open question(s) for you`, [
          section(`*Open questions for you*\n${lines.join('\n') || '_Nothing open._'}`),
          ...(rows.length ? [context('Reply with `answer <id> <your answer>`.')] : []),
        ], true),
        detail: 'Read my open questions',
      };
    }

    case 'answer': {
      const rows = (await client.query(
        `SELECT q.id::text AS id FROM bureau.questions q
           JOIN bureau.digital_clones dc ON dc.id = q.target_clone_id
          WHERE q.workspace_id = $1 AND dc.owner_user_id = $2 AND q.status = 'open' AND q.id::text LIKE $3
          LIMIT 2`,
        [req.workspaceId, req.userId, `${cmd.ref}%`] // ref is validated hex, so no LIKE wildcards
      )).rows;
      if (rows.length !== 1) {
        return {
          reply: reply(rows.length ? 'That id matches more than one question.' : 'No open question with that id for you.', [
            section(rows.length ? 'That id matches more than one question; use more characters.' : 'I couldn\u2019t find an open question with that id asked of your AI. `questions` lists them.'),
          ], true),
          detail: 'Tried to answer a question: not found',
        };
      }
      await client.query('SELECT bureau.answer_question($1, $2, $3, $4, FALSE)', [req.workspaceId, req.userId, rows[0].id, cmd.text]);
      return {
        reply: reply('Answered.', [section(`:white_check_mark: Answered question \`${rows[0].id.slice(0, 8)}\`.`)], true),
        detail: `Answered question ${rows[0].id.slice(0, 8)}`,
      };
    }

    case 'board': {
      if (!canReadActivity(req.role)) return { reply: denied('The Team Work Board'), detail: 'denied' };
      if (!activityKeyConfigured()) return { reply: reply('Work tracking is not configured on this Bureau server yet.', [section('Work tracking is not configured on this Bureau server yet.')], true), detail: null };
      const b = await teamBoard(client, req.workspaceId, { days: cmd.days });
      const t = b.totals;
      const people = b.people.slice(0, 12).map(p => `\u2022 ${esc((p.email || 'someone').split('@')[0])}: ${p.shipped} shipped, ${p.units - p.shipped - p.blocked} in progress, ${p.blocked} blocked${p.consent_accepted ? '' : ' _(notice not accepted)_'}`);
      return {
        reply: reply(`Team Work Board, last ${b.window_days} day(s): ${t.shipped} shipped, ${t.in_progress} in progress, ${t.blocked} blocked`, [
          section(`*Team Work Board* \u2014 last ${b.window_days} day${b.window_days === 1 ? '' : 's'}\n${t.shipped} shipped \u00b7 ${t.in_progress} in progress \u00b7 ${t.blocked} blocked \u00b7 ${t.verified} verified by a real artifact`),
          ...(people.length ? [section(people.join('\n'))] : []),
          ...(b.blocked.length ? [section(`*Blocked*\n${b.blocked.slice(0, 6).map(unitLine).join('\n')}`)] : []),
          openInBureau('/work'),
        ], true),
        detail: `Read the Team Work Board (${b.window_days} days)`,
      };
    }

    case 'digest': {
      if (!canReadActivity(req.role)) return { reply: denied('The work digest'), detail: 'denied' };
      if (!activityKeyConfigured()) return { reply: reply('Work tracking is not configured on this Bureau server yet.', [section('Work tracking is not configured on this Bureau server yet.')], true), detail: null };
      let userIds: string[] | null = null;
      let label = 'the team';
      if (cmd.who) {
        const m = await resolveWho(client, req, ctx.teamId, cmd.who);
        if (m.status !== 'found') return { reply: notFound(cmd.who, m), detail: `Digest for ${cmd.who}: not found` };
        userIds = [m.clone.owner_user_id];
        label = m.clone.display_name;
      }
      const d = await buildDigest(client, req.workspaceId, cmd.period, userIds);
      const blocks = [
        section(`*${cmd.period === 'weekly' ? 'Weekly' : 'Daily'} digest* for ${esc(label)}\n${d.counts.shipped} shipped \u00b7 ${d.counts.in_flight} in flight \u00b7 ${d.counts.blocked} blocked \u00b7 ${d.counts.people_active} people active`),
        ...(d.shipped.length ? [section(`*Shipped*\n${d.shipped.slice(0, 8).map(unitLine).join('\n')}`)] : []),
        ...(d.blocked.length ? [section(`*Blocked*\n${d.blocked.slice(0, 6).map(unitLine).join('\n')}`)] : []),
        ...(d.in_flight.length ? [section(`*In flight*\n${d.in_flight.slice(0, 6).map(unitLine).join('\n')}`)] : []),
        ...(d.coverage.not_accepted.length ? [context(`Not covered (notice not accepted): ${d.coverage.not_accepted.map(x => esc((x.email || '?').split('@')[0])).join(', ')}`)] : []),
        openInBureau('/work'),
      ];
      return {
        reply: reply(`${cmd.period === 'weekly' ? 'Weekly' : 'Daily'} digest: ${d.counts.shipped} shipped, ${d.counts.blocked} blocked`, blocks, true),
        detail: `Read the ${cmd.period} work digest${cmd.who ? ` for ${cmd.who}` : ''}`,
      };
    }
  }
}

/**
 * Run one command for a linked requester and log it. The reply's visibility is decided here:
 * DMs are private anyway; in channels anything personal or management-only is ephemeral.
 */
export async function executeCommand(req: Requester, ctx: CommandContext, cmd: SlackCommand): Promise<CommandOutcome> {
  const { reply: out, detail } = await withUser(req.userId, req.email, (client: Client) => run(client, req, ctx, cmd));
  if (ctx.surface === 'slash') out.ephemeral = true;
  else if (ctx.surface === 'dm') out.ephemeral = false;
  else if (PRIVATE_IN_CHANNEL.has(cmd.kind)) out.ephemeral = true;

  let logged: CommandOutcome['logged'] = 'skipped';
  if (cmd.kind !== 'help' && cmd.kind !== 'usage' && ctx.rawText.trim()) {
    if (!activityKeyConfigured()) {
      logged = 'not_configured';
    } else {
      try {
        const res = await withUser(req.userId, req.email, (client: Client) => logActivity(client, {
          workspaceId: req.workspaceId,
          userId: req.userId,
          source: 'slack',
          vendor: 'slack',
          agentLabel: ctx.surface === 'slash' ? 'Slack /bureau' : ctx.surface === 'dm' ? 'Slack DM to Bureau' : 'Slack @Bureau',
          kind: 'request',
          request: ctx.rawText,
          detail,
          conversationRef: ctx.conversationRef,
        }));
        logged = res.status === 'logged' ? 'logged' : res.status === 'consent_required' ? 'consent_required' : 'skipped';
      } catch (err) {
        console.error('[slack] activity log failed:', err instanceof Error ? err.name : 'error');
        logged = 'skipped';
      }
    }
  }
  if (logged === 'consent_required') {
    out.blocks.push(context(`Not logged: you haven't accepted Bureau's activity notice yet (${esc(appUrl())}/activity).`));
  }
  return { reply: out, logged };
}
