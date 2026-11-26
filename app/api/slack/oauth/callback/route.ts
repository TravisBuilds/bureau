import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { withUser } from '@/lib/db';
import { slackApi } from '@/lib/slack/api';
import { slackClientId, slackClientSecret, slackInstallConfigured, slackRedirectUri } from '@/lib/slack/config';
import { verifyState, STATE_COOKIE } from '@/lib/slack/state';
import { encryptBotToken } from '@/lib/slack/token-crypto';
import { syncSlackMembers } from '@/lib/slack/store';
import { runInBackground } from '@/lib/slack/background';

/**
 * GET /api/slack/oauth/callback: Slack redirects here after the owner approves the install.
 * Validates state (signature, expiry, browser nonce, same signed-in owner), exchanges the code at
 * oauth.v2.access with the same redirect_uri, encrypts the bot token and stores it. The token is
 * never put in a URL, a response body or a log. Ends with a redirect to Settings -> Team.
 */
export async function GET(request: NextRequest) {
  const done = (flag: string) => {
    const u = new URL('/settings/team', request.nextUrl.origin);
    u.searchParams.set('slack', flag);
    const res = NextResponse.redirect(u, 303);
    res.cookies.set(STATE_COOKIE, '', { path: '/api/slack/oauth', maxAge: 0 });
    res.headers.set('cache-control', 'no-store');
    return res;
  };

  const params = request.nextUrl.searchParams;
  if (params.get('error')) return done('denied');
  if (!slackInstallConfigured()) return done('not_configured');

  const check = verifyState(slackClientSecret(), params.get('state'), request.cookies.get(STATE_COOKIE)?.value);
  if (!check.ok) return done('invalid_state');

  const user = await getAuthUser().catch(() => null);
  if (!user || user.id !== check.payload.u || user.workspaceId !== check.payload.w) return done('invalid_state');
  if (user.role !== 'owner') return done('owner_only');

  const code = params.get('code') || '';
  if (!code || code.length > 500) return done('error');

  let res;
  try {
    res = await slackApi('oauth.v2.access', {
      form: { code, redirect_uri: slackRedirectUri() },
      basicAuth: { user: slackClientId(), pass: slackClientSecret() },
    });
  } catch {
    return done('error');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Slack JSON
  const r = res as any;
  const token = typeof r.access_token === 'string' ? r.access_token : '';
  const teamId = typeof r.team?.id === 'string' ? r.team.id : '';
  if (!r.ok || r.token_type !== 'bot' || !/^xoxb-/.test(token) || !/^T[A-Z0-9]+$/.test(teamId) || r.is_enterprise_install === true) {
    return done('error');
  }
  const botUserId = typeof r.bot_user_id === 'string' && /^[UWB][A-Z0-9]+$/.test(r.bot_user_id) ? r.bot_user_id : null;

  let ciphertext: string;
  try { ciphertext = encryptBotToken(token, user.workspaceId, teamId); } catch { return done('not_configured'); }

  const outcome = await withUser(user.id, user.email, async (client) => (await client.query(
    'SELECT bureau.slack_store_installation($1, $2, $3, $4, $5, $6, $7, $8) AS outcome',
    [user.workspaceId, teamId, typeof r.team?.name === 'string' ? r.team.name.slice(0, 200) : null, botUserId,
     typeof r.app_id === 'string' ? r.app_id.slice(0, 40) : null, typeof r.scope === 'string' ? r.scope.slice(0, 1000) : null,
     typeof r.authed_user?.id === 'string' ? r.authed_user.id.slice(0, 40) : null, ciphertext]
  )).rows[0]?.outcome as string);

  if (outcome !== 'ok') return done(outcome === 'team_taken' || outcome === 'workspace_has_other_team' ? outcome : 'owner_only');

  // Link Slack users to Bureau members by email right away (after the redirect is sent).
  runInBackground(async () => { await syncSlackMembers(teamId, token); });
  return done('connected');
}
