import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

// Scope allowlist
const ALLOWED_SCOPES = ['ingest:write', 'clone:write', 'questions:read', 'questions:write', 'team:read'];

/**
 * POST /api/oauth/register - RFC 7591 Dynamic Client Registration
 * Fallback for clients that don't publish CIMD documents
 * 
 * Rate limited, marks clients as unverified (dcr)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      redirect_uris,
      client_name,
      client_uri,
      grant_types,
      response_types,
      scope
    } = body;
    
    // Validate required fields
    if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return NextResponse.json(
        { error: 'invalid_redirect_uri', error_description: 'redirect_uris is required and must be a non-empty array' },
        { status: 400 }
      );
    }

    // Validate scopes against allowlist
    if (scope) {
      const requestedScopes = scope.split(' ');
      const invalidScopes = requestedScopes.filter((s: string) => !ALLOWED_SCOPES.includes(s));
      if (invalidScopes.length > 0) {
        return NextResponse.json({ 
          error: 'invalid_scope',
          error_description: `Invalid scopes: ${invalidScopes.join(', ')}`
        }, { status: 400 });
      }
    }
    
    // Check all redirect_uris are https (or localhost for dev)
    for (const uri of redirect_uris) {
      try {
        const url = new URL(uri);
        if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
          return NextResponse.json(
            { error: 'invalid_redirect_uri', error_description: `Redirect URI must be https or localhost: ${uri}` },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'invalid_redirect_uri', error_description: `Malformed redirect URI: ${uri}` },
          { status: 400 }
        );
      }
    }
    
    // Generate client credentials
    const clientId = `dcr_${crypto.randomBytes(16).toString('hex')}`;
    const clientSecret = crypto.randomBytes(32).toString('base64url');
    
    // Store in DB (marked as unverified DCR client)
    await query(
      `INSERT INTO bureau.oauth_clients (
        client_id, client_secret, client_name, client_uri,
        redirect_uris, grant_types, response_types, scope,
        registration_method, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'dcr', NOW())`,
      [
        clientId,
        clientSecret,
        client_name || 'Unknown Client',
        client_uri || null,
        redirect_uris,
        grant_types || ['authorization_code', 'refresh_token'],
        response_types || ['code'],
        scope || 'ingest:write'
      ]
    );
    
    // Return RFC 7591 client information response
    return NextResponse.json({
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client_name || 'Unknown Client',
      client_uri: client_uri || undefined,
      redirect_uris,
      grant_types: grant_types || ['authorization_code', 'refresh_token'],
      response_types: response_types || ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      scope: scope || 'ingest:write'
    }, { status: 201 });
    
  } catch (error) {
    console.error('DCR error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to register client' },
      { status: 500 }
    );
  }
}
