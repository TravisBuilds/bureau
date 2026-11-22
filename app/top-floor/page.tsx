'use client';

import { useState } from 'react';
import { Building2, Plus, Settings } from 'lucide-react';
import { travisStreams, type IncomeStream } from '@/lib/travis-streams-seed';
import { useRouter } from 'next/navigation';
import PrototypeBanner from '@/components/PrototypeBanner';
import WeeklyPlanCard from '@/components/WeeklyPlanCard';

export default function TopFloorPage() {
  const router = useRouter();
  const [streams, setStreams] = useState<IncomeStream[]>(travisStreams);
  const [monthlyNeed, setMonthlyNeed] = useState<number | null>(null);
  const [showNeedDialog, setShowNeedDialog] = useState(false);

  // Exclude SAMPLE streams from Travis's real totals
  const realStreams = streams.filter(s => !s.id.includes('sample'));
  const connectedRealStreams = realStreams.filter(s => s.connected);

  // Calculate totals from connected REAL streams only (exclude SAMPLE)
  const totalIncome = connectedRealStreams.reduce((sum, s) => sum + (s.monthlyIncome || 0), 0);
  const totalCosts = connectedRealStreams.reduce((sum, s) => sum + (s.monthlyCosts || 0), 0);
  const netIncome = totalIncome - totalCosts;
  
  // Non-day-job streams for "can I quit" analysis
  const nonDayJobStreams = connectedRealStreams.filter(s => s.type !== 'day-job');
  const otherIncome = nonDayJobStreams.reduce((sum, s) => {
    const income = s.monthlyIncome || 0;
    const costs = s.monthlyCosts || 0;
    return sum + (income - costs);
  }, 0);

  const getTypeLabel = (type: 'day-job' | 'contract' | 'project') => {
    switch (type) {
      case 'day-job': return 'Day Job';
      case 'contract': return 'Contract';
      case 'project': return 'Project';
    }
  };

  const getSignalColor = (signal?: string) => {
    switch (signal) {
      case 'push': return 'text-green-600 bg-green-50';
      case 'keep': return 'text-blue-600 bg-blue-50';
      case 'pause': return 'text-yellow-600 bg-yellow-50';
      case 'kill': return 'text-red-600 bg-red-50';
      default: return 'text-slate-400 bg-slate-50';
    }
  };

  const handleSetMonthlyNeed = () => {
    const need = prompt('What do you need per month to live (and cover your side projects)?');
    if (need) {
      const amount = Number(need);
      if (!isNaN(amount)) {
        setMonthlyNeed(amount);
        setShowNeedDialog(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* PROTOTYPE BANNER */}
      <PrototypeBanner />
      
      {/* Header */}
      <header className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-highstreet-purple" />
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Bureau</h1>
                <p className="text-sm text-slate-500">Top Floor</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/add-stream')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-highstreet-purple rounded-lg hover:bg-opacity-90"
            >
              <Plus className="w-4 h-4" />
              Add Stream
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Financial Overview - Comprehensive Dashboard */}
        <div className="mb-12">
          <h2 className="text-lg font-medium text-slate-900 mb-6">Financial Overview</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {/* Total Income */}
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Total Income</div>
              <div className="text-2xl font-semibold text-slate-900">
                ${totalIncome.toLocaleString()}
              </div>
              <div className="text-xs text-slate-400 mt-1">per month</div>
            </div>

            {/* Total Costs */}
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Total Costs</div>
              <div className="text-2xl font-semibold text-slate-900">
                ${totalCosts.toLocaleString()}
              </div>
              <div className="text-xs text-slate-400 mt-1">per month</div>
            </div>

            {/* Net */}
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Net</div>
              <div className={`text-2xl font-semibold ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${netIncome.toLocaleString()}
              </div>
              <div className="text-xs text-slate-400 mt-1">per month</div>
            </div>

            {/* Active Streams */}
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Active Streams</div>
              <div className="text-2xl font-semibold text-slate-900">
                {connectedRealStreams.length}
              </div>
              <div className="text-xs text-slate-400 mt-1">of {realStreams.length} total</div>
            </div>
          </div>

          {/* Stream Breakdown */}
          <div className="text-sm text-slate-600">
            <strong>Income:</strong> Day job + contracts + projects • 
            <strong className="ml-2">Costs:</strong> Agent usage (Grok, OpenAI) + APIs (Places, Gemini) + subscriptions
          </div>
        </div>

        {/* Weekly Plan */}
        <div className="mb-12">
          <WeeklyPlanCard streams={realStreams} availableHours={10} />
        </div>

        {/* Building Stack - All Floors */}
        <div>
          <h2 className="text-lg font-medium text-slate-900 mb-6">Your Building</h2>
          
          <div className="space-y-3">
            {streams.map((stream) => {
              const netIncome = (stream.monthlyIncome || 0) - (stream.monthlyCosts || 0);
              
              return (
                <button
                  key={stream.id}
                  onClick={() => router.push(`/stream/${stream.id}`)}
                  className="w-full p-6 border border-slate-200 rounded-xl hover:border-highstreet-purple hover:shadow-sm transition-all text-left bg-white"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-slate-900">{stream.name}</h3>
                        <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">
                          {getTypeLabel(stream.type)}
                        </span>
                        {stream.connected && stream.signal && (
                          <span className={`text-xs px-2 py-1 rounded font-medium uppercase ${getSignalColor(stream.signal)}`}>
                            {stream.signal}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-slate-500">{stream.description}</p>
                      
                      {stream.connected ? (
                        <div className="mt-3 flex items-center gap-6 text-sm">
                          <div>
                            <span className="text-slate-500">Net: </span>
                            <span className={`font-semibold ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${netIncome.toLocaleString()}/mo
                            </span>
                          </div>
                          {stream.monthlyHours && (
                            <div>
                              <span className="text-slate-500">Hours: </span>
                              <span className="font-semibold text-slate-900">{stream.monthlyHours}/mo</span>
                            </div>
                          )}
                          {stream.users !== undefined && (
                            <div>
                              <span className="text-slate-500">Users: </span>
                              <span className="font-semibold text-slate-900">{stream.users}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-slate-400">
                          Not connected • Connect an agent to see data
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            
            {streams.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Building2 className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                <p className="text-sm mb-4">No streams yet</p>
                <button
                  onClick={() => router.push('/add-stream')}
                  className="text-sm text-highstreet-purple hover:underline"
                >
                  Add your first stream
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
