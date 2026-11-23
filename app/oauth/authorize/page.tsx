'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface Client {
  client_id: string;
  client_name: string;
  verified: boolean;
  vendor: string | null;
}

interface Stream {
  id: string;
  name: string;
  category: string;
}

export default function OAuthAuthorizePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [client, setClient] = useState<Client | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  
  const [agentLabel, setAgentLabel] = useState('');
  const [selectedStreams, setSelectedStreams] = useState<string[]>([]);
  const [allowCreate, setAllowCreate] = useState(false);
  
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const state = searchParams.get('state');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');
  const resource = searchParams.get('resource');
  const scope = searchParams.get('scope');
  
  useEffect(() => {
    async function loadConsentData() {
      try {
        // Validate required params
        if (!clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== 'S256') {
          setError('Missing or invalid OAuth parameters');
          setLoading(false);
          return;
        }
        
        // Fetch client info
        const clientRes = await fetch(`/api/oauth/client?client_id=${encodeURIComponent(clientId)}`);
        if (!clientRes.ok) {
          setError('Unknown client');
          setLoading(false);
          return;
        }
        const clientData = await clientRes.json();
        setClient(clientData);
        
        // Fetch user's streams
        const streamsRes = await fetch('/api/streams');
        if (streamsRes.ok) {
          const streamsData = await streamsRes.json();
          setStreams(streamsData.streams || []);
        }
        
        setLoading(false);
      } catch (err) {
        setError('Failed to load consent data');
        setLoading(false);
      }
    }
    
    loadConsentData();
  }, [clientId, redirectUri, codeChallenge, codeChallengeMethod]);
  
  async function handleApprove() {
    if (!agentLabel.trim()) {
      alert('Please enter an agent name');
      return;
    }
    
    if (selectedStreams.length === 0 && !allowCreate) {
      alert('Please select at least one stream or allow stream creation');
      return;
    }
    
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
          scopes: scope?.split(' ') || ['ingest:write'],
          agent_label: agentLabel.trim(),
          stream_ids: selectedStreams,
          allow_create_streams: allowCreate,
          approved: true
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Authorization failed');
        setApproving(false);
        return;
      }
      
      // Redirect back to client with code
      const redirectUrl = new URL(redirectUri);
      redirectUrl.searchParams.set('code', data.code);
      if (state) {
        redirectUrl.searchParams.set('state', state);
      }
      
      window.location.href = redirectUrl.toString();
    } catch (err) {
      setError('Failed to authorize');
      setApproving(false);
    }
  }
  
  async function handleDeny() {
    if (!redirectUri) return;
    
    // Redirect with error
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('error', 'access_denied');
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }
    
    window.location.href = redirectUrl.toString();
  }
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (error || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Authorization Error</h1>
          <p className="text-gray-700">{error || 'Invalid request'}</p>
          <a href="/top-floor" className="mt-4 inline-block text-blue-600 hover:underline">
            Return to Bureau
          </a>
        </div>
      </div>
    );
  }
  
  const redirectHost = redirectUri ? new URL(redirectUri).host : 'unknown';
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-3xl font-bold mb-2">Authorize Agent Connection</h1>
        <p className="text-gray-600 mb-6">
          <strong>{client.client_name}</strong> wants to connect to your Bureau workspace
        </p>
        
        {!client.verified && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-800">
              <strong>⚠️ Unverified Client</strong><br/>
              This client is not on Bureau's verified vendor list. Only approve if you trust this application.
              {client.registration === 'cimd' && client.client_id && (
                <><br/><span className="font-mono text-xs">Client ID: {new URL(client.client_id).hostname}</span></>
              )}
            </p>
          </div>
        )}
        
        <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2 text-sm">
          <div><strong>Client:</strong> {client.client_name}</div>
          <div><strong>Redirect to:</strong> {redirectHost}</div>
          {resource && <div><strong>Resource:</strong> {resource}</div>}
          <div><strong>Scopes:</strong> {scope || 'ingest:write'}</div>
        </div>
        
        <div className="space-y-6">
          {/* Agent Name */}
          <div>
            <label htmlFor="agent-label" className="block text-sm font-medium text-gray-700 mb-2">
              Agent Name *
            </label>
            <input
              id="agent-label"
              type="text"
              value={agentLabel}
              onChange={(e) => setAgentLabel(e.target.value)}
              placeholder="e.g. My Assistant"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              A label to identify this agent in your Bureau workspace
            </p>
          </div>
          
          {/* Stream Selection */}
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
              <span className="text-sm">Allow this agent to create new streams</span>
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Select which streams this agent can write to. Unselected streams will be inaccessible.
            </p>
          </div>
          
          {/* Actions */}
          <div className="flex space-x-4">
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition"
            >
              {approving ? 'Authorizing...' : 'Authorize'}
            </button>
            <button
              onClick={handleDeny}
              disabled={approving}
              className="flex-1 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-md transition"
            >
              Deny
            </button>
          </div>
        </div>
        
        <p className="mt-6 text-xs text-gray-500 text-center">
          By authorizing, you allow {client.client_name} to access Bureau on your behalf with the permissions above.
          You can revoke access anytime from your Bureau settings.
        </p>
      </div>
    </div>
  );
}
