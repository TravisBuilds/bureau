'use client';

import { useEffect, useState } from 'react';

interface WorkspaceMember {
  id: string;
  email: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

interface IngestToken {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  user: string;
  details: string;
  status: 'success' | 'error';
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'members' | 'tokens' | 'audit'>('members');
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [tokens, setTokens] = useState<IngestToken[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // DEMO DATA - In production, fetch from API
    setMembers([
      {
        id: '1',
        email: 'travis@bureau.example.com',
        role: 'owner',
        joinedAt: '2026-11-01T00:00:00Z',
      },
    ]);

    setTokens([
      {
        id: '1',
        name: 'Production Ingest',
        token: 'bureau_live_a1b2c3d4',
        createdAt: '2026-11-21T00:00:00Z',
        lastUsedAt: '2026-11-22T05:36:56Z',
      },
    ]);

    setAuditLog([
      {
        id: '1',
        timestamp: '2026-11-22T05:36:56Z',
        action: 'ingest.created',
        user: 'travis@bureau.example.com',
        details: 'Created token: Production Ingest',
        status: 'success',
      },
      {
        id: '2',
        timestamp: '2026-11-22T05:30:00Z',
        action: 'output.created',
        user: 'api.ingest',
        details: 'Ingested Ember Ep12 ($30.93)',
        status: 'success',
      },
      {
        id: '3',
        timestamp: '2026-11-22T04:00:00Z',
        action: 'auth.login',
        user: 'travis@bureau.example.com',
        details: 'Logged in via magic link',
        status: 'success',
      },
    ]);

    setLoading(false);
  }, []);

  const handleRevokeToken = (tokenId: string) => {
    if (!confirm('Revoke this token? This cannot be undone.')) return;
    
    setTokens(tokens.filter(t => t.id !== tokenId));
    
    // Add to audit log
    setAuditLog([
      {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        action: 'token.revoked',
        user: 'admin',
        details: `Revoked token: ${tokens.find(t => t.id === tokenId)?.name}`,
        status: 'success',
      },
      ...auditLog,
    ]);
  };

  const formatTimestamp = (iso: string) => {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-gray-600">Loading admin panel...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin</h1>
          <p className="text-gray-600 mt-2">Workspace management and audit logs</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { key: 'members', label: 'Members', count: members.length },
              { key: 'tokens', label: 'Tokens', count: tokens.length },
              { key: 'audit', label: 'Audit Log', count: auditLog.length },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab.label}
                <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-600">
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Workspace Members</h2>
              <p className="text-sm text-gray-600 mt-1">Manage who has access to this workspace</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{member.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          member.role === 'owner'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {member.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatTimestamp(member.joinedAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {member.role !== 'owner' && (
                          <button className="text-red-600 hover:text-red-800">
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                Invite Member
              </button>
            </div>
          </div>
        )}

        {/* Tokens Tab */}
        {activeTab === 'tokens' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Ingest Tokens</h2>
              <p className="text-sm text-gray-600 mt-1">API tokens for programmatic ingest</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Token
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Used
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tokens.map((token) => (
                    <tr key={token.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{token.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                          bureau_••••{token.token.slice(-4)}
                        </code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatTimestamp(token.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {token.lastUsedAt ? formatTimestamp(token.lastUsedAt) : 'Never'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleRevokeToken(token.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                Create Token
              </button>
            </div>
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Audit Log</h2>
              <p className="text-sm text-gray-600 mt-1">Recent workspace activity</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditLog.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                          {entry.action}
                        </code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {entry.user}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {entry.details}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          entry.status === 'success'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <div className="text-blue-600 text-sm">ℹ️</div>
            <div className="text-sm text-blue-900">
              <strong>Demo Mode:</strong> This admin panel shows example data.
              In production, it connects to your workspace database with real-time updates.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
