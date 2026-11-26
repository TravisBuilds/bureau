import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { activityKeyConfigured } from '@/lib/activity-crypto';
import { consentStatus, isLeader } from '@/lib/activity-log';
import { buildDigest, listWorkUnits, teamBoard } from '@/lib/ground-truth/work-events';

/**
 * GET /api/work?view=board|timeline|digest|mine
 *  board    (leaders) team rollup: ?days=&project=
 *  timeline (leaders) one person's units: ?user_id=&since=&until=&verified=1
 *  digest   (leaders) ?period=daily|weekly
 *  mine     (everyone) your own units, the same rows leaders see about you
 * Non-leaders asking for a team view get their own data (RLS enforces the same).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireWorkspaceUser();
    const sp = request.nextUrl.searchParams;
    const view = sp.get('view') || 'mine';
    const out = await withUser(user.id, user.email, async (c) => {
      const leader = await isLeader(c, user.workspaceId);
      const consent = await consentStatus(c, user.workspaceId, user.id);
      const base = { is_leader: leader, consent, configured: activityKeyConfigured(), user_id: user.id };
      if (view === 'board' && leader) {
        return { ...base, view, board: await teamBoard(c, user.workspaceId, { days: Number(sp.get('days')) || 7, project: sp.get('project') }) };
      }
      if (view === 'digest' && leader) {
        return { ...base, view, digest: await buildDigest(c, user.workspaceId, sp.get('period') === 'weekly' ? 'weekly' : 'daily') };
      }
      const target = view === 'timeline' && leader && sp.get('user_id') ? sp.get('user_id')! : user.id;
      const units = await listWorkUnits(c, {
        workspaceId: user.workspaceId, userIds: [target],
        project: sp.get('project'), status: sp.get('status'), since: sp.get('since'), until: sp.get('until'),
        verifiedOnly: sp.get('verified') === '1', limit: Number(sp.get('limit')) || 200,
      });
      return { ...base, view: target === user.id ? 'mine' : 'timeline', target_user_id: target, units };
    });
    return NextResponse.json(out);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Error reading work units:', error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Failed to read work' }, { status: 500 });
  }
}
