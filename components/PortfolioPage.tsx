'use client';

import { useState } from 'react';

interface IncomeStream {
  id: string;
  name: string;
  goal: string;
  signal: 'push' | 'keep' | 'pause' | 'kill';
  signalReason: string;
  monthlyBudget: number;
  spent: number;
  earnings: number;
  helpers: number;
  needsYou: number;
}

const streams: IncomeStream[] = [
  {
    id: 'plum-list',
    name: 'Plum List',
    goal: 'Help travelers find great restaurants',
    signal: 'push',
    signalReason: 'Critical blocker: return tracking not measurable',
    monthlyBudget: 100,
    spent: 9.97,
    earnings: 0,
    helpers: 2,
    needsYou: 1,
  },
];

export default function PortfolioPage() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dark mb-2">Your Income Streams</h1>
        <p className="text-silver">Passions you're turning into money</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Streams" value="1" />
        <StatCard label="Spending" value="$9.97/mo" />
        <StatCard label="Earning" value="$0/mo" />
        <StatCard label="Needs You" value="1" highlight />
      </div>

      {/* Stream Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {streams.map((stream) => (
          <StreamCard key={stream.id} stream={stream} />
        ))}
        
        {/* Add Stream Card */}
        <button className="border-2 border-dashed border-silver rounded-xl p-8 hover:border-primary hover:bg-white transition-all flex flex-col items-center justify-center min-h-[280px] group">
          <div className="text-6xl mb-4 text-silver group-hover:text-primary transition-colors">+</div>
          <div className="text-sm font-medium text-silver group-hover:text-primary transition-colors">Add Income Stream</div>
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

function StreamCard({ stream }: { stream: IncomeStream }) {
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

  const signalMessages = {
    push: 'Unblock this',
    keep: 'Keep going',
    pause: 'Take a break',
    kill: 'Let it go',
  };

  return (
    <a 
      href={`/stream/${stream.id}`}
      className="bg-white rounded-xl p-6 border border-gray-200 hover:border-primary hover:shadow-lg transition-all block"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-dark mb-1">{stream.name}</h3>
          <p className="text-sm text-silver line-clamp-2">{stream.goal}</p>
        </div>
        <span className={`${signalColors[stream.signal]} px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1 whitespace-nowrap`}>
          <span>{signalIcons[stream.signal]}</span>
          <span>{stream.signal}</span>
        </span>
      </div>

      {/* One-line reason */}
      <div className="mb-4 p-3 bg-light-gray rounded-lg">
        <p className="text-sm text-dark font-medium">{signalMessages[stream.signal]}: {stream.signalReason}</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-silver">Spending</div>
          <div className="font-semibold text-dark">${stream.spent}/mo</div>
        </div>
        <div>
          <div className="text-silver">Earning</div>
          <div className={`font-semibold ${stream.earnings > 0 ? 'text-success' : 'text-silver'}`}>
            ${stream.earnings}/mo
          </div>
        </div>
        <div>
          <div className="text-silver">Helpers</div>
          <div className="font-semibold text-dark">{stream.helpers}</div>
        </div>
      </div>
    </a>
  );
}
