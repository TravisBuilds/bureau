import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { handlePostLogin, getDefaultWorkspaceId } from '@/lib/post-login';

export async function POST(request: NextRequest) {
  try {
    // Validate origin (same-origin only, reject missing)
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    
    if (!origin) {
      return NextResponse.json(
        { error: 'Missing origin header' },
        { status: 403 }
      );
    }
    
    const originHost = new URL(origin).host;
    const expectedHost = siteUrl ? new URL(siteUrl).host : host;
    
    if (originHost !== expectedHost && originHost !== host) {
      return NextResponse.json(
        { error: 'Invalid origin' },
        { status: 403 }
      );
    }

    // Parse request body
    const { accessToken, refreshToken, next } = await request.json();
    
    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { error: 'Missing access_token or refresh_token' },
        { status: 400 }
      );
    }

    // Create Supabase client with cookie access
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      );
    }

    const cookieStore = await cookies();
    const isProduction = process.env.NODE_ENV === 'production';
    
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ 
              name, 
              value, 
              ...options,
              secure: isProduction,
              sameSite: 'lax',
            });
          } catch (error) {
            // Route handler can set cookies
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ 
              name, 
              value: '', 
              ...options,
              secure: isProduction,
              sameSite: 'lax',
            });
          } catch (error) {
            // Route handler can remove cookies
          }
        },
      },
    });

    // Set the session
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError || !sessionData.session) {
      console.error('Error setting session:', sessionError);
      return NextResponse.json(
        { error: 'Failed to set session' },
        { status: 401 }
      );
    }

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Error getting user:', userError);
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

    const userId = user.id;
    const email = user.email!;

    // Run post-login logic (claim invite, bootstrap workspace)
    const result = await handlePostLogin(userId, email, next);

    return NextResponse.json({ redirect: result.redirect });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVITE_REQUIRED') {
      return NextResponse.json({
        redirect: getDefaultWorkspaceId() ? '/auth/signin?error=workspace-error' : '/auth/signup?error=invite-required'
      });
    }
    
    console.error('Error in session callback:', error);
    return NextResponse.json(
      { error: 'Failed to complete sign in' },
      { status: 500 }
    );
  }
}
