'use client';

import { useEffect, useState } from 'react';
import { formatFullDateTime } from '@/lib/timezone-utils';

interface Token {
  id: string;
  name: string;
  token: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export default function ConnectAgentPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [justCreatedToken, setJustCreatedToken] = useState<string | null>(null);
  
  useEffect(() => {
    loadTokens();
  }, []);
  
  async function loadTokens() {
    try {
      const res = await fetch('/api/tokens');
      const data = await res.json();
      setTokens(data.tokens || []);
    } catch (err) {
      console.error('Failed to load tokens:', err);
    } finally {
      setLoading(false);
    }
  }
  
  async function createToken() {
    setCreating(true);
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Agent Token' })
      });
      const data = await res.json();
      if (data.success) {
        setJustCreatedToken(data.token); // Show full token only once
        await loadTokens();
        // Clear after 30 seconds
        setTimeout(() => setJustCreatedToken(null), 30000);
      }
    } catch (err) {
      console.error('Failed to create token:', err);
    } finally {
      setCreating(false);
    }
  }
  
  const latestToken = tokens.find(t => t.revoked_at === null);
  
  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Connect Your Agent</h1>
        <p className="text-slate-600 mb-8">
          Use this token to push costs, findings, and updates from your agents to Bureau.
        </p>
        
        {loading ? (
          <div className="text-slate-500">Loading...</div>
        ) : tokens.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
            <div className="mb-4 text-6xl">🤖</div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No tokens yet
            </h3>
            <p className="text-slate-600 mb-6">
              Create a token to connect your agents
            </p>
            <button
              onClick={createToken}
              disabled={creating}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Token'}
            </button>
          </div>
        ) : (
          <div>
            {/* Token display */}
            {latestToken && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-slate-700">Your Token</label>
                  <button
                    onClick={() => navigator.clipboard.writeText(justCreatedToken || latestToken.token)}
                    className="text-sm text-purple-600 hover:text-purple-700"
                  >
                    Copy
                  </button>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg font-mono text-sm break-all">
                  {justCreatedToken ? (
                    <div>
                      <div className="mb-2 text-green-600 text-xs font-normal">✓ Token created! Copy now - it won't be shown again.</div>
                      {justCreatedToken}
                    </div>
                  ) : (
                    `bureau_••••${latestToken.token.slice(-4)}`
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Created: {formatFullDateTime(latestToken.created_at)}
                  {latestToken.last_used_at && (
                    <span className="ml-4">
                      Last used: {formatFullDateTime(latestToken.last_used_at)}
                    </span>
                  )}
                </p>
              </div>
            )}
            
            {/* Code snippet */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-slate-900 mb-3">Usage Example</h3>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm">{`curl -X POST http://localhost:3000/api/ingest \\
  -H "Authorization: Bearer ${justCreatedToken || (latestToken ? `bureau_••••${latestToken.token.slice(-4)}` : 'YOUR_TOKEN')}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "intake",
    "stream": "ember",
    "content": "Published Ep12: 49 views, $30.93 cost",
    "metadata": {
      "output_id": "ep12",
      "cost_usd": 30.93,
      "views": 49
    }
  }'`}</pre>
              </div>
            </div>
            
            {/* Documentation link */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📖</span>
                <div>
                  <h4 className="font-medium text-blue-900 mb-1">Full Documentation</h4>
                  <p className="text-sm text-blue-700 mb-2">
                    See <code className="bg-blue-100 px-1 py-0.5 rounded">docs/BUREAU.md</code> for:
                  </p>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Auto-processed cost tracking</li>
                    <li>• ElevenLabs + Higgsfield + YouTube examples</li>
                    <li>• Python integration code</li>
                    <li>• Trust levels and verification</li>
                  </ul>
                </div>
              </div>
            </div>
            
            {/* All tokens */}
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-slate-900 mb-3">All Tokens</h3>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-2 px-4 text-xs font-medium text-slate-600">Name</th>
                      <th className="text-left py-2 px-4 text-xs font-medium text-slate-600">Created</th>
                      <th className="text-left py-2 px-4 text-xs font-medium text-slate-600">Last Used</th>
                      <th className="text-center py-2 px-4 text-xs font-medium text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((token) => (
                      <tr key={token.id} className="border-b border-slate-100">
                        <td className="py-3 px-4 font-medium">{token.name}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">
                          {formatFullDateTime(token.created_at)}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">
                          {token.last_used_at 
                            ? formatFullDateTime(token.last_used_at)
                            : 'Never'
                          }
                        </td>
                        <td className="py-3 px-4 text-center">
                          {token.revoked_at ? (
                            <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full">
                              Revoked
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
                              Active
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
