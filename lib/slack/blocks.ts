/** Block Kit helpers. All user/DB text goes through esc() so it can't inject Slack markup. */
import { appUrl } from './config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Block Kit JSON
export type Block = Record<string, any>;

export interface SlackReply {
  text: string;          // notification / fallback text (always present)
  blocks: Block[];
  ephemeral: boolean;    // only the requester sees it (in channels)
}

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const clip = (s: unknown, n: number) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}\u2026` : t; };

export function section(mrkdwn: string): Block {
  return { type: 'section', text: { type: 'mrkdwn', text: clip(mrkdwn, 2900) } };
}

export function context(mrkdwn: string): Block {
  return { type: 'context', elements: [{ type: 'mrkdwn', text: clip(mrkdwn, 2900) }] };
}

export function openInBureau(path: string, label = 'Open in Bureau'): Block {
  return {
    type: 'actions',
    elements: [{ type: 'button', text: { type: 'plain_text', text: label }, url: `${appUrl()}${path}`, action_id: `open_bureau_${path.replace(/[^a-z]/gi, '_').slice(0, 40)}` }],
  };
}

export function reply(text: string, blocks: Block[], ephemeral = false): SlackReply {
  return { text: clip(text, 3000), blocks: blocks.slice(0, 48), ephemeral };
}
