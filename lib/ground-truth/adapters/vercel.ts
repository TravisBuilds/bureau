/* eslint-disable @typescript-eslint/no-explicit-any -- vendor JSON and pg rows are untyped; every field is narrowed before use */
/**
 * Vercel deployment webhooks -> signals (https://vercel.com/docs/webhooks/webhooks-api).
 * Documented fields used: type, id, createdAt, payload.user.id, payload.deployment.{id,url,name,meta},
 * payload.links.deployment, payload.target, payload.project.id.
 *  - deployment.created -> in_progress
 *  - deployment.succeeded / deployment.ready / deployment.promoted -> shipped for production,
 *    in_progress (+1 preview deploy) otherwise
 *  - deployment.error -> blocked (deploy_failed), counts toward the retry-loop rule
 * Actor: payload.user.id (identity provider "vercel"). [Unverified] As a fallback we read
 * payload.deployment.meta.githubCommitAuthorLogin / githubCommitMessage, which Vercel sets for
 * Git-connected deploys but does not list in the webhook reference.
 */
import type { ParsedSignal } from '../types';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function parseVercel(body: any): ParsedSignal[] {
  const type = str(body?.type);
  const p = body?.payload || {};
  const d = p.deployment || {};
  if (!d.id) return [];
  const target = str(p.target || d.target) || 'preview';
  const meta = d.meta && typeof d.meta === 'object' ? d.meta : {};
  const ghLogin = str(meta.githubCommitAuthorLogin);
  const commitMsg = str(meta.githubCommitMessage).split('\n')[0].trim();
  const occurredAt = typeof body.createdAt === 'number' ? new Date(body.createdAt) : (Date.parse(str(body.createdAt)) ? new Date(str(body.createdAt)) : new Date());
  const link = str(p.links?.deployment) || (str(d.url) ? `https://${str(d.url).replace(/^https?:\/\//, '')}` : null);
  const base = {
    provider: 'vercel', sourceKind: 'webhook_truth' as const, tool: 'vercel', taskType: 'build' as const,
    externalId: `${type}:${d.id}`, occurredAt,
    title: `Deploy ${str(d.name) || 'project'} (${target})${commitMsg ? `: ${commitMsg}` : ''}`,
    projectHints: [str(d.name), str(p.project?.id)].filter(Boolean),
    artifactLink: link,
    actor: {
      provider: 'vercel',
      externalIds: str(p.user?.id) ? [str(p.user.id)] : [],
      emails: [],
      ...(ghLogin ? { fallback: { provider: 'github', externalIds: [ghLogin], emails: [] } } : {}),
    },
  };
  switch (type) {
    case 'deployment.created':
      return [{ ...base, status: 'in_progress' }];
    case 'deployment.succeeded':
    case 'deployment.ready':
    case 'deployment.promoted':
      return target === 'production'
        ? [{ ...base, status: 'shipped', effort: { deploys: 1 } }]
        : [{ ...base, status: 'in_progress', effort: { preview_deploys: 1 } }];
    case 'deployment.error':
      return [{ ...base, status: 'blocked', blocker: 'deploy_failed', failed: true, effort: { failed_deploys: 1 } }];
    default:
      return [];
  }
}
