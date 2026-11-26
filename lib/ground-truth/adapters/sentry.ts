/* eslint-disable @typescript-eslint/no-explicit-any -- vendor JSON and pg rows are untyped; every field is narrowed before use */
/**
 * Sentry integration-platform issue webhooks -> signals
 * (https://docs.sentry.io/organization/integrations/integration-platform/webhooks/issues/).
 * Header Sentry-Hook-Resource must be "issue". Actions used:
 * *  - assigned: debug unit (in progress) for the assignee (data.issue.assignedTo)
 *  - resolved: shipped, credited to the user who resolved it (actor.type === "user")
 * "created", "archived" and "unresolved" have no human owner yet and are ignored.
 * actor = {type, id, name} is documented; [Unverified] assignedTo may carry {type:"user", id,
 * email, name}; we read id/email defensively.
 */
import type { ParsedSignal } from '../types';

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

export function parseSentry(resource: string, requestId: string, body: any): ParsedSignal[] {
  if (resource !== 'issue') return [];
  const action = str(body?.action);
  const issue = body?.data?.issue || {};
  if (!issue.id) return [];
  const base = {
    provider: 'sentry', sourceKind: 'webhook_truth' as const, tool: 'sentry', taskType: 'debug' as const,
    occurredAt: new Date(),
    title: `${str(issue.shortId) ? `${str(issue.shortId)}: ` : ''}${str(issue.title) || 'Sentry issue'}`,
    projectHints: [str(issue.project?.slug), str(issue.project?.name)].filter(Boolean),
    artifactLink: str(issue.web_url) || str(issue.permalink) || null,
  };
  if (action === 'assigned') {
    const a = issue.assignedTo || {};
    if (a.type && a.type !== 'user') return [];
    const ids = [str(a.id)].filter(Boolean);
    const emails = [str(a.email)].filter(Boolean);
    if (!ids.length && !emails.length) return [];
    return [{ ...base, externalId: `assigned:${issue.id}:${requestId || ids[0] || emails[0]}`, status: 'in_progress', blocker: null, effort: { errors_assigned: 1 }, actor: { provider: 'sentry', externalIds: ids, emails } }];
  }
  if (action === 'resolved') {
    if (str(body.actor?.type) !== 'user') return [];
    return [{ ...base, externalId: `resolved:${issue.id}:${requestId || 'x'}`, status: 'shipped', effort: { errors_resolved: 1 }, actor: { provider: 'sentry', externalIds: [str(body.actor.id)].filter(Boolean), emails: [] } }];
  }
  return [];
}
