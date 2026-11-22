'use client';

import { Building2, Shield, AlertCircle } from 'lucide-react';
import { REAL_STREAMS, calculateRealRollup, ATTENTION_ITEMS } from '@/lib/real-stream-data';
import { useRouter } from 'next/navigation';
import MetricStreamCard from '@/components/MetricStreamCard';

export default function TopFloorPage() {
  const router = useRouter();
  
  // Real streams with actual data
  const visibleStreams = REAL_STREAMS.filter(s => s.visible);
  const rollup = calculateRealRollup();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-highstreet-purple" />
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Bureau</h1>
                <p className="text-sm text-slate-500">Command center for your AI businesses</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/connections')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <Shield className="w-4 h-4" />
                Connections
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Cross-Stream Rollup */}
        <div className="mb-12">
          <h2 className="text-lg font-medium text-slate-900 mb-6">Overview</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Monthly Spend</div>
              <div className="text-2xl font-semibold text-slate-400">
                Not reconciled
              </div>
              <div className="text-xs text-slate-400 mt-1">partial coverage</div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Income</div>
              <div className="text-2xl font-semibold text-slate-400">
                Not connected
              </div>
              <div className="text-xs text-slate-400 mt-1">across all streams</div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Connected</div>
              <div className="text-2xl font-semibold text-slate-900">
                {rollup.connectedStreams}/{rollup.totalStreams}
              </div>
              <div className="text-xs text-slate-400 mt-1">streams</div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Attention</div>
              <div className={`text-2xl font-semibold ${rollup.attentionItems > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                {rollup.attentionItems}
              </div>
              <div className="text-xs text-slate-400 mt-1">items</div>
            </div>
          </div>

          {/* Attention Items */}
          {ATTENTION_ITEMS.length > 0 && (
            <div className="space-y-2">
              {ATTENTION_ITEMS.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-lg border ${
                    item.severity === 'critical' ? 'bg-red-50 border-red-200' :
                    item.severity === 'warning' ? 'bg-amber-50 border-amber-200' :
                    'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className={`w-5 h-5 mt-0.5 ${
                      item.severity === 'critical' ? 'text-red-600' :
                      item.severity === 'warning' ? 'text-amber-600' :
                      'text-blue-600'
                    }`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{item.streamName}</span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className={`text-sm font-medium ${
                          item.severity === 'critical' ? 'text-red-700' :
                          item.severity === 'warning' ? 'text-amber-700' :
                          'text-blue-700'
                        }`}>
                          {item.title}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stream Cards */}
        <div>
          <h2 className="text-lg font-medium text-slate-900 mb-6">Your Streams</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleStreams.map((stream) => (
              <MetricStreamCard
                key={stream.id}
                stream={stream}
                onClick={() => router.push(`/stream-detail/${stream.id}`)}
              />
            ))}
          </div>

          {visibleStreams.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <Building2 className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p className="text-sm">No streams configured yet</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
