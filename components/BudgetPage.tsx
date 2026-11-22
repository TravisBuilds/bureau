'use client';

interface BudgetItem {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

interface CostBreakdown {
  service: string;
  amount: number;
  details: string;
}

export default function BudgetPage() {
  const monthlyBudget = 100;
  const spent = 9.97;
  const percentage = (spent / monthlyBudget) * 100;
  
  const agentBudgets: BudgetItem[] = [
    { category: 'Mock Agent Alpha', amount: 4.99, percentage: 50, color: 'bg-primary' },
    { category: 'Mock Agent Beta', amount: 4.98, percentage: 50, color: 'bg-cyan' },
  ];

  const costBreakdown: CostBreakdown[] = [
    { service: 'Google Places API', amount: 8.72, details: 'Restaurant search & details' },
    { service: 'Gemini API', amount: 1.25, details: 'AI curation & summaries' },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dark mb-2">Budget & Costs</h1>
        <p className="text-silver">Monthly spending cap and cost tracking</p>
      </div>

      {/* Company Budget Overview */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-bold text-dark mb-4">Company Budget</h2>
        
        <div className="mb-6">
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-3xl font-bold text-dark">${spent}</div>
              <div className="text-sm text-silver">of ${monthlyBudget}/month</div>
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
          
          <div className="mt-2 flex justify-between text-xs text-silver">
            <span>$0</span>
            <span className="text-warning">80% warning</span>
            <span className="text-danger">100% pause</span>
            <span>${monthlyBudget}</span>
          </div>
        </div>

        {/* Budget Thresholds */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-light-gray rounded-lg">
            <div className="text-sm text-silver mb-1">Remaining</div>
            <div className="text-xl font-bold text-success">${(monthlyBudget - spent).toFixed(2)}</div>
          </div>
          <div className="p-4 bg-warning/10 rounded-lg">
            <div className="text-sm text-silver mb-1">Warning at</div>
            <div className="text-xl font-bold text-warning">${(monthlyBudget * 0.8).toFixed(2)}</div>
          </div>
          <div className="p-4 bg-danger/10 rounded-lg">
            <div className="text-sm text-silver mb-1">Auto-pause at</div>
            <div className="text-xl font-bold text-danger">${monthlyBudget}</div>
          </div>
        </div>
      </div>

      {/* Per-Agent Budgets */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-bold text-dark mb-4">Per-Agent Budgets</h2>
        
        <div className="space-y-4">
          {agentBudgets.map((agent, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-dark">{agent.category}</div>
                <div className="text-sm text-silver">${agent.amount}/month allocated</div>
              </div>
              <div className="h-3 bg-light-gray rounded-full overflow-hidden">
                <div
                  className={`h-full ${agent.color}`}
                  style={{ width: `${(agent.amount / agent.percentage * 100)}%` }}
                ></div>
              </div>
              <div className="mt-1 text-xs text-silver">
                ${agent.amount.toFixed(2)} used (100% of allocated)
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-light-gray rounded-lg">
          <div className="text-sm text-dark mb-2">
            💡 <strong>Budget allocation:</strong> Each agent has a monthly limit within the company ceiling.
            When an agent hits 100% of its budget, it pauses automatically.
          </div>
        </div>
      </div>

      {/* Cost Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-dark mb-4">Cost Breakdown (November)</h2>
        
        <div className="space-y-3">
          {costBreakdown.map((cost, i) => (
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
          <div className="font-semibold text-dark">Total</div>
          <div className="text-2xl font-bold text-dark">${spent.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
