'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, DollarSign, TrendingUp, Calculator } from 'lucide-react';
import { travisStreams } from '@/lib/travis-streams-seed';
import { SAMPLE_BAKERY_PITCH } from '@/lib/sample-bakery-data';
import { generatePayoutProjection, type OfferTerms } from '@/lib/funding-types';
import PrototypeBanner from '@/components/PrototypeBanner';

export default function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const stream = travisStreams.find(s => s.id === id);

  const [offerData, setOfferData] = useState({
    targetAmount: id === 'sample-corner-bakery' ? 10000 : 5000,
    minimumTicket: 500,
    termsType: 'revenue-share' as 'revenue-share' | 'dividend' | 'equity',
    revenueSharePercentage: 10,
    revenueShareCap: 1.5,
    dividendPercentage: 5,
    equityPercentage: 2,
  });

  const [investmentAmount, setInvestmentAmount] = useState(500);
  const [showCalculator, setShowCalculator] = useState(false);

  if (!stream) {
    return <div className="p-6">Stream not found</div>;
  }

  const pitch = id === 'sample-corner-bakery' ? SAMPLE_BAKERY_PITCH : null;
  const monthlyRevenue = stream.monthlyIncome || 0;
  const growthRate = 0.10; // 10% monthly growth (from audit trail analysis)

  // Build terms object
  const terms: OfferTerms = offerData.termsType === 'revenue-share' ? {
    type: 'revenue-share',
    percentage: offerData.revenueSharePercentage,
    cap: offerData.revenueShareCap,
  } : offerData.termsType === 'dividend' ? {
    type: 'dividend',
    percentage: offerData.dividendPercentage,
  } : {
    type: 'equity',
    percentage: offerData.equityPercentage,
  };

  // Generate projection
  const projection = generatePayoutProjection(
    investmentAmount,
    terms,
    monthlyRevenue,
    growthRate,
    24
  );

  return (
    <div className="min-h-screen bg-white">
      <PrototypeBanner />
      
      <div className="max-w-4xl mx-auto px-6 py-12">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to stream
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Funding Offer</h1>
          <p className="text-slate-600">{stream.name}</p>
        </div>

        {/* Offer Setup */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Offer Details</h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Target Amount
              </label>
              <input
                type="number"
                value={offerData.targetAmount}
                onChange={(e) => setOfferData({ ...offerData, targetAmount: Number(e.target.value) })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Minimum Ticket
              </label>
              <input
                type="number"
                value={offerData.minimumTicket}
                onChange={(e) => setOfferData({ ...offerData, minimumTicket: Number(e.target.value) })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Terms Type
              </label>
              <select
                value={offerData.termsType}
                onChange={(e) => setOfferData({ ...offerData, termsType: e.target.value as any })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg"
              >
                <option value="revenue-share">Revenue Share</option>
                <option value="dividend">Dividend</option>
                <option value="equity">Equity</option>
              </select>
            </div>

            {offerData.termsType === 'revenue-share' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Revenue Share Percentage
                  </label>
                  <input
                    type="number"
                    value={offerData.revenueSharePercentage}
                    onChange={(e) => setOfferData({ ...offerData, revenueSharePercentage: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Investor receives this % of revenue until cap is reached
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Cap (Multiple of Investment)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={offerData.revenueShareCap}
                    onChange={(e) => setOfferData({ ...offerData, revenueShareCap: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    e.g., 1.5x = investor gets 1.5× their investment back, then stops
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Payout Calculator */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Calculator className="w-5 h-5 text-highstreet-purple" />
              <h2 className="text-lg font-semibold text-slate-900">Payout Calculator</h2>
            </div>
            <button
              onClick={() => setShowCalculator(!showCalculator)}
              className="text-sm text-highstreet-purple hover:underline"
            >
              {showCalculator ? 'Hide' : 'Show'} Projections
            </button>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Investment Amount
            </label>
            <input
              type="number"
              value={investmentAmount}
              onChange={(e) => setInvestmentAmount(Number(e.target.value))}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg"
              min={offerData.minimumTicket}
              step={offerData.minimumTicket}
            />
          </div>

          {showCalculator && projection && (
            <div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                <p className="text-sm text-amber-900">
                  <strong>Projection, not a promise:</strong> {projection.disclaimer}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="text-sm text-slate-500 mb-1">Est. Total Return</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    ${projection.estimatedTotalReturn?.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {((projection.estimatedTotalReturn || 0) / investmentAmount * 100).toFixed(0)}% of investment
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="text-sm text-slate-500 mb-1">Est. Breakeven</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {projection.estimatedMonthsToBreakeven || '—'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {projection.estimatedMonthsToBreakeven ? 'months' : 'Unknown'}
                  </div>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2">
                {projection.projectedMonthlyPayouts.map((payout, i) => (
                  <div key={i} className="flex items-center justify-between text-sm p-2 bg-slate-50 rounded">
                    <span className="text-slate-600">
                      {new Date(payout.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </span>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-500">
                        ${payout.projectedRevenue.toLocaleString()} revenue
                      </span>
                      <span className="font-semibold text-slate-900">
                        ${payout.projectedPayout.toLocaleString()} payout
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Simulated Invest Button */}
        <div className="bg-white rounded-xl border-2 border-highstreet-purple p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Make a Simulated Commitment</h3>
              <p className="text-sm text-slate-600">
                This is a prototype. No real money will be exchanged.
              </p>
            </div>
            <button
              onClick={() => {
                alert(`Simulated commitment of $${investmentAmount} recorded!\n\n(In real version, this would create an investor account and track payouts)`);
              }}
              className="px-6 py-3 bg-highstreet-purple text-white rounded-lg hover:bg-opacity-90 font-medium"
            >
              Simulate Investment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
