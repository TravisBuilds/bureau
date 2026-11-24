import { NextRequest, NextResponse } from 'next/server';
import { startDeviceFlow } from '@/lib/oauth-server';

// Scope allowlist
const ALLOWED_SCOPES = ['ingest:write', 'clone:write', 'questions:read', 'questions:write', 'team:read'];

/**
 * POST /api/oauth/device - RFC 8628 Device Authorization Grant
 * For scripts/CLIs without a browser
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type');
    let clientName = 'Script';
    let scope = 'ingest:write';
    
    if (contentType?.includes('application/json')) {
      const body = await request.json();
      clientName = body.client_name || body.clientName || 'Script';
      scope = body.scope || 'ingest:write';
    } else {
      const body = await request.formData();
      clientName = body.get('client_name')?.toString() || 'Script';
      scope = body.get('scope')?.toString() || 'ingest:write';
    }
    
    const scopes = scope.split(' ').filter(Boolean);
    
    // Validate scopes against allowlist
    const invalidScopes = scopes.filter((s: string) => !ALLOWED_SCOPES.includes(s));
    if (invalidScopes.length > 0) {
      return NextResponse.json({ 
        error: 'invalid_scope',
        error_description: `Invalid scopes: ${invalidScopes.join(', ')}`
      }, { status: 400 });
    }
    
    const result = await startDeviceFlow(clientName, scopes);
    
    return NextResponse.json({
      device_code: result.deviceCode,
      user_code: result.userCode,
      verification_uri: result.verificationUri,
      verification_uri_complete: result.verificationUriComplete,
      expires_in: result.expiresIn,
      interval: result.interval
    });
  } catch (error) {
    console.error('Device flow error:', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
