'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { lookupDeviceCode, approveDeviceCode } from '@/lib/oauth-grants';

interface Stream {
  id: string;
  name: string;
  category: string;
}

function DeviceFlowContent() {
  const searchParams = useSearchParams();
  const userCodeParam = searchParams.get('user_code');
  
  const [step, setStep] = useState<'enter' | 'confirm' | 'success' | 'error'>('enter');
  const [userCode, setUserCode] = useState(userCodeParam || '');
  const [deviceInfo, setDeviceInfo] = useState<{
    clientName: string;
    scopes: string[];
    status: string;
    expiresAt: Date;
  } | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [selectedStreams, setSelectedStreams] = useState<string[]>([]);
  const [allowCreate, setAllowCreate] = useState(false);
  const [agentLabel, setAgentLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userCodeParam) {
      handleLookupCode(userCodeParam);
    }
  }, [userCodeParam]);

  async function handleLookupCode(code?: string) {
    const codeToLookup = code || userCode.trim().toUpperCase();
    if (!codeToLookup) {
      setError('Please enter a user code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/oauth/device/lookup?user_code=${encodeURIComponent(codeToLookup)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid or expired code');
        setLoading(false);
        return;
      }

      setDeviceInfo(data);
      
      // Fetch user's streams
      const streamsRes = await fetch('/api/streams');
      if (streamsRes.ok) {
        const streamsData = await streamsRes.json();
        setStreams(streamsData.streams || []);
      }

      setStep('confirm');
      setLoading(false);
    } catch (err) {
      setError('Failed to verify code');
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!agentLabel.trim()) {
      setError('Please enter an agent name');
      return;
    }

    if (selectedStreams.length === 0 && !allowCreate) {
      setError('Please select at least one stream or allow stream creation');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/oauth/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_code: userCode.trim().toUpperCase(),
          agent_label: agentLabel.trim(),
          stream_ids: selectedStreams,
          allow_create_streams: allowCreate
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to approve connection');
        setLoading(false);
        return;
      }

      setStep('success');
      setLoading(false);
    } catch (err) {
      setError('Failed to approve connection');
      setLoading(false);
    }
  }

  if (step === 'enter') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold mb-2">Connect a Device</h1>
          <p className="text-gray-600 mb-6">
            Enter the code shown on your device or script
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="user-code" className="block text-sm font-medium text-gray-700 mb-2">
                User Code
              </label>
              <input
                id="user-code"
                type="text"
                value={userCode}
                onChange={(e) => {
                  setUserCode(e.target.value.toUpperCase());
                  setError(null);
                }}
                placeholder="BURE-XY3K"
                maxLength={9}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-lg text-center"
              />
              <p className="mt-1 text-xs text-gray-500">
                Enter the 9-character code shown on your device (e.g., BURE-XY3K)
              </p>
            </div>

            <button
              onClick={() => handleLookupCode()}
              disabled={loading || !userCode.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition"
            >
              {loading ? 'Verifying...' : 'Continue'}
            </button>
          </div>

          <div className="mt-6 text-sm text-gray-500">
            <p><strong>Don't have a code?</strong></p>
            <p className="mt-2">Run this command to get a code:</p>
            <pre className="mt-2 bg-gray-100 p-3 rounded-md overflow-x-auto text-xs">
{`curl -X POST ${process.env.NEXT_PUBLIC_APP_URL || 'https://bureau-krustbuild.vercel.app'}/api/oauth/device \\
  -H "Content-Type: application/json" \\
  -d '{"client_id":"script-device"}'`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'confirm' && deviceInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold mb-2">Authorize Device</h1>
          <p className="text-gray-600 mb-6">
            <strong>{deviceInfo.clientName}</strong> wants to connect to your Bureau workspace
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2 text-sm">
            <div><strong>Device Code:</strong> <span className="font-mono">{userCode}</span></div>
            <div><strong>Client:</strong> {deviceInfo.clientName}</div>
            <div><strong>Scopes:</strong> {deviceInfo.scopes.join(', ')}</div>
          </div>

          <div className="space-y-6">
            <div>
              <label htmlFor="agent-label" className="block text-sm font-medium text-gray-700 mb-2">
                Agent Name *
              </label>
              <input
                id="agent-label"
                type="text"
                value={agentLabel}
                onChange={(e) => setAgentLabel(e.target.value)}
                placeholder="e.g. My CLI Script"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                A label to identify this device/script in your Bureau workspace
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Allowed Streams *
              </label>
              <div className="border border-gray-300 rounded-md max-h-48 overflow-y-auto p-3 space-y-2">
                {streams.length === 0 ? (
                  <p className="text-sm text-gray-500">No streams yet. Enable "Allow creating streams" below.</p>
                ) : (
                  streams.map(stream => (
                    <label key={stream.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedStreams.includes(stream.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStreams([...selectedStreams, stream.id]);
                          } else {
                            setSelectedStreams(selectedStreams.filter(id => id !== stream.id));
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{stream.name} <span className="text-gray-500">({stream.category})</span></span>
                    </label>
                  ))
                )}
              </div>
              <label className="flex items-center space-x-2 mt-3">
                <input
                  type="checkbox"
                  checked={allowCreate}
                  onChange={(e) => setAllowCreate(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Allow this device to create new streams</span>
              </label>
              <p className="mt-1 text-xs text-gray-500">
                Select which streams this device can write to.
              </p>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition"
              >
                {loading ? 'Authorizing...' : 'Authorize'}
              </button>
              <button
                onClick={() => {
                  setStep('enter');
                  setUserCode('');
                  setDeviceInfo(null);
                  setError(null);
                }}
                disabled={loading}
                className="flex-1 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-md transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Device Authorized!</h1>
          <p className="text-gray-600 mb-6">
            Your device is now connected to Bureau. You can close this page and return to your script.
          </p>
          <a
            href="/connections"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md transition"
          >
            View Connections
          </a>
        </div>
      </div>
    );
  }

  return null;
}

export default function DeviceFlowPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <DeviceFlowContent />
    </Suspense>
  );
}
