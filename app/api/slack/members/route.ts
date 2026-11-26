import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { withUser } from '@/lib/db';
import { isLeaderRole } from '@/lib/oauth-scopes';
import { workspaceInstallation } from '@/lib/slack/install';
import { getInstallation, botToken, syncSlackMembers } from '@/lib/slack/store';

/**
 * POST /api/slack/members -> owners/admins: refresh Slack members (users.list) and link by email.
 * PUT  /api/slack/members -> owners/admins: manual link { slack_user_id, member_user_id | null }.
 */
async function leader() {
  const user = await requireWorkspaceUser();
  if (!isLeaderRole(user.role)) throw NextResponse.json({ error: 'Owners and admins only' }, { status: 403 });
  return user;
}

export async function POST() {
  let user;
  try { user = await leader(); } catch (e) { if (e instanceof Response) return e; throw e; }
  const st = await workspaceInstallation(user.id, user.email, user.workspaceId);
  if (!st || st.status !== 'active') return NextResponse.json({ error: 'Slack is not connected' }, { status: 409 });
  const token = botToken(await getInstallation(st.team_id));
  if (!token) return NextResponse.json({ error: 'Slack needs to be reconnected' }, { status: 409 });
  const res = await syncSlackMembers(st.team_id, token);
  if (res.error) return NextResponse.json({ error: 'Slack did not return the member list', ...res }, { status: 502 });
  return NextResponse.json({ ok: true, ...res });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(request: NextRequest) {
  let user;
  try { user = await leader(); } catch (e) { if (e instanceof Response) return e; throw e; }
  const body = await request.json().catch(() => null);
  const slackUserId = typeof body?.slack_user_id === 'string' ? body.slack_user_id : '';
  const memberUserId = body?.member_user_id === null ? null : typeof body?.member_user_id === 'string' ? body.member_user_id : undefined;
  if (!/^[UW][A-Z0-9]{2,30}$/.test(slackUserId) || memberUserId === undefined || (memberUserId && !UUID_RE.test(memberUserId))) {
    return NextResponse.json({ error: 'slack_user_id and member_user_id (or null) are required' }, { status: 400 });
  }
  const out = await withUser(user.id, user.email, async (client) => {
    if (memberUserId) {
      const m = await client.query(
        `SELECT 1 FROM bureau.workspace_members WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL`,
        [user.workspaceId, memberUserId]
      );
      if (!m.rows.length) return 'no_member';
    }
    const r = await client.query(
      `UPDATE bureau.slack_user_links
          SET member_user_id = $3, linked_how = CASE WHEN $3::uuid IS NULL THEN NULL ELSE 'manual' END,
              linked_by = $4, updated_at = NOW()
        WHERE workspace_id = $1 AND slack_user_id = $2`,
      [user.workspaceId, slackUserId, memberUserId, user.id]
    );
    return r.rowCount ? 'ok' : 'no_link';
  });
  if (out === 'no_member') return NextResponse.json({ error: 'That person is not an active member of this workspace' }, { status: 400 });
  if (out === 'no_link') return NextResponse.json({ error: 'Unknown Slack user; refresh Slack members first' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
