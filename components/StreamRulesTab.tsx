'use client';

import { Plus, Play, Pause, Trash2, Edit, Clock, Zap } from 'lucide-react';
import { AutomationRule, DEFAULT_AUTOMATION_RULES } from '@/lib/automation-types';
import { useState } from 'react';

interface Props {
  streamId: string;
  streamName: string;
  rules: AutomationRule[];
  onAddRule: () => void;
  onToggleRule: (ruleId: string) => void;
  onEditRule: (ruleId: string) => void;
  onDeleteRule: (ruleId: string) => void;
}

export default function StreamRulesTab({
  streamId,
  streamName,
  rules,
  onAddRule,
  onToggleRule,
  onEditRule,
  onDeleteRule,
}: Props) {
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  const getRuleTypeIcon = (triggerType: string) => {
    switch (triggerType) {
      case 'time-scheduled':
        return <Clock className="w-4 h-4" />;
      case 'budget-exceeded':
        return <Zap className="w-4 h-4" />;
      default:
        return <Zap className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Standing Rules</h2>
          <p className="text-sm text-slate-500 mt-1">
            Bureau recommends a move, shows its reasoning, and remembers what you chose
          </p>
        </div>
        <button
          onClick={onAddRule}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-highstreet-purple rounded-lg hover:bg-opacity-90"
        >
          <Plus className="w-4 h-4" />
          Add Rule
        </button>
      </div>

      {/* Rules List */}
      {rules.length > 0 ? (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="p-4 border border-slate-200 rounded-lg">
              {/* Rule Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`p-2 rounded-lg ${rule.enabled ? 'bg-green-100' : 'bg-slate-100'}`}>
                    {getRuleTypeIcon(rule.trigger.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-slate-900">{rule.name}</h3>
                      {!rule.enabled && (
                        <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                          Paused
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      <strong>When:</strong> {rule.trigger.condition}
                    </div>
                    <div className="text-sm text-slate-600">
                      <strong>Then:</strong> {rule.action.details}
                      {rule.action.requiresApproval && (
                        <span className="ml-2 text-xs text-amber-600">(needs approval)</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onToggleRule(rule.id)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    title={rule.enabled ? 'Pause rule' : 'Resume rule'}
                  >
                    {rule.enabled ? (
                      <Pause className="w-4 h-4 text-slate-600" />
                    ) : (
                      <Play className="w-4 h-4 text-slate-600" />
                    )}
                  </button>
                  <button
                    onClick={() => onEditRule(rule.id)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Edit rule"
                  >
                    <Edit className="w-4 h-4 text-slate-600" />
                  </button>
                  <button
                    onClick={() => onDeleteRule(rule.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete rule"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>

              {/* Rule Stats */}
              {rule.triggerCount > 0 && (
                <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                  <div>
                    Triggered {rule.triggerCount} time{rule.triggerCount !== 1 ? 's' : ''}
                  </div>
                  {rule.lastTriggered && (
                    <div>
                      Last: {new Date(rule.lastTriggered).toLocaleString()}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
          <Zap className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <p className="text-slate-600 mb-2">No automation rules yet</p>
          <p className="text-sm text-slate-400 mb-4">
            Create rules to handle routine decisions automatically
          </p>
          <button
            onClick={onAddRule}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-highstreet-purple rounded-lg hover:bg-opacity-90"
          >
            <Plus className="w-4 h-4" />
            Create First Rule
          </button>
        </div>
      )}

      {/* Rule Examples */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">Example rules</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Invoice overdue 7 days → agent drafts reminder for approval</li>
          <li>• Agent hits budget cap → pause it</li>
          <li>• Every Friday → prepare weekly ten-hours review</li>
          <li>• User count drops 20% → escalate to needs-you queue</li>
        </ul>
        <p className="text-xs text-blue-700 mt-3">
          Outward actions (emails, contacts) always need approval. Everything else is logged in the automation log.
        </p>
      </div>

      {/* How It Works */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <h4 className="text-sm font-semibold text-slate-900 mb-2">How automation works</h4>
        <ol className="text-sm text-slate-700 space-y-1 list-decimal list-inside">
          <li>Bureau checks rules based on their frequency (hourly, daily, etc.)</li>
          <li>When a condition is met, Bureau executes through the connected agent</li>
          <li>Every run is logged with trigger, action, cost, and result</li>
          <li>The log feeds the decision/outcome record</li>
          <li>Anything outside the rules escalates to your "needs you" queue</li>
        </ol>
      </div>
    </div>
  );
}
