'use client';

import { useState } from 'react';
import PrototypeBanner from '@/components/PrototypeBanner';
import StreamRulesTab from '@/components/StreamRulesTab';
import { AutomationRule, DEFAULT_AUTOMATION_RULES } from '@/lib/automation-types';

const SAMPLE_RULES: AutomationRule[] = [
  {
    id: 'rule-1',
    streamId: 'plum-list',
    name: 'Weekly review preparation',
    enabled: true,
    trigger: {
      type: 'time-scheduled',
      condition: 'Every Friday at 4pm',
      checkFrequency: 'daily',
    },
    action: {
      type: 'prepare-review',
      details: 'Prepare weekly ten-hours review with priorities',
      requiresApproval: false,
    },
    createdAt: '2026-11-15T10:00:00Z',
    lastTriggered: '2026-11-15T16:00:00Z',
    triggerCount: 1,
  },
  {
    id: 'rule-2',
    streamId: 'plum-list',
    name: 'Budget cap warning',
    enabled: true,
    trigger: {
      type: 'budget-exceeded',
      condition: 'Agent spending reaches 80% of monthly cap',
      checkFrequency: 'hourly',
    },
    action: {
      type: 'send-notification',
      details: 'Notify founder that budget cap is approaching',
      requiresApproval: false,
    },
    createdAt: '2026-11-01T10:00:00Z',
    triggerCount: 0,
  },
  {
    id: 'rule-3',
    streamId: 'plum-list',
    name: 'User growth alert',
    enabled: true,
    trigger: {
      type: 'metric-threshold',
      condition: 'users >= 100',
      checkFrequency: 'daily',
    },
    action: {
      type: 'escalate',
      details: 'Escalate to founder: time to add capacity',
      requiresApproval: false,
    },
    createdAt: '2026-11-10T10:00:00Z',
    triggerCount: 0,
  },
];

export default function StreamRulesDemoPage() {
  const [rules, setRules] = useState<AutomationRule[]>(SAMPLE_RULES);

  return (
    <div className="min-h-screen bg-white">
      <PrototypeBanner />
      
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Plum List - Standing Rules</h1>
          <p className="text-slate-600 mt-1">Automation for routine decisions</p>
        </div>

        <StreamRulesTab
          streamId="plum-list"
          streamName="Plum List"
          rules={rules}
          onAddRule={() => alert('Add rule modal would open here')}
          onToggleRule={(ruleId) => {
            setRules(rules.map(r => 
              r.id === ruleId ? { ...r, enabled: !r.enabled } : r
            ));
          }}
          onEditRule={(ruleId) => alert(`Edit rule ${ruleId}`)}
          onDeleteRule={(ruleId) => {
            setRules(rules.filter(r => r.id !== ruleId));
          }}
        />
      </div>
    </div>
  );
}
