'use client';

import { useState } from 'react';
import { use } from 'react';
import AppLayout from '@/components/AppLayout';
import CompanyOverviewPage from '@/components/CompanyOverviewPage';
import OrgChartPage from '@/components/OrgChartPage';
import TaskBoard from '@/components/TaskBoard';
import BudgetPage from '@/components/BudgetPage';

export default function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'org' | 'budget'>('overview');
  
  const companyName = id === 'plum-list' ? 'Plum List' : 'Company';

  return (
    <AppLayout currentCompany={companyName}>
      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex gap-1 px-8">
          <Tab active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
            Overview
          </Tab>
          <Tab active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')}>
            Tasks
          </Tab>
          <Tab active={activeTab === 'org'} onClick={() => setActiveTab('org')}>
            Agents & Org
          </Tab>
          <Tab active={activeTab === 'budget'} onClick={() => setActiveTab('budget')}>
            Budget
          </Tab>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'overview' && <CompanyOverviewPage />}
      {activeTab === 'tasks' && <TaskBoard projectName={companyName} />}
      {activeTab === 'org' && <OrgChartPage />}
      {activeTab === 'budget' && <BudgetPage />}
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
