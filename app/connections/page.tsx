'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Connection {
  id: string;
  client_name: string;
  vendor: string;
  connected_at: string;
  last_seen_at: string | null;
  status: string;
  agent_links: Array<{
    id: string;
    agent_label: string;
    stream_count: number;
    last_used_at: string | null;
  }>;
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function loadConnections() {
      try {
        const res = await fetch('/api/connections');
        if (res.ok) {
          const data = await res.json();
          setConnections(data.connections || []);
        }
      } catch (err) {
        console.error('Failed to load connections:', err);
      } finally {
        setLoading(false);
      }
    }
    
    loadConnections();
  }, []);
  
  async function revokeConnection(connectionId: string) {
    if (!confirm('Revoke this connection? All linked agents will stop working.')) {
      return;
    }
    
    try {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        setConnections(connections.filter(c => c.id !== connectionId));
      } else {
        alert('Failed to revoke connection');
      }
    } catch (err) {
      alert('Failed to revoke connection');
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-300 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-300 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Agent Connections</h1>
            <p className="text-gray-600">
              Manage your MCP connections and linked agents
            </p>
          </div>
          <Link
            href="/connect"
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md transition"
          >
            + Connect Agent
          </Link>
        </div>
        
        {connections.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <p className="text-gray-500 mb-4">No agent connections yet</p>
            <Link
              href="/connect"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md transition"
            >
              Connect Your First Agent
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {connections.map(conn => (
              <div key={conn.id} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold">{conn.client_name}</h2>
                    <p className="text-sm text-gray-500">
                      {conn.vendor} • Connected {new Date(conn.connected_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      conn.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {conn.status}
                    </span>
                    <button
                      onClick={() => revokeConnection(conn.id)}
                      className="text-red-600 hover:text-red-700 text-sm font-medium"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
                
                {conn.last_seen_at && (
                  <p className="text-xs text-gray-500 mb-4">
                    Last active: {new Date(conn.last_seen_at).toLocaleString()}
                  </p>
                )}
                
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Linked Agents</h3>
                  {conn.agent_links.length === 0 ? (
                    <p className="text-sm text-gray-500">No agents linked yet</p>
                  ) : (
                    <ul className="space-y-2">
                      {conn.agent_links.map(link => (
                        <li key={link.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                          <div>
                            <span className="font-medium">{link.agent_label}</span>
                            <span className="text-sm text-gray-500 ml-2">
                              {link.stream_count} stream{link.stream_count !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {link.last_used_at && (
                            <span className="text-xs text-gray-500">
                              Used {new Date(link.last_used_at).toLocaleString()}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
