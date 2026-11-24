import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { revokeGrant } from '@/lib/oauth-grants';
import { withUser } from '@/lib/db';

/**
 * DELETE /api/connections/[id] - Revoke a connection
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
    
    const { id: connectionId } = await params;
    
    // Revoke grant (resolve_credential checks grant status, so this effectively invalidates all tokens)
    const revoked = await revokeGrant(connectionId, user.id, user.workspaceId);
    
    if (!revoked) {
      return NextResponse.json({ error: 'Connection not found or already revoked' }, { status: 404 });
    }
    
    // Revoke agent links
    await withUser(user.id, user.email, (client) =>
      client.query(
        `UPDATE bureau.agent_links
         SET status = 'revoked', revoked_at = NOW()
         WHERE grant_id = $1 AND workspace_id = $2`,
        [connectionId, user.workspaceId]
      )
    );
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error revoking connection:', error);
    return NextResponse.json({ error: 'Failed to revoke connection' }, { status: 500 });
  }
}
