'use client';

/** Shared rendering for work units (Team Work Board, Individual Timeline, /my-activity). */
export interface WorkUnitView {
  id: string;
  user_id: string;
  email: string | null;
  project: string;
  task_type: string;
  tool: string;
  tools: string[];
  artifact_link: string | null;
  status: string;
  blocker: string | null;
  effort: Record<string, number>;
  evidence: string[];
  confidence: string;
  title: string | null;
  hidden: boolean;
  signals: number;
  started_at: string;
  last_seen_at: string;
}

export const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');

const STATUS_STYLE: Record<string, string> = {
  shipped: 'bg-green-100 text-green-800',
  rendered: 'bg-green-100 text-green-800',
  in_progress: 'bg-blue-100 text-blue-800',
  needs_review: 'bg-purple-100 text-purple-800',
  blocked: 'bg-red-100 text-red-800',
  abandoned: 'bg-gray-100 text-gray-600',
};
const CONFIDENCE_LABEL: Record<string, string> = {
  verified_artifact: 'Verified by a real artifact',
  correlated: 'AI request + matching artifact',
  self_reported: 'From AI requests only',
};
const EFFORT_LABEL: Record<string, string> = {
  prompts: 'prompts', commits: 'commits', prs_opened: 'PRs opened', prs_merged: 'PRs merged', reviews: 'reviews',
  deploys: 'prod deploys', preview_deploys: 'preview deploys', failed_deploys: 'failed deploys', issues_done: 'issues done',
  errors_assigned: 'errors assigned', errors_resolved: 'errors resolved', drive_edits: 'Drive edits',
  generations: 'generations', failed_generations: 'failed generations', credits: 'credits', chars: 'characters',
};

export function StatusPill({ status }: { status: string }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[status] || 'bg-gray-100 text-gray-700'}`}>{status.replace('_', ' ')}</span>;
}

export function WorkUnitList({ units, showPerson, mineId, onHide, onDelete, empty }: {
  units: WorkUnitView[];
  showPerson?: boolean;
  mineId?: string;
  onHide?: (id: string) => void;
  onDelete?: (id: string) => void;
  empty?: string;
}) {
  if (!units.length) return <p className="px-4 py-6 text-sm text-gray-500">{empty || 'Nothing yet.'}</p>;
  return (
    <ul className="divide-y" data-testid="work-units">
      {units.map(u => (
        <li key={u.id} className="px-4 py-3">
          <div className="flex justify-between gap-4 text-xs text-gray-500 mb-1">
            <span>
              {fmtTime(u.last_seen_at)}
              {showPerson && u.email ? ` · ${u.email}` : ''} · {u.project} · {u.task_type.replace('_', ' ')} · {u.tools.join(', ')}
            </span>
            {mineId && u.user_id === mineId && !u.hidden && (onHide || onDelete) && (
              <span className="flex gap-3 shrink-0">
                {onHide && <button onClick={() => onHide(u.id)} className="text-gray-600 hover:underline">Mark personal</button>}
                {onDelete && <button onClick={() => onDelete(u.id)} className="text-red-600 hover:underline">Delete</button>}
              </span>
            )}
          </div>
          {u.hidden ? (
            <p className="text-sm italic text-gray-400">Hidden as personal</p>
          ) : (
            <div className="flex items-start gap-2">
              <StatusPill status={u.status} />
              <div className="flex-1">
                <p className="text-sm text-gray-900">
                  {u.artifact_link ? <a href={u.artifact_link} target="_blank" rel="noreferrer" className="hover:underline">{u.title}</a> : u.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {CONFIDENCE_LABEL[u.confidence] || u.confidence}
                  {u.blocker ? ` · ${u.blocker}` : ''}
                  {Object.entries(u.effort).filter(([, v]) => v).map(([k, v]) => ` · ${Math.round(v * 100) / 100} ${EFFORT_LABEL[k] || k}`).join('')}
                </p>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
