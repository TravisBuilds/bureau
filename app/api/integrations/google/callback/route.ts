import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { withUser } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { APP_BASE_URL, createIntegration } from '@/lib/ground-truth/integrations';
import { GOOGLE_TOKEN_URL } from '@/lib/ground-truth/adapters/google-drive';

/** GET: Google OAuth redirect. Stores only the encrypted refresh token, owned by the signed-in person. */
export async function GET(request: NextRequest) {
  const back = (q: string) => NextResponse.redirect(`${APP_BASE_URL()}/my-activity?drive=${q}`);
  try {
    const user = await requireWorkspaceUser();
    const sp = request.nextUrl.searchParams;
    const state = sp.get('state') || '';
    const cookie = request.cookies.get('bureau_gdrive_state')?.value || '';
    if (!state || state.length !== cookie.length || !timingSafeEqual(Buffer.from(state), Buffer.from(cookie))) return back('state_mismatch');
    const code = sp.get('code');
    if (!code) return back('cancelled');
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code,
        client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${APP_BASE_URL()}/api/integrations/google/callback`,
      }).toString(),
    });
    if (!res.ok) return back('token_error');
    const tok = (await res.json()) as { refresh_token?: string };
    if (!tok?.refresh_token) return back('no_refresh_token');
    await withUser(user.id, user.email, (c) => createIntegration(c, {
      workspaceId: user.workspaceId, userId: user.id, provider: 'google_drive', label: 'My Google Drive', credential: String(tok.refresh_token),
    }));
    const out = back('connected');
    out.cookies.delete('bureau_gdrive_state');
    return out;
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Google Drive connect failed:', error instanceof Error ? error.message : 'error');
    return back('error');
  }
}
