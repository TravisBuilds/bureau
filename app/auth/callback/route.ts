import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { query, execute } from '@/lib/db';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const code = requestUrl.searchParams.get('code'); // PKCE flow
  const next = requestUrl.searchParams.get('next') || '/';

  // If no query params, return HTML to handle implicit flow (hash fragment)
  if (!token_hash && !type && !code) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signing in...</title>
  <style>
    body { font-family: system-ui; max-width: 500px; margin: 100px auto; padding: 20px; text-align: center; }
    .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #7c3aed; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .error { color: #dc2626; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>Completing sign in...</p>
  <div id="error" class="error" style="display:none;"></div>
  <script>
    (function() {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const error = params.get('error');
      const errorDesc = params.get('error_description');
      const next = new URLSearchParams(window.location.search).get('next') || '/';
      
      if (error) {
        document.getElementById('error').innerHTML = 
          '<p><strong>Sign in failed:</strong> ' + (errorDesc || error) + '</p>' +
          '<p><a href="/auth/signin">Try again</a></p>';
        document.getElementById('error').style.display = 'block';
        document.querySelector('.spinner').style.display = 'none';
        document.querySelector('p').style.display = 'none';
        return;
      }
      
      if (accessToken && refreshToken) {
        fetch('/auth/callback/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ accessToken, refreshToken, next })
        })
        .then(res => res.json())
        .then(data => {
          if (data.redirect) {
            window.location.replace(data.redirect);
          } else {
            throw new Error(data.error || 'Unknown error');
          }
        })
        .catch(err => {
          document.getElementById('error').innerHTML = 
            '<p><strong>Error:</strong> ' + err.message + '</p>' +
            '<p><a href="/auth/signin">Try again</a></p>';
          document.getElementById('error').style.display = 'block';
          document.querySelector('.spinner').style.display = 'none';
          document.querySelector('p').style.display = 'none';
        });
      } else {
        window.location.replace('/auth/signin?error=missing-params');
      }
    })();
  </script>
</body>
</html>`;
    
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Check if this is a Supabase auth callback (magic link or PKCE)
  if ((token_hash && type) || code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration');
      return NextResponse.redirect(
        new URL('/auth/signin?error=config-error', request.url)
      );
    }

    const cookieStore = await cookies();

    // Create Supabase client with cookie handling (manages refresh tokens)
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Route handler can set cookies
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Route handler can remove cookies
          }
        },
      },
    });

    // Verify the auth code (OTP or PKCE)
    let authData;
    
    if (token_hash && type) {
      // Magic link (OTP) flow
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash,
        type: type as any,
      });
      
      if (error) {
        console.error('Supabase OTP verification error:', error);
        return NextResponse.redirect(
          new URL('/auth/signin?error=invalid-token', request.url)
        );
      }
      
      authData = data;
    } else if (code) {
      // PKCE flow
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('Supabase code exchange error:', error);
        return NextResponse.redirect(
          new URL('/auth/signin?error=invalid-token', request.url)
        );
      }
      
      authData = data;
    } else {
      return NextResponse.redirect(
        new URL('/auth/signin?error=missing-params', request.url)
      );
    }

    if (!authData.user || !authData.session) {
      return NextResponse.redirect(
        new URL('/auth/signin?error=invalid-token', request.url)
      );
    }

    const userId = authData.user.id;
    const email = authData.user.email!;

    try {
      // Use shared post-login helper
      const { handlePostLogin } = await import('@/lib/post-login');
      const result = await handlePostLogin(userId, email, next);
      
      return NextResponse.redirect(new URL(result.redirect, request.url));
    } catch (error) {
      if (error instanceof Error && error.message === 'INVITE_REQUIRED') {
        const { getDefaultWorkspaceId } = await import('@/lib/post-login');
        const dest = getDefaultWorkspaceId() ? '/auth/signin?error=workspace-error' : '/auth/signup?error=invite-required';
        return NextResponse.redirect(
          new URL(dest, request.url)
        );
      }
      console.error('Error checking/creating workspace:', error);
      return NextResponse.redirect(
        new URL('/auth/signin?error=workspace-error', request.url)
      );
    }
  }

  // Not a Supabase callback, redirect to signin
  return NextResponse.redirect(new URL('/auth/signin', request.url));
}
