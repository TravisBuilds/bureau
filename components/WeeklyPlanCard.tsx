'use client';

import { Clock, TrendingUp } from 'lucide-react';
import { type IncomeStream } from '@/lib/travis-streams-seed';

interface Props {
  streams: IncomeStream[];
  availableHours: number;
}

interface StreamPriority {
  stream: IncomeStream;
  expectedPayoffPerHour: number;
  reasoning: string;
  recommendedHours: number;
}

export default function WeeklyPlanCard({ streams, availableHours = 10 }: Props) {
  // Calculate expected payoff per hour for each connected stream
  const priorities: StreamPriority[] = streams
    .filter(s => s.connected && !s.id.includes('sample')) // Exclude sample streams
    .map(stream => {
      const netIncome = (stream.monthlyIncome || 0) - (stream.monthlyCosts || 0);
      const currentHourlyRate = stream.monthlyHours && stream.monthlyHours > 0
        ? netIncome / stream.monthlyHours
        : 0;

      let expectedPayoffPerHour = currentHourlyRate;
      let reasoning = '';
      let recommendedHours = 0;

      // Prioritize based on signal and blockers
      if (stream.signal === 'push') {
        // Critical blockers = high priority
        expectedPayoffPerHour = currentHourlyRate * 2; // Double the value for PUSH signals
        reasoning = stream.signalReason || 'Critical blocker needs immediate attention';
        recommendedHours = Math.min(5, availableHours); // Allocate up to 5 hours
      } else if (stream.signal === 'keep') {
        // Steady growth = medium priority
        expectedPayoffPerHour = currentHourlyRate;
        reasoning = 'Steady progress, maintain momentum';
        recommendedHours = Math.min(3, availableHours);
      } else if (stream.signal === 'pause') {
        // Paused = low priority
        expectedPayoffPerHour = 0;
        reasoning = 'Paused - evaluate before spending more time';
        recommendedHours = 0;
      } else {
        // Unknown = evaluate
        expectedPayoffPerHour = currentHourlyRate;
        reasoning = 'Needs evaluation';
        recommendedHours = Math.min(2, availableHours);
      }

      return {
        stream,
        expectedPayoffPerHour,
        reasoning,
        recommendedHours,
      };
    })
    .sort((a, b) => b.expectedPayoffPerHour - a.expectedPayoffPerHour);

  const topPriorities = priorities.slice(0, 3);
  const totalRecommendedHours = topPriorities.reduce((sum, p) => sum + p.recommendedHours, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <Clock className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Where Should My Next 10 Hours Go?</h2>
          <p className="text-sm text-slate-500">Ranked by expected payoff per hour</p>
        </div>
      </div>

      {topPriorities.length === 0 ? (
        <div className="text-center py-6 text-slate-400">
          <p className="text-sm">Connect streams to see recommendations</p>
        </div>
      ) : (
        <div className="space-y-3">
          {topPriorities.map((priority, index) => {
            const { stream, expectedPayoffPerHour, reasoning, recommendedHours } = priority;
            const netIncome = (stream.monthlyIncome || 0) - (stream.monthlyCosts || 0);
            
            return (
              <div key={stream.id} className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-bold text-slate-400">#{index + 1}</div>
                    <div>
                      <div className="font-semibold text-slate-900">{stream.name}</div>
                      <div className="text-sm text-slate-500 mt-1">{reasoning}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-highstreet-purple">
                      {recommendedHours}h
                    </div>
                    <div className="text-xs text-slate-400">suggested</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-xs text-slate-600 mt-2">
                  {expectedPayoffPerHour > 0 && (
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      ${expectedPayoffPerHour.toFixed(0)}/hr expected
                    </div>
                  )}
                  {netIncome !== 0 && (
                    <div>
                      Current: ${netIncome}/mo
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Summary */}
          <div className="pt-3 mt-3 border-t border-slate-200 flex items-center justify-between text-sm">
            <span className="text-slate-600">Total recommended</span>
            <span className="font-semibold text-slate-900">{totalRecommendedHours}h / {availableHours}h available</span>
          </div>
        </div>
      )}
    </div>
  );
}
