import { NextRequest, NextResponse } from 'next/server';
import { LocalAuthAdapter } from '@/lib/auth-adapter';
import { query, execute, withUser } from '@/lib/db';
import { cookies } from 'next/headers';

const auth = new LocalAuthAdapter();

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  
  if (!token) {
    return NextResponse.redirect(new URL('/auth/signin?error=missing-token', request.url));
  }
  
  // Verify token
  const session = await auth.verifyToken(token);
  
  if (!session) {
    return NextResponse.redirect(new URL('/auth/signin?error=invalid-token', request.url));
  }
  
  // Set session cookie
  const cookieStore = await cookies();
  cookieStore.set('bureau_session', session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: session.expiresAt,
  });
  
  const userId = session.user.id;
  const email = session.user.email;
  
  try {
    // Use shared post-login helper
    const { handlePostLogin } = await import('@/lib/post-login');
    const result = await handlePostLogin(userId, email);
    
    return NextResponse.redirect(new URL(result.redirect, request.url));
  } catch (error) {
    if (error instanceof Error && error.message === 'INVITE_REQUIRED') {
      return NextResponse.redirect(new URL('/auth/signup?error=invite-required', request.url));
    }
    console.error('Error checking/creating workspace:', error);
    return NextResponse.redirect(new URL('/auth/signin?error=workspace-error', request.url));
  }
}
