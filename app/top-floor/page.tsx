'use client';

import { Building2, Shield } from 'lucide-react';
import { TRAVIS_CURRENT_STREAMS, calculateStreamRollup } from '@/lib/stream-metrics-types';
import { useRouter } from 'next/navigation';
import MetricStreamCard from '@/components/MetricStreamCard';

export default function TopFloorPage() {
  const router = useRouter();
  
  // Only show visible streams (the 4 Travis is building)
  const visibleStreams = TRAVIS_CURRENT_STREAMS.filter(s => s.visible);
  const rollup = calculateStreamRollup(TRAVIS_CURRENT_STREAMS);

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
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">AI Spend</div>
              <div className="text-2xl font-semibold text-slate-900">
                {rollup.totalSpendThisMonth > 0 
                  ? `$${rollup.totalSpendThisMonth.toLocaleString()}` 
                  : '—'}
              </div>
              <div className="text-xs text-slate-400 mt-1">this month</div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Income</div>
              <div className="text-2xl font-semibold text-slate-900">
                {rollup.totalIncome > 0 
                  ? `$${rollup.totalIncome.toLocaleString()}` 
                  : '—'}
              </div>
              <div className="text-xs text-slate-400 mt-1">this month</div>
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
              <div className="text-2xl font-semibold text-slate-900">
                {rollup.attentionItems}
              </div>
              <div className="text-xs text-slate-400 mt-1">items</div>
            </div>
          </div>
        </div>

        {/* Stream Cards */}
        <div>
          <h2 className="text-lg font-medium text-slate-900 mb-6">Your Streams</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleStreams.map((stream) => (
              <MetricStreamCard
                key={stream.id}
                stream={stream}
                onClick={() => router.push(`/stream/${stream.id}`)}
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
