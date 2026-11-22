'use client';

import { useState, useEffect } from 'react';
import { PROVIDER_INFO, ProviderType } from '@/lib/agent-provider-interface';

interface Props {
  projectName: string;
  onBack: () => void;
}

interface Connection {
  providerId: string;
  providerType: string;
  createdAt: string;
  isExpired: boolean;
}

interface Agent {
  id: string;
  displayName: string;
  providerType: string;
  status: string;
  capabilities: string[];
}

export default function ConnectionsPage({ projectName, onBack }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderType | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConnections();
  }, [projectName]);

  const loadConnections = async () => {
    try {
      const res = await fetch(`/api/connections?projectName=${encodeURIComponent(projectName)}`);
      const data = await res.json();
      
      if (res.ok) {
        setConnections(data.connections || []);
        setAgents(data.availableAgents || []);
      }
    } catch (err) {
      console.error('Failed to load connections:', err);
    }
  };

  const handleConnect = async () => {
    if (!selectedProvider) return;
    
    setConnecting(true);
    setError(null);
    
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          providerType: selectedProvider,
          apiKey: apiKey || 'mock-key',
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.message || data.error);
        return;
      }
      
      // Success
      setSelectedProvider(null);
      setApiKey('');
      await loadConnections();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Connections: {projectName}</h1>
              <p className="text-sm text-slate-600 mt-1">
                Sign in agents to dispatch tasks and chat
              </p>
            </div>
            <button
              onClick={onBack}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors text-sm font-medium"
            >
              ← Back
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Connected Agents */}
        {agents.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Connected Agents ({agents.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{agent.displayName}</h3>
                      <p className="text-xs text-slate-500">{agent.providerType}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      agent.status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {agent.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {agent.capabilities.map((cap, i) => (
                      <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add New Connection */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Add New Connection
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {Object.entries(PROVIDER_INFO).map(([type, info]) => (
              <button
                key={type}
                onClick={() => setSelectedProvider(type as ProviderType)}
                className={`p-4 border-2 rounded-lg text-left transition-colors ${
                  selectedProvider === type
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <h3 className="font-semibold text-slate-900 mb-1">{info.name}</h3>
                <p className="text-xs text-slate-600 mb-2">
                  Auth: {info.authType === 'api-key' ? 'API Key' : info.authType}
                </p>
                <div className="flex gap-2 text-xs">
                  {info.supportsDispatch && (
                    <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">Tasks</span>
                  )}
                  {info.supportsChat && (
                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Chat</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {selectedProvider && (
            <div className="border-t border-slate-200 pt-6">
              <h3 className="font-semibold text-slate-900 mb-3">
                Connect to {PROVIDER_INFO[selectedProvider].name}
              </h3>
              
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                <strong>Setup:</strong> {PROVIDER_INFO[selectedProvider].setupInstructions}
              </div>
              
              {selectedProvider === 'mock' ? (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                  <strong>Development Mode:</strong> Mock provider simulates async task execution. No real API calls.
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key..."
                    className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              )}
              
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {error}
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setSelectedProvider(null);
                    setApiKey('');
                    setError(null);
                  }}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConnect}
                  disabled={connecting || (selectedProvider !== 'mock' && !apiKey)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Existing Connections */}
        {connections.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Provider Connections
            </h2>
            <div className="space-y-3">
              {connections.map((conn, i) => (
                <div
                  key={i}
                  className="border border-slate-200 rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      {PROVIDER_INFO[conn.providerType as ProviderType]?.name || conn.providerType}
                    </h3>
                    <p className="text-sm text-slate-500">
                      Connected: {new Date(conn.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded ${
                    conn.isExpired ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {conn.isExpired ? 'Expired' : 'Active'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
