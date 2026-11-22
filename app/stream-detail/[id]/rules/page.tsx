'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface AllocationRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  trigger: {
    type: 'keyword' | 'amount' | 'platform' | 'manual';
    condition: string;
  };
  action: {
    type: 'assign' | 'split' | 'flag';
    target: string;
  };
  created: string;
  lastMatch: string | null;
}

export default function StreamRulesPage() {
  const params = useParams();
  const streamId = params.id as string;
  const [rules, setRules] = useState<AllocationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewRule, setShowNewRule] = useState(false);

  useEffect(() => {
    // DEMO DATA - In production, fetch from API
    setRules([
      {
        id: '1',
        name: 'Auto-assign Higgsfield charges',
        enabled: true,
        priority: 1,
        trigger: {
          type: 'platform',
          condition: 'source = "higgsfield-api"',
        },
        action: {
          type: 'assign',
          target: 'Latest published output',
        },
        created: '2026-11-21T00:00:00Z',
        lastMatch: '2026-11-22T05:30:00Z',
      },
      {
        id: '2',
        name: 'Split ElevenLabs across outputs',
        enabled: true,
        priority: 2,
        trigger: {
          type: 'platform',
          condition: 'source = "elevenlabs-api" AND amount > 0',
        },
        action: {
          type: 'split',
          target: 'All outputs this week',
        },
        created: '2026-11-21T00:00:00Z',
        lastMatch: '2026-11-22T05:30:00Z',
      },
      {
        id: '3',
        name: 'Flag large failed attempts',
        enabled: false,
        priority: 3,
        trigger: {
          type: 'amount',
          condition: 'amount > 10 AND status = "failed"',
        },
        action: {
          type: 'flag',
          target: 'Manual review required',
        },
        created: '2026-11-21T00:00:00Z',
        lastMatch: null,
      },
    ]);
    setLoading(false);
  }, [streamId]);

  const toggleRule = (ruleId: string) => {
    setRules(rules.map(r => 
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    ));
  };

  const deleteRule = (ruleId: string) => {
    if (!confirm('Delete this rule? This cannot be undone.')) return;
    setRules(rules.filter(r => r.id !== ruleId));
  };

  const formatTimestamp = (iso: string | null) => {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-gray-600">Loading rules...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Allocation Rules</h1>
            <p className="text-gray-600 mt-2">
              Automate how charges are assigned to outputs
            </p>
          </div>
          <button
            onClick={() => setShowNewRule(!showNewRule)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            New Rule
          </button>
        </div>

        {/* New Rule Form */}
        {showNewRule && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Create Allocation Rule</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Auto-assign Higgsfield charges"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trigger Type
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                    <option>Platform (Higgsfield, ElevenLabs)</option>
                    <option>Keyword in description</option>
                    <option>Amount threshold</option>
                    <option>Manual trigger only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Action
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                    <option>Assign to latest output</option>
                    <option>Split across outputs</option>
                    <option>Flag for review</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condition
                </label>
                <input
                  type="text"
                  placeholder='e.g. source = "higgsfield-api"'
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>

              <div className="flex gap-3">
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  Create Rule
                </button>
                <button
                  onClick={() => setShowNewRule(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rules List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Active Rules</h2>
            <p className="text-sm text-gray-600 mt-1">
              Rules run in priority order when new charges arrive
            </p>
          </div>

          {rules.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="text-4xl mb-4">📋</div>
              <div className="text-lg font-medium">No rules yet</div>
              <div className="text-sm mt-2">Create your first rule to automate charge allocation</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-6 ${rule.enabled ? '' : 'bg-gray-50 opacity-60'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-medium text-gray-900">{rule.name}</h3>
                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                          rule.enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-200 text-gray-600'
                        }`}>
                          {rule.enabled ? '✓ Enabled' : 'Disabled'}
                        </span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono">
                          Priority {rule.priority}
                        </span>
                      </div>

                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-start gap-2">
                          <span className="font-medium text-gray-700 w-24">Trigger:</span>
                          <code className="flex-1 bg-gray-100 px-2 py-1 rounded font-mono text-xs">
                            {rule.trigger.type}: {rule.trigger.condition}
                          </code>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium text-gray-700 w-24">Action:</span>
                          <span className="flex-1">
                            {rule.action.type} → {rule.action.target}
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium text-gray-700 w-24">Last match:</span>
                          <span className="flex-1">
                            {formatTimestamp(rule.lastMatch)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => toggleRule(rule.id)}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          rule.enabled
                            ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {rule.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <div className="text-blue-600 text-sm">ℹ️</div>
            <div className="text-sm text-blue-900">
              <strong>How Rules Work:</strong> When new charges arrive (via API or manual entry),
              enabled rules run in priority order. The first matching rule processes the charge.
              You can test rules without enabling them.
            </div>
          </div>
        </div>

        {/* Plus Upsell */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                🚀 Advanced Rules with Plus
              </h3>
              <p className="text-gray-700 mb-3">
                Upgrade to unlock unlimited rules, priority support, and advanced allocation logic.
              </p>
              <ul className="text-sm text-gray-600 space-y-1 mb-4">
                <li>✓ Unlimited allocation rules</li>
                <li>✓ Time-based triggers (weekly budgets)</li>
                <li>✓ Complex conditions (AND/OR logic)</li>
                <li>✓ Rule testing and simulation</li>
              </ul>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">$9/mo</div>
              <div className="text-sm text-gray-600">or $79/year</div>
              <button className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                Upgrade Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
