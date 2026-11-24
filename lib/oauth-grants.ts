/**
 * OAuth Grant Management
 * Functions for revoking and managing OAuth grants
 */

import { query, withUser } from './db';

/**
 * Revoke an OAuth grant
 * Verifies ownership (workspace + user) before revoking
 */
export async function revokeGrant(
  grantId: string,
  userId: string,
  workspaceId: string
): Promise<boolean> {
  // Run as the owning user so the oauth_grants RLS update policy applies
  const rowCount = await withUser(userId, '', async (client) =>
    (await client.query(
      `UPDATE bureau.oauth_grants 
       SET status = 'revoked', revoked_at = NOW(), revoked_reason = 'User revoked'
       WHERE id = $1 AND workspace_id = $2 AND user_id = $3 AND status = 'active'
       RETURNING true as revoked`,
      [grantId, workspaceId, userId]
    )).rowCount ?? 0
  );
  
  return rowCount > 0;
}

/**
 * Lookup device code for approval page
 */
export async function lookupDeviceCode(userCode: string): Promise<{
  clientName: string;
  scopes: string[];
  status: string;
  expiresAt: Date;
} | null> {
  const result = await query<{
    client_name: string;
    scopes: string[];
    status: string;
    expires_at: Date;
  }>(
    `SELECT * FROM bureau.lookup_device_code($1)`,
    [userCode]
  );
  
  if (result.length === 0) {
    return null;
  }
  
  return {
    clientName: result[0].client_name,
    scopes: result[0].scopes,
    status: result[0].status,
    expiresAt: result[0].expires_at
  };
}

/**
 * Approve device code
 */
export async function approveDeviceCode(
  userCode: string,
  userId: string,
  workspaceId: string,
  agentLabel: string,
  streamIds: string[],
  allowCreateStreams: boolean
): Promise<boolean> {
  const result = await query<{ approved: boolean }>(
    `SELECT bureau.approve_device_code($1, $2, $3, $4, $5, $6) as approved`,
    [userCode, userId, workspaceId, agentLabel, streamIds, allowCreateStreams]
  );
  
  return result[0]?.approved || false;
}
