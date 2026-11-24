import { NextRequest, NextResponse } from 'next/server';
import { lookupDeviceCode } from '@/lib/oauth-grants';
import { requireAuth } from '@/lib/auth-helpers';

/**
 * GET /api/oauth/device/lookup?user_code=BURE-XY3K
 * Lookup device code for approval page
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    
    const userCode = request.nextUrl.searchParams.get('user_code');
    if (!userCode) {
      return NextResponse.json({ error: 'Missing user_code' }, { status: 400 });
    }

    const deviceInfo = await lookupDeviceCode(userCode.toUpperCase());
    
    if (!deviceInfo) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 404 });
    }

    return NextResponse.json({
      clientName: deviceInfo.clientName,
      scopes: deviceInfo.scopes,
      status: deviceInfo.status,
      expiresAt: deviceInfo.expiresAt
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Device lookup error:', error);
    return NextResponse.json({ error: 'Failed to lookup code' }, { status: 500 });
  }
}
