'use client';

import { useState } from 'react';

interface Company {
  id: string;
  name: string;
  goal: string;
  signal: 'push' | 'keep' | 'pause' | 'kill';
  signalReason: string;
  monthlyBudget: number;
  spent: number;
  agents: number;
  needsYou: number;
}

const companies: Company[] = [
  {
    id: 'plum-list',
    name: 'Plum List',
    goal: 'Help travelers find great restaurants',
    signal: 'push',
    signalReason: 'Critical blocker: return tracking not measurable',
    monthlyBudget: 100,
    spent: 9.97,
    agents: 2,
    needsYou: 1,
  },
];

export default function PortfolioPage() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dark mb-2">Portfolio</h1>
        <p className="text-silver">Your AI agent companies at a glance</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Companies" value="1" />
        <StatCard label="Total Budget" value="$100/mo" />
        <StatCard label="Total Spent" value="$9.97" />
        <StatCard label="Needs You" value="1" highlight />
      </div>

      {/* Company Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {companies.map((company) => (
          <CompanyCard key={company.id} company={company} />
        ))}
        
        {/* Add Company Card */}
        <button className="border-2 border-dashed border-silver rounded-xl p-8 hover:border-primary hover:bg-white transition-all flex flex-col items-center justify-center min-h-[280px] group">
          <div className="text-6xl mb-4 text-silver group-hover:text-primary transition-colors">+</div>
          <div className="text-sm font-medium text-silver group-hover:text-primary transition-colors">Add Company</div>
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`bg-white rounded-xl p-6 border ${highlight ? 'border-warning' : 'border-gray-200'}`}>
      <div className="text-sm text-silver mb-1">{label}</div>
      <div className={`text-2xl font-bold ${highlight ? 'text-warning' : 'text-dark'}`}>{value}</div>
    </div>
  );
}

function CompanyCard({ company }: { company: Company }) {
  const signalColors = {
    push: 'bg-success text-white',
    keep: 'bg-info text-white',
    pause: 'bg-warning text-white',
    kill: 'bg-danger text-white',
  };

  const signalIcons = {
    push: '🚀',
    keep: '✓',
    pause: '⏸',
    kill: '⛔',
  };

  return (
    <a 
      href={`/company/${company.id}`}
      className="bg-white rounded-xl p-6 border border-gray-200 hover:border-primary hover:shadow-lg transition-all block"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-dark mb-1">{company.name}</h3>
          <p className="text-sm text-silver line-clamp-2">{company.goal}</p>
        </div>
        <span className={`${signalColors[company.signal]} px-3 py-1 rounded-full text-xs font-medium uppercase flex items-center gap-1`}>
          <span>{signalIcons[company.signal]}</span>
          {company.signal}
        </span>
      </div>

      {/* One-line reason */}
      <div className="mb-4 p-3 bg-light-gray rounded-lg">
        <p className="text-sm text-dark">{company.signalReason}</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-silver">Budget</div>
          <div className="font-semibold text-dark">${company.spent}/${company.monthlyBudget}</div>
        </div>
        <div>
          <div className="text-silver">Agents</div>
          <div className="font-semibold text-dark">{company.agents}</div>
        </div>
        <div>
          <div className="text-silver">Needs You</div>
          <div className={`font-semibold ${company.needsYou > 0 ? 'text-warning' : 'text-silver'}`}>
            {company.needsYou}
          </div>
        </div>
      </div>
    </a>
  );
}
