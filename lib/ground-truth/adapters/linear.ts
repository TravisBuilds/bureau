/* eslint-disable @typescript-eslint/no-explicit-any -- vendor JSON and pg rows are untyped; every field is narrowed before use */
/**
 * Linear data-change webhooks -> signals (https://linear.app/developers/webhooks).
 * Envelope (documented): action, type, actor{id,type,name,email}, data, url, updatedFrom,
 * webhookTimestamp. Only type "Issue" is used: creates, and updates that change state or assignee.
 * Issue fields read from data follow Linear's GraphQL Issue entity (identifier, title, url,
 * assigneeId, assignee{id,email}, state{name,type}, team{key,name}, project{name}); every field is
 * optional here. [Partially verified: the envelope is documented; per-field Issue payload shape
 * is from the GraphQL schema explorer and is read defensively.]
 * The unit goes to the assignee (who is doing the work), else to the actor.
 * State types: completed -> shipped, canceled -> abandoned, a state named "blocked" -> blocked,
 * everything else -> in_progress.
 */
import type { ParsedSignal, WorkStatus } from '../types';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function parseLinear(delivery: string, body: any): ParsedSignal[] {
  if (str(body?.type) !== 'Issue') return [];
  const action = str(body.action);
  const d = body.data || {};
  const from = body.updatedFrom || {};
  if (action === 'remove') return [];
  if (action === 'update' && !('stateId' in from) && !('assigneeId' in from)) return [];
  const stateType = str(d.state?.type);
  const stateName = str(d.state?.name);
  let status: WorkStatus = 'in_progress';
  if (stateType === 'completed') status = 'shipped';
  else if (stateType === 'canceled') status = 'abandoned';
  else if (/blocked/i.test(stateName)) status = 'blocked';
  const assigneeIds = [str(d.assignee?.id), str(d.assigneeId)].filter(Boolean);
  const assigneeEmails = [str(d.assignee?.email)].filter(Boolean);
  const useAssignee = assigneeIds.length > 0 || assigneeEmails.length > 0;
  const actor = useAssignee
    ? { provider: 'linear', externalIds: assigneeIds, emails: assigneeEmails }
    : { provider: 'linear', externalIds: [str(body.actor?.id)].filter(Boolean), emails: [str(body.actor?.email)].filter(Boolean) };
  const ts = typeof body.webhookTimestamp === 'number' ? new Date(body.webhookTimestamp) : new Date();
  return [{
    provider: 'linear', sourceKind: 'webhook_truth', tool: 'linear',
    externalId: `delivery:${delivery || `${d.id}:${action}:${ts.getTime()}`}`,
    occurredAt: Date.parse(str(d.updatedAt)) ? new Date(str(d.updatedAt)) : ts,
    title: `${str(d.identifier) ? `${str(d.identifier)}: ` : ''}${str(d.title) || 'Issue'}`,
    classifyText: stateName,
    projectHints: [str(d.team?.key), str(d.team?.name), str(d.project?.name)].filter(Boolean),
    artifactLink: str(body.url) || str(d.url) || null,
    status,
    blocker: status === 'blocked' ? 'stuck_keyword' : null,
    effort: status === 'shipped' ? { issues_done: 1 } : {},
    actor,
  }];
}
