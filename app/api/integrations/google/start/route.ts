import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { APP_BASE_URL } from '@/lib/ground-truth/integrations';
import { DRIVE_ACTIVITY_SCOPE, GOOGLE_AUTH_URL } from '@/lib/ground-truth/adapters/google-drive';

/** GET: start connecting YOUR Google Drive (read-only activity scope; no file contents). */
export async function GET() {
  try {
    await requireWorkspaceUser();
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.json({ error: 'Google Drive capture is not configured' }, { status: 503 });
    const state = randomBytes(24).toString('hex');
    const u = new URL(GOOGLE_AUTH_URL);
    u.searchParams.set('client_id', clientId);
    u.searchParams.set('redirect_uri', `${APP_BASE_URL()}/api/integrations/google/callback`);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', DRIVE_ACTIVITY_SCOPE);
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('prompt', 'consent');
    u.searchParams.set('include_granted_scopes', 'false');
    u.searchParams.set('state', state);
    const res = NextResponse.redirect(u.toString());
    res.cookies.set('bureau_gdrive_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/integrations/google', maxAge: 600 });
    return res;
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'Failed to start Google connection' }, { status: 500 });
  }
}
