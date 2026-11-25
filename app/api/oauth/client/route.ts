import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { resolveClient } from '@/lib/oauth-cimd';
import { validateRedirectUri } from '@/lib/oauth-server';

/**
 * GET /api/oauth/client?client_id=...
 * Returns public client info for consent screen
 * Tries CIMD first, falls back to DB.
 * With &redirect_uri=..., also returns redirect_uri_allowed so the consent page never
 * redirects (even on Cancel) to a URI the client did not register.
 */
export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get('client_id');
    
    if (!clientId) {
      return NextResponse.json({ error: 'Missing client_id' }, { status: 400 });
    }
    
    // Try CIMD resolution first (if client_id is HTTPS URL)
    const cimdClient = await resolveClient(clientId);
    const redirectUri = request.nextUrl.searchParams.get('redirect_uri');
    if (cimdClient) {
      return NextResponse.json({
        ...cimdClient,
        ...(redirectUri !== null ? { redirect_uri_allowed: validateRedirectUri(redirectUri, cimdClient.redirect_uris || []) } : {}),
      });
    }
    
    // Fall back to DB lookup (static or DCR clients)
    const rows = await query<{
      client_id: string;
      client_name: string;
      client_uri: string | null;
      redirect_uris: string[];
      verified: boolean;
      vendor: string | null;
      registration: string;
    }>(
      `SELECT client_id, client_name, client_uri, redirect_uris, verified, vendor, registration
       FROM bureau.oauth_clients
       WHERE client_id = $1`,
      [clientId]
    );
    
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Unknown client' }, { status: 404 });
    }
    
    return NextResponse.json({
      ...rows[0],
      ...(redirectUri !== null ? { redirect_uri_allowed: validateRedirectUri(redirectUri, rows[0].redirect_uris) } : {}),
    });
    
  } catch (error) {
    console.error('OAuth client lookup error:', error);
    return NextResponse.json({ error: 'Failed to lookup client' }, { status: 500 });
  }
}
