import { NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { consentStatus, recordConsent, revokeConsent, workspaceOwnerEmail } from '@/lib/activity-log';
import { ACTIVITY_NOTICE, ACTIVITY_POLICY_VERSION, privacyContactLine } from '@/lib/activity-policy';

/** GET: the notice, who to contact, and whether you have accepted the current version. */
export async function GET() {
  try {
    const user = await requireWorkspaceUser();
    const out = await withUser(user.id, user.email, async (client) => ({
      status: await consentStatus(client, user.workspaceId, user.id),
      contact: privacyContactLine(await workspaceOwnerEmail(client, user.workspaceId)),
    }));
    return NextResponse.json({ ...out, notice: ACTIVITY_NOTICE, policy_version: ACTIVITY_POLICY_VERSION });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Error reading activity consent:', error);
    return NextResponse.json({ error: 'Failed to read consent' }, { status: 500 });
  }
}

/** POST: accept the current notice (from the My activity page). */
export async function POST() {
  try {
    const user = await requireWorkspaceUser();
    const status = await withUser(user.id, user.email, async (client) => {
      await recordConsent(client, user.workspaceId, user.id, 'web');
      return consentStatus(client, user.workspaceId, user.id);
    });
    return NextResponse.json({ status });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Error recording activity consent:', error);
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 });
  }
}

/** DELETE: withdraw. Nothing more is logged until you accept again (past entries stay until they expire or you delete them). */
export async function DELETE() {
  try {
    const user = await requireWorkspaceUser();
    const status = await withUser(user.id, user.email, async (client) => {
      await revokeConsent(client, user.workspaceId, user.id);
      return consentStatus(client, user.workspaceId, user.id);
    });
    return NextResponse.json({ status });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Error revoking activity consent:', error);
    return NextResponse.json({ error: 'Failed to revoke consent' }, { status: 500 });
  }
}
