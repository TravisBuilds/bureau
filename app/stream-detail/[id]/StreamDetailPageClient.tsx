'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, AlertCircle } from 'lucide-react';
import { formatFullDateTime } from '@/lib/timezone-utils';

interface StreamData {
  id: string;
  name: string;
  category: string;
  description: string;
  connected: boolean;
  data_source: string | null;
  last_updated: string | null;
  log_count: string;
  total_cost: string;
}

interface LogData {
  id: string;
  type: string;
  content: string;
  cost_usd: string | null;
  created_at: string;
  status: string;
}

interface Props {
  stream: StreamData;
  recentLogs: LogData[];
}

export default function StreamDetailPageClient({ stream, recentLogs }: Props) {
  const router = useRouter();
  
  const logCount = parseInt(stream.log_count || '0');
  const totalCost = parseFloat(stream.total_cost || '0');
  const hasData = logCount > 0;

  // Count by type
  const costLogs = recentLogs.filter(log => log.type === 'cost').length;
  const metricLogs = recentLogs.filter(log => log.type === 'metric').length;
  const findingLogs = recentLogs.filter(log => log.type === 'finding').length;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <button
            onClick={() => router.push('/top-floor')}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Top Floor
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{stream.name}</h1>
            <p className="text-sm text-slate-500 mt-1">{stream.description}</p>
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-700">
              {stream.category.replace(/-/g, ' ')}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Connection Status */}
        {stream.connected && stream.data_source ? (
          <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 bg-green-600 rounded-full"></div>
              <span className="font-medium text-green-900">Connected</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-600">{stream.data_source}</span>
              {stream.last_updated && (
                <>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-500 text-xs">
                    Last updated {formatFullDateTime(stream.last_updated)}
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-8 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
              <span className="font-medium text-slate-700">Not Connected</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-500">No data source connected yet</span>
            </div>
          </div>
        )}

        {/* Overview Stats */}
        <div className="mb-8">
          <h2 className="text-lg font-medium text-slate-900 mb-4">Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Total Logs</div>
              <div className="text-2xl font-semibold text-slate-900">
                {logCount.toLocaleString()}
              </div>
            </div>
            
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Total Cost</div>
              <div className="text-2xl font-semibold text-slate-900">
                ${totalCost.toFixed(2)}
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Cost Entries</div>
              <div className="text-2xl font-semibold text-slate-900">
                {costLogs}
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Metrics/Findings</div>
              <div className="text-2xl font-semibold text-slate-900">
                {metricLogs + findingLogs}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        {hasData ? (
          <div className="mb-8">
            <h2 className="text-lg font-medium text-slate-900 mb-4">Recent Activity</h2>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Type</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Content</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-600">Cost</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-600">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((log) => {
                    const cost = log.cost_usd && log.cost_usd.match(/^[0-9]+\.?[0-9]*$/) 
                      ? parseFloat(log.cost_usd) 
                      : null;
                    
                    return (
                      <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            log.type === 'cost' ? 'bg-purple-100 text-purple-800' :
                            log.type === 'metric' ? 'bg-blue-100 text-blue-800' :
                            log.type === 'finding' ? 'bg-green-100 text-green-800' :
                            'bg-slate-100 text-slate-800'
                          }`}>
                            {log.type || 'unknown'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-700 max-w-md truncate">
                          {log.content || '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-medium text-slate-900">
                          {cost !== null ? `$${cost.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-xs text-slate-500">
                          {new Date(log.created_at).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {logCount > recentLogs.length && (
              <p className="text-sm text-slate-500 mt-2">
                Showing {recentLogs.length} of {logCount} total entries
              </p>
            )}
          </div>
        ) : (
          <div className="mb-8">
            <h2 className="text-lg font-medium text-slate-900 mb-4">Recent Activity</h2>
            <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-600 mb-2">No data yet</p>
              <p className="text-sm text-slate-400 mb-6">
                Start sending ingest events to see activity in this stream
              </p>
              <button
                onClick={() => router.push('/settings/intake')}
                className="px-4 py-2 text-sm font-medium text-highstreet-purple border border-highstreet-purple rounded-lg hover:bg-highstreet-purple hover:text-white transition-colors"
              >
                View Intake Settings
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/stream-detail/${stream.id}/costs`)}
            className="px-4 py-2 text-sm font-medium text-white bg-highstreet-purple rounded-lg hover:bg-opacity-90 transition-colors"
          >
            View Detailed Costs
          </button>
          <button
            onClick={() => router.push('/settings/intake')}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Intake Settings
          </button>
        </div>
      </main>
    </div>
  );
}
