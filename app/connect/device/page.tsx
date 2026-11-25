'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { defaultAgentLabel } from '@/lib/display-name';
import ActivityNotice from '@/components/ActivityNotice';
import { scopesForRole, SCOPE_DESCRIPTIONS } from '@/lib/oauth-scopes';

interface Stream {
  id: string;
  name: string;
  category: string;
}

function DeviceFlowContent() {
  const searchParams = useSearchParams();
  const userCodeParam = searchParams.get('user_code');

  const [step, setStep] = useState<'enter' | 'confirm' | 'success'>('enter');
  const [userCode, setUserCode] = useState((userCodeParam || '').toUpperCase());
  const [deviceInfo, setDeviceInfo] = useState<{ clientName: string; scopes: string[] } | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [selectedStreams, setSelectedStreams] = useState<string[]>([]);
  const [allowCreate, setAllowCreate] = useState(true);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [agentLabel, setAgentLabel] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(!!userCodeParam);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userCodeParam) handleLookupCode(userCodeParam.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCodeParam]);

  async function handleLookupCode(code?: string) {
    const codeToLookup = (code || userCode).trim().toUpperCase();
    if (!codeToLookup) {
      setError('Please enter the code your bot showed you');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/oauth/device/lookup?user_code=${encodeURIComponent(codeToLookup)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'That code is wrong or has expired. Ask your bot for a new link.');
        setStep('enter');
        return;
      }
      setUserCode(codeToLookup);
      setDeviceInfo(data);
      const [streamsRes, meRes] = await Promise.all([fetch('/api/streams'), fetch('/api/oauth/me')]);
      if (streamsRes.ok) {
        const list: Stream[] = (await streamsRes.json()).streams || [];
        setStreams(list);
        setSelectedStreams(list.map(s => s.id)); // default: all streams
      }
      const me = meRes.ok ? await meRes.json() : {};
      setAgentLabel(defaultAgentLabel(me.first_name || '', data.clientName));
      setRole(me.role ?? null);
      setStep('confirm');
    } catch {
      setError('Couldn\u2019t check that code. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/oauth/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_code: userCode,
          agent_label: agentLabel.trim() || defaultAgentLabel('', deviceInfo?.clientName),
          stream_ids: selectedStreams,
          allow_create_streams: allowCreate,
          activity_notice_accepted: noticeAccepted,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Approval failed');
        return;
      }
      setStep('success');
    } catch {
      setError('Approval failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const errorBox = error && (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-sm text-red-800">{error}</div>
  );

  if (loading && step === 'enter') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (step === 'enter') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-2xl font-bold mb-2">Connect your bot</h1>
          <p className="text-gray-600 mb-6">Type the code your bot showed you.</p>
          {errorBox}
          <input
            id="user-code"
            type="text"
            value={userCode}
            onChange={(e) => { setUserCode(e.target.value.toUpperCase()); setError(null); }}
            placeholder="BURE-XY3K"
            maxLength={9}
            className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-lg text-center"
          />
          <button
            onClick={() => handleLookupCode()}
            disabled={!userCode.trim()}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 rounded-md"
          >
            Continue
          </button>
          <p className="mt-6 text-sm text-gray-500">
            No code? Go to <a href="/connect" className="text-blue-600 hover:underline">Connect</a> and pick your AI app.
          </p>
        </div>
      </div>
    );
  }

  if (step === 'confirm' && deviceInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-2xl font-bold mb-2">Connect {deviceInfo.clientName} to Bureau?</h1>
          <p className="text-gray-600 mb-4">Check that your bot shows this same code:</p>
          <div className="text-center font-mono text-3xl tracking-widest bg-gray-100 rounded-lg py-4 mb-6" aria-label="Device code">
            {userCode}
          </div>
          {errorBox}
          <p className="text-sm text-gray-600 mb-6">
            It will appear on your team page as <strong>{agentLabel.trim() || deviceInfo.clientName}</strong>.
          </p>
          {/* Same rule pollDeviceCode applies when it mints: owners/admins get team:read, members never do */}
          <ul className="mb-6 space-y-1 text-sm text-gray-700 list-disc pl-5">
            {scopesForRole(deviceInfo.scopes || [], role).map(s => <li key={s}>{SCOPE_DESCRIPTIONS[s] || s}</li>)}
          </ul>
          <ActivityNotice checked={noticeAccepted} onChange={setNoticeAccepted} />
          <button
            onClick={handleApprove}
            disabled={loading || !noticeAccepted}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-lg font-medium py-3 rounded-md"
          >
            {loading ? 'Connecting\u2026' : 'Approve'}
          </button>
          <div className="mt-3 flex justify-between text-sm">
            <button onClick={() => setShowAdvanced(v => !v)} className="text-gray-500 hover:underline">
              {showAdvanced ? 'Hide options' : 'Options'}
            </button>
            <a href="/connect" className="text-gray-500 hover:underline">Not my code</a>
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
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Connected</h1>
          <p className="text-gray-600 mb-6">Go back to your bot. It will finish on its own in a few seconds.</p>
          <a href="/top-floor" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md">
            Back to Bureau
          </a>
        </div>
      </div>
    );
  }

  return null;
}

export default function DeviceFlowPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <DeviceFlowContent />
    </Suspense>
  );
}
