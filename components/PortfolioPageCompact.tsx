'use client';

import { useState } from 'react';
import { travisStreams, getPortfolioRollup, todayQueue, type IncomeStream, type TodayItem } from '@/lib/travis-streams-seed';

type FilterType = 'all' | 'needs-me' | 'growing' | 'paused';
type SortType = 'name' | 'signal' | 'spending' | 'earning' | 'activity';

export default function PortfolioPageCompact() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('name');
  
  const rollup = getPortfolioRollup(travisStreams);
  
  // Apply filters
  let filteredStreams = travisStreams;
  if (filter === 'needs-me') {
    filteredStreams = travisStreams.filter(s => (s.needsYou || 0) > 0);
  } else if (filter === 'growing') {
    filteredStreams = travisStreams.filter(s => s.connected && (s.users || 0) > 0);
  } else if (filter === 'paused') {
    filteredStreams = travisStreams.filter(s => s.status === 'paused');
  }
  
  // Apply sort
  const sortedStreams = [...filteredStreams].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'signal') {
      const signalOrder = { push: 0, keep: 1, pause: 2, kill: 3 };
      return (signalOrder[a.signal || 'keep'] || 999) - (signalOrder[b.signal || 'keep'] || 999);
    }
    if (sort === 'spending') return (b.spending || 0) - (a.spending || 0);
    if (sort === 'earning') return (b.earnings || 0) - (a.earnings || 0);
    return 0;
  });

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-dark mb-2">Your Income Streams</h1>
        <p className="text-silver">Brief check-in: what needs you today</p>
      </div>

      {/* Portfolio Rollup */}
      <div className="bg-gradient-to-r from-primary/10 to-cyan/10 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-5 gap-4 text-center">
          <div>
            <div className="text-sm text-silver mb-1">Streams</div>
            <div className="text-2xl font-bold text-dark">{rollup.totalStreams}</div>
            <div className="text-xs text-silver">{rollup.connectedStreams} connected</div>
          </div>
          <div>
            <div className="text-sm text-silver mb-1">Total Users</div>
            <div className="text-2xl font-bold text-dark">{rollup.totalUsers}</div>
          </div>
          <div>
            <div className="text-sm text-silver mb-1">Earning</div>
            <div className={`text-2xl font-bold ${rollup.totalEarnings > 0 ? 'text-success' : 'text-silver'}`}>
              ${rollup.totalEarnings}/mo
            </div>
          </div>
          <div>
            <div className="text-sm text-silver mb-1">Spending</div>
            <div className="text-2xl font-bold text-dark">${rollup.totalSpending.toFixed(2)}/mo</div>
          </div>
          <div>
            <div className="text-sm text-silver mb-1">Needs You</div>
            <div className={`text-2xl font-bold ${rollup.needsYou > 0 ? 'text-warning' : 'text-success'}`}>
              {rollup.needsYou}
            </div>
          </div>
        </div>
      </div>

      {/* Today's Queue */}
      {todayQueue.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-bold text-dark mb-4">Today ({todayQueue.length} items)</h2>
          <div className="space-y-2">
            {todayQueue.map((item, i) => (
              <TodayItemRow key={i} item={item} />
            ))}
          </div>
          <div className="mt-4 text-sm text-silver">
            Total time: {todayQueue.reduce((sum, item) => sum + item.timeMinutes, 0)} minutes
          </div>
        </div>
      )}

      {/* Filters & Sort */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
            All ({travisStreams.length})
          </FilterButton>
          <FilterButton active={filter === 'needs-me'} onClick={() => setFilter('needs-me')}>
            Needs Me ({travisStreams.filter(s => (s.needsYou || 0) > 0).length})
          </FilterButton>
          <FilterButton active={filter === 'growing'} onClick={() => setFilter('growing')}>
            Growing ({travisStreams.filter(s => s.connected && (s.users || 0) > 0).length})
          </FilterButton>
          <FilterButton active={filter === 'paused'} onClick={() => setFilter('paused')}>
            Paused ({travisStreams.filter(s => s.status === 'paused').length})
          </FilterButton>
        </div>
        
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortType)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="name">Sort: Name</option>
          <option value="signal">Sort: Signal</option>
          <option value="spending">Sort: Spending</option>
          <option value="earning">Sort: Earning</option>
        </select>
      </div>

      {/* Streams Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-light-gray border-b border-gray-200">
            <tr className="text-left text-xs text-silver uppercase tracking-wider">
              <th className="px-6 py-3">Stream</th>
              <th className="px-6 py-3">Signal</th>
              <th className="px-6 py-3">Agents</th>
              <th className="px-6 py-3 text-right">Spending</th>
              <th className="px-6 py-3 text-right">Earning</th>
              <th className="px-6 py-3 text-center">Needs You</th>
              <th className="px-6 py-3 text-right">Time Asked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortedStreams.map((stream) => (
              <StreamRow key={stream.id} stream={stream} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TodayItemRow({ item }: { item: TodayItem }) {
  return (
    <div className="flex items-center justify-between p-3 bg-light-gray rounded-lg hover:bg-gray-100 transition-colors">
      <div className="flex items-center gap-3">
        <span className="flex-shrink-0 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">
          {item.priority}
        </span>
        <div>
          <div className="font-medium text-dark">{item.title}</div>
          <div className="text-xs text-silver">{item.streamName}</div>
        </div>
      </div>
      <div className="text-sm text-silver">{item.timeMinutes} min</div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-primary text-white'
          : 'bg-white border border-gray-200 text-dark hover:bg-light-gray'
      }`}
    >
      {children}
    </button>
  );
}

function StreamRow({ stream }: { stream: IncomeStream }) {
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

  if (!stream.connected) {
    return (
      <tr className="hover:bg-light-gray transition-colors">
        <td className="px-6 py-4">
          <div>
            <div className="font-semibold text-dark">{stream.name}</div>
            <div className="text-sm text-silver">{stream.description}</div>
          </div>
        </td>
        <td className="px-6 py-4" colSpan={6}>
          <a
            href={`/stream/${stream.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors"
          >
            Connect {stream.agents.length > 1 ? 'agents' : 'agent'} to get started
          </a>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-light-gray transition-colors cursor-pointer" onClick={() => window.location.href = `/stream/${stream.id}`}>
      <td className="px-6 py-4">
        <div>
          <div className="font-semibold text-dark">{stream.name}</div>
          <div className="text-sm text-silver">{stream.description}</div>
        </div>
      </td>
      <td className="px-6 py-4">
        {stream.signal && (
          <span className={`${signalColors[stream.signal]} px-2 py-1 rounded text-xs font-bold uppercase inline-flex items-center gap-1`}>
            <span>{signalIcons[stream.signal]}</span>
            {stream.signal}
          </span>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="text-sm">
          {stream.agents.map(a => a.name).join(', ')}
        </div>
      </td>
      <td className="px-6 py-4 text-right">
        <div className="font-semibold text-dark">${stream.spending?.toFixed(2) || '0'}</div>
      </td>
      <td className="px-6 py-4 text-right">
        <div className={`font-semibold ${(stream.earnings || 0) > 0 ? 'text-success' : 'text-silver'}`}>
          ${stream.earnings?.toFixed(2) || '0'}
        </div>
      </td>
      <td className="px-6 py-4 text-center">
        {(stream.needsYou || 0) > 0 ? (
          <span className="inline-flex items-center justify-center w-6 h-6 bg-warning text-white rounded-full text-xs font-bold">
            {stream.needsYou}
          </span>
        ) : (
          <span className="text-silver">—</span>
        )}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="text-sm text-silver">
          {stream.timeAskedHours ? `${(stream.timeAskedHours * 60).toFixed(0)} min` : '—'}
        </div>
      </td>
    </tr>
  );
}
