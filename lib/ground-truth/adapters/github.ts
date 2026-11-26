/* eslint-disable @typescript-eslint/no-explicit-any -- vendor JSON and pg rows are untyped; every field is narrowed before use */
/**
 * GitHub repository/organization webhooks -> signals.
 * Events (https://docs.github.com/en/webhooks/webhook-events-and-payloads):
 *  - push: one signal per distinct commit (author username/email), status in_progress
 *  - pull_request: opened/reopened/ready_for_review -> needs_review; closed+merged -> shipped
 *    (credited to the PR author); closed unmerged -> abandoned
 *  - pull_request_review: submitted -> a review unit for the reviewer
 * Everything else (ping, issues, stars, ...) is ignored.
 */
import type { ParsedSignal } from '../types';

const firstLine = (s: unknown) => String(s ?? '').split('\n')[0].trim();
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const when = (v: unknown) => {
  const t = Date.parse(str(v));
  return Number.isNaN(t) ? new Date() : new Date(t);
};

export function parseGithub(event: string, delivery: string, body: any): ParsedSignal[] {
  const repo = body?.repository || {};
  const hints = [str(repo.full_name), str(repo.name)].filter(Boolean);
  const out: ParsedSignal[] = [];

  if (event === 'push') {
    if (body.deleted) return [];
    for (const c of Array.isArray(body.commits) ? body.commits : []) {
      if (c?.distinct === false || !c?.id) continue;
      const login = str(c.author?.username);
      out.push({
        provider: 'github', sourceKind: 'webhook_truth',
        externalId: `commit:${str(repo.full_name)}:${c.id}`,
        occurredAt: when(c.timestamp),
        title: firstLine(c.message) || 'Commit',
        classifyText: str(body.ref),
        tool: 'github', projectHints: hints,
        artifactLink: str(c.url) || null,
        status: null,
        effort: { commits: 1 },
        actor: { provider: 'github', externalIds: login ? [login] : [], emails: str(c.author?.email) ? [str(c.author.email)] : [] },
      });
    }
    return out;
  }

  if (event === 'pull_request') {
    const pr = body.pull_request || {};
    const action = str(body.action);
    const author = str(pr.user?.login);
    const base = {
      provider: 'github', sourceKind: 'webhook_truth' as const,
      tool: 'github', projectHints: hints,
      title: `PR #${pr.number}: ${firstLine(pr.title)}`,
      classifyText: str(pr.head?.ref),
      artifactLink: str(pr.html_url) || null,
      actor: { provider: 'github', externalIds: author ? [author] : [], emails: [] },
    };
    if (['opened', 'reopened', 'ready_for_review'].includes(action) && !pr.draft) {
      out.push({ ...base, externalId: `pr:${str(repo.full_name)}#${pr.number}:${action}:${delivery}`, occurredAt: when(pr.updated_at || pr.created_at), taskType: 'build', status: 'needs_review', effort: { prs_opened: 1 } });
    } else if (action === 'closed' && pr.merged) {
      out.push({ ...base, externalId: `pr:${str(repo.full_name)}#${pr.number}:merged`, occurredAt: when(pr.merged_at), taskType: 'build', status: 'shipped', effort: { prs_merged: 1 } });
    } else if (action === 'closed') {
      out.push({ ...base, externalId: `pr:${str(repo.full_name)}#${pr.number}:closed:${delivery}`, occurredAt: when(pr.closed_at), taskType: 'build', status: 'abandoned' });
    }
    return out;
  }

  if (event === 'pull_request_review' && str(body.action) === 'submitted') {
    const review = body.review || {};
    const pr = body.pull_request || {};
    const reviewer = str(review.user?.login);
    if (!reviewer || reviewer === str(pr.user?.login)) return [];
    out.push({
      provider: 'github', sourceKind: 'webhook_truth',
      externalId: `review:${review.id}`,
      occurredAt: when(review.submitted_at),
      title: `Reviewed PR #${pr.number}: ${firstLine(pr.title)}`,
      tool: 'github', projectHints: hints, taskType: 'review',
      artifactLink: str(review.html_url) || str(pr.html_url) || null,
      status: 'shipped', effort: { reviews: 1 },
      actor: { provider: 'github', externalIds: [reviewer], emails: [] },
    });
  }
  return out;
}
