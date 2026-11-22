'use client';

import { use } from 'react';
import { Building2, TrendingUp, Clock, Users, DollarSign, AlertTriangle } from 'lucide-react';
import { travisStreams } from '@/lib/travis-streams-seed';
import { generateSampleBakeryAuditTrail, SAMPLE_BAKERY_PITCH } from '@/lib/sample-bakery-data';
import { DEFAULT_SHARE_SETTINGS } from '@/lib/audit-types';
import { getTotalIncome, getTotalCosts, getDecisionHistory } from '@/lib/audit-types';

export default function PublicStreamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  
  // Find the stream
  const stream = travisStreams.find(s => s.id === slug);
  
  if (!stream) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Stream Not Found</h1>
          <p className="text-slate-600">This stream doesn't exist or isn't public yet.</p>
        </div>
      </div>
    );
  }

  // Check if stream is public (for now, only sample-corner-bakery and plum-list can be shared)
  const isPublic = stream.id === 'sample-corner-bakery' || stream.id === 'plum-list';
  
  if (!isPublic) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Private Stream</h1>
          <p className="text-slate-600">This stream is not public yet.</p>
        </div>
      </div>
    );
  }

  // Get audit trail (sample bakery has one, plum list doesn't yet)
  const auditTrail = stream.id === 'sample-corner-bakery' 
    ? generateSampleBakeryAuditTrail() 
    : null;

  const shareSettings = stream.shareSettings || {
    ...DEFAULT_SHARE_SETTINGS,
    visibility: 'public-preview',
    publicFields: {
      monthlyIncome: true,
      monthlyCosts: true,
      monthlyHours: true,
      userMetrics: true,
      decisions: true,
      auditTrail: true,
      effectiveHourlyRate: true,
      recentActivity: true,
    },
  };

  const isSample = stream.id.includes('sample');
  const pitch = stream.id === 'sample-corner-bakery' ? SAMPLE_BAKERY_PITCH : null;

  // Calculate metrics from audit trail
  const currentMonth = '2026-11';
  const previousMonth = '2026-10';
  const monthlyIncome = auditTrail ? getTotalIncome(auditTrail, currentMonth) : (stream.monthlyIncome || 0);
  const monthlyCosts = auditTrail ? getTotalCosts(auditTrail, currentMonth) : (stream.monthlyCosts || 0);
  const netIncome = monthlyIncome - monthlyCosts;
  const margin = monthlyIncome > 0 ? (netIncome / monthlyIncome) * 100 : 0;
  
  const previousIncome = auditTrail ? getTotalIncome(auditTrail, previousMonth) : 0;
  const growthRate = previousIncome > 0 ? ((monthlyIncome - previousIncome) / previousIncome) * 100 : 0;

  const effectiveHourlyRate = stream.monthlyHours && stream.monthlyHours > 0
    ? netIncome / stream.monthlyHours
    : 0;

  const decisions = auditTrail ? getDecisionHistory(auditTrail, 3) : [];

  return (
    <div className="min-h-screen bg-white">
      {/* PROTOTYPE BANNER */}
      <div className="bg-red-600 text-white py-3 px-6 text-center font-medium">
        ⚠️ PROTOTYPE — No real money, not an offer of securities
      </div>

      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-highstreet-purple bg-opacity-10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-highstreet-purple" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-slate-900">{stream.name}</h1>
              <p className="text-slate-600 mt-2">{stream.description}</p>
              {isSample && (
                <div className="mt-3 inline-block px-3 py-1 bg-amber-100 text-amber-900 text-sm font-medium rounded-lg">
                  SAMPLE DATA - for demonstration only
                </div>
              )}
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {shareSettings.publicFields.monthlyIncome && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="text-sm text-slate-500 mb-1">Monthly Revenue</div>
                <div className="text-2xl font-semibold text-slate-900">
                  ${monthlyIncome.toLocaleString()}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  from {stream.dataSource || 'agent'}, {new Date(stream.dataAsOf || Date.now()).toLocaleDateString()}
                </div>
              </div>
            )}

            {shareSettings.publicFields.monthlyCosts && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="text-sm text-slate-500 mb-1">Monthly Costs</div>
                <div className="text-2xl font-semibold text-slate-900">
                  ${monthlyCosts.toLocaleString()}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {margin.toFixed(0)}% margin
                </div>
              </div>
            )}

            {shareSettings.publicFields.userMetrics && stream.users !== undefined && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="text-sm text-slate-500 mb-1">Customers</div>
                <div className="text-2xl font-semibold text-slate-900">
                  {stream.users}
                </div>
                {growthRate !== 0 && (
                  <div className={`text-xs mt-1 flex items-center gap-1 ${growthRate > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    <TrendingUp className="w-3 h-3" />
                    {growthRate > 0 ? '+' : ''}{growthRate.toFixed(0)}% from last month
                  </div>
                )}
              </div>
            )}

            {shareSettings.publicFields.effectiveHourlyRate && effectiveHourlyRate > 0 && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="text-sm text-slate-500 mb-1">Per Hour</div>
                <div className="text-2xl font-semibold text-slate-900">
                  ${effectiveHourlyRate.toFixed(0)}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {stream.monthlyHours}h/month
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Pitch (if available) */}
        {pitch && (
          <div className="mb-12">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">{pitch.headline}</h2>
            <div className="prose prose-slate max-w-none">
              {pitch.story.split('\n\n').map((para, i) => (
                <p key={i} className="text-slate-600 mb-4">{para}</p>
              ))}
            </div>

            {/* Use of Funds */}
            <div className="mt-6 p-6 bg-slate-50 rounded-lg">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Use of Funds</h3>
              <div className="space-y-2">
                {pitch.useOfFunds.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{item.item}</span>
                    <span className="font-semibold text-slate-900">${item.amount.toLocaleString()}</span>
                  </div>
                ))}
                <div className="pt-2 mt-2 border-t border-slate-200 flex items-center justify-between font-semibold">
                  <span className="text-slate-900">Total</span>
                  <span className="text-slate-900">
                    ${pitch.useOfFunds.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Track Record Timeline */}
        {shareSettings.publicFields.auditTrail && auditTrail && (
          <div className="mb-12">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">Track Record</h2>
            
            {/* Monthly Revenue Chart */}
            <div className="p-6 bg-slate-50 rounded-lg mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Monthly Revenue (Last 6 Months)</h3>
              <div className="space-y-3">
                {['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map(month => {
                  const income = getTotalIncome(auditTrail, month);
                  const costs = getTotalCosts(auditTrail, month);
                  const net = income - costs;
                  const maxIncome = 4500;
                  const incomeWidth = (income / maxIncome) * 100;
                  const costsWidth = (costs / maxIncome) * 100;
                  
                  return (
                    <div key={month}>
                      <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                        <span>{new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                        <span className="font-semibold text-slate-900">${income.toLocaleString()} revenue</span>
                      </div>
                      <div className="relative h-8 bg-white rounded overflow-hidden">
                        <div 
                          className="absolute h-full bg-green-500 bg-opacity-20"
                          style={{ width: `${incomeWidth}%` }}
                        />
                        <div 
                          className="absolute h-full bg-red-500 bg-opacity-20"
                          style={{ width: `${costsWidth}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-end px-2 text-xs font-medium text-slate-700">
                          ${net.toLocaleString()} net
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Source: {auditTrail.entries.find(e => e.type === 'income' && e.period === month)?.source}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Recent Decisions */}
        {shareSettings.publicFields.decisions && decisions.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">Recent Decisions</h2>
            <div className="space-y-4">
              {decisions.map(decision => (
                <div key={decision.id} className="p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-semibold uppercase px-2 py-1 rounded ${
                      decision.signal === 'push' ? 'bg-green-100 text-green-700' :
                      decision.signal === 'keep' ? 'bg-blue-100 text-blue-700' :
                      decision.signal === 'pause' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {decision.signal}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(decision.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">{decision.reasoning}</p>
                  {decision.verdict && (
                    <p className="text-sm text-slate-500 mt-2 italic">{decision.verdict}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-200 text-center text-sm text-slate-500">
          <p>All data from auditable record • Bureau by Highstreet</p>
        </div>
      </main>
    </div>
  );
}
