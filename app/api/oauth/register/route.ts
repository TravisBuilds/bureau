import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

import { ALLOWED_SCOPES, DEFAULT_SCOPES } from '@/lib/oauth-scopes';

const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 2048;
// Cursor (and Grok Bot, which uses Cursor's MCP client) uses this private-use callback (RFC 8252)
const CURSOR_CALLBACK_PREFIX = 'cursor://anysphere.cursor-mcp/';

function hostIs(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Vendor from the parsed hostname (never a substring of the whole URI). */
function inferVendor(uri: string): string {
  if (uri.startsWith(CURSOR_CALLBACK_PREFIX)) return 'cursor';
  let host = '';
  try { host = new URL(uri).hostname.toLowerCase(); } catch { return 'other'; }
  if (hostIs(host, 'chatgpt.com') || hostIs(host, 'openai.com')) return 'openai';
  if (hostIs(host, 'cursor.com') || hostIs(host, 'cursor.sh')) return 'cursor';
  if (hostIs(host, 'grok.com') || hostIs(host, 'x.ai')) return 'grokbot';
  return 'other'; // includes claude.ai (no 'anthropic' value in the vendor CHECK; clones map it via redirect host)
}

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

    if (redirect_uris.length > MAX_REDIRECT_URIS ||
        redirect_uris.some((u: unknown) => typeof u !== 'string' || u.length > MAX_URI_LENGTH)) {
      return NextResponse.json(
        { error: 'invalid_redirect_uri', error_description: `At most ${MAX_REDIRECT_URIS} redirect_uris of up to ${MAX_URI_LENGTH} characters` },
        { status: 400 }
      );
    }
    if (client_name !== undefined && (typeof client_name !== 'string' || client_name.length > 200)) {
      return NextResponse.json({ error: 'invalid_client_metadata', error_description: 'client_name must be a string of at most 200 characters' }, { status: 400 });
    }
    if (client_uri !== undefined && client_uri !== null) {
      let ok = false;
      try { ok = typeof client_uri === 'string' && client_uri.length <= MAX_URI_LENGTH && new URL(client_uri).protocol === 'https:'; } catch { ok = false; }
      if (!ok) return NextResponse.json({ error: 'invalid_client_metadata', error_description: 'client_uri must be an https URL' }, { status: 400 });
    }

    // Validate scopes against allowlist
    if (scope) {
      if (typeof scope !== 'string') {
        return NextResponse.json({ error: 'invalid_scope', error_description: 'scope must be a string' }, { status: 400 });
      }
      const requestedScopes = scope.split(' ').filter(Boolean);
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
        const isHttps = url.protocol === 'https:' && !url.username && !url.password && !url.hash;
        const isLoopback = url.protocol === 'http:' &&
          (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');
        const isCursorScheme = url.protocol === 'cursor:' && uri.startsWith(CURSOR_CALLBACK_PREFIX);
        
        if (!isHttps && !isLoopback && !isCursorScheme) {
          return NextResponse.json(
            { error: 'invalid_redirect_uri', error_description: `Redirect URI must be https, http loopback, or cursor://anysphere.cursor-mcp/: ${uri}` },
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
    
    // Infer vendor from the first redirect_uri's hostname
    const vendor = inferVendor(redirect_uris[0]);
    
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
      scope: scope || DEFAULT_SCOPES.join(' ')
    }, { status: 201 });
    
  } catch (error) {
    console.error('DCR error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to register client' },
      { status: 500 }
    );
  }
}
