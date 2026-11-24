import { NextRequest, NextResponse } from 'next/server';
import { getAuthAdapter, LocalAuthAdapter, SupabaseAuthAdapter } from '@/lib/auth-adapter';
import { query, execute } from '@/lib/db';
import { cookies } from 'next/headers';
import { safeNext, NEXT_COOKIE } from '@/lib/safe-next';

export async function POST(request: NextRequest) {
  try {
    const { email, inviteCode, next } = await request.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }
    
    // Validate invite code if provided (required for new signups)
    if (inviteCode) {
      const invite = await query<{ 
        code: string; 
        claimed_by: string | null;
        expires_at: Date;
      }>(
        `SELECT code, claimed_by, expires_at 
         FROM bureau.pilot_invites
         WHERE code = $1 AND expires_at > NOW()`,
        [inviteCode]
      );
      
      if (invite.length === 0) {
        return NextResponse.json({ 
          error: 'Invalid or expired invite code' 
        }, { status: 400 });
      }
      
      const inviteRecord = invite[0];
      
      // Check if already claimed by someone else
      if (inviteRecord.claimed_by) {
        const existingUser = await query<{ email: string }>(
          'SELECT email FROM auth.users WHERE id = $1::uuid',
          [inviteRecord.claimed_by]
        );
        
        if (existingUser.length > 0 && existingUser[0].email !== email) {
          return NextResponse.json({ 
            error: 'This invite code has already been claimed' 
          }, { status: 400 });
        }
      }
      
      // Store invite code in short-lived cookie for callback to claim
      if (inviteCode) {
        const cookieStore = await cookies();
        cookieStore.set('bureau_invite', inviteCode, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 600, // 10 minutes
        });
      }
    }
    
    // Remember where to go after sign-in (e.g. /connect/device?user_code=...).
    // Kept in a short-lived cookie instead of the emailRedirectTo query string, so the
    // redirect URL Supabase checks against its allowlist stays exactly /auth/callback.
    const safe = safeNext(next);
    if (safe) {
      const cookieStore = await cookies();
      cookieStore.set(NEXT_COOKIE, safe, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
      });
    }

    // Build redirect URL from request origin or env vars
    const baseUrl = getBaseUrl(request);
    const redirectTo = `${baseUrl}/auth/callback`;
    
    const auth = getAuthAdapter();
    
    // Send magic link
    if (auth instanceof SupabaseAuthAdapter) {
      const result = await auth.sendMagicLink(email, redirectTo);
      
      if (!result.success) {
        return NextResponse.json({ 
          error: 'Failed to send magic link' 
        }, { status: 500 });
      }
      
      // Never return the magic link in production with Supabase
      return NextResponse.json({ success: true });
    } else {
      // Local adapter - use verify route instead of callback
      const verifyUrl = `${baseUrl}/auth/verify`;
      const result = await auth.sendMagicLink(email, baseUrl);
      
      if (!result.success) {
        return NextResponse.json({ 
          error: 'Failed to send magic link' 
        }, { status: 500 });
      }
      
      // In development, log the magic link
      if (process.env.NODE_ENV === 'development' && result.magicLink) {
        console.log('\n🔐 MAGIC LINK (Local Dev)');
        console.log(`Link: ${result.magicLink}\n`);
      }
      
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error('Error sending magic link:', error);
    return NextResponse.json({ 
      error: 'Failed to send magic link' 
    }, { status: 500 });
  }
}

/**
 * Get base URL for redirect links
 * Priority: NEXT_PUBLIC_SITE_URL > VERCEL_URL > request origin
 */
function getBaseUrl(request: NextRequest): string {
  // Use configured site URL if available
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  
  // Use Vercel URL in production
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // Fall back to request origin
  const origin = request.headers.get('origin') || request.headers.get('host');
  if (origin) {
    return origin.startsWith('http') ? origin : `https://${origin}`;
  }
  
  // Last resort: localhost
  return 'http://localhost:3000';
}
