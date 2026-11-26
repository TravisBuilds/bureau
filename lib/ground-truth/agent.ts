/**
 * AI requests logged through bureau_log_activity become 'agent_mcp' signals, so a prompt burst and
 * the commit/deploy/render it produced end up in the same work unit. Personal requests are never fed.
 */
import type { Signal } from './types';

const VENDOR_TOOL: Record<string, string> = { openai: 'chatgpt', anthropic: 'claude', cursor: 'cursor' };

export function agentToolName(explicit: unknown, vendor: string | null, agentLabel: string | null): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (typeof explicit === 'string' && clean(explicit)) return clean(explicit);
  if (vendor && VENDOR_TOOL[vendor]) return VENDOR_TOOL[vendor];
  if (agentLabel && clean(agentLabel)) return clean(agentLabel);
  return 'ai_assistant';
}

export function agentSignal(input: {
  activityLogId: string; request: string; detail?: string | null; occurredAt?: string | null;
  tool: string; project?: unknown; artifactUrl?: unknown;
}): Signal {
  const t = input.occurredAt ? Date.parse(input.occurredAt) : NaN;
  const now = Date.now();
  const occurredAt = Number.isNaN(t) || t > now + 5 * 60_000 || t < now - 24 * 3600_000 ? new Date(now) : new Date(t);
  return {
    provider: 'agent',
    sourceKind: 'agent_mcp',
    externalId: `log:${input.activityLogId}`,
    occurredAt,
    title: input.request,
    classifyText: input.detail || '',
    tool: input.tool,
    project: typeof input.project === 'string' ? input.project : null,
    artifactLink: typeof input.artifactUrl === 'string' ? input.artifactUrl : null,
    activityLogId: input.activityLogId,
  };
}
