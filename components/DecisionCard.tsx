import { PricingRecommendation, OpenToUsersRecommendation } from '@/lib/types';

interface Props {
  title: string;
  recommendation: PricingRecommendation | OpenToUsersRecommendation;
  type: 'pricing' | 'access';
}

export default function DecisionCard({ title, recommendation, type }: Props) {
  const isPricing = type === 'pricing';
  const rec = recommendation as any;

  const strategyLabels: { [key: string]: string } = {
    set_price: '💵 Set Price',
    free_with_cap: '🆓 Free with Cost Cap',
    invite_only: '🔐 Invite Only',
    closed: '🚫 Closed',
    open_now: '🌐 Open Now',
    open_with_limits: '⚡ Open with Limits',
    keep_closed: '🔒 Keep Closed',
    review_needed: '🔍 Review Needed',
  };

  const strategy = isPricing ? rec.strategy : rec.recommendation;
  const label = strategyLabels[strategy] || strategy;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <h3 className="font-semibold text-lg text-slate-900 mb-4">{title}</h3>
      
      <div className="mb-4">
        <div className="inline-block bg-slate-100 text-slate-900 px-4 py-2 rounded-lg font-semibold">
          {label}
        </div>
      </div>

      {isPricing && rec.recommendedPricePerUser && (
        <div className="mb-3">
          <span className="text-sm text-slate-600">Recommended price: </span>
          <span className="text-xl font-bold text-slate-900">
            ${rec.recommendedPricePerUser}/user/month
          </span>
        </div>
      )}

      {isPricing && rec.monthlyCostCap && (
        <div className="mb-3">
          <span className="text-sm text-slate-600">Monthly cost cap: </span>
          <span className="text-lg font-semibold text-orange-600">
            ${rec.monthlyCostCap}/month
          </span>
        </div>
      )}

      {rec.conditions && rec.conditions.length > 0 && (
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Conditions:</h4>
          <ul className="text-sm text-slate-600 space-y-1">
            {rec.conditions.map((condition: string, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-slate-400">•</span>
                <span>{condition}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-3">
        <h4 className="text-sm font-semibold text-slate-700 mb-1">Reasoning:</h4>
        <p className="text-sm text-slate-600 leading-relaxed">
          {rec.reasoning}
        </p>
      </div>

      {rec.reviewDate && (
        <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-200">
          Review by: {rec.reviewDate}
        </div>
      )}

      <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <h4 className="text-xs font-semibold text-slate-700 mb-1">Agent Action:</h4>
        <p className="text-xs text-slate-600 leading-relaxed">
          {rec.agentActionBrief}
        </p>
      </div>
    </div>
  );
}
