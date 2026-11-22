'use client';

interface Helper {
  id: string;
  name: string;
  job: string;
  provider: string;
  status: 'active' | 'paused';
  monthlyBudget: number;
  spent: number;
  capabilities: string[];
  lastActive: string;
}

const helpers: Helper[] = [
  {
    id: 'alpha',
    name: 'Mock Agent Alpha',
    job: 'Handle the planning and reporting',
    provider: 'Mock Provider',
    status: 'active',
    monthlyBudget: 50,
    spent: 4.99,
    capabilities: ['Planning', 'Reports', 'Scheduling'],
    lastActive: '2 hours ago',
  },
  {
    id: 'beta',
    name: 'Mock Agent Beta',
    job: 'Build and test code',
    provider: 'Mock Provider',
    status: 'active',
    monthlyBudget: 50,
    spent: 4.98,
    capabilities: ['Code', 'Testing', 'Bug fixes'],
    lastActive: '1 hour ago',
  },
];

export default function YourHelpersPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dark mb-2">Your Helpers</h1>
        <p className="text-silver">AI assistants helping with your project</p>
      </div>

      {/* Helpers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {helpers.map((helper) => (
          <HelperCard key={helper.id} helper={helper} />
        ))}
      </div>

      {/* Add Helper */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <h3 className="text-lg font-bold text-dark mb-2">Need more help?</h3>
        <p className="text-sm text-silver mb-4">Connect another AI assistant to help with this project</p>
        <button className="px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover transition-colors">
          + Connect Helper
        </button>
      </div>
    </div>
  );
}

function HelperCard({ helper }: { helper: Helper }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-bold text-dark">{helper.name}</h3>
            <span className={`w-2 h-2 rounded-full ${helper.status === 'active' ? 'bg-success' : 'bg-gray-300'}`}></span>
          </div>
          <p className="text-sm text-silver mb-3">{helper.job}</p>
          <div className="text-xs text-silver">{helper.provider}</div>
        </div>
      </div>

      {/* What they can do */}
      <div className="mb-4">
        <div className="text-xs text-silver mb-2">What they help with:</div>
        <div className="flex flex-wrap gap-2">
          {helper.capabilities.map((cap, i) => (
            <span key={i} className="px-2 py-1 bg-light-gray text-dark rounded text-xs">
              {cap}
            </span>
          ))}
        </div>
      </div>

      {/* Spending */}
      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-silver">Monthly spending:</span>
          <span className="text-sm font-semibold text-dark">${helper.spent} of ${helper.monthlyBudget}</span>
        </div>
        <div className="h-2 bg-light-gray rounded-full overflow-hidden">
          <div
            className="h-full bg-primary"
            style={{ width: `${(helper.spent / helper.monthlyBudget) * 100}%` }}
          ></div>
        </div>
        <div className="text-xs text-silver mt-2">Last active: {helper.lastActive}</div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <button className="flex-1 py-2 border border-gray-200 text-dark rounded-lg text-sm font-medium hover:bg-light-gray transition-colors">
          Configure
        </button>
        <button className="flex-1 py-2 border border-gray-200 text-dark rounded-lg text-sm font-medium hover:bg-light-gray transition-colors">
          Pause
        </button>
      </div>
    </div>
  );
}
