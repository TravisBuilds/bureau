'use client';

import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';

export type StreamType = 'day-job' | 'contract' | 'project';

export interface IncomeStream {
  id: string;
  name: string;
  type: StreamType;
  connected: boolean;
  monthlyIncome?: number;
  monthlyCosts?: number;
  monthlyHours?: number;
  signal?: 'push' | 'keep' | 'pause' | 'kill';
  status?: string;
}

interface Props {
  streams: IncomeStream[];
  monthlyNeed: number | null;
  onSelectStream: (id: string) => void;
  onAddStream: () => void;
  onSetMonthlyNeed: () => void;
}

export default function TopFloorSimple({
  streams,
  monthlyNeed,
  onSelectStream,
  onAddStream,
  onSetMonthlyNeed,
}: Props) {
  const connectedStreams = streams.filter(s => s.connected);
  
  // Calculate totals from connected streams only
  const totalIncome = connectedStreams.reduce((sum, s) => sum + (s.monthlyIncome || 0), 0);
  const totalCosts = connectedStreams.reduce((sum, s) => sum + (s.monthlyCosts || 0), 0);
  const netIncome = totalIncome - totalCosts;
  
  // Non-day-job streams for "can I quit" analysis
  const nonDayJobStreams = connectedStreams.filter(s => s.type !== 'day-job');
  const otherIncome = nonDayJobStreams.reduce((sum, s) => sum + ((s.monthlyIncome || 0) - (s.monthlyCosts || 0)), 0);

  const getSignalColor = (signal?: string) => {
    switch (signal) {
      case 'push': return 'text-green-600';
      case 'keep': return 'text-blue-600';
      case 'pause': return 'text-yellow-600';
      case 'kill': return 'text-red-600';
      default: return 'text-slate-400';
    }
  };

  const getTypeLabel = (type: StreamType) => {
    switch (type) {
      case 'day-job': return 'Day Job';
      case 'contract': return 'Contract';
      case 'project': return 'Project';
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header - Clean and minimal */}
      <header className="border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-highstreet-purple" />
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Bureau</h1>
                <p className="text-sm text-slate-500 mt-0.5">Top Floor</p>
              </div>
            </div>
            <button
              onClick={onAddStream}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-highstreet-purple rounded-lg hover:bg-opacity-90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Stream
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Top Floor Overview - Very few numbers */}
        <div className="mb-12">
          <h2 className="text-sm font-medium text-slate-500 mb-6">Monthly Overview</h2>
          
          <div className="flex items-baseline gap-12">
            <div>
              <div className="text-4xl font-semibold text-slate-900">
                ${totalIncome.toLocaleString()}
              </div>
              <div className="text-sm text-slate-500 mt-1">Income</div>
            </div>
            
            <div>
              <div className="text-4xl font-semibold text-slate-900">
                ${totalCosts.toLocaleString()}
              </div>
              <div className="text-sm text-slate-500 mt-1">Costs</div>
            </div>
            
            <div>
              <div className="text-4xl font-semibold text-slate-900">
                ${netIncome.toLocaleString()}
              </div>
              <div className="text-sm text-slate-500 mt-1">Net</div>
            </div>
          </div>
          
          {/* Can I quit analysis - only if monthly need is set */}
          {monthlyNeed !== null && monthlyNeed > 0 && (
            <div className="mt-8 pt-8 border-t border-slate-200">
              <div className="flex items-baseline gap-4">
                <div className="text-2xl font-semibold text-slate-900">
                  {otherIncome >= monthlyNeed ? (
                    <span className="text-green-600">Yes, you can quit</span>
                  ) : (
                    <span className="text-slate-900">Not yet</span>
                  )}
                </div>
                {otherIncome < monthlyNeed && (
                  <div className="text-sm text-slate-500">
                    Other streams cover {monthlyNeed > 0 ? Math.round((otherIncome / monthlyNeed) * 100) : 0}% of your ${monthlyNeed.toLocaleString()} monthly need
                  </div>
                )}
              </div>
            </div>
          )}
          
          {monthlyNeed === null && (
            <div className="mt-8 pt-8 border-t border-slate-200">
              <button
                onClick={onSetMonthlyNeed}
                className="text-sm text-highstreet-purple hover:underline"
              >
                Set your monthly need to see if you can quit
              </button>
            </div>
          )}
        </div>

        {/* Streams - Simple list, detail one click away */}
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-4">Your Streams</h2>
          
          <div className="space-y-1">
            {streams.map((stream) => (
              <button
                key={stream.id}
                onClick={() => onSelectStream(stream.id)}
                className="w-full flex items-center justify-between px-4 py-4 rounded-lg hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{stream.name}</div>
                    <div className="text-sm text-slate-500 mt-0.5">
                      {getTypeLabel(stream.type)}
                      {stream.status && stream.connected && ` • ${stream.status}`}
                    </div>
                  </div>
                  
                  {stream.connected && stream.signal && (
                    <div className={`text-xs font-semibold uppercase ${getSignalColor(stream.signal)}`}>
                      {stream.signal}
                    </div>
                  )}
                  
                  {!stream.connected && (
                    <div className="text-sm text-slate-400">Not connected</div>
                  )}
                </div>
              </button>
            ))}
            
            {streams.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <p className="text-sm">No streams yet</p>
                <button
                  onClick={onAddStream}
                  className="mt-4 text-sm text-highstreet-purple hover:underline"
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
