'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { WorkUnitList, fmtTime, type WorkUnitView } from '@/components/work/work-units';

interface Board {
  window_days: number;
  totals: { units: number; shipped: number; blocked: number; in_progress: number; verified: number; correlated: number; self_reported: number };
  people: Array<{ user_id: string; email: string | null; units: number; shipped: number; blocked: number; projects: string[]; last_seen_at: string | null; consent_accepted: boolean }>;
  projects: Array<{ project: string; units: number; shipped: number; blocked: number; people: number }>;
  throughput: Array<{ day: string; shipped: number; units: number }>;
  blocked: WorkUnitView[];
  tools: Array<{ tool: string; units: number; prompts: number; credits: number; chars: number; generations: number }>;
}
interface Digest { period: string; counts: { shipped: number; in_flight: number; blocked: number; people_active: number }; lines: string[]; coverage: { not_accepted: Array<{ email: string | null }>; no_activity: Array<{ email: string | null }> }; by_project: Array<{ project: string; shipped: number; in_flight: number; blocked: number }> }

type Tab = 'board' | 'timeline' | 'digest';

/** Team Work Board, Individual Timeline and Digest (owners/admins). Members are sent to /my-activity. */
export default function WorkPage() {
  const [tab, setTab] = useState<Tab>('board');
  const [days, setDays] = useState(7);
  const [project, setProject] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [board, setBoard] = useState<Board | null>(null);
  const [units, setUnits] = useState<WorkUnitView[]>([]);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [isLeader, setIsLeader] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams();
      if (tab === 'board') { p.set('view', 'board'); p.set('days', String(days)); if (project) p.set('project', project); }
      if (tab === 'timeline') {
        p.set('view', 'timeline'); if (person) p.set('user_id', person); if (verifiedOnly) p.set('verified', '1');
        p.set('since', new Date(Date.now() - days * 86400_000).toISOString());
      }
      if (tab === 'digest') { p.set('view', 'digest'); p.set('period', period); }
      const res = await fetch(`/api/work?${p.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load');
      setIsLeader(body.is_leader);
      if (body.board) setBoard(body.board);
      if (body.units) setUnits(body.units);
      if (body.digest) setDigest(body.digest);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [tab, days, project, person, period, verifiedOnly]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on filter change
    load();
  }, [load]);

  const people = board?.people || [];
  const maxDay = Math.max(1, ...(board?.throughput || []).map(d => d.units));

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Work</h1>
            <p className="text-gray-600 mt-1">What shipped, what&apos;s in flight and who&apos;s blocked, built from connected tools and AI requests. Only owners and admins see this.</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/settings/integrations" className="text-blue-600 hover:underline">Sources</Link>
            <Link href="/my-activity" className="text-blue-600 hover:underline">My activity</Link>
            <Link href="/top-floor" className="text-blue-600 hover:underline">← Top Floor</Link>
          </div>
        </div>

        {isLeader === false && (
          <div className="bg-white rounded-lg shadow p-4 text-sm">
            The team views are for owners and admins. <Link href="/my-activity" className="text-blue-600 hover:underline">See exactly what Bureau has about you</Link>.
          </div>
        )}
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-800">{error}</div>}

        {isLeader !== false && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-6 text-sm">
              {(['board', 'timeline', 'digest'] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md ${tab === t ? 'bg-blue-600 text-white' : 'bg-white border'}`}>
                  {t === 'board' ? 'Team board' : t === 'timeline' ? 'Person timeline' : 'Digest'}
                </button>
              ))}
              {tab !== 'digest' && (
                <select value={days} onChange={e => setDays(Number(e.target.value))} className="ml-auto border rounded-md px-2 py-1.5" aria-label="Window">
                  {[1, 7, 14, 30].map(d => <option key={d} value={d}>Last {d} day{d > 1 ? 's' : ''}</option>)}
                </select>
              )}
              {tab === 'digest' && (
                <select value={period} onChange={e => setPeriod(e.target.value as 'daily' | 'weekly')} className="ml-auto border rounded-md px-2 py-1.5" aria-label="Period">
                  <option value="daily">Daily (24h)</option><option value="weekly">Weekly (7d)</option>
                </select>
              )}
            </div>

            {loading && <p className="text-sm text-gray-500 mb-4">Loading…</p>}

            {tab === 'board' && board && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[['Shipped', board.totals.shipped], ['In flight', board.totals.in_progress], ['Blocked', board.totals.blocked], ['Verified by artifacts', `${board.totals.verified}/${board.totals.units}`]].map(([k, v]) => (
                    <div key={String(k)} className="bg-white rounded-lg shadow p-4"><div className="text-xs text-gray-500">{k}</div><div className="text-2xl font-semibold">{v}</div></div>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <section className="bg-white rounded-lg shadow p-4">
                    <h2 className="font-semibold mb-3">People</h2>
                    <ul className="space-y-2 text-sm">
                      {people.map(p => (
                        <li key={p.user_id}>
                          <button onClick={() => { setPerson(p.user_id); setTab('timeline'); }} className="w-full text-left hover:bg-gray-50 rounded px-2 py-1">
                            <div className="font-medium">{p.email || p.user_id}</div>
                            <div className="text-xs text-gray-500">{p.shipped} shipped · {p.units - p.shipped - p.blocked} in flight · {p.blocked} blocked · last {fmtTime(p.last_seen_at)}</div>
                            {!p.consent_accepted && <div className="text-xs text-amber-700">Has not accepted the current notice: nothing is captured</div>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="bg-white rounded-lg shadow p-4">
                    <h2 className="font-semibold mb-3">Projects</h2>
                    <ul className="space-y-1 text-sm">
                      {board.projects.map(p => (
                        <li key={p.project}>
                          <button onClick={() => setProject(project === p.project ? null : p.project)} className={`w-full text-left rounded px-2 py-1 hover:bg-gray-50 ${project === p.project ? 'bg-blue-50' : ''}`}>
                            <span className="font-medium">{p.project}</span>
                            <span className="text-xs text-gray-500"> · {p.shipped} shipped · {p.blocked} blocked · {p.people} people</span>
                          </button>
                        </li>
                      ))}
                      {!board.projects.length && <li className="text-gray-500">No work units yet.</li>}
                    </ul>
                  </section>
                  <section className="bg-white rounded-lg shadow p-4">
                    <h2 className="font-semibold mb-3">Throughput</h2>
                    <div className="flex items-end gap-1 h-24" aria-label="Units per day">
                      {board.throughput.map(d => (
                        <div key={d.day} className="flex-1 flex flex-col justify-end" title={`${d.day}: ${d.shipped} shipped of ${d.units}`}>
                          <div className="bg-blue-200" style={{ height: `${((d.units - d.shipped) / maxDay) * 100}%` }} />
                          <div className="bg-green-500" style={{ height: `${(d.shipped / maxDay) * 100}%` }} />
                        </div>
                      ))}
                    </div>
                    <h3 className="font-semibold mt-4 mb-2 text-sm">Tools</h3>
                    <ul className="text-xs text-gray-600 space-y-0.5">
                      {board.tools.map(t => (
                        <li key={t.tool}>{t.tool}: {t.units} units{t.prompts ? ` · ${t.prompts} prompts` : ''}{t.generations ? ` · ${t.generations} generations` : ''}{t.credits ? ` · ${t.credits} credits` : ''}{t.chars ? ` · ${t.chars} chars` : ''}</li>
                      ))}
                    </ul>
                  </section>
                </div>
                <section className="bg-white rounded-lg shadow">
                  <h2 className="font-semibold px-4 pt-4">Blocked</h2>
                  <WorkUnitList units={board.blocked} showPerson empty="Nobody is blocked." />
                </section>
              </div>
            )}

            {tab === 'timeline' && (
              <section className="bg-white rounded-lg shadow">
                <div className="px-4 py-3 border-b flex flex-wrap gap-3 items-center text-sm">
                  <select value={person || ''} onChange={e => setPerson(e.target.value || null)} className="border rounded-md px-2 py-1" aria-label="Person">
                    <option value="">Me</option>
                    {people.map(p => <option key={p.user_id} value={p.user_id}>{p.email}</option>)}
                  </select>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={verifiedOnly} onChange={e => setVerifiedOnly(e.target.checked)} /> Verified only</label>
                  <span className="text-gray-500">{units.length} units</span>
                </div>
                <WorkUnitList units={units} empty="No work units in this window." />
              </section>
            )}

            {tab === 'digest' && digest && (
              <section className="bg-white rounded-lg shadow p-4 text-sm space-y-3">
                <pre className="whitespace-pre-wrap bg-gray-50 rounded p-3 text-xs">{digest.lines.join('\n')}</pre>
                <div>
                  <h3 className="font-semibold mb-1">By project</h3>
                  <ul className="text-gray-700">{digest.by_project.map(p => <li key={p.project}>{p.project}: {p.shipped} shipped, {p.in_flight} in flight, {p.blocked} blocked</li>)}</ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Coverage</h3>
                  <p className="text-gray-700">Not accepted the notice: {digest.coverage.not_accepted.map(x => x.email).join(', ') || 'nobody'}</p>
                  <p className="text-gray-700">Accepted but no activity: {digest.coverage.no_activity.map(x => x.email).join(', ') || 'nobody'}</p>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
