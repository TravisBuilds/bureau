/**
 * Minimal Slack Web API client (fetch). Tokens are passed in per call and never logged.
 * Honours HTTP 429 Retry-After once (capped at 3 seconds so post-ack work stays short).
 */
export interface SlackApiResult { ok: boolean; error?: string; [k: string]: unknown }

const SLACK_API = 'https://slack.com/api/';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function slackApi(method: string, opts: {
  token?: string;
  json?: Record<string, unknown>;
  form?: Record<string, string>;
  basicAuth?: { user: string; pass: string };
}): Promise<SlackApiResult> {
  if (!/^[a-z]+(\.[a-zA-Z0-9]+)+$/.test(method)) throw new Error('bad Slack method');
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.basicAuth) headers.authorization = `Basic ${Buffer.from(`${opts.basicAuth.user}:${opts.basicAuth.pass}`).toString('base64')}`;
  if (opts.json) {
    headers['content-type'] = 'application/json; charset=utf-8';
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(opts.form).toString();
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(SLACK_API + method, { method: 'POST', headers, body });
    if (res.status === 429 && attempt === 0) {
      const wait = Math.min(Math.max(Number(res.headers?.get?.('retry-after')) || 1, 0), 3);
      await sleep(wait * 1000);
      continue;
    }
    let data: SlackApiResult;
    try { data = (await res.json()) as SlackApiResult; } catch { data = { ok: false, error: `http_${res.status}` }; }
    return data && typeof data === 'object' ? data : { ok: false, error: 'bad_response' };
  }
  return { ok: false, error: 'ratelimited' };
}

/** Only Slack's own response_url hosts (slash commands); anything else is refused (no SSRF). */
export function isSlackResponseUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && url.hostname === 'hooks.slack.com' && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

export async function postToResponseUrl(responseUrl: string, message: Record<string, unknown>): Promise<boolean> {
  if (!isSlackResponseUrl(responseUrl)) return false;
  const res = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(message),
  });
  return res.ok;
}
