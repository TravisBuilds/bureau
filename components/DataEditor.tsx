'use client';

import { useState } from 'react';
import { BusinessInputs } from '@/lib/types';
import { businessArchetypes } from '@/lib/seed-data';

interface Props {
  inputs: BusinessInputs;
  onUpdate: (inputs: BusinessInputs) => void;
  onClose: () => void;
}

export default function DataEditor({ inputs, onUpdate, onClose }: Props) {
  const [jsonInput, setJsonInput] = useState(JSON.stringify(inputs, null, 2));
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      onUpdate(parsed);
      setError(null);
      onClose();
    } catch (e) {
      setError('Invalid JSON: ' + (e as Error).message);
    }
  };

  const handleLoadArchetype = (archetype: BusinessInputs) => {
    setJsonInput(JSON.stringify(archetype, null, 2));
    setError(null);
  };

  const handleExport = () => {
    const blob = new Blob([jsonInput], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${inputs.businessName.replace(/\s+/g, '-').toLowerCase()}-data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonInput(content);
      setError(null);
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-slate-300 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-slate-900">Edit Business Data</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600"
        >
          ✕
        </button>
      </div>

      {/* Archetype Loader */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Load Example Business:
        </label>
        <div className="flex flex-wrap gap-2">
          {businessArchetypes.map((archetype) => (
            <button
              key={archetype.name}
              onClick={() => handleLoadArchetype(archetype.inputs)}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg transition-colors"
            >
              {archetype.name}
            </button>
          ))}
        </div>
      </div>

      {/* JSON Editor */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Business Data (JSON):
        </label>
        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          className="w-full h-96 font-mono text-sm p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          spellCheck={false}
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <label className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg cursor-pointer transition-colors">
            Import JSON
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg transition-colors"
          >
            Export JSON
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm rounded-lg transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>

      {/* JSON Schema Info */}
      <div className="mt-6 pt-6 border-t border-slate-200">
        <h4 className="text-sm font-semibold text-slate-700 mb-2">
          JSON Schema Documentation
        </h4>
        <p className="text-xs text-slate-600 mb-2">
          See <code className="bg-slate-100 px-1 rounded">lib/types.ts</code> for the complete BusinessInputs interface.
        </p>
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer hover:text-slate-900 font-medium mb-1">
            Show schema overview
          </summary>
          <pre className="bg-slate-50 p-2 rounded mt-2 overflow-auto text-[10px]">
{`{
  businessName: string,
  agentTasks: Array<{
    name: string,
    costUSD: number,
    timeMinutes: number,
    frequency: 'per_user' | 'per_action' | 'one_time' | 'daily' | 'weekly' | 'monthly',
    description?: string
  }>,
  servingCosts: Array<{
    name: string,
    costPerAction: number,
    actionsPerUser: number
  }>,
  userMetrics: {
    totalUsers: number,
    activeUsers: number,
    actionsPerUserPerMonth: number,
    returnRate?: number,
    churnRate?: number
  },
  revenue: {
    monthlyRevenue: number,
    revenuePerUser?: number,
    contributionMargin?: number
  },
  founderTime: {
    hoursPerWeek: number,
    valuePerHour?: number
  },
  incomeTarget?: {
    monthlyTargetUSD: number,
    reasoning?: string
  }
}`}
          </pre>
        </details>
      </div>
    </div>
  );
}
