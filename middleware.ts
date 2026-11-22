import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').filter(Boolean);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths (no auth required)
  const publicPaths = [
    '/',
    '/auth/signin',
    '/auth/signup',
    '/auth/callback',
    '/auth/verify',
    '/api/ingest', // Token-based auth
  ];

  // Check if path is public
  if (publicPaths.some(path => pathname === path || pathname.startsWith(path + '/'))) {
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
    const signInUrl = new URL('/auth/signin', request.url);
    signInUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Admin-only paths
  if (pathname.startsWith('/admin')) {
    const userEmail = typeof user === 'object' && user !== null && 'email' in user 
      ? (user as any).email 
      : '';
    
    if (!ADMIN_EMAILS.length || !ADMIN_EMAILS.includes(userEmail)) {
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
