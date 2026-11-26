import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { SLACK_BOT_SCOPES, slackClientId, slackClientSecret, slackInstallConfigured, slackRedirectUri } from '@/lib/slack/config';
import { signState, STATE_COOKIE, STATE_TTL_SECONDS } from '@/lib/slack/state';
import { disconnectWorkspace } from '@/lib/slack/install';

/**
 * GET  /api/slack/install  -> "Add to Slack" (workspace owners only): redirect to Slack's OAuth v2
 *                             authorize page with a signed, expiring, browser-bound state.
 * DELETE /api/slack/install -> Disconnect (owners only): auth.revoke + destroy the stored token.
 * /api/slack/* is public in middleware (for Slack's webhooks), so both check the session here.
 */
export async function GET(request: NextRequest) {
  let user;
  try { user = await requireWorkspaceUser(); } catch (e) { if (e instanceof Response) return e; throw e; }
  const settings = new URL('/settings/team', request.nextUrl.origin);
  if (user.role !== 'owner') {
    settings.searchParams.set('slack', 'owner_only');
    return NextResponse.redirect(settings, 303);
  }
  if (!slackInstallConfigured()) {
    settings.searchParams.set('slack', 'not_configured');
    return NextResponse.redirect(settings, 303);
  }
  const { state, nonce } = signState(slackClientSecret(), { workspaceId: user.workspaceId, userId: user.id });
  const authorize = new URL('https://slack.com/oauth/v2/authorize');
  authorize.searchParams.set('client_id', slackClientId());
  authorize.searchParams.set('scope', SLACK_BOT_SCOPES.join(','));
  authorize.searchParams.set('redirect_uri', slackRedirectUri());
  authorize.searchParams.set('state', state);
  const res = NextResponse.redirect(authorize, 303);
  res.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax',
    path: '/api/slack/oauth', maxAge: STATE_TTL_SECONDS,
  });
  res.headers.set('cache-control', 'no-store');
  return res;
}

export async function DELETE() {
  let user;
  try { user = await requireWorkspaceUser(); } catch (e) { if (e instanceof Response) return e; throw e; }
  if (user.role !== 'owner') return NextResponse.json({ error: 'Only workspace owners can disconnect Slack' }, { status: 403 });
  const done = await disconnectWorkspace(user.id, user.email, user.workspaceId);
  return NextResponse.json({ ok: true, disconnected: done });
}
