'use client';

import { useEffect, useState } from 'react';
import { formatFullDateTime } from '@/lib/timezone-utils';

interface IntakeLog {
  id: string;
  token_id: string;
  token_name: string;
  payload: {
    type: string;
    stream?: string;
    stream_id?: string;
    content: string;
    metadata?: Record<string, any>;
    received_at: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export default function IntakePage() {
  const [logs, setLogs] = useState<IntakeLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetch('/api/intake-logs')
      .then(res => res.json())
      .then(data => {
        setLogs(data.logs || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load intake logs:', err);
        setLoading(false);
      });
  }, []);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-slate-500">Loading intake...</div>
      </div>
    );
  }
  
  if (logs.length === 0) {
    return (
      <div className="min-h-screen bg-white p-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Intake Logs</h1>
          <p className="text-slate-600 mb-8">
            View all data pushed from your agents
          </p>
          
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-16 text-center">
            <div className="mb-4 text-6xl">📥</div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No intake yet
            </h3>
            <p className="text-slate-600">
              Data pushed from agents will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Intake Logs</h1>
        <p className="text-slate-600 mb-8">
          {logs.length} {logs.length === 1 ? 'item' : 'items'} received from agents
        </p>
        
        <div className="space-y-4">
          {logs.map((log) => (
            <div 
              key={log.id} 
              className="border border-slate-200 rounded-lg p-6 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    log.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    log.status === 'approved' ? 'bg-green-100 text-green-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {log.status}
                  </span>
                  <span className="text-sm font-medium text-slate-600">
                    {log.payload.type}
                  </span>
                  {log.payload.stream && (
                    <span className="text-sm text-slate-500">
                      → {log.payload.stream}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {formatFullDateTime(log.created_at)}
                </div>
              </div>
              
              <div className="mb-3">
                <div className="text-slate-900 font-medium mb-1">
                  {log.payload.content}
                </div>
                {log.payload.metadata && Object.keys(log.payload.metadata).length > 0 && (
                  <div className="mt-2 p-3 bg-slate-50 rounded border border-slate-200">
                    <div className="text-xs font-medium text-slate-600 mb-1">Metadata:</div>
                    <div className="text-xs text-slate-700 font-mono">
                      {JSON.stringify(log.payload.metadata, null, 2)}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>Token: {log.token_name}</span>
                <span>ID: {log.id.substring(0, 8)}...</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
