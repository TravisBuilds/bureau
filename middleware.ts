import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths (no auth required)
  // Exact match for root, prefix match for auth and ingest
  const isPublic = 
    pathname === '/' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/auth/') ||  // send-magic-link, validate-invite
    pathname.startsWith('/api/ingest') ||
    pathname.startsWith('/api/oauth/') ||  // OAuth token, revoke, client lookup
    pathname.startsWith('/api/mcp') ||  // MCP server (legacy)
    pathname.startsWith('/mcp') ||  // MCP server (canonical)
    pathname.startsWith('/api/slack/') ||  // Slack events webhook
    pathname.startsWith('/api/cron/') ||  // Vercel Cron (route checks CRON_SECRET itself)
    pathname.startsWith('/api/webhooks/') ||  // Vendor webhooks (route verifies each delivery's signature)
    pathname.startsWith('/.well-known/');

  if (isPublic) {
    return NextResponse.next();
  }

  // Check authentication
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let user = null;
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  if (supabaseUrl && supabaseKey) {
    // Production: check Supabase session
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    });

    const { data: { user: authUser } } = await supabase.auth.getUser();
    user = authUser;
  } else {
    // Local dev: check bureau_session cookie
    const session = request.cookies.get('bureau_session');
    if (session?.value) {
      try {
        user = JSON.parse(session.value);
      } catch {}
    }
  }

  // Require auth for protected paths
  if (!user) {
    // API routes get 401 JSON, pages get redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const signInUrl = new URL('/auth/signin', request.url);
    // Preserve full path + query string, safely (same-origin only, no open redirect)
    const nextPath = pathname + (request.nextUrl.search || '');
    signInUrl.searchParams.set('next', nextPath);
    return NextResponse.redirect(signInUrl);
  }

  // Admin-only paths
  if (pathname.startsWith('/admin')) {
    const userEmail = typeof user === 'object' && user !== null && 'email' in user 
      ? (user as any).email 
      : '';
    
    // Default deny if ADMIN_EMAILS not set or user not in list
    if (!ADMIN_EMAILS.length || !ADMIN_EMAILS.includes(userEmail.toLowerCase().trim())) {
      return NextResponse.redirect(new URL('/top-floor', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
