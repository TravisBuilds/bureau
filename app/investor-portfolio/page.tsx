'use client';

import { DollarSign, TrendingUp, Clock } from 'lucide-react';
import PrototypeBanner from '@/components/PrototypeBanner';

// Simulated investor data
const SIMULATED_COMMITMENTS = [
  {
    id: '1',
    streamName: 'Sample: Corner Bakery',
    streamId: 'sample-corner-bakery',
    amount: 1000,
    committedAt: '2026-10-15',
    terms: {
      type: 'revenue-share' as const,
      percentage: 10,
      cap: 1.5,
    },
    totalPaidOut: 180,
    lastPayoutDate: '2026-11-20',
    payoutHistory: [
      { date: '2026-10-30', amount: 65, source: 'October 2026 revenue' },
      { date: '2026-11-30', amount: 115, source: 'November 2026 revenue (projected)' },
    ],
  },
];

export default function InvestorPortfolioPage() {
  const totalCommitted = SIMULATED_COMMITMENTS.reduce((sum, c) => sum + c.amount, 0);
  const totalPaidOut = SIMULATED_COMMITMENTS.reduce((sum, c) => sum + c.totalPaidOut, 0);
  const totalReturn = totalCommitted > 0 ? (totalPaidOut / totalCommitted) * 100 : 0;

  return (
    <div className="min-h-screen bg-white">
      <PrototypeBanner />
      
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Investor Portfolio</h1>
          <p className="text-slate-600">Simulated commitments and payouts</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-6 bg-white rounded-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <div className="text-sm font-medium text-slate-500">Total Committed</div>
            </div>
            <div className="text-3xl font-bold text-slate-900">
              ${totalCommitted.toLocaleString()}
            </div>
          </div>

          <div className="p-6 bg-white rounded-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <div className="text-sm font-medium text-slate-500">Total Paid Out</div>
            </div>
            <div className="text-3xl font-bold text-slate-900">
              ${totalPaidOut.toLocaleString()}
            </div>
            <div className="text-sm text-slate-500 mt-1">
              {totalReturn.toFixed(1)}% return
            </div>
          </div>

          <div className="p-6 bg-white rounded-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-purple-600" />
              <div className="text-sm font-medium text-slate-500">Active Commitments</div>
            </div>
            <div className="text-3xl font-bold text-slate-900">
              {SIMULATED_COMMITMENTS.length}
            </div>
          </div>
        </div>

        {/* Commitments List */}
        <div className="space-y-6">
          {SIMULATED_COMMITMENTS.map(commitment => {
            const capAmount = commitment.amount * commitment.terms.cap;
            const remaining = capAmount - commitment.totalPaidOut;
            const progress = (commitment.totalPaidOut / capAmount) * 100;

            return (
              <div key={commitment.id} className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{commitment.streamName}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {commitment.terms.percentage}% revenue share until {commitment.terms.cap}× return
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-500">Committed</div>
                    <div className="text-xl font-semibold text-slate-900">
                      ${commitment.amount.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                    <span>Payout Progress</span>
                    <span className="font-medium">${commitment.totalPaidOut} / ${capAmount.toLocaleString()} cap</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    ${remaining.toLocaleString()} remaining to cap
                  </div>
                </div>

                {/* Payout History */}
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-3">Recent Payouts</h4>
                  <div className="space-y-2">
                    {commitment.payoutHistory.map((payout, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            ${payout.amount.toLocaleString()}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">{payout.source}</div>
                        </div>
                        <div className="text-xs text-slate-400">
                          {new Date(payout.date).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Note */}
        <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>Note:</strong> All payouts are simulated based on the stream's actual revenue entries.
            In a real implementation, payouts would be automated monthly based on verified revenue data from the auditable record.
          </p>
        </div>
      </div>
    </div>
  );
}
