import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { query, withUser } from '@/lib/db';

import { ALLOWED_SCOPES, resolveScopes, scopesForRole } from '@/lib/oauth-scopes';
import { storeAuthCode, validateRedirectUri } from '@/lib/oauth-server';

/**
 * POST /api/oauth/authorize - Process consent approval
 * Called from consent screen after user approves
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    let workspaceId = user.workspaceId;
    let role = user.role;
    if (!workspaceId) {
      const { ensureDefaultWorkspaceMembership } = await import('@/lib/post-login');
      workspaceId = await ensureDefaultWorkspaceMembership(user.id, user.email);
      if (workspaceId) {
        const { getAuthUser } = await import('@/lib/auth-helpers');
        const refreshed = await getAuthUser();
        role = refreshed?.role ?? 'member';
      }
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }
    
    const body = await request.json();
    const {
      client_id,
      redirect_uri,
      state,
      code_challenge,
      resource,
      scopes,
      agent_label,
      stream_ids,
      allow_create_streams,
      approved,
      activity_notice_accepted
    } = body;
    
    // Validate required fields
    if (!client_id || !redirect_uri || !code_challenge || !agent_label) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    if (!approved) {
      return NextResponse.json({ error: 'User denied' }, { status: 403 });
    }

    // Validate scopes against allowlist
    if (scopes !== undefined && scopes !== null && !Array.isArray(scopes) && typeof scopes !== 'string') {
      return NextResponse.json({ error: 'invalid_scope', error_description: 'scopes must be an array' }, { status: 400 });
    }
    // Apply workspace role policy (all active members get team:read under full transparency).
    const requestedScopes = scopesForRole(resolveScopes(scopes), role);
    if (typeof agent_label !== 'string' || !agent_label.trim() || agent_label.length > 100) {
      return NextResponse.json({ error: 'agent_label must be 1-100 characters' }, { status: 400 });
    }
    const invalidScopes = requestedScopes.filter((s: string) => !ALLOWED_SCOPES.includes(s));
    if (invalidScopes.length > 0) {
      return NextResponse.json({ 
        error: 'invalid_scope',
        error_description: `Invalid scopes: ${invalidScopes.join(', ')}`
      }, { status: 400 });
    }
    
    // Resolve client (CIMD or DB)
    const { resolveClient: resolveCIMDClient } = await import('@/lib/oauth-cimd');
    const cimdClient = await resolveCIMDClient(client_id);
    
    let redirectUris: string[];
    
    if (cimdClient) {
      redirectUris = cimdClient.redirect_uris;
    } else {
      // Fall back to DB lookup
      const clientRows = await query<{ redirect_uris: string[] }>(
        `SELECT redirect_uris FROM bureau.oauth_clients WHERE client_id = $1`,
        [client_id]
      );
      
      if (clientRows.length === 0) {
        return NextResponse.json({ error: 'Unknown client' }, { status: 400 });
      }
      
      redirectUris = clientRows[0].redirect_uris;
    }
    
    // Validate redirect URI
    if (!validateRedirectUri(redirect_uri, redirectUris)) {
      return NextResponse.json({ error: 'Invalid redirect_uri' }, { status: 400 });
    }
    
    // Validate stream IDs belong to workspace
    if (stream_ids && stream_ids.length > 0) {
      const streamRows = await withUser(user.id, user.email, async (client) =>
        (await client.query(
          `SELECT id FROM bureau.streams WHERE workspace_id = $1 AND id = ANY($2)`,
          [workspaceId, stream_ids]
        )).rows
      );
      
      if (streamRows.length !== stream_ids.length) {
        return NextResponse.json({ error: 'Invalid stream IDs' }, { status: 400 });
      }
    }
    
    // Store auth code
    const code = await storeAuthCode({
      userId: user.id,
      workspaceId,
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      resource: resource || null,
      scopes: requestedScopes,
      agentLabel: agent_label.trim(),
      streamIds: stream_ids || [],
      allowCreateStreams: allow_create_streams || false
    });
    
    // AI activity logging notice (BC PIPA notice before collection). The consent page only
    // enables Approve once the box is ticked; we record the acknowledgement here. Without it the
    // connection still works but bureau_log_activity refuses to store anything.
    if (activity_notice_accepted === true) {
      const { recordConsent } = await import('@/lib/activity-log');
      await withUser(user.id, user.email, (client) => recordConsent(client, workspaceId as string, user.id, 'oauth_consent'));
    }

    // RFC 9207: the consent page appends iss to the redirect
    const iss = process.env.NEXT_PUBLIC_APP_URL || 'https://bureau-krustbuild.vercel.app';
    return NextResponse.json({ code, state, iss });
    
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('OAuth authorize error:', error);
    return NextResponse.json({ error: 'Authorization failed' }, { status: 500 });
  }
}
