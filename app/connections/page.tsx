'use client';

import { useState, useEffect } from 'react';
import { Building2, Shield, RefreshCw, Ban, ChevronDown, ChevronRight, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SAMPLE_CONNECTIONS } from '@/lib/sample-connections';
import { Connection, PROVIDER_DEFINITIONS, getConnectionFreshness } from '@/lib/connection-types';

export default function ConnectionsPage() {
  const router = useRouter();
  const [connections] = useState<Connection[]>(SAMPLE_CONNECTIONS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState<number>(0);

  useEffect(() => {
    setNowTimestamp(Date.now());
  }, []);

  const getStatusIcon = (status: Connection['status']) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'stale':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'revoked':
        return <Ban className="w-4 h-4 text-slate-400" />;
      case 'expired':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const getStatusColor = (status: Connection['status']) => {
    switch (status) {
      case 'connected':
        return 'text-green-600 bg-green-50';
      case 'stale':
        return 'text-yellow-600 bg-yellow-50';
      case 'revoked':
        return 'text-slate-600 bg-slate-50';
      case 'expired':
        return 'text-red-600 bg-red-50';
      case 'error':
        return 'text-red-600 bg-red-50';
    }
  };

  const getScopeColor = (scope: string) => {
    switch (scope) {
      case 'read':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'write':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'act':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'admin':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const handleReconnect = (conn: Connection) => {
    alert(`Reconnecting ${PROVIDER_DEFINITIONS[conn.provider].name}...`);
  };

  const handleDowngrade = (conn: Connection) => {
    if (confirm(`Remove write/act permissions from ${PROVIDER_DEFINITIONS[conn.provider].name}? Only read access will remain.`)) {
      alert('Downgraded to read-only');
    }
  };

  const handleRevoke = (conn: Connection) => {
    if (confirm(`Revoke ${PROVIDER_DEFINITIONS[conn.provider].name}? History will be kept but syncing will stop.`)) {
      alert('Connection revoked');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-highstreet-purple" />
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Connections</h1>
                <p className="text-sm text-slate-500">Manage permissions and credentials</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/top-floor')}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              ← Back to Top Floor
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Summary */}
        <div className="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-slate-500 mb-1">Total</div>
              <div className="text-2xl font-semibold text-slate-900">{connections.length}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Active</div>
              <div className="text-2xl font-semibold text-green-600">
                {connections.filter(c => c.status === 'connected').length}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Revoked</div>
              <div className="text-2xl font-semibold text-slate-400">
                {connections.filter(c => c.status === 'revoked').length}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Shared</div>
              <div className="text-2xl font-semibold text-highstreet-purple">
                {connections.filter(c => c.streamsUsing.length > 1).length}
              </div>
            </div>
          </div>
        </div>

        {/* Connections List */}
        <div className="space-y-3">
          {connections.map((conn) => {
            const provider = PROVIDER_DEFINITIONS[conn.provider];
            const freshness = getConnectionFreshness(conn, nowTimestamp);
            const isExpanded = expandedId === conn.id;

            return (
              <div key={conn.id} className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                {/* Main Row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : conn.id)}
                  className="w-full p-6 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      {/* Icon & Name */}
                      <div className="text-2xl">{provider.icon}</div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-slate-900">{provider.name}</h3>
                          
                          {/* Status Badge */}
                          <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${getStatusColor(conn.status)}`}>
                            {getStatusIcon(conn.status)}
                            {conn.status}
                          </span>

                          {/* Method Badge */}
                          <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">
                            {conn.method === 'oauth' ? 'OAuth' : conn.method === 'api-key' ? 'API Key' : conn.method}
                          </span>
                        </div>

                        {/* Scopes */}
                        <div className="flex items-center gap-2 mb-2">
                          {conn.scopes.map((scope) => (
                            <span
                              key={scope}
                              className={`text-xs px-2 py-0.5 rounded border font-medium ${getScopeColor(scope)}`}
                            >
                              {scope}
                            </span>
                          ))}
                          <span className="text-sm text-slate-500">• {conn.scopeDetails}</span>
                        </div>

                        {/* Streams Using */}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-slate-500">Used by:</span>
                          {conn.streamsUsing.length > 0 ? (
                            <div className="flex items-center gap-2">
                              {conn.streamsUsing.map((stream) => (
                                <span key={stream.streamId} className="px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                                  {stream.streamName}
                                  {stream.attributionRule && (
                                    <span className="text-slate-400 ml-1 text-xs">({stream.attributionRule})</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">No streams</span>
                          )}
                        </div>
                      </div>

                      {/* Last Sync */}
                      <div className="text-right">
                        <div className={`text-sm font-medium ${freshness.status === 'fresh' ? 'text-slate-900' : 'text-slate-400'}`}>
                          {freshness.message}
                        </div>
                        {conn.status === 'connected' && (
                          <div className="text-xs text-slate-400 mt-1">Last sync</div>
                        )}
                      </div>

                      {/* Expand Icon */}
                      <div className="text-slate-400">
                        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50 p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      {/* Left Column */}
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Connected By</div>
                          <div className="text-sm font-medium text-slate-900">{conn.connectedByName}</div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500 mb-1">Connected At</div>
                          <div className="text-sm text-slate-900">
                            {new Date(conn.connectedAt).toLocaleString()}
                          </div>
                        </div>

                        {conn.oauthAccountName && (
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Account</div>
                            <div className="text-sm text-slate-900">
                              {conn.oauthAccountName}
                              {conn.oauthAccountId && (
                                <span className="text-slate-500 ml-2">({conn.oauthAccountId})</span>
                              )}
                            </div>
                          </div>
                        )}

                        {conn.apiKeyHint && (
                          <div>
                            <div className="text-xs text-slate-500 mb-1">API Key</div>
                            <div className="text-sm text-slate-900 font-mono">
                              {conn.apiKeyHint}
                              <span className="text-xs text-slate-400 ml-2">({conn.apiKeyType})</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right Column */}
                      <div className="space-y-4">
                        {conn.expiresAt && (
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Expires At</div>
                            <div className="text-sm text-slate-900">
                              {new Date(conn.expiresAt).toLocaleString()}
                            </div>
                          </div>
                        )}

                        {conn.errorMessage && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded">
                            <div className="text-xs text-red-800 font-medium mb-1">Error</div>
                            <div className="text-sm text-red-700">{conn.errorMessage}</div>
                            {conn.errorAt && (
                              <div className="text-xs text-red-600 mt-1">
                                {new Date(conn.errorAt).toLocaleString()}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                          <div className="text-xs text-blue-800 font-medium mb-2">Security</div>
                          <div className="text-xs text-blue-700 space-y-1">
                            <div>✓ Credentials encrypted server-side</div>
                            <div>✓ All actions logged</div>
                            <div>✓ {conn.method === 'oauth' ? 'OAuth tokens' : 'API keys'} never shown after save</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
                      {conn.status === 'connected' && (
                        <>
                          <button
                            onClick={() => handleReconnect(conn)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-highstreet-purple border-2 border-highstreet-purple rounded-lg hover:bg-highstreet-purple hover:text-white transition-colors"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Reconnect
                          </button>

                          {conn.scopes.some(s => s === 'write' || s === 'act') && (
                            <button
                              onClick={() => handleDowngrade(conn)}
                              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                            >
                              Downgrade to Read-Only
                            </button>
                          )}

                          <button
                            onClick={() => handleRevoke(conn)}
                            className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                          >
                            <Ban className="w-4 h-4 inline mr-1" />
                            Revoke
                          </button>
                        </>
                      )}

                      {conn.status === 'revoked' && (
                        <button
                          onClick={() => handleReconnect(conn)}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-highstreet-purple rounded-lg hover:bg-opacity-90"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Reconnect
                        </button>
                      )}

                      {(conn.status === 'expired' || conn.status === 'error') && (
                        <button
                          onClick={() => handleReconnect(conn)}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-highstreet-purple rounded-lg hover:bg-opacity-90"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Reconnect
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Info */}
        <div className="mt-12 p-6 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-slate-400 mt-0.5" />
            <div className="text-sm text-slate-600">
              <p className="font-medium text-slate-900 mb-2">About Connections</p>
              <ul className="space-y-1 text-slate-500">
                <li>• All credentials are AES-encrypted server-side and never shown after save</li>
                <li>• Connections can be shared across multiple streams with per-stream attribution</li>
                <li>• All grants, upgrades, downgrades, and revokes are logged in the audit trail</li>
                <li>• Revoking keeps history but stops syncing — you can reconnect anytime</li>
                <li>• Write/act scopes require explicit approval and enable automation rules</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
