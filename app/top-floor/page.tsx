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

  // Exclude SAMPLE streams from Travis's real totals
  const realStreams = streams.filter(s => !s.id.includes('sample'));
  const connectedRealStreams = realStreams.filter(s => s.connected);

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
        {/* Can I Quit My 9-5? - LEADING SECTION */}
        <div className="mb-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-medium text-slate-900">Can I quit my 9-5?</h2>
            {monthlyNeed !== null && (
              <button
                onClick={handleSetMonthlyNeed}
                className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Update need
              </button>
            )}
          </div>

          {monthlyNeed === null ? (
            <button
              onClick={handleSetMonthlyNeed}
              className="p-8 border-2 border-dashed border-slate-300 rounded-xl hover:border-highstreet-purple hover:bg-slate-50 transition-all w-full text-center"
            >
              <p className="text-slate-600 mb-2">Set your monthly need to see if you can quit</p>
              <p className="text-sm text-slate-400">How much do you need per month to cover living and projects?</p>
            </button>
          ) : (
            <div className="space-y-6">
              {/* The Answer */}
              <div>
                {otherIncome >= monthlyNeed ? (
                  <div className="text-4xl font-semibold text-green-600 mb-2">
                    Yes, you can quit
                  </div>
                ) : (
                  <div className="text-4xl font-semibold text-slate-900 mb-2">
                    Not yet
                  </div>
                )}
                <p className="text-slate-600">
                  Other streams cover{' '}
                  <span className="font-semibold">
                    {monthlyNeed > 0 ? Math.round((otherIncome / monthlyNeed) * 100) : 0}%
                  </span>
                  {' '}of your ${monthlyNeed.toLocaleString()} monthly need
                </p>
              </div>

              {/* Gap and Details */}
              {otherIncome < monthlyNeed && (
                <div className="flex items-baseline gap-12 pt-6 border-t border-slate-200">
                  <div>
                    <div className="text-2xl font-semibold text-slate-900">
                      ${(monthlyNeed - otherIncome).toLocaleString()}
                    </div>
                    <div className="text-sm text-slate-500 mt-1">Gap to close</div>
                  </div>
                  
                  <div>
                    <div className="text-2xl font-semibold text-slate-900">
                      ${otherIncome.toLocaleString()}
                    </div>
                    <div className="text-sm text-slate-500 mt-1">From other streams</div>
                  </div>
                  
                  <div>
                    <div className="text-2xl font-semibold text-slate-900">
                      {nonDayJobStreams.length}
                    </div>
                    <div className="text-sm text-slate-500 mt-1">Active streams</div>
                  </div>
                </div>
              )}
            </div>
          )}
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
