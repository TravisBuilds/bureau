'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DEFAULT_SCOPES, scopesForRole } from '@/lib/oauth-scopes';
import { defaultAgentLabel } from '@/lib/display-name';

interface Client {
  client_id: string;
  client_name: string;
  verified: boolean;
  vendor: string | null;
  registration?: 'static' | 'cimd' | 'dcr';
  redirect_uri_allowed?: boolean;
}

interface Stream {
  id: string;
  name: string;
  category: string;
}

const SCOPE_TEXT: Record<string, string> = {
  'ingest:write': 'Log the work it does (costs and outputs)',
  'clone:write': 'Keep your Digital Clone up to date (daily check-in)',
  'questions:read': 'See questions teammates ask you',
  'questions:write': 'Answer or pass on those questions',
  'team:read': 'See your team\u2019s check-ins and ask teammates\u2019 AIs questions',
};

/** RFC 9207 issuer, sent back with every authorization response. */
function issuer(): string {
  return process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
}

function OAuthAuthorizeContent() {
  const searchParams = useSearchParams();

  const [client, setClient] = useState<Client | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [agentLabel, setAgentLabel] = useState('');
  const [selectedStreams, setSelectedStreams] = useState<string[]>([]);
  const [allowCreate, setAllowCreate] = useState(true);

  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const state = searchParams.get('state');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');
  const resource = searchParams.get('resource');
  const scope = searchParams.get('scope');
  const scopes = scope && scope.trim() ? scope.trim().split(/\s+/) : DEFAULT_SCOPES;

  useEffect(() => {
    async function loadConsentData() {
      try {
        if (!clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== 'S256') {
          setError('This connect link is incomplete. Go back to your AI app and try connecting again.');
          return;
        }

        const clientRes = await fetch(
          `/api/oauth/client?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}`
        );
        if (!clientRes.ok) {
          setError('Bureau doesn\u2019t recognise this app. Go back to your AI app and try connecting again.');
          return;
        }
        const clientData: Client = await clientRes.json();
        if (clientData.redirect_uri_allowed === false) {
          setError('This connect link points somewhere Bureau doesn\u2019t trust, so it was stopped.');
          return;
        }
        setClient(clientData);

        const [streamsRes, meRes] = await Promise.all([fetch('/api/streams'), fetch('/api/oauth/me')]);
        if (streamsRes.ok) {
          const streamsData = await streamsRes.json();
          const list: Stream[] = streamsData.streams || [];
          setStreams(list);
          setSelectedStreams(list.map(s => s.id)); // default: all streams
        }
        const me = meRes.ok ? await meRes.json() : {};
        setAgentLabel(defaultAgentLabel(me.first_name || '', clientData.client_name));
        setRole(me.role ?? null);
      } catch {
        setError('Failed to load. Refresh the page to try again.');
      } finally {
        setLoading(false);
      }
    }

    loadConsentData();
  }, [clientId, redirectUri, codeChallenge, codeChallengeMethod]);

  function backToClient(params: Record<string, string>) {
    if (!redirectUri || !client) return;
    const url = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (state) url.searchParams.set('state', state);
    url.searchParams.set('iss', issuer());
    window.location.href = url.toString();
  }

  async function handleApprove() {
    const label = agentLabel.trim() || defaultAgentLabel('', client?.client_name);
    setApproving(true);
    try {
      const res = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          state,
          code_challenge: codeChallenge,
          resource,
          scopes,
          agent_label: label,
          stream_ids: selectedStreams,
          allow_create_streams: allowCreate,
          approved: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error_description || data.error || 'Approval failed');
        setApproving(false);
        return;
      }
      backToClient({ code: data.code });
    } catch {
      setError('Approval failed. Try again.');
      setApproving(false);
    }
  }

  function handleCancel() {
    backToClient({ error: 'access_denied' });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Couldn&apos;t connect</h1>
          <p className="text-gray-700">{error || 'Invalid request'}</p>
          <a href="/connect" className="mt-4 inline-block text-blue-600 hover:underline">Back to Connect</a>
        </div>
      </div>
    );
  }

  const redirectHost = redirectUri ? new URL(redirectUri).host || redirectUri.split('/')[0] : '';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-2xl font-bold mb-2">Connect {client.client_name} to Bureau?</h1>
        <p className="text-gray-600 mb-6">
          It will appear on your team page as <strong>{agentLabel.trim() || client.client_name}</strong>.
        </p>

        {!client.verified && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6 text-sm text-yellow-800">
            Only approve if you just clicked &quot;Connect&quot; in {client.client_name} yourself.
            {redirectHost && <> It will send you back to <span className="font-mono">{redirectHost}</span>.</>}
          </div>
        )}

        <ul className="mb-6 space-y-1 text-sm text-gray-700 list-disc pl-5">
          {/* Same rule the server applies on approve */}
          {scopesForRole(scopes, role).map(s => <li key={s}>{SCOPE_TEXT[s] || s}</li>)}
        </ul>

        <button
          onClick={handleApprove}
          disabled={approving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-lg font-medium py-3 rounded-md transition"
        >
          {approving ? 'Connecting\u2026' : 'Approve'}
        </button>
        <div className="mt-3 flex justify-between text-sm">
          <button onClick={() => setShowAdvanced(v => !v)} className="text-gray-500 hover:underline">
            {showAdvanced ? 'Hide options' : 'Options'}
          </button>
          <button onClick={handleCancel} disabled={approving} className="text-gray-500 hover:underline">
            Cancel
          </button>
        </div>

        {showAdvanced && (
          <div className="mt-6 space-y-5 border-t pt-5">
            <div>
              <label htmlFor="agent-label" className="block text-sm font-medium text-gray-700 mb-1">Agent name</label>
              <input
                id="agent-label"
                type="text"
                maxLength={100}
                value={agentLabel}
                onChange={(e) => setAgentLabel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <p className="block text-sm font-medium text-gray-700 mb-1">Streams it can log to</p>
              <div className="border border-gray-300 rounded-md max-h-40 overflow-y-auto p-3 space-y-2">
                {streams.length === 0 ? (
                  <p className="text-sm text-gray-500">No streams yet. It can create them.</p>
                ) : (
                  streams.map(stream => (
                    <label key={stream.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedStreams.includes(stream.id)}
                        onChange={(e) => setSelectedStreams(e.target.checked
                          ? [...selectedStreams, stream.id]
                          : selectedStreams.filter(id => id !== stream.id))}
                      />
                      <span className="text-sm">{stream.name}</span>
                    </label>
                  ))
                )}
              </div>
              <label className="flex items-center space-x-2 mt-2">
                <input type="checkbox" checked={allowCreate} onChange={(e) => setAllowCreate(e.target.checked)} />
                <span className="text-sm">Can create new streams</span>
              </label>
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-gray-500 text-center">
          You can disconnect it any time from Connections.
        </p>
      </div>
    </div>
  );
}

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <OAuthAuthorizeContent />
    </Suspense>
  );
}
