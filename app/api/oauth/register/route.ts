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
    
    // Validate redirect host allowlist (for pilot phase)
    const allowedHosts = [
      'chatgpt.com',
      'chat.openai.com',
      'www.cursor.com',
      'localhost',
      '127.0.0.1'
    ];
    
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
