/**
 * Sign-in "next" handling: real middleware, real send-magic-link route and real
 * handlePostLogin, with only next/headers, the DB and the Supabase adapter mocked.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';

const jar = new Map<string, string>();
const deleted: string[] = [];
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: any, v?: any) => {
      if (typeof n === 'object') jar.set(n.name, n.value);
      else jar.set(n, v);
    },
    delete: (n: string) => { deleted.push(n); jar.delete(n); },
  }),
}));

const sent: Array<{ email: string; redirectTo: string }> = [];
vi.mock('@/lib/auth-adapter', () => {
  class SupabaseAuthAdapter {
    async sendMagicLink(email: string, redirectTo: string) { sent.push({ email, redirectTo }); return { success: true }; }
  }
  class LocalAuthAdapter {}
  return { SupabaseAuthAdapter, LocalAuthAdapter, getAuthAdapter: () => new SupabaseAuthAdapter() };
});

vi.mock('@/lib/db', () => ({
  query: vi.fn(async () => []),
  execute: vi.fn(async () => undefined),
  // workspace lookup -> existing workspace; onboarding lookup -> not new
  withUser: vi.fn(async (_u: string, _e: string, fn: any) =>
    fn({ query: async (sql: string) => (/onboarding_progress/.test(sql) ? { rows: [] } : { rows: [{ id: 'ws-1' }] }) })),
}));

import { safeNext, NEXT_COOKIE } from '@/lib/safe-next';
import { middleware } from '@/middleware';
import { POST as sendMagicLink } from '@/app/api/auth/send-magic-link/route';
import { handlePostLogin } from '@/lib/post-login';

const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, site: process.env.NEXT_PUBLIC_SITE_URL };
beforeEach(() => {
  jar.clear(); deleted.length = 0; sent.length = 0;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://bureau-krustbuild.vercel.app';
});
afterAll(() => {
  if (saved.url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
  if (saved.key !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
  if (saved.site !== undefined) process.env.NEXT_PUBLIC_SITE_URL = saved.site; else delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe('safeNext', () => {
  it.each([
    ['/connect/device?user_code=BURE-AB12', '/connect/device?user_code=BURE-AB12'],
    ['/top-floor', '/top-floor'],
    ['/settings/team#invites', '/settings/team#invites'],
  ])('accepts %s', (inp, out) => expect(safeNext(inp)).toBe(out));

  it.each([
    '//evil.com', '//evil.com/path', '/\\evil.com', '\\\\evil.com', '/\\/evil.com',
    'https://evil.com', 'http://bureau-krustbuild.vercel.app.evil.com/', 'javascript:alert(1)',
    'evil.com', '', '   ', '/%0d%0aSet-Cookie:x', '/\tevil', '/\nevil', '/auth/callback?next=//evil',
  ])('rejects %j', (inp) => expect(safeNext(inp)).toBeNull());

  it('rejects non-strings', () => {
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext(['/x'])).toBeNull();
  });
});

describe('middleware (real)', () => {
  it('keeps path + query in next, URL-encoded', async () => {
    const res = await middleware(new NextRequest('https://bureau-krustbuild.vercel.app/connect/device?user_code=BURE-AB12'));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe('https://bureau-krustbuild.vercel.app');
    expect(loc.pathname).toBe('/auth/signin');
    expect(loc.search).toBe('?next=%2Fconnect%2Fdevice%3Fuser_code%3DBURE-AB12');
    expect(loc.searchParams.get('next')).toBe('/connect/device?user_code=BURE-AB12');
  });

  it('a //evil path ends up in next but is rejected by safeNext', async () => {
    const res = await middleware(new NextRequest('https://bureau-krustbuild.vercel.app//evil.com/x'));
    const next = new URL(res.headers.get('location')!).searchParams.get('next');
    expect(next?.startsWith('//')).toBe(true);
    expect(safeNext(next)).toBeNull();
  });

  it('API routes still get 401 JSON', async () => {
    const res = await middleware(new NextRequest('https://bureau-krustbuild.vercel.app/api/streams'));
    expect(res.status).toBe(401);
  });
});

function post(body: unknown) {
  return new NextRequest('https://bureau-krustbuild.vercel.app/api/auth/send-magic-link', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', origin: 'https://bureau-krustbuild.vercel.app' },
  });
}

describe('send-magic-link (real route)', () => {
  it('keeps emailRedirectTo exactly /auth/callback (allowlist unchanged) and stores next in a cookie', async () => {
    const res = await sendMagicLink(post({ email: 'a@example.com', next: '/connect/device?user_code=BURE-AB12' }));
    expect(res.status).toBe(200);
    expect(sent).toEqual([{ email: 'a@example.com', redirectTo: 'https://bureau-krustbuild.vercel.app/auth/callback' }]);
    expect(jar.get(NEXT_COOKIE)).toBe('/connect/device?user_code=BURE-AB12');
  });

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com'])('ignores unsafe next %j', async (n) => {
    await sendMagicLink(post({ email: 'a@example.com', next: n }));
    expect(sent[0].redirectTo).toBe('https://bureau-krustbuild.vercel.app/auth/callback');
    expect(jar.has(NEXT_COOKIE)).toBe(false);
  });

  it('no next -> no cookie', async () => {
    await sendMagicLink(post({ email: 'a@example.com' }));
    expect(jar.has(NEXT_COOKIE)).toBe(false);
  });
});

describe('handlePostLogin (real) redirect', () => {
  const U = '00000000-0000-0000-0000-000000000001';
  it('round-trip: cookie next from sign-in survives the magic link (callback passes next="/")', async () => {
    jar.set(NEXT_COOKIE, '/connect/device?user_code=BURE-AB12');
    const r = await handlePostLogin(U, 'a@example.com', '/');
    expect(r.redirect).toBe('/connect/device?user_code=BURE-AB12');
    expect(deleted).toContain(NEXT_COOKIE);
  });

  it('explicit safe next wins', async () => {
    expect((await handlePostLogin(U, 'a@example.com', '/questions')).redirect).toBe('/questions');
  });

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)'])('unsafe next %j -> /top-floor', async (n) => {
    expect((await handlePostLogin(U, 'a@example.com', n)).redirect).toBe('/top-floor');
  });

  it('tampered cookie is ignored', async () => {
    jar.set(NEXT_COOKIE, '//evil.com');
    expect((await handlePostLogin(U, 'a@example.com', '/')).redirect).toBe('/top-floor');
  });

  it('no next -> /top-floor', async () => {
    expect((await handlePostLogin(U, 'a@example.com')).redirect).toBe('/top-floor');
  });
});
