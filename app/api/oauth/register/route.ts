import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

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
    
    if (!client_name) {
      return NextResponse.json(
        { error: 'invalid_client_metadata', error_description: 'client_name is required' },
        { status: 400 }
      );
    }
    
    // Validate all redirect URIs (HTTPS or localhost only)
    for (const uri of redirect_uris) {
      try {
        const url = new URL(uri);
        if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
          return NextResponse.json(
            { error: 'invalid_redirect_uri', error_description: `Redirect URI must be HTTPS or localhost: ${uri}` },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'invalid_redirect_uri', error_description: `Invalid URI format: ${uri}` },
          { status: 400 }
        );
      }
    }
    
    // Validate redirect host allowlist (env-configurable)
    // Defaults from vendor documentation:
    // - chatgpt.com, chat.openai.com: ChatGPT custom MCP server callbacks
    //   Source: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
    // - www.cursor.com: Cursor MCP OAuth callback
    //   Source: https://cursor.com/docs/mcp (fixed callback: https://www.cursor.com/agents/mcp/oauth/callback)
    // - localhost, 127.0.0.1: Local development
    // 
    // Grok Bot callback host is not documented publicly; leave configurable via env.
    // Set BUREAU_OAUTH_REDIRECT_HOSTS to add additional hosts (comma-separated).
    const defaultHosts = [
      'chatgpt.com',
      'chat.openai.com', 
      'www.cursor.com',
      'localhost',
      '127.0.0.1'
    ];
    
    const envHosts = process.env.BUREAU_OAUTH_REDIRECT_HOSTS 
      ? process.env.BUREAU_OAUTH_REDIRECT_HOSTS.split(',').map(h => h.trim()).filter(Boolean)
      : [];
    
    const allowedHosts = [...defaultHosts, ...envHosts];
    
    for (const uri of redirect_uris) {
      const url = new URL(uri);
      if (!allowedHosts.includes(url.hostname)) {
        return NextResponse.json(
          { error: 'invalid_redirect_uri', error_description: `Redirect host not allowed in pilot: ${url.hostname}. Contact support.` },
          { status: 400 }
        );
      }
    }
    
    // Generate client_id (dcr prefix for unverified)
    const clientId = `dcr_${crypto.randomBytes(16).toString('hex')}`;
    
    // Infer vendor from redirect URI
    let vendor = 'other';
    const firstRedirect = new URL(redirect_uris[0]);
    if (firstRedirect.hostname.includes('openai.com') || firstRedirect.hostname.includes('chatgpt.com')) {
      vendor = 'openai';
    } else if (firstRedirect.hostname.includes('cursor.com')) {
      vendor = 'cursor';
    } else if (firstRedirect.hostname === 'localhost' || firstRedirect.hostname === '127.0.0.1') {
      vendor = 'script';
    }
    
    // Store client
    await query(
      `INSERT INTO bureau.oauth_clients (
        client_id, client_name, client_uri, redirect_uris, 
        registration, vendor, verified
      ) VALUES ($1, $2, $3, $4, 'dcr', $5, false)`,
      [clientId, client_name, client_uri || null, redirect_uris, vendor]
    );
    
    // Return RFC 7591 response
    return NextResponse.json({
      client_id: clientId,
      client_name,
      client_uri: client_uri || undefined,
      redirect_uris,
      grant_types: grant_types || ['authorization_code', 'refresh_token'],
      response_types: response_types || ['code'],
      token_endpoint_auth_method: 'none',
      registration_access_token: undefined, // We don't support client config updates
      registration_client_uri: undefined,
      client_id_issued_at: Math.floor(Date.now() / 1000)
    });
    
  } catch (error) {
    console.error('DCR error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to register client' },
      { status: 500 }
    );
  }
}
