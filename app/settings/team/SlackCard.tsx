'use client';

import { useCallback, useEffect, useState } from 'react';

interface Link {
  slack_user_id: string;
  slack_display_name: string | null;
  slack_email: string | null;
  member_user_id: string | null;
  member_email: string | null;
  linked_how: 'email' | 'manual' | null;
}
interface Status {
  configured: boolean;
  can_manage: boolean;
  is_leader: boolean;
  installation: { team_id: string; team_name: string | null; status: 'active' | 'revoked' | 'uninstalled'; installed_at: string | null } | null;
  me: { slack_user_id: string; slack_display_name: string | null } | null;
  links: Link[];
  members: Array<{ user_id: string; email: string; role: string }>;
}

const FLAGS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Slack is connected. Mention @Bureau in a channel, DM it, or type /bureau help.' },
  denied: { ok: false, text: 'The Slack install was cancelled.' },
  invalid_state: { ok: false, text: 'That Slack install link expired or came from another browser. Please try again.' },
  owner_only: { ok: false, text: 'Only workspace owners can connect Slack.' },
  not_configured: { ok: false, text: 'The Slack app is not configured on this Bureau server yet.' },
  team_taken: { ok: false, text: 'That Slack workspace is already connected to a different Bureau workspace.' },
  workspace_has_other_team: { ok: false, text: 'Another Slack workspace is already connected. Disconnect it first.' },
  error: { ok: false, text: 'Slack did not complete the install. Please try again.' },
};

async function fetchStatus(): Promise<Status | null> {
  const res = await fetch('/api/slack/status');
  return res.ok ? ((await res.json()) as Status) : null;
}

export default function SlackCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(() => {
    if (typeof window === 'undefined') return null;
    const flag = new URLSearchParams(window.location.search).get('slack');
    return flag && FLAGS[flag] ? FLAGS[flag] : null;
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchStatus().then(s => { if (s) setStatus(s); });
  }, []);

  useEffect(() => {
    let live = true;
    fetchStatus().then(s => { if (live && s) setStatus(s); });
    return () => { live = false; };
  }, []);

  async function refreshMembers() {
    setBusy(true);
    const res = await fetch('/api/slack/members', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setNotice(res.ok
      ? { ok: true, text: `Checked ${data.seen} Slack members: ${data.linked} linked by email, ${data.unlinked} not matched.` }
      : { ok: false, text: data.error || 'Could not refresh Slack members.' });
    setBusy(false);
    load();
  }

  async function link(slackUserId: string, memberUserId: string) {
    const res = await fetch('/api/slack/members', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slack_user_id: slackUserId, member_user_id: memberUserId || null }),
    });
    if (!res.ok) setNotice({ ok: false, text: (await res.json().catch(() => ({}))).error || 'Could not update the link.' });
    load();
  }

  async function disconnect() {
    if (!confirm('Disconnect Bureau from Slack? @Bureau and /bureau will stop answering until it is reconnected.')) return;
    setBusy(true);
    await fetch('/api/slack/install', { method: 'DELETE' });
    setBusy(false);
    setNotice({ ok: true, text: 'Slack disconnected.' });
    load();
  }

  if (!status) return null;
  const inst = status.installation;
  const active = inst?.status === 'active';

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold">Slack</h2>
        {active && <span className="text-sm text-green-700 font-medium">Connected to {inst?.team_name || 'Slack'}</span>}
        {inst && !active && <span className="text-sm text-yellow-700 font-medium">{inst.status === 'revoked' ? 'Access revoked' : 'Disconnected'}</span>}
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Ask Bureau from Slack: <code>@Bureau status jack</code>, <code>@Bureau ask jack is the release on track?</code>, a DM, or <code>/bureau digest weekly</code>.
        Answers come from Bureau data only. Requests are logged to the asker&apos;s activity if they accepted the activity notice.
      </p>

      {notice && (
        <div className={`${notice.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'} border rounded-md p-3 mb-4 text-sm`}>{notice.text}</div>
      )}

      {!status.configured && <p className="text-sm text-gray-500">The Slack app has not been set up on this Bureau server yet.</p>}

      {status.configured && status.can_manage && (
        <div className="flex gap-3 mb-4">
          {!active && (
            <a href="/api/slack/install" className="bg-gray-900 hover:bg-black text-white font-medium py-2 px-4 rounded-md">Add to Slack</a>
          )}
          {active && (
            <button onClick={disconnect} disabled={busy} className="text-red-600 hover:text-red-700 text-sm font-medium">Disconnect</button>
          )}
        </div>
      )}
      {status.configured && !status.can_manage && !active && (
        <p className="text-sm text-gray-500">A workspace owner can connect Slack here.</p>
      )}

      {active && (
        <p className="text-sm text-gray-700 mb-4">
          {status.me ? <>You are linked as <strong>{status.me.slack_display_name || status.me.slack_user_id}</strong> in Slack.</> : <>You are not linked to a Slack user yet. Your Slack email needs to match your Bureau email, or ask an owner to link you.</>}
        </p>
      )}

      {active && status.is_leader && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Slack members</h3>
            <button onClick={refreshMembers} disabled={busy} className="text-blue-600 hover:underline text-sm">{busy ? 'Working…' : 'Refresh Slack members'}</button>
          </div>
          {status.links.length === 0 && <p className="text-sm text-gray-500">No Slack members seen yet. Click Refresh Slack members.</p>}
          <div className="space-y-2">
            {status.links.map(l => (
              <div key={l.slack_user_id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md text-sm">
                <div>
                  <span className="font-medium">{l.slack_display_name || l.slack_user_id}</span>
                  {l.slack_email && <span className="text-gray-500"> · {l.slack_email}</span>}
                  {l.linked_how && <span className="text-gray-400"> · linked by {l.linked_how}</span>}
                </div>
                <select
                  value={l.member_user_id || ''}
                  onChange={e => link(l.slack_user_id, e.target.value)}
                  className="border border-gray-300 rounded-md px-2 py-1"
                >
                  <option value="">Not linked</option>
                  {status.members.map(m => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
