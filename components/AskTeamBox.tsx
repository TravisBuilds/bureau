'use client';

import { useEffect, useRef, useState } from 'react';

interface Clone {
  id: string;
  display_name: string;
  handle: string;
  owner_email: string;
  is_stale?: boolean;
}

export interface CheckinPreview {
  date: string;
  days_old: number;
  top_priority: string | null;
  active: string[];
  blocked: string[];
  decisions_waiting_on_me: string[];
  out_of_office: boolean;
}

/** Renders a teammate's latest check-in (shared by the Ask box and tests). */
export function CheckinPreviewCard({ name, preview }: { name: string; preview: CheckinPreview | null }) {
  if (!preview) {
    return (
      <p className="text-sm text-slate-600" data-testid="no-checkin">
        {name} hasn&rsquo;t posted a check-in yet. Their AI will answer when it next connects.
      </p>
    );
  }
  const age = preview.days_old <= 0 ? 'today' : preview.days_old === 1 ? 'yesterday' : `${preview.days_old} days ago`;
  return (
    <div className="text-sm text-slate-700 space-y-1" data-testid="checkin-preview">
      <p className="text-xs text-slate-500">From {name}&rsquo;s latest check-in ({preview.date}, {age}){preview.out_of_office ? ' · out of office' : ''}</p>
      {preview.top_priority && <p><span className="font-medium">Top priority:</span> {preview.top_priority}</p>}
      {preview.active.length > 0 && <p><span className="font-medium">Working on:</span> {preview.active.join('; ')}</p>}
      {preview.blocked.length > 0 && <p><span className="font-medium">Blocked on:</span> {preview.blocked.join('; ')}</p>}
      {preview.decisions_waiting_on_me.length > 0 && <p><span className="font-medium">Waiting on them:</span> {preview.decisions_waiting_on_me.join('; ')}</p>}
    </div>
  );
}

const POLL_MS = 5000;
const POLL_MAX = 24; // ~2 minutes

/**
 * "Ask your team": pick a teammate, ask a question. Shows their latest check-in right away,
 * then watches briefly for their AI's answer (the question stays open either way).
 */
export default function AskTeamBox({ onAsked, title = 'Ask your team' }: { onAsked?: () => void; title?: string }) {
  const [clones, setClones] = useState<Clone[]>([]);
  const [target, setTarget] = useState('');
  const [text, setText] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ questionId: string; name: string; preview: CheckinPreview | null } | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/clones').then(r => (r.ok ? r.json() : { clones: [] })).then(d => setClones(d.clones || [])).catch(() => {});
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  function watchForAnswer(questionId: string, n = 0) {
    if (n >= POLL_MAX) return;
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/questions');
        if (r.ok) {
          const q = ((await r.json()).questions || []).find((x: { id: string; answer_text: string | null }) => x.id === questionId);
          if (q?.answer_text) { setAnswer(q.answer_text); onAsked?.(); return; }
        }
      } catch { /* keep trying */ }
      watchForAnswer(questionId, n + 1);
    }, POLL_MS);
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setResult(null); setAnswer(null);
    if (timer.current) clearTimeout(timer.current);
    setAsking(true);
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_clone_id: target, question_text: text }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Couldn\u2019t ask that. Try again.'); return; }
      const name = data.target?.display_name || clones.find(c => c.id === target)?.display_name || 'They';
      setResult({ questionId: data.questionId, name, preview: data.preview ?? null });
      setText('');
      onAsked?.();
      watchForAnswer(data.questionId);
    } catch {
      setError('Couldn\u2019t ask that. Try again.');
    } finally {
      setAsking(false);
    }
  }

  return (
    <section className="border border-slate-200 rounded-xl p-6 mb-8" aria-label={title}>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">{title}</h2>
      <p className="text-sm text-slate-500 mb-4">Ask a teammate&rsquo;s AI. You&rsquo;ll see their latest check-in right away.</p>
      {clones.length === 0 ? (
        <p className="text-sm text-slate-500">No teammates&rsquo; AIs are connected yet. Invite your team in Settings, then have them connect their AI.</p>
      ) : (
        <form onSubmit={ask} className="flex flex-col gap-3 md:flex-row md:items-start">
          <select
            aria-label="Teammate"
            value={target}
            onChange={e => setTarget(e.target.value)}
            required
            className="px-3 py-2 border border-slate-300 rounded-md md:w-64"
          >
            <option value="">Who?</option>
            {clones.map(c => (
              <option key={c.id} value={c.id}>{c.display_name} ({c.owner_email})</option>
            ))}
          </select>
          <input
            aria-label="Question"
            value={text}
            onChange={e => setText(e.target.value)}
            required
            maxLength={2000}
            placeholder="What are you working on today?"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-md"
          />
          <button type="submit" disabled={asking} className="px-4 py-2 bg-highstreet-purple text-white rounded-md disabled:bg-slate-400">
            {asking ? 'Asking\u2026' : 'Ask'}
          </button>
        </form>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {result && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4 space-y-2">
          <CheckinPreviewCard name={result.name} preview={result.preview} />
          {answer
            ? <p className="text-sm"><span className="font-medium">{result.name} answered:</span> {answer}</p>
            : <p className="text-xs text-slate-500">Question sent. Their answer will show on the Questions page when their AI replies.</p>}
        </div>
      )}
    </section>
  );
}
