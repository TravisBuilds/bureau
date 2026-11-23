import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { query } from '@/lib/db';

/**
 * DELETE /api/connections/[id] - Revoke a connection
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }
    
    const connectionId = params.id;
    
    // Revoke grant (resolve_credential checks grant status, so this effectively invalidates all tokens)
    await query(
      `UPDATE bureau.oauth_grants
       SET status = 'revoked', revoked_at = NOW(), revoked_reason = 'User revoked'
       WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
      [connectionId, user.workspaceId, user.id]
    );
    
    // Note: We don't directly UPDATE oauth_tokens (no table access)
    // The revoked grant status is checked by resolve_credential, invalidating all tokens
    
    // Revoke agent links
    await query(
      `UPDATE bureau.agent_links
       SET status = 'revoked', revoked_at = NOW()
       WHERE grant_id = $1`,
      [connectionId]
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
