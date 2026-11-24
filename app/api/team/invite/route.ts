import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { query } from '@/lib/db';

/**
 * POST /api/team/invite - Invite a member to workspace
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }

    const body = await request.json();
    const { email, role } = body;

    if (!email || !role) {
      return NextResponse.json({ error: 'Missing email or role' }, { status: 400 });
    }

    if (!['member', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be member or admin' }, { status: 400 });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const result = await query<{ invite_member: string }>(
      `SELECT bureau.invite_member($1, $2, $3, $4) as invite_member`,
      [user.workspaceId, email.toLowerCase(), role, user.id]
    );

    return NextResponse.json({ 
      success: true,
      inviteId: result[0].invite_member 
    });
  } catch (error: any) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error inviting member:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to invite member' 
    }, { status: 500 });
  }
}
