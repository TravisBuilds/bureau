import { NextResponse } from 'next/server';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { withUser } from '@/lib/db';
import { isLeaderRole } from '@/lib/oauth-scopes';
import { slackInstallConfigured, slackSigningSecret } from '@/lib/slack/config';
import { workspaceInstallation } from '@/lib/slack/install';

/**
 * GET /api/slack/status: Slack connection for Settings -> Team. Never returns token material.
 * Everyone sees whether Slack is connected and their own link; owners/admins also get the
 * Slack member list (for linking) and the Bureau member list (for manual mapping).
 */
export async function GET() {
  let user;
  try { user = await requireWorkspaceUser(); } catch (e) { if (e instanceof Response) return e; throw e; }
  const installation = await workspaceInstallation(user.id, user.email, user.workspaceId);
  const leader = isLeaderRole(user.role);
  const data = await withUser(user.id, user.email, async (client) => {
    const links = (await client.query(
      `SELECT l.slack_user_id, l.slack_display_name, l.slack_email, l.member_user_id::text AS member_user_id,
              l.linked_how, wm.email AS member_email
         FROM bureau.slack_user_links l
         LEFT JOIN bureau.workspace_members wm
           ON wm.workspace_id = l.workspace_id AND wm.user_id = l.member_user_id AND wm.removed_at IS NULL
        WHERE l.workspace_id = $1 ${installation ? 'AND l.slack_team_id = $2' : ''}
        ORDER BY (l.member_user_id IS NULL) DESC, lower(COALESCE(l.slack_display_name, l.slack_user_id))`,
      installation ? [user.workspaceId, installation.team_id] : [user.workspaceId]
    )).rows;
    const members = leader ? (await client.query(
      `SELECT user_id::text AS user_id, email, role::text AS role FROM bureau.workspace_members
        WHERE workspace_id = $1 AND removed_at IS NULL ORDER BY email`, [user.workspaceId]
    )).rows : [];
    return { links, members };
  });
  const me = data.links.find((l: { member_user_id: string | null }) => l.member_user_id === user.id) || null;
  return NextResponse.json({
    configured: slackInstallConfigured() && slackSigningSecret().length > 0,
    can_manage: user.role === 'owner',
    is_leader: leader,
    installation,
    me: me ? { slack_user_id: me.slack_user_id, slack_display_name: me.slack_display_name, linked_how: me.linked_how } : null,
    links: leader ? data.links : [],
    members: data.members,
  }, { headers: { 'cache-control': 'no-store' } });
}
