import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { activityPeople, consentStatus, isLeader, listActivity } from '@/lib/activity-log';
import { activityKeyConfigured } from '@/lib/activity-crypto';

/**
 * GET /api/activity - logged AI requests.
 * Owners/admins: everyone in the workspace (?user_id= for one person's timeline, ?q= search).
 * Everyone else: only their own entries, whatever they pass. RLS enforces the same rule.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireWorkspaceUser();
    const sp = request.nextUrl.searchParams;
    const configured = activityKeyConfigured();
    const out = await withUser(user.id, user.email, async (client) => {
      const leader = await isLeader(client, user.workspaceId);
      const mine = sp.get('mine') === '1' || !leader;
      const requested = sp.get('user_id');
      const userIds = mine ? [user.id] : requested ? [requested] : null;
      const consent = await consentStatus(client, user.workspaceId, user.id);
      const list = configured
        ? await listActivity(client, {
            workspaceId: user.workspaceId,
            userIds,
            query: sp.get('q'),
            since: sp.get('since'),
            until: sp.get('until'),
            limit: Number(sp.get('limit')) || 100,
          })
        : { entries: [], scanned: 0, truncated: false };
      const people = leader && !mine ? await activityPeople(client, user.workspaceId) : undefined;
      return { is_leader: leader, scope: mine ? 'mine' : 'workspace', configured, consent, people, ...list };
    });
    return NextResponse.json({ ...out, user_id: user.id });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Error reading activity:', error);
    return NextResponse.json({ error: 'Failed to read activity' }, { status: 500 });
  }
}
