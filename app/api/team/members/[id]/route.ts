import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { query } from '@/lib/db';

/**
 * DELETE /api/team/members/[id] - Remove a member
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }

    const { id: userIdToRemove } = await params;

    const result = await query<{ remove_member: boolean }>(
      `SELECT bureau.remove_member($1, $2, $3) as remove_member`,
      [user.workspaceId, userIdToRemove, user.id]
    );

    if (!result[0]?.remove_member) {
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error removing member:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to remove member' 
    }, { status: 500 });
  }
}
