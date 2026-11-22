'use client';

import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import CompanyOverviewPage from '@/components/CompanyOverviewPage';
import YourHelpersPage from '@/components/YourHelpersPage';
import TaskBoard from '@/components/TaskBoard';
import MoneyPage from '@/components/MoneyPage';

export default function StreamPageClient({ id }: { id: string }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'helpers' | 'money'>('overview');
  
  const streamName = id === 'plum-list' ? 'Plum List' : 'Income Stream';

  return (
    <AppLayout currentStream={streamName}>
      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex gap-1 px-8">
          <Tab active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
            Overview
          </Tab>
          <Tab active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')}>
            Tasks
          </Tab>
          <Tab active={activeTab === 'helpers'} onClick={() => setActiveTab('helpers')}>
            Your Helpers
          </Tab>
          <Tab active={activeTab === 'money'} onClick={() => setActiveTab('money')}>
            Money In/Out
          </Tab>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'overview' && <CompanyOverviewPage />}
      {activeTab === 'tasks' && <TaskBoard projectName={streamName} />}
      {activeTab === 'helpers' && <YourHelpersPage />}
      {activeTab === 'money' && <MoneyPage />}
    </AppLayout>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-4 border-b-2 font-medium transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-silver hover:text-dark hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  );
}
