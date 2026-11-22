import { BureauDecision } from '@/lib/types';

interface Props {
  decision: BureauDecision;
}

const verdictConfig = {
  quit_your_day_job: {
    label: '✅ Yes, quit your day job',
    color: 'bg-green-500',
    textColor: 'text-green-900',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  keep_going: {
    label: '🚀 Keep going',
    color: 'bg-blue-500',
    textColor: 'text-blue-900',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  not_enough_evidence: {
    label: '🔍 Not enough evidence',
    color: 'bg-yellow-500',
    textColor: 'text-yellow-900',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  not_yet: {
    label: '⚠️ Not yet',
    color: 'bg-orange-500',
    textColor: 'text-orange-900',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  stop: {
    label: '🛑 Stop',
    color: 'bg-red-500',
    textColor: 'text-red-900',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
};

const confidenceConfig = {
  high: { label: 'High', color: 'text-green-700 bg-green-100' },
  medium: { label: 'Medium', color: 'text-yellow-700 bg-yellow-100' },
  low: { label: 'Low', color: 'text-red-700 bg-red-100' },
};

export default function VerdictDisplay({ decision }: Props) {
  const config = verdictConfig[decision.verdict];
  const confidenceStyle = confidenceConfig[decision.confidence];

  return (
    <div className={`${config.bgColor} ${config.borderColor} border-2 rounded-xl shadow-lg p-8`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <div className={`${config.color} w-3 h-3 rounded-full`} />
            <h2 className={`text-3xl font-bold ${config.textColor}`}>
              {config.label}
            </h2>
          </div>
          
          <div className="flex items-center gap-3 mb-6">
            <span className="text-sm font-medium text-slate-600">Confidence:</span>
            <span className={`${confidenceStyle.color} px-3 py-1 rounded-full text-xs font-semibold`}>
              {confidenceStyle.label}
            </span>
          </div>

          {decision.missingData && decision.missingData.length > 0 && (
            <div className="mt-4 p-4 bg-white/50 rounded-lg border border-slate-200">
              <h4 className="font-semibold text-sm text-slate-700 mb-2">
                Missing data that would improve this decision:
              </h4>
              <ul className="text-sm text-slate-600 space-y-1">
                {decision.missingData.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-slate-400">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
