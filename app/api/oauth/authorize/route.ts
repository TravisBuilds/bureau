import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { query, withUser } from '@/lib/db';

// Scope allowlist
const ALLOWED_SCOPES = ['ingest:write', 'clone:write', 'questions:read', 'questions:write', 'team:read'];
import { storeAuthCode, validateRedirectUri } from '@/lib/oauth-server';

/**
 * POST /api/oauth/authorize - Process consent approval
 * Called from consent screen after user approves
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
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
      approved
    } = body;
    
    // Validate required fields
    if (!client_id || !redirect_uri || !code_challenge || !agent_label) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    if (!approved) {
      return NextResponse.json({ error: 'User denied' }, { status: 403 });
    }

    // Validate scopes against allowlist
    const requestedScopes = scopes || [];
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
          [user.workspaceId, stream_ids]
        )).rows
      );
      
      if (streamRows.length !== stream_ids.length) {
        return NextResponse.json({ error: 'Invalid stream IDs' }, { status: 400 });
      }
    }
    
    // Store auth code
    const code = await storeAuthCode({
      userId: user.id,
      workspaceId: user.workspaceId,
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      resource: resource || null,
      scopes: scopes || ['ingest:write'],
      agentLabel: agent_label,
      streamIds: stream_ids || [],
      allowCreateStreams: allow_create_streams || false
    });
    
    return NextResponse.json({ code, state });
    
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('OAuth authorize error:', error);
    return NextResponse.json({ error: 'Authorization failed' }, { status: 500 });
  }
}
