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
    
    // Check all redirect_uris are https, localhost, or cursor:// private-use scheme (RFC 8252)
    for (const uri of redirect_uris) {
      try {
        const url = new URL(uri);
        const isHttps = url.protocol === 'https:';
        const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
        const isCursorScheme = url.protocol === 'cursor:';
        
        if (!isHttps && !isLoopback && !isCursorScheme) {
          return NextResponse.json(
            { error: 'invalid_redirect_uri', error_description: `Redirect URI must be https, localhost, or cursor://: ${uri}` },
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
    
    // Generate client_id (public client, no secret per RFC 7591 for token_endpoint_auth_method=none)
    const clientId = `dcr_${crypto.randomBytes(16).toString('hex')}`;
    
    // Infer vendor from redirect_uri
    let vendor = 'other';
    const firstUri = redirect_uris[0].toLowerCase();
    if (firstUri.includes('claude.ai')) vendor = 'other'; // Will be 'anthropic' after optional migration
    else if (firstUri.includes('cursor.com') || firstUri.includes('cursor://')) vendor = 'cursor';
    else if (firstUri.includes('chatgpt.com') || firstUri.includes('openai.com')) vendor = 'openai';
    else if (firstUri.includes('grok.com')) vendor = 'grokbot';
    
    // Store in DB (only columns that exist in bureau.oauth_clients)
    await query(
      `INSERT INTO bureau.oauth_clients (
        client_id, client_name, client_uri, redirect_uris, 
        registration, vendor, verified, created_by, metadata
      ) VALUES ($1, $2, $3, $4, 'dcr', $5, FALSE, NULL, '{}'::jsonb)`,
      [
        clientId,
        client_name || 'Unknown Client',
        client_uri || null,
        redirect_uris,
        vendor
      ]
    );
    
    // Return RFC 7591 client information response (public client)
    return NextResponse.json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client_name || 'Unknown Client',
      client_uri: client_uri || undefined,
      redirect_uris,
      grant_types: grant_types || ['authorization_code', 'refresh_token'],
      response_types: response_types || ['code'],
      token_endpoint_auth_method: 'none',
      scope: scope || 'ingest:write clone:write questions:read questions:write'
    }, { status: 201 });
    
  } catch (error) {
    console.error('DCR error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to register client' },
      { status: 500 }
    );
  }
}
