import { NextRequest, NextResponse } from 'next/server';
import { revokeToken } from '@/lib/oauth-server';

/**
 * POST /api/oauth/revoke - RFC 7009 Token Revocation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    const token = body.get('token')?.toString();
    const tokenTypeHint = body.get('token_type_hint')?.toString();
    
    if (!token) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing token' },
        { status: 400 }
      );
    }
    
    await revokeToken(token, tokenTypeHint);
    
    // RFC 7009: always return 200 OK (even if token was invalid)
    return new NextResponse(null, { status: 200 });
    
  } catch (error) {
    console.error('OAuth revoke error:', error);
    // Still return 200 per spec
    return new NextResponse(null, { status: 200 });
  }
}
