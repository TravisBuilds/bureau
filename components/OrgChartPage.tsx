'use client';

interface Agent {
  id: string;
  name: string;
  role: string;
  provider: string;
  status: 'active' | 'paused';
  monthlyBudget: number;
  spent: number;
  manager: string | null;
  capabilities: string[];
  lastActive: string;
}

const agents: Agent[] = [
  {
    id: 'founder',
    name: 'You (Founder)',
    role: 'Board',
    provider: 'Human',
    status: 'active',
    monthlyBudget: 0,
    spent: 0,
    manager: null,
    capabilities: ['Final decisions', 'Strategy', 'Approvals'],
    lastActive: 'Now',
  },
  {
    id: 'ceo',
    name: 'CEO Agent',
    role: 'Chief Executive',
    provider: 'Mock Agent Alpha',
    status: 'active',
    monthlyBudget: 50,
    spent: 4.99,
    manager: 'founder',
    capabilities: ['Planning', 'Delegation', 'Reporting'],
    lastActive: '2 hours ago',
  },
  {
    id: 'engineer',
    name: 'Engineering Agent',
    role: 'Engineer',
    provider: 'Mock Agent Beta',
    status: 'active',
    monthlyBudget: 50,
    spent: 4.98,
    manager: 'ceo',
    capabilities: ['Code', 'Testing', 'Deployment'],
    lastActive: '1 hour ago',
  },
];

export default function OrgChartPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dark mb-2">Agents & Org Chart</h1>
        <p className="text-silver">Your agent team hierarchy</p>
      </div>

      {/* Org Chart (Visual Hierarchy) */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
        <div className="flex flex-col items-center">
          {/* Founder at Top */}
          <AgentNode agent={agents[0]} isFounder />
          
          <div className="w-px h-12 bg-gray-300"></div>
          
          {/* CEO */}
          <AgentNode agent={agents[1]} />
          
          <div className="w-px h-12 bg-gray-300"></div>
          
          {/* Reports */}
          <div className="flex gap-8">
            <AgentNode agent={agents[2]} />
          </div>
        </div>

        {/* Add Agent Button */}
        <div className="mt-8 pt-8 border-t border-gray-200 flex justify-center">
          <button className="px-6 py-3 border-2 border-dashed border-silver rounded-lg hover:border-primary hover:bg-light-gray transition-all flex items-center gap-2 text-silver hover:text-primary">
            <span className="text-xl">+</span>
            <span className="font-medium">Hire Agent</span>
          </button>
        </div>
      </div>

      {/* Agent Details List */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-dark">All Agents</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {agents.map((agent) => (
            <AgentRow key={agent.id} agent={agent} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentNode({ agent, isFounder }: { agent: Agent; isFounder?: boolean }) {
  return (
    <div className={`${isFounder ? 'w-64' : 'w-56'} border-2 ${agent.status === 'active' ? 'border-primary' : 'border-gray-300'} rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-all`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className={`text-sm font-bold ${isFounder ? 'text-primary' : 'text-dark'} mb-1`}>
            {agent.role}
          </div>
          <div className="text-xs text-silver">{agent.name}</div>
        </div>
        <span className={`w-3 h-3 rounded-full ${agent.status === 'active' ? 'bg-success' : 'bg-gray-300'}`}></span>
      </div>
      
      {!isFounder && (
        <div className="text-xs text-silver mb-2">
          {agent.provider}
        </div>
      )}
      
      <div className="pt-2 border-t border-gray-200 text-xs">
        {!isFounder && (
          <div className="flex justify-between mb-1">
            <span className="text-silver">Budget:</span>
            <span className="font-semibold text-dark">${agent.spent}/${agent.monthlyBudget}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-silver">Last active:</span>
          <span className="font-semibold text-dark">{agent.lastActive}</span>
        </div>
      </div>
    </div>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const isFounder = agent.id === 'founder';
  
  return (
    <div className="p-6 hover:bg-light-gray transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className={`text-lg font-bold ${isFounder ? 'text-primary' : 'text-dark'}`}>
              {agent.name}
            </h3>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              agent.status === 'active' ? 'bg-success/10 text-success' : 'bg-gray-200 text-silver'
            }`}>
              {agent.status}
            </span>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-silver mb-3">
            <span className="font-medium">{agent.role}</span>
            <span>•</span>
            <span>{agent.provider}</span>
            {!isFounder && (
              <>
                <span>•</span>
                <span>Reports to: {agents.find(a => a.id === agent.manager)?.name || 'N/A'}</span>
              </>
            )}
          </div>
          
          <div className="flex flex-wrap gap-2">
            {agent.capabilities.map((cap, i) => (
              <span key={i} className="px-2 py-1 bg-light-gray text-dark rounded text-xs">
                {cap}
              </span>
            ))}
          </div>
        </div>
        
        {!isFounder && (
          <div className="text-right">
            <div className="text-sm text-silver mb-1">Monthly Budget</div>
            <div className="text-xl font-bold text-dark">${agent.spent}</div>
            <div className="text-xs text-silver">of ${agent.monthlyBudget}</div>
            <div className="mt-2 w-32 h-2 bg-light-gray rounded-full overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${(agent.spent / agent.monthlyBudget) * 100}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
      
      {!isFounder && (
        <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2">
          <button className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors">
            Configure
          </button>
          <button className="px-4 py-2 border border-gray-200 text-dark rounded-lg text-sm font-medium hover:bg-light-gray transition-colors">
            View History
          </button>
          <button className="px-4 py-2 border border-gray-200 text-dark rounded-lg text-sm font-medium hover:bg-light-gray transition-colors">
            Pause
          </button>
        </div>
      )}
    </div>
  );
}
