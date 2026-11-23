import { NextRequest, NextResponse } from 'next/server';
import { startDeviceFlow } from '@/lib/oauth-server';

/**
 * POST /api/oauth/device - RFC 8628 Device Authorization Grant
 * For scripts/CLIs without a browser
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    const clientName = body.get('client_name')?.toString() || 'Script';
    const scope = body.get('scope')?.toString() || 'ingest:write';
    
    const scopes = scope.split(' ').filter(Boolean);
    
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
    console.error('Device authorization error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to initiate device flow' },
      { status: 500 }
    );
  }
}
