'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ACTIVITY_NOTICE } from '@/lib/activity-policy';
import { WorkUnitList, fmtTime, type WorkUnitView } from '@/components/work/work-units';

interface Integration { id: string; provider: string; label: string; personal: boolean; owner_user_id: string | null; status: string; last_event_at: string | null; last_sync_at: string | null; last_error: string | null }
interface Link_ { id: string; provider: string; external_id: string }
interface Mine { consent: { accepted: boolean; accepted_at: string | null }; configured: boolean; user_id: string; units: WorkUnitView[] }

const SOURCES: Record<string, string> = {
  github: 'GitHub (commits, PRs, reviews)', vercel: 'Vercel (deploys)', linear: 'Linear (issue status)', sentry: 'Sentry (errors assigned/resolved)',
  google_drive: 'Google Drive (file titles you edit)', elevenlabs: 'ElevenLabs (voice generations)', higgsfield: 'Higgsfield (generations and credits)',
};

/**
 * The employee mirror: exactly what Bureau holds about you (the same work units leaders see),
 * which sources can attribute work to you, and the controls to hide, delete or withdraw.
 */
export default function MyActivityPage() {
  const [mine, setMine] = useState<Mine | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [links, setLinks] = useState<Link_[]>([]);
  const [linkProvider, setLinkProvider] = useState('github');
  const [linkId, setLinkId] = useState('');
  const [elKey, setElKey] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [w, i, l] = await Promise.all([
        fetch('/api/work?view=mine').then(r => r.json()),
        fetch('/api/integrations').then(r => r.json()),
        fetch('/api/identity-links').then(r => r.json()),
      ]);
      if (w.error) throw new Error(w.error);
      setMine(w);
      setIntegrations(i.integrations || []);
      setLinks(((l.links || []) as Array<Link_ & { user_id: string }>).filter(x => x.user_id === w.user_id));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    load();
    const q = new URLSearchParams(window.location.search).get('drive');
    if (q) setMsg(q === 'connected' ? 'Google Drive connected.' : `Google Drive was not connected (${q}).`);
  }, [load]);

  const call = async (url: string, init: RequestInit, ok: string) => {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? ok : body.error || 'Something went wrong');
    load();
  };
  const hide = (id: string) => confirm('Mark this as personal? Its title and link are erased for good; only the time stays.') && call(`/api/work/${id}`, { method: 'PATCH', body: JSON.stringify({ hidden: true }) }, 'Hidden.');
  const remove = (id: string) => confirm('Delete this work unit completely?') && call(`/api/work/${id}`, { method: 'DELETE' }, 'Deleted.');

  const personal = integrations.filter(i => i.personal && i.owner_user_id === mine?.user_id);
  const shared = integrations.filter(i => !i.personal);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">My activity</h1>
            <p className="text-gray-600 mt-1">Everything Bureau has about your work: the same view your owners and admins get. Deleted after 30 days.</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/activity" className="text-blue-600 hover:underline">AI request log</Link>
            <Link href="/top-floor" className="text-blue-600 hover:underline">← Top Floor</Link>
          </div>
        </div>
        {msg && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">{msg}</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800">{error}</div>}

        {mine && !mine.consent.accepted && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="font-semibold mb-2">{ACTIVITY_NOTICE.title}</p>
            <p className="mb-1">{ACTIVITY_NOTICE.what}</p>
            <p className="mb-1"><strong>Who can see it:</strong> {ACTIVITY_NOTICE.who}</p>
            <p className="mb-3">{ACTIVITY_NOTICE.retention} {ACTIVITY_NOTICE.control}</p>
            <p className="mb-3 text-gray-700">Nothing about you is captured from any source until you accept.</p>
            <button onClick={() => call('/api/activity/consent', { method: 'POST' }, 'Notice accepted.')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md">I understand, turn it on</button>
          </div>
        )}

        <section className="bg-white rounded-lg shadow">
          <h2 className="font-semibold px-4 pt-4">My work units</h2>
          <WorkUnitList units={mine?.units || []} mineId={mine?.user_id} onHide={hide} onDelete={remove} empty="Nothing captured about you yet." />
        </section>

        <section className="bg-white rounded-lg shadow p-4 text-sm">
          <h2 className="font-semibold mb-2">Sources that can attribute work to you</h2>
          <ul className="space-y-1 mb-3">
            {shared.map(i => <li key={i.id}>{SOURCES[i.provider] || i.provider}{i.label ? ` · ${i.label}` : ''} · {i.status} · last event {fmtTime(i.last_event_at || i.last_sync_at)}</li>)}
            {!shared.length && <li className="text-gray-500">Your workspace hasn&apos;t connected any team sources.</li>}
          </ul>
          <p className="text-gray-600 mb-2">Team sources only count work by accounts linked to you below (or by your work email).</p>
          <ul className="space-y-1 mb-3">
            {links.map(l => (
              <li key={l.id} className="flex gap-3">{l.provider}: <strong>{l.external_id}</strong>
                <button onClick={() => call(`/api/identity-links/${l.id}`, { method: 'DELETE' }, 'Unlinked.')} className="text-red-600 hover:underline">Unlink</button>
              </li>
            ))}
          </ul>
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); call('/api/identity-links', { method: 'POST', body: JSON.stringify({ provider: linkProvider, external_id: linkId }) }, 'Linked.'); setLinkId(''); }}>
            <select value={linkProvider} onChange={e => setLinkProvider(e.target.value)} className="border rounded-md px-2 py-1" aria-label="Provider">
              {['github', 'vercel', 'linear', 'sentry', 'higgsfield'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={linkId} onChange={e => setLinkId(e.target.value)} placeholder="Your username or user id there" className="flex-1 border rounded-md px-2 py-1" aria-label="Account id" />
            <button className="bg-blue-600 text-white px-3 py-1 rounded-md">Link</button>
          </form>
        </section>

        <section className="bg-white rounded-lg shadow p-4 text-sm">
          <h2 className="font-semibold mb-2">My personal sources (optional)</h2>
          <ul className="space-y-1 mb-3">
            {personal.map(i => (
              <li key={i.id} className="flex flex-wrap gap-3">{SOURCES[i.provider]} · {i.status} · last sync {fmtTime(i.last_sync_at)}{i.last_error ? ` · ${i.last_error}` : ''}
                <button onClick={() => call(`/api/integrations/${i.id}/sync`, { method: 'POST' }, 'Synced.')} className="text-blue-600 hover:underline">Sync now</button>
                <button onClick={() => call(`/api/integrations/${i.id}`, { method: 'PATCH', body: JSON.stringify({ status: i.status === 'active' ? 'paused' : 'active' }) }, 'Updated.')} className="text-gray-600 hover:underline">{i.status === 'active' ? 'Pause' : 'Resume'}</button>
                <button onClick={() => call(`/api/integrations/${i.id}`, { method: 'DELETE' }, 'Disconnected.')} className="text-red-600 hover:underline">Disconnect</button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 items-center">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route that redirects to Google, not a page */}
            <a href="/api/integrations/google/start" className="bg-white border px-3 py-1 rounded-md hover:bg-gray-50">Connect my Google Drive</a>
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); call('/api/integrations', { method: 'POST', body: JSON.stringify({ provider: 'elevenlabs', credential: elKey }) }, 'ElevenLabs connected.'); setElKey(''); }}>
              <input value={elKey} onChange={e => setElKey(e.target.value)} type="password" placeholder="ElevenLabs API key (history read)" className="border rounded-md px-2 py-1" aria-label="ElevenLabs API key" />
              <button className="bg-white border px-3 py-1 rounded-md">Connect ElevenLabs</button>
            </form>
          </div>
          <p className="text-xs text-gray-500 mt-2">Drive: titles of files you create or edit, never contents. ElevenLabs: voice, character count and time; your text is used only to guess the project and is not stored.</p>
        </section>

        {mine?.consent.accepted && (
          <p className="text-xs text-gray-500">You accepted the notice on {fmtTime(mine.consent.accepted_at)}. <button onClick={() => call('/api/activity/consent', { method: 'DELETE' }, 'Withdrawn: nothing new is captured.')} className="underline">Withdraw</button></p>
        )}
      </div>
    </div>
  );
}
