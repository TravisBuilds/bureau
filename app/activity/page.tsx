'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ACTIVITY_NOTICE, AGENT_LOGGING_INSTRUCTIONS } from '@/lib/activity-policy';

interface Entry {
  id: string;
  occurred_at: string;
  user_id: string;
  email: string | null;
  agent_label: string | null;
  vendor: string | null;
  source: string;
  kind: string;
  hidden: boolean;
  request: string | null;
  detail: string | null;
  secrets_removed: number;
}

interface Person {
  user_id: string;
  email: string | null;
  role: string | null;
  requests_7d: number;
  hidden_7d: number;
  last_activity_at: string | null;
  consent_accepted: boolean;
}

interface ActivityResponse {
  is_leader: boolean;
  scope: 'mine' | 'workspace';
  configured: boolean;
  user_id: string;
  consent: { accepted: boolean; accepted_at: string | null; revoked_at: string | null };
  people?: Person[];
  entries: Entry[];
  truncated: boolean;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');

export default function ActivityPage() {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [person, setPerson] = useState<string | null>(null);
  const [view, setView] = useState<'team' | 'mine'>('team');
  const [contact, setContact] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (appliedQ) params.set('q', appliedQ);
      if (person) params.set('user_id', person);
      if (view === 'mine') params.set('mine', '1');
      const res = await fetch(`/api/activity?${params.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [appliedQ, person, view]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on filter change
    load();
  }, [load]);
  useEffect(() => {
    fetch('/api/activity/consent').then(r => (r.ok ? r.json() : null)).then(d => setContact(d?.contact ?? null)).catch(() => {});
  }, []);

  async function setConsent(accept: boolean) {
    await fetch('/api/activity/consent', { method: accept ? 'POST' : 'DELETE' });
    load();
  }
  async function hide(id: string) {
    if (!confirm('Mark this as personal? Its content is erased for good; only the time stays.')) return;
    await fetch(`/api/activity/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: true }) });
    load();
  }
  async function remove(id: string) {
    if (!confirm('Delete this entry completely? This erases it for good, not just hides it.')) return;
    await fetch(`/api/activity/${id}`, { method: 'DELETE' });
    load();
  }

  const leaderTeamView = !!data?.is_leader && view === 'team';
  const selected = data?.people?.find(p => p.user_id === person) || null;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">{leaderTeamView ? 'Team activity' : 'My activity'}</h1>
            <p className="text-gray-600 mt-1">
              {leaderTeamView
                ? 'What people asked their connected AIs in the last 30 days. Only owners and admins see this.'
                : 'What your connected AIs logged for you. Only you and your workspace owners/admins can see it.'}
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {data?.is_leader && (
              <button onClick={() => { setView(view === 'team' ? 'mine' : 'team'); setPerson(null); }} className="text-blue-600 hover:underline">
                {view === 'team' ? 'My activity' : 'Team activity'}
              </button>
            )}
            <Link href={data?.is_leader ? '/work' : '/my-activity'} className="text-blue-600 hover:underline">{data?.is_leader ? 'Work board' : 'My work'}</Link>
            <Link href="/team-health" className="text-blue-600 hover:underline">Team</Link>
            <Link href="/top-floor" className="text-blue-600 hover:underline">← Top Floor</Link>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-800">{error}</div>}

        {data && !data.configured && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-900">
            Activity logging is not switched on for this Bureau yet (no encryption key is set), so nothing is being logged.
          </div>
        )}

        {data && !data.consent.accepted && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-6 text-sm" data-testid="consent-banner">
            <p className="font-semibold mb-2">{ACTIVITY_NOTICE.title}</p>
            <p className="mb-1">{ACTIVITY_NOTICE.what}</p>
            <p className="mb-1"><strong>Why:</strong> {ACTIVITY_NOTICE.why}</p>
            <p className="mb-1"><strong>Who can see it:</strong> {ACTIVITY_NOTICE.who}</p>
            <p className="mb-1">{ACTIVITY_NOTICE.retention} {ACTIVITY_NOTICE.control}</p>
            {contact && <p className="mb-2 text-gray-600">{contact}</p>}
            <p className="mb-3 text-gray-700">Until you accept, your AI&apos;s logging calls are refused and nothing is stored.</p>
            <button onClick={() => setConsent(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md">
              I understand, turn on logging
            </button>
          </div>
        )}

        {leaderTeamView && (
          <form
            className="flex gap-2 mb-6"
            onSubmit={(e) => { e.preventDefault(); setAppliedQ(q.trim()); }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search requests, e.g. invoice or pricing deck"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              aria-label="Search activity"
            />
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md">Search</button>
            {(appliedQ || person) && (
              <button type="button" onClick={() => { setQ(''); setAppliedQ(''); setPerson(null); }} className="px-3 py-2 text-gray-600 hover:underline">
                Clear
              </button>
            )}
          </form>
        )}

        <div className={leaderTeamView ? 'grid grid-cols-1 md:grid-cols-3 gap-6' : ''}>
          {leaderTeamView && (
            <aside className="bg-white rounded-lg shadow p-4 h-fit">
              <h2 className="font-semibold mb-3">People</h2>
              <ul className="space-y-2">
                {(data?.people || []).map(p => (
                  <li key={p.user_id}>
                    <button
                      onClick={() => setPerson(person === p.user_id ? null : p.user_id)}
                      className={`w-full text-left rounded-md px-2 py-2 hover:bg-gray-50 ${person === p.user_id ? 'bg-blue-50' : ''}`}
                    >
                      <div className="font-medium text-sm">{p.email || p.user_id}</div>
                      <div className="text-xs text-gray-500">
                        {p.requests_7d} in 7 days{p.hidden_7d ? ` · ${p.hidden_7d} personal` : ''} · last {fmt(p.last_activity_at)}
                      </div>
                      {!p.consent_accepted && <div className="text-xs text-amber-700">Has not accepted the logging notice</div>}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          <section className={leaderTeamView ? 'md:col-span-2' : ''}>
            <div className="bg-white rounded-lg shadow">
              <div className="px-4 py-3 border-b text-sm text-gray-600">
                {loading ? 'Loading\u2026' : `${data?.entries.length ?? 0} entr${(data?.entries.length ?? 0) === 1 ? 'y' : 'ies'}`}
                {selected && <> for <strong>{selected.email}</strong></>}
                {appliedQ && <> matching <strong>&ldquo;{appliedQ}&rdquo;</strong></>}
                {data?.truncated && <> (newest 2,000 searched)</>}
              </div>
              <ul className="divide-y" data-testid="activity-timeline">
                {(data?.entries || []).map(e => (
                  <li key={e.id} className="px-4 py-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>
                        {fmt(e.occurred_at)}
                        {leaderTeamView && e.email ? ` · ${e.email}` : ''}
                        {e.agent_label ? ` · ${e.agent_label}` : ''}
                        {e.kind === 'action' ? ' · action' : ''}
                      </span>
                      {e.user_id === data?.user_id && !e.hidden && (
                        <span className="flex gap-3">
                          <button onClick={() => hide(e.id)} className="text-gray-600 hover:underline">Mark personal</button>
                          <button onClick={() => remove(e.id)} className="text-red-600 hover:underline">Delete</button>
                        </span>
                      )}
                    </div>
                    {e.hidden ? (
                      <p className="text-sm italic text-gray-400">Hidden as personal</p>
                    ) : (
                      <>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{e.request}</p>
                        {e.detail && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{e.detail}</p>}
                        {e.secrets_removed > 0 && <p className="text-xs text-gray-400 mt-1">{e.secrets_removed} secret{e.secrets_removed > 1 ? 's' : ''} removed before saving</p>}
                      </>
                    )}
                  </li>
                ))}
                {!loading && (data?.entries.length ?? 0) === 0 && (
                  <li className="px-4 py-6 text-sm text-gray-500">Nothing logged yet.</li>
                )}
              </ul>
            </div>
          </section>
        </div>

        <div className="mt-8 bg-white rounded-lg shadow p-4 text-sm">
          <h2 className="font-semibold mb-2">Make your AI log team work only</h2>
          <p className="text-gray-600 mb-2">
            Bureau asks connected AIs to log work for this team, once per task, and to skip personal matters. Your own instruction wins: if you tell your AI not to log something, it will not. To make this stick, paste this into your AI&apos;s custom instructions
            (ChatGPT: Settings → Personalization; Claude: Settings → Profile or a Project&apos;s instructions; Grok Bot: tell it to remember this).
            ChatGPT Plus and Pro can&apos;t send logs to outside apps, so this only works there on ChatGPT Business or Enterprise. If something personal slips through, delete it above; deleting erases it for good.
          </p>
          <pre className="bg-gray-100 rounded p-3 whitespace-pre-wrap text-xs">{AGENT_LOGGING_INSTRUCTIONS}</pre>
          <button
            onClick={() => { navigator.clipboard?.writeText(AGENT_LOGGING_INSTRUCTIONS); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="mt-2 text-blue-600 hover:underline"
          >
            {copied ? 'Copied' : 'Copy instructions'}
          </button>
          {data?.consent.accepted && (
            <p className="mt-4 text-xs text-gray-500">
              You accepted the logging notice on {fmt(data.consent.accepted_at)}.{' '}
              <button onClick={() => setConsent(false)} className="underline">Withdraw</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
