'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { fmtTime } from '@/components/work/work-units';

interface Integration { id: string; provider: string; label: string; personal: boolean; owner_email: string | null; status: string; config: { project_map?: Record<string, string> }; webhook_url: string | null; last_event_at: string | null; last_sync_at: string | null; last_error: string | null }
interface IdLink { id: string; user_id: string; email: string | null; provider: string; external_id: string }

const SETUP: Record<string, { label: string; needs: 'none' | 'secret' | 'key'; how: string }> = {
  github: { label: 'GitHub', needs: 'none', how: 'Org or repo Settings → Webhooks → Add webhook. Payload URL below, content type application/json, the secret shown once after you click Connect. Events: Pushes, Pull requests, Pull request reviews.' },
  vercel: { label: 'Vercel', needs: 'secret', how: 'Team Settings → Webhooks (Pro/Enterprise). URL below; events deployment.created, succeeded, error, promoted. Paste the secret Vercel shows.' },
  linear: { label: 'Linear', needs: 'secret', how: 'Settings → API → Webhooks → New webhook. URL below, resource type Issues. Paste the signing secret Linear shows.' },
  sentry: { label: 'Sentry', needs: 'secret', how: 'Settings → Developer Settings → New internal integration. Webhook URL below, enable Issue events. Paste the integration Client Secret.' },
  higgsfield: { label: 'Higgsfield (org usage)', needs: 'key', how: 'Organization owner: Settings → Usage → Team usage → API keys → Add, permission Usage (read:usage) only. Paste the key.' },
};

/** Workspace sources (owners/admins): connect, map repos/teams to projects, link people. */
export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[]>([]);
  const [links, setLinks] = useState<IdLink[]>([]);
  const [leader, setLeader] = useState<boolean | null>(null);
  const [provider, setProvider] = useState('github');
  const [secret, setSecret] = useState('');
  const [label, setLabel] = useState('');
  const [shownSecret, setShownSecret] = useState<string | null>(null);
  const [mapText, setMapText] = useState<Record<string, string>>({});
  const [linkForm, setLinkForm] = useState({ user_id: '', provider: 'github', external_id: '' });
  const [people, setPeople] = useState<Array<{ user_id: string; email: string | null }>>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [i, l, b] = await Promise.all([
      fetch('/api/integrations').then(r => r.json()),
      fetch('/api/identity-links').then(r => r.json()),
      fetch('/api/work?view=board&days=1').then(r => r.json()),
    ]);
    setLeader(!!i.is_leader);
    setItems(i.integrations || []);
    setLinks(l.links || []);
    setPeople(b.board?.people || []);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    load();
  }, [load]);

  const send = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(out.error || 'Something went wrong'); else setMsg(null);
    load();
    return res.ok ? out : null;
  };
  const connect = async () => {
    const need = SETUP[provider].needs;
    const out = await send('/api/integrations', 'POST', { provider, label, ...(need === 'secret' ? { secret } : need === 'key' ? { credential: secret } : {}) });
    if (out?.signing_secret) setShownSecret(out.signing_secret);
    setSecret(''); setLabel('');
  };
  const saveMap = (i: Integration) => {
    const map: Record<string, string> = {};
    for (const line of (mapText[i.id] ?? '').split('\n')) {
      const [k, v] = line.split('=').map(s => s?.trim());
      if (k && v) map[k] = v;
    }
    send(`/api/integrations/${i.id}`, 'PATCH', { config: { project_map: map } });
  };

  if (leader === false) {
    return <div className="p-8 text-sm">Only workspace owners and admins manage sources. <Link href="/my-activity" className="text-blue-600 hover:underline">My activity</Link></div>;
  }
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Work sources</h1>
            <p className="text-gray-600 mt-1">Connected tools feed the work board. Every delivery is signature-checked; secrets are encrypted and never shown again.</p>
          </div>
          <Link href="/work" className="text-blue-600 hover:underline text-sm">← Work</Link>
        </div>
        {msg && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">{msg}</div>}
        {shownSecret && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            <p className="font-semibold">GitHub webhook secret (shown once, copy it now):</p>
            <code className="break-all">{shownSecret}</code>
            <button onClick={() => { navigator.clipboard?.writeText(shownSecret); }} className="ml-3 text-blue-600 hover:underline">Copy</button>
            <button onClick={() => setShownSecret(null)} className="ml-3 text-gray-600 hover:underline">Done</button>
          </div>
        )}

        <section className="bg-white rounded-lg shadow p-4 text-sm space-y-3">
          <h2 className="font-semibold">Connect a source</h2>
          <div className="flex flex-wrap gap-2">
            <select value={provider} onChange={e => setProvider(e.target.value)} className="border rounded-md px-2 py-1" aria-label="Source">
              {Object.entries(SETUP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional)" className="border rounded-md px-2 py-1" aria-label="Label" />
            {SETUP[provider].needs !== 'none' && (
              <input value={secret} onChange={e => setSecret(e.target.value)} type="password" placeholder={SETUP[provider].needs === 'key' ? 'API key' : 'Signing secret'} className="border rounded-md px-2 py-1 flex-1" aria-label="Secret" />
            )}
            <button onClick={connect} className="bg-blue-600 text-white px-3 py-1 rounded-md">Connect</button>
          </div>
          <p className="text-gray-600">{SETUP[provider].how}</p>
          <p className="text-xs text-gray-500">Google Drive and ElevenLabs are personal: each person connects their own on My activity.</p>
        </section>

        <section className="bg-white rounded-lg shadow p-4 text-sm">
          <h2 className="font-semibold mb-3">Connected</h2>
          <ul className="divide-y">
            {items.map(i => (
              <li key={i.id} className="py-3 space-y-1">
                <div className="flex flex-wrap gap-3 items-center">
                  <strong>{SETUP[i.provider]?.label || i.provider}</strong>{i.label && <span>{i.label}</span>}
                  {i.personal && <span className="text-gray-500">personal · {i.owner_email}</span>}
                  <span className="text-gray-500">{i.status} · last {fmtTime(i.last_event_at || i.last_sync_at)}</span>
                  {i.last_error && <span className="text-red-700">{i.last_error}</span>}
                  {!i.personal && <button onClick={() => send(`/api/integrations/${i.id}`, 'PATCH', { status: i.status === 'active' ? 'paused' : 'active' })} className="text-gray-600 hover:underline">{i.status === 'active' ? 'Pause' : 'Resume'}</button>}
                  {i.provider === 'github' && <button onClick={async () => { const o = await send(`/api/integrations/${i.id}`, 'PATCH', { rotate_secret: true }); if (o?.signing_secret) setShownSecret(o.signing_secret); }} className="text-gray-600 hover:underline">New secret</button>}
                  {i.provider === 'higgsfield' && <button onClick={() => send(`/api/integrations/${i.id}/sync`, 'POST')} className="text-blue-600 hover:underline">Sync now</button>}
                  {!i.personal && <button onClick={() => confirm('Disconnect this source?') && send(`/api/integrations/${i.id}`, 'DELETE')} className="text-red-600 hover:underline">Disconnect</button>}
                </div>
                {i.webhook_url && <div className="text-xs">Webhook URL: <code className="break-all">{i.webhook_url}</code></div>}
                {!i.personal && (
                  <div className="text-xs">
                    <textarea
                      value={mapText[i.id] ?? Object.entries(i.config.project_map || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
                      onChange={e => setMapText({ ...mapText, [i.id]: e.target.value })}
                      placeholder={'Map repos / teams / projects to Bureau projects, one per line:\ntravisbuilds/bureau=bureau'}
                      className="w-full border rounded-md p-2 font-mono" rows={2} aria-label="Project map"
                    />
                    <button onClick={() => saveMap(i)} className="text-blue-600 hover:underline">Save project map</button>
                  </div>
                )}
              </li>
            ))}
            {!items.length && <li className="py-3 text-gray-500">Nothing connected yet.</li>}
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow p-4 text-sm">
          <h2 className="font-semibold mb-2">People ↔ accounts</h2>
          <p className="text-gray-600 mb-2">Events are credited only to linked accounts (or a matching work email), and only for people who accepted the notice. Everything else is dropped.</p>
          <ul className="space-y-1 mb-3">
            {links.map(l => (
              <li key={l.id} className="flex gap-3">{l.email}: {l.provider} <strong>{l.external_id}</strong>
                <button onClick={() => send(`/api/identity-links/${l.id}`, 'DELETE')} className="text-red-600 hover:underline">Remove</button>
              </li>
            ))}
          </ul>
          <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); send('/api/identity-links', 'POST', linkForm); setLinkForm({ ...linkForm, external_id: '' }); }}>
            <select value={linkForm.user_id} onChange={e => setLinkForm({ ...linkForm, user_id: e.target.value })} className="border rounded-md px-2 py-1" aria-label="Person">
              <option value="">Me</option>
              {people.map(p => <option key={p.user_id} value={p.user_id}>{p.email}</option>)}
            </select>
            <select value={linkForm.provider} onChange={e => setLinkForm({ ...linkForm, provider: e.target.value })} className="border rounded-md px-2 py-1" aria-label="Provider">
              {['github', 'vercel', 'linear', 'sentry', 'higgsfield'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={linkForm.external_id} onChange={e => setLinkForm({ ...linkForm, external_id: e.target.value })} placeholder="username / user id" className="border rounded-md px-2 py-1" aria-label="Account id" />
            <button className="bg-blue-600 text-white px-3 py-1 rounded-md">Link</button>
          </form>
        </section>
      </div>
    </div>
  );
}
