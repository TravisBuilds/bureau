'use client';

interface Metric {
  label: string;
  value: string;
  source?: string;
}

interface NextAction {
  priority: number;
  title: string;
  reasoning: string;
  time: string;
  blocked?: string;
}

export default function CompanyOverviewPage() {
  const stream = {
    name: 'Plum List',
    myGoal: 'Learn if travelers want this',
    signal: 'push' as const,
    signalReason: 'Critical blocker: return tracking not measurable',
    signalDetail: 'You need to know if people come back. Right now you can't measure that.',
    headline: 'Too early to tell if this is becoming real income',
    monthlyBudget: 100,
    spent: 9.97,
    earnings: 0,
    needsYou: 1,
  };

  const metrics: Metric[] = [
    { label: 'Auth Users', value: '26', source: 'Supabase' },
    { label: 'Users with Saves', value: '6', source: 'Supabase' },
    { label: 'Total Saves', value: '633', source: 'Supabase' },
    { label: 'Costs (Nov)', value: '$9.97', source: 'Google Places + Gemini' },
    { label: 'Revenue', value: '$0', source: 'Not monetized' },
    { label: 'Unpushed Syncs', value: '4', source: 'Git' },
  ];

  const nextActions: NextAction[] = [
    {
      priority: 1,
      title: 'Approve: Return-tracking fix',
      reasoning: 'Unblocks retention measurement; needed to decide if users come back',
      time: '15 min',
      blocked: 'Retention',
    },
    {
      priority: 2,
      title: 'Push: 4 syncs unpushed, 2 open PRs',
      reasoning: 'Work is done but not deployed; users missing fixes',
      time: '10 min',
    },
    {
      priority: 3,
      title: 'Review: Session tracking gaps',
      reasoning: 'Some interactions not tracked (directions, website taps)',
      time: '20 min',
    },
  ];

  return (
    <div className="p-8">
      {/* Headline */}
      <div className="bg-white rounded-xl border-l-4 border-primary p-6 mb-6">
        <h2 className="text-xl font-bold text-dark mb-2">{stream.headline}</h2>
        <p className="text-sm text-silver">Your goal: {stream.myGoal}</p>
      </div>

      {/* Signal Banner */}
      <SignalBanner
        signal={stream.signal}
        reason={stream.signalReason}
        detail={stream.signalDetail}
      />

      {/* Key Metrics */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-bold text-dark mb-4">What's Happening</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {metrics.map((metric, i) => (
            <MetricCard key={i} metric={metric} />
          ))}
        </div>
      </div>

      {/* What to Do Next */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-dark">What You Should Do</h2>
          <span className="text-sm text-silver">Ranked by what matters most</span>
        </div>
        <div className="space-y-3">
          {nextActions.map((action, i) => (
            <ActionCard key={i} action={action} />
          ))}
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-silver mb-1">Spending</div>
          <div className="text-2xl font-bold text-dark">${stream.spent}/mo</div>
          <div className="text-xs text-silver mt-1">of ${stream.monthlyBudget} you're okay with</div>
          <div className="mt-3 h-2 bg-light-gray rounded-full overflow-hidden">
            <div className="h-full bg-success" style={{ width: `${(stream.spent / stream.monthlyBudget) * 100}%` }}></div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-silver mb-1">Earning</div>
          <div className={`text-2xl font-bold ${stream.earnings > 0 ? 'text-success' : 'text-silver'}`}>
            ${stream.earnings}/mo
          </div>
          <div className="text-xs text-silver mt-1">
            {stream.earnings > 0 ? 'Money coming in!' : 'Not monetized yet'}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-silver mb-1">Needs You</div>
          <div className="text-2xl font-bold text-warning">{stream.needsYou}</div>
          <div className="text-xs text-silver mt-1">Decision waiting</div>
        </div>
      </div>
    </div>
  );
}

function SignalBanner({ signal, reason, detail }: { signal: string; reason: string; detail: string }) {
  const colors = {
    push: 'bg-gradient-to-r from-success/20 to-success/10 border-success',
    keep: 'bg-gradient-to-r from-info/20 to-info/10 border-info',
    pause: 'bg-gradient-to-r from-warning/20 to-warning/10 border-warning',
    kill: 'bg-gradient-to-r from-danger/20 to-danger/10 border-danger',
  };

  const icons = {
    push: '🚀',
    keep: '✓',
    pause: '⏸',
    kill: '⛔',
  };

  return (
    <div className={`rounded-xl border-l-4 ${colors[signal]} p-6 mb-6`}>
      <div className="flex items-start gap-4">
        <span className="text-4xl">{icons[signal]}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-bold uppercase tracking-wide">{signal}</span>
            <span className="text-sm text-silver">•</span>
            <span className="text-sm font-medium">{reason}</span>
          </div>
          <p className="text-sm text-dark">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div className="group cursor-help">
      <div className="text-sm text-silver mb-1 group-hover:text-primary transition-colors">
        {metric.label}
      </div>
      <div className="text-xl font-bold text-dark">{metric.value}</div>
      {metric.source && (
        <div className="text-xs text-silver mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          Source: {metric.source}
        </div>
      )}
    </div>
  );
}

function ActionCard({ action }: { action: NextAction }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-primary hover:shadow-sm transition-all">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-3 flex-1">
          <span className="flex-shrink-0 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">
            {action.priority}
          </span>
          <div className="flex-1">
            <h3 className="font-semibold text-dark mb-1">{action.title}</h3>
            <p className="text-sm text-silver">{action.reasoning}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-xs text-silver">{action.time}</span>
          {action.blocked && (
            <span className="text-xs bg-warning/10 text-warning px-2 py-1 rounded">
              Blocks: {action.blocked}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
        <button className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors">
          Send to Agent
        </button>
        <button className="px-4 py-2 border border-gray-200 text-dark rounded-lg text-sm font-medium hover:bg-light-gray transition-colors">
          Details
        </button>
      </div>
    </div>
  );
}
