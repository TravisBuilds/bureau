import { NextRequest, NextResponse } from 'next/server';
import { approveDeviceCode } from '@/lib/oauth-grants';
import { requireAuth } from '@/lib/auth-helpers';

/**
 * POST /api/oauth/device/approve
 * Approve device code and create agent link
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }

    const body = await request.json();
    const { user_code, agent_label, stream_ids, allow_create_streams } = body;

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

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Device approval error:', error);
    return NextResponse.json({ error: 'Failed to approve device' }, { status: 500 });
  }
}
