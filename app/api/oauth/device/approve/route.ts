import { NextRequest, NextResponse } from 'next/server';
import { approveDeviceCode } from '@/lib/oauth-grants';
import { requireAuth } from '@/lib/auth-helpers';
import { ensureDefaultWorkspaceMembership } from '@/lib/post-login';
import { withUser } from '@/lib/db';
import { recordConsent } from '@/lib/activity-log';

/**
 * POST /api/oauth/device/approve
 * Approve device code and create agent link
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user.workspaceId) {
      const joined = await ensureDefaultWorkspaceMembership(user.id, user.email);
      if (joined) {
        user.workspaceId = joined;
      }
    }
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }

    const body = await request.json();
    const { user_code, agent_label, stream_ids, allow_create_streams, activity_notice_accepted } = body;

    if (!user_code || !agent_label) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const approved = await approveDeviceCode(
      user_code.toUpperCase(),
      user.id,
      user.workspaceId,
      agent_label,
      stream_ids || [],
      allow_create_streams || false
    );

    if (!approved) {
      return NextResponse.json({ error: 'Failed to approve device code' }, { status: 400 });
    }

    // AI activity logging notice acknowledgement (see /api/oauth/authorize).
    if (activity_notice_accepted === true) {
      const workspaceId = user.workspaceId;
      await withUser(user.id, user.email, (client) => recordConsent(client, workspaceId, user.id, 'device_consent'));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Device approval error:', error);
    return NextResponse.json({ error: 'Failed to approve device' }, { status: 500 });
  }
}
