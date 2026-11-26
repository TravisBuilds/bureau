# Bureau for Slack: setup

Bureau's Slack app makes Bureau reactive: `@Bureau` in a channel, a DM to Bureau, or `/bureau`
triggers Bureau right away and it answers from Bureau data (check-ins, questions, the Team Work
Board and digests). No AI model is called. Every request is logged to the asker's activity
(source `slack`) only if they have accepted the activity notice.

Production URLs (already in `slack-app-manifest.json`):

| What | URL |
|---|---|
| Event Subscriptions request URL | `https://bureau-krustbuild.vercel.app/api/slack/events` |
| Slash command `/bureau` | `https://bureau-krustbuild.vercel.app/api/slack/commands` |
| OAuth redirect URL | `https://bureau-krustbuild.vercel.app/api/slack/oauth/callback` |

Bot scopes: `app_mentions:read`, `chat:write`, `commands`, `im:history`, `users:read`,
`users:read.email`. No channel-history scopes (Bureau does not read channels).
Bot events: `app_mention`, `message.im`, `app_uninstalled`, `tokens_revoked`.

## Environment (Vercel project `bureau`, team `krustbuild`)

| Variable | Where it comes from |
|---|---|
| `SLACK_CLIENT_ID` | Slack app > Basic Information > App Credentials |
| `SLACK_CLIENT_SECRET` | same page (sensitive) |
| `SLACK_SIGNING_SECRET` | same page (sensitive) |
| `BUREAU_ACTIVITY_ENCRYPTION_KEY` | already set; also encrypts the Slack bot token |
| `SLACK_REDIRECT_URI` | optional; only if `NEXT_PUBLIC_APP_URL` is not the production URL |

There is no `SLACK_BOT_TOKEN` variable: each install's bot token is stored encrypted
(AES-256-GCM) in `bureau.slack_bot_tokens`, readable only through definer functions.

## Order of operations

1. Apply migration `20261127000000_slack_connect.sql`, merge, and deploy.
2. A Slack workspace admin opens https://api.slack.com/apps > **Create New App** >
   **From a manifest**, picks the company workspace, pastes `slack-app-manifest.json`, and creates
   the app. Do **not** turn on public distribution (keep it an internal, single-workspace app).
3. Copy Client ID, Client Secret and Signing Secret into the Vercel env vars above (Production)
   and redeploy. Never paste them into chat.
4. Back in the Slack app: **Event Subscriptions** > click **Retry** next to the request URL until it
   shows Verified (Slack's first check fails until the signing secret is deployed).
5. A Bureau **owner** opens Bureau > Settings > Team > Slack > **Add to Slack** and clicks Allow.
   Bureau stores the token and links Slack users to Bureau members by email.
6. Anyone not linked (different email): an owner or admin picks their Bureau member in the
   Slack card on Settings > Team (click **Refresh Slack members** first).
7. Invite `@Bureau` to the channels where people will mention it (`/invite @Bureau`).

## Commands

```
status [who]                 latest check-ins (whole team, or one person)
what is <who> working on?    same as status <who>
ask <who> <question>         asks their AI (reply shows their latest check-in now)
questions [who]              your open questions, or questions asked of someone
answer <id> <text>           answer a question asked of your AI
board [days]                 Team Work Board (owners/admins, private reply)
digest [daily|weekly] [who]  shipped / in-flight / blocked (owners/admins, private reply)
```

In channels, `status` and `ask` reply in the thread; questions, answers, board and digest reply
privately (ephemeral). DMs reply in the DM. `/bureau` always replies privately.

## Disconnect

Settings > Team > Slack > Disconnect revokes the token at Slack and deletes Bureau's copy.
Uninstalling the app in Slack does the same automatically (`app_uninstalled` / `tokens_revoked`).
