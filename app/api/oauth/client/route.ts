import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { resolveClient } from '@/lib/oauth-cimd';

/**
 * GET /api/oauth/client?client_id=...
 * Returns public client info for consent screen
 * Tries CIMD first, falls back to DB
 */
export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get('client_id');
    
    if (!clientId) {
      return NextResponse.json({ error: 'Missing client_id' }, { status: 400 });
    }
    
    // Try CIMD resolution first (if client_id is HTTPS URL)
    const cimdClient = await resolveClient(clientId);
    if (cimdClient) {
      return NextResponse.json(cimdClient);
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
    
    return NextResponse.json(rows[0]);
    
  } catch (error) {
    console.error('OAuth client lookup error:', error);
    return NextResponse.json({ error: 'Failed to lookup client' }, { status: 500 });
  }
}
