'use client';

interface CostItem {
  service: string;
  amount: number;
  details: string;
}

export default function MoneyPage() {
  const monthlyLimit = 100;
  const spent = 9.97;
  const earnings = 0;
  const netIncome = earnings - spent;
  const percentage = (spent / monthlyLimit) * 100;
  
  const costs: CostItem[] = [
    { service: 'Google Places API', amount: 8.72, details: 'Restaurant search & details' },
    { service: 'Gemini API', amount: 1.25, details: 'AI curation & summaries' },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dark mb-2">Money In & Out</h1>
        <p className="text-silver">What you're spending and earning</p>
      </div>

      {/* Net Income */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
        <div className="text-center">
          <div className="text-sm text-silver mb-2">Net Income This Month</div>
          <div className={`text-5xl font-bold mb-2 ${netIncome >= 0 ? 'text-success' : 'text-danger'}`}>
            {netIncome >= 0 ? '+' : ''}{' $'}{Math.abs(netIncome).toFixed(2)}
          </div>
          <div className="text-sm text-silver">
            {earnings > 0 
              ? `Earning $${earnings}/mo, spending $${spent}/mo`
              : `Spending $${spent}/mo, not earning yet`
            }
          </div>
        </div>
      </div>

      {/* Spending Limit */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-bold text-dark mb-4">Your Spending Limit</h2>
        
        <div className="mb-6">
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-3xl font-bold text-dark">${spent}</div>
              <div className="text-sm text-silver">of ${monthlyLimit}/month you're okay with</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-success">{percentage.toFixed(1)}%</div>
              <div className="text-sm text-silver">used</div>
            </div>
          </div>
          
          <div className="h-4 bg-light-gray rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-success to-cyan transition-all"
              style={{ width: `${percentage}%` }}
            ></div>
          </div>
          
          <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-light-gray rounded-lg">
              <div className="text-silver mb-1">Still have</div>
              <div className="font-bold text-success">${(monthlyLimit - spent).toFixed(2)}</div>
            </div>
            <div className="p-3 bg-warning/10 rounded-lg">
              <div className="text-silver mb-1">Warning at</div>
              <div className="font-bold text-warning">${(monthlyLimit * 0.8).toFixed(2)}</div>
            </div>
            <div className="p-3 bg-danger/10 rounded-lg">
              <div className="text-silver mb-1">Stop at</div>
              <div className="font-bold text-danger">${monthlyLimit}</div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-light-gray rounded-lg">
          <div className="text-sm text-dark">
            💡 <strong>How this works:</strong> Bureau stops spending when you hit your limit. 
            You'll get a warning at 80%. You set this limit, so you're always in control.
          </div>
        </div>
      </div>

      {/* What You're Spending On */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-bold text-dark mb-4">What You're Spending On</h2>
        
        <div className="space-y-3">
          {costs.map((cost, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-light-gray rounded-lg">
              <div>
                <div className="font-semibold text-dark">{cost.service}</div>
                <div className="text-sm text-silver">{cost.details}</div>
              </div>
              <div className="text-xl font-bold text-dark">${cost.amount.toFixed(2)}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
          <div className="font-semibold text-dark">Total This Month</div>
          <div className="text-2xl font-bold text-dark">${spent.toFixed(2)}</div>
        </div>
      </div>

      {/* Earnings (placeholder for future) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-dark mb-4">What You're Earning</h2>
        
        {earnings > 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl font-bold text-success mb-2">${earnings}/mo</div>
            <div className="text-sm text-silver">Keep it up!</div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">📊</div>
            <div className="text-lg font-semibold text-dark mb-2">Not monetized yet</div>
            <div className="text-sm text-silver mb-4">That's okay! You're still learning what works.</div>
            <div className="text-xs text-silver">
              When you're ready to charge, Bureau will help you figure out pricing.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
