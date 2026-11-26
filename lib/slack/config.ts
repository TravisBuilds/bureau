/**
 * Slack app configuration (server-only). Values come from env; nothing here is a secret by itself.
 *
 * Required in production (Vercel, project "bureau"):
 *   SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_SIGNING_SECRET
 *   BUREAU_ACTIVITY_ENCRYPTION_KEY (already set; encrypts the per-workspace bot token)
 * Optional:
 *   SLACK_REDIRECT_URI (defaults to <app url>/api/slack/oauth/callback)
 *
 * There is deliberately no global SLACK_BOT_TOKEN: each Slack workspace's bot token is stored
 * encrypted in bureau.slack_bot_tokens by the "Add to Slack" OAuth flow.
 */
export const PROD_APP_URL = 'https://bureau-krustbuild.vercel.app';

/** Bot scopes requested at install (Phase 1 + 2). No history scopes (Phase 3 is not built). */
export const SLACK_BOT_SCOPES = [
  'app_mentions:read', // @Bureau in channels
  'chat:write',        // replies (threaded or ephemeral)
  'commands',          // /bureau
  'im:history',        // DMs to Bureau (message.im)
  'users:read',        // display names for the reply / link list
  'users:read.email',  // link Slack users to Bureau members by email
] as const;

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || PROD_APP_URL).replace(/\/+$/, '');
}

export function slackRedirectUri(): string {
  return process.env.SLACK_REDIRECT_URI || `${appUrl()}/api/slack/oauth/callback`;
}

export const slackClientId = () => (process.env.SLACK_CLIENT_ID || '').trim();
export const slackClientSecret = () => (process.env.SLACK_CLIENT_SECRET || '').trim();
export const slackSigningSecret = () => (process.env.SLACK_SIGNING_SECRET || '').trim();

/** True when the install flow can run (never reveals values). */
export function slackInstallConfigured(): boolean {
  return slackClientId().length > 0 && slackClientSecret().length >= 16;
}
