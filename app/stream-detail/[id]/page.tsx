'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingDown, TrendingUp, AlertCircle, ExternalLink } from 'lucide-react';
import { REAL_STREAMS, ATTENTION_ITEMS, SHARED_ELEVENLABS, SHARED_HIGGSFIELD, EMBER_TOP_SHORTS } from '@/lib/real-stream-data';
import { formatMetricValue } from '@/lib/stream-metrics-types';

export default function StreamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const stream = REAL_STREAMS.find(s => s.id === id);
  
  if (!stream) {
    return (
      <div className="min-h-screen bg-white p-12">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-900 mb-4">Stream not found</h1>
          <button
            onClick={() => router.push('/top-floor')}
            className="text-highstreet-purple hover:underline"
          >
            ← Back to Top Floor
          </button>
        </div>
      </div>
    );
  }

  const attentionItems = ATTENTION_ITEMS.filter(item => item.streamId === stream.id);

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
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Attention Items */}
        {attentionItems.length > 0 && (
          <div className="mb-8 space-y-2">
            {attentionItems.map((item) => (
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
                    <div className={`text-sm font-medium ${
                      item.severity === 'critical' ? 'text-red-700' :
                      item.severity === 'warning' ? 'text-amber-700' :
                      'text-blue-700'
                    }`}>
                      {item.title}
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Connection Status */}
        <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 bg-green-600 rounded-full"></div>
            <span className="font-medium text-green-900">Connected</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-600">{stream.dataSource}</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-500 text-xs">
              Last updated {new Date(stream.lastUpdated!).toLocaleString()}
            </span>
          </div>
        </div>

        {/* All Metrics */}
        <div className="mb-8">
          <h2 className="text-lg font-medium text-slate-900 mb-4">Metrics</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stream.metricDefinitions.map((def) => {
              const metricValue = stream.currentMetrics.find(m => m.metricId === def.id);
              
              return (
                <div key={def.id} className="p-4 bg-white border border-slate-200 rounded-lg">
                  <div className="text-sm text-slate-500 mb-1">{def.label}</div>
                  {metricValue ? (
                    <>
                      <div className={`text-2xl font-semibold ${
                        def.kind === 'growth' && metricValue.value < 0 
                          ? 'text-red-600' 
                          : def.id === 'episodes-published' && metricValue.value === 0
                          ? 'text-amber-600'
                          : 'text-slate-900'
                      }`}>
                        {formatMetricValue(metricValue.value, def)}
                      </div>
                      {metricValue.source && (
                        <div className="text-xs text-slate-400 mt-2">
                          Source: {metricValue.source}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-lg text-slate-400">Not connected</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Stream-specific sections */}
        {stream.id === 'elon' && (
          <div className="mb-8">
            <h2 className="text-lg font-medium text-slate-900 mb-4">Follower History</h2>
            <div className="p-6 bg-white border border-slate-200 rounded-lg">
              <div className="space-y-3">
                {stream.historicalMetrics.map((metric, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">
                      {new Date(metric.timestamp).toLocaleDateString()}
                    </span>
                    <span className="text-sm font-medium text-slate-900">
                      {metric.value.toLocaleString()} followers
                    </span>
                    {i > 0 && (
                      <span className={`text-sm ${
                        metric.value < stream.historicalMetrics[i-1].value ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {metric.value < stream.historicalMetrics[i-1].value ? '↓' : '↑'}
                        {Math.abs(metric.value - stream.historicalMetrics[i-1].value)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {stream.id === 'ember' && (
          <div className="mb-8">
            <h2 className="text-lg font-medium text-slate-900 mb-4">Top Shorts by Views</h2>
            <div className="p-6 bg-white border border-slate-200 rounded-lg">
              <div className="space-y-3">
                {EMBER_TOP_SHORTS.map((short, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900">{short.name}</span>
                    <span className="text-sm text-slate-600">{short.views} views</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> Instagram @bedtimewithember has been disabled since Sep 17
              </p>
            </div>
          </div>
        )}

        {/* Not Connected section */}
        <div className="mb-8">
          <h2 className="text-lg font-medium text-slate-900 mb-4">Not Connected</h2>
          <div className="p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg">
            <div className="text-sm text-slate-600 space-y-2">
              {stream.id === 'duckduckgoose' && (
                <ul className="list-disc list-inside space-y-1">
                  <li>Paying users</li>
                  <li>Revenue</li>
                  <li>Pipeline success rate</li>
                  <li>Product generation spend (needs studio ledger with jobs tagged by stream)</li>
                </ul>
              )}
              {stream.id === 'elon' && (
                <p>All key metrics are connected via X API</p>
              )}
              {stream.id === 'studio-peak-glow-up' && (
                <ul className="list-disc list-inside space-y-1">
                  <li>Ep04 spend</li>
                  <li>Revenue (no documented credit-to-USD rate)</li>
                </ul>
              )}
              {stream.id === 'ember' && (
                <ul className="list-disc list-inside space-y-1">
                  <li>Ep1–10 spend</li>
                  <li>Watch time</li>
                  <li>Retention rate</li>
                  <li>Traffic sources (needs YouTube Analytics connection)</li>
                </ul>
              )}
            </div>
            <button className="mt-4 px-4 py-2 text-sm font-medium text-highstreet-purple border-2 border-highstreet-purple rounded-lg hover:bg-highstreet-purple hover:text-white transition-colors">
              Connect data source
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/connections')}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Manage Connections
          </button>
          <button
            onClick={() => router.push(`/stream/${stream.id}`)}
            className="px-4 py-2 text-sm font-medium text-highstreet-purple border border-highstreet-purple rounded-lg hover:bg-highstreet-purple hover:text-white transition-colors"
          >
            View Full Stream
          </button>
        </div>
      </main>
    </div>
  );
}
