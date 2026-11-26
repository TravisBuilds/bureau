'use client';

import { Building2, Shield, AlertCircle, Plus, Key, Clock, Users, MessageCircleQuestion, Activity, Briefcase } from 'lucide-react';
import AskTeamBox from '@/components/AskTeamBox';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow, format } from 'date-fns';

interface Stream {
  id: string;
  name: string;
  category: string;
  description: string;
  log_count: string;
  recent_logs: string;
  total_cost: string;
}

interface IngestLog {
  id: string;
  payload: any;
  created_at: string;
  status: string;
  stream_name: string;
}

interface DueDecision {
  id: string;
  title: string;
  review_date: string;
  metric_name: string;
  stream_name: string | null;
}

interface TopFloorPageContentProps {
  streams: Stream[];
  recentLogs: IngestLog[];
  tokensCount: number;
  dueDecisions: DueDecision[];
  userEmail: string;
}

export default function TopFloorPageContent({ 
  streams, 
  recentLogs, 
  tokensCount,
  dueDecisions,
  userEmail 
}: TopFloorPageContentProps) {
  const router = useRouter();
  
  const totalCost = streams.reduce((sum, s) => sum + parseFloat(s.total_cost || '0'), 0);
  const totalLogs = streams.reduce((sum, s) => sum + parseInt(s.log_count || '0'), 0);
  const activeStreams = streams.filter(s => parseInt(s.recent_logs || '0') > 0).length;

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
                onClick={() => router.push('/decisions')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <Clock className="w-4 h-4" />
                Decisions
              </button>
              <button
                onClick={() => router.push('/team-health')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <Users className="w-4 h-4" />
                Team
              </button>
              <button
                onClick={() => router.push('/questions')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <MessageCircleQuestion className="w-4 h-4" />
                Questions
              </button>
              <button
                onClick={() => router.push('/activity')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <Activity className="w-4 h-4" />
                Activity
              </button>
              <button
                onClick={() => router.push('/work')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <Briefcase className="w-4 h-4" />
                Work
              </button>
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
        <AskTeamBox />

        {/* Empty State for New Users */}
        {streams.length === 0 && (
          <div className="text-center py-16">
            <Building2 className="w-16 h-16 mx-auto mb-6 text-slate-300" />
            <h2 className="text-2xl font-semibold text-slate-900 mb-3">Welcome to Bureau</h2>
            <p className="text-slate-600 mb-8 max-w-md mx-auto">
              Connect your first AI agent to start tracking costs, outputs, and revenue.
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => router.push('/connect')}
                className="flex items-center gap-2 px-6 py-3 bg-highstreet-purple text-white rounded-lg hover:bg-highstreet-purple/90"
              >
                <Key className="w-5 h-5" />
                Connect your AI
              </button>
            </div>
          </div>
        )}

        {/* Decisions Due for Review */}
        {dueDecisions.length > 0 && (
          <div className="mb-12">
            <div className="p-6 bg-amber-50 border-2 border-amber-300 rounded-lg">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Clock className="w-6 h-6 text-amber-700" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    {dueDecisions.length} Decision{dueDecisions.length > 1 ? 's' : ''} Due for Review
                  </h3>
                  <div className="space-y-2 mb-4">
                    {dueDecisions.slice(0, 3).map((decision) => (
                      <div key={decision.id} className="text-sm text-slate-700">
                        <span className="font-medium">{decision.title}</span>
                        {decision.stream_name && (
                          <span className="text-slate-500 ml-2">({decision.stream_name})</span>
                        )}
                        <span className="text-slate-500 ml-2">
                          • Due {format(new Date(decision.review_date), 'MMM d')}
                        </span>
                      </div>
                    ))}
                    {dueDecisions.length > 3 && (
                      <div className="text-sm text-slate-500">
                        +{dueDecisions.length - 3} more
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => router.push('/decisions')}
                    className="px-4 py-2 text-sm font-medium text-amber-900 bg-amber-100 rounded-lg hover:bg-amber-200"
                  >
                    Review Decisions
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Overview Stats */}
        {streams.length > 0 && (
          <>
            <div className="mb-12">
              <h2 className="text-lg font-medium text-slate-900 mb-6">Overview</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-white border border-slate-200 rounded-lg">
                  <div className="text-sm text-slate-500 mb-1">Total Cost</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    ${totalCost.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">all time</div>
                </div>

                <div className="p-4 bg-white border border-slate-200 rounded-lg">
                  <div className="text-sm text-slate-500 mb-1">Activity</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {totalLogs}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">total logs</div>
                </div>

                <div className="p-4 bg-white border border-slate-200 rounded-lg">
                  <div className="text-sm text-slate-500 mb-1">Streams</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {activeStreams}/{streams.length}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">active (7 days)</div>
                </div>

                <div className="p-4 bg-white border border-slate-200 rounded-lg">
                  <div className="text-sm text-slate-500 mb-1">Tokens</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {tokensCount}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">active</div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            {recentLogs.length > 0 && (
              <div className="mb-12">
                <h2 className="text-lg font-medium text-slate-900 mb-6">Recent Activity</h2>
                <div className="space-y-2">
                  {recentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-4 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {log.stream_name && (
                              <>
                                <span className="text-sm font-medium text-slate-900">{log.stream_name}</span>
                                <span className="text-xs text-slate-400">•</span>
                              </>
                            )}
                            <span className="text-xs text-slate-500">
                              {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700">
                            {log.payload.content || 'Log entry'}
                          </p>
                          {log.payload.metadata?.cost_usd && (
                            <span className="inline-block mt-2 px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded">
                              Cost: ${parseFloat(log.payload.metadata.cost_usd).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Streams List */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-slate-900">Your Streams</h2>
                <button
                  onClick={() => router.push('/add-stream')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-highstreet-purple border border-highstreet-purple rounded-lg hover:bg-highstreet-purple/5"
                >
                  <Plus className="w-4 h-4" />
                  Add Stream
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {streams.map((stream) => (
                  <div
                    key={stream.id}
                    onClick={() => router.push(`/stream-detail/${stream.id}`)}
                    className="p-6 bg-white border border-slate-200 rounded-lg hover:border-highstreet-purple cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{stream.name}</h3>
                        <p className="text-sm text-slate-500 capitalize">{stream.category.replace(/-/g, ' ')}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        parseInt(stream.recent_logs || '0') > 0
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {parseInt(stream.recent_logs || '0') > 0 ? 'active' : 'inactive'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Total Cost</div>
                        <div className="text-lg font-semibold text-slate-900">
                          ${parseFloat(stream.total_cost || '0').toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Log Entries</div>
                        <div className="text-lg font-semibold text-slate-900">
                          {stream.log_count}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
