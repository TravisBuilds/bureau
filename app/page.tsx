'use client';

import { useState, useEffect } from 'react';
import { BusinessInputs } from '@/lib/types';
import { evaluateBusiness } from '@/lib/engine';
import { plumListBaseline } from '@/lib/seed-data';
import VerdictDisplay from '@/components/VerdictDisplay';
import KeyFactsDisplay from '@/components/KeyFactsDisplay';
import BreakEvenCalculator from '@/components/BreakEvenCalculator';
import DecisionCard from '@/components/DecisionCard';
import DataEditor from '@/components/DataEditor';

export default function Home() {
  const [businessInputs, setBusinessInputs] = useState<BusinessInputs>(plumListBaseline.inputs);
  const [showEditor, setShowEditor] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('bureau-business-data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setBusinessInputs(parsed);
      } catch (e) {
        console.error('Failed to load saved data:', e);
      }
    }
  }, []);

  // Save to localStorage when data changes
  useEffect(() => {
    localStorage.setItem('bureau-business-data', JSON.stringify(businessInputs));
  }, [businessInputs]);

  const decision = evaluateBusiness(businessInputs);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Bureau</h1>
              <p className="text-sm text-slate-600 mt-1">
                Decision intelligence for solo founders
              </p>
            </div>
            <button
              onClick={() => setShowEditor(!showEditor)}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
            >
              {showEditor ? 'Hide Editor' : 'Edit Data'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Business Name */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-2xl font-semibold text-slate-900">
            {businessInputs.businessName}
          </h2>
          {businessInputs.dataSource && (
            <p className="text-sm text-slate-500 mt-1">
              Data source: {businessInputs.dataSource}
              {businessInputs.dataDate && ` (${businessInputs.dataDate})`}
            </p>
          )}
        </div>

        {/* Data Editor */}
        {showEditor && (
          <DataEditor
            inputs={businessInputs}
            onUpdate={setBusinessInputs}
            onClose={() => setShowEditor(false)}
          />
        )}

        {/* Verdict */}
        <VerdictDisplay decision={decision} />

        {/* Key Facts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <KeyFactsDisplay keyFacts={decision.keyFacts} />
        </div>

        {/* Decision Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DecisionCard
            title="Pricing Recommendation"
            recommendation={decision.pricingRecommendation}
            type="pricing"
          />
          <DecisionCard
            title="Open to Users"
            recommendation={decision.openToUsersRecommendation}
            type="access"
          />
        </div>

        {/* Break-Even Calculator */}
        <BreakEvenCalculator
          inputs={businessInputs}
          breakEvenMetrics={decision.breakEvenMetrics}
        />

        {/* Agent Action Brief */}
        <div className="bg-slate-900 text-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-3">Agent Action Brief</h3>
          <pre className="text-sm font-mono whitespace-pre-wrap opacity-90 leading-relaxed">
            {decision.agentActionBrief}
          </pre>
        </div>

        {/* API Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            📡 Agent-Readable Interface
          </h3>
          <p className="text-sm text-blue-800 mb-3">
            POST your business data to <code className="bg-blue-100 px-1 py-0.5 rounded">/api/evaluate</code> or use the CLI:{' '}
            <code className="bg-blue-100 px-1 py-0.5 rounded">npm run evaluate -- --file data.json</code>
          </p>
          <p className="text-sm text-blue-800">
            Don't have a business yet?{' '}
            <a href="/no-idea" className="underline font-semibold hover:text-blue-900">
              Visit the "No Idea Yet" page
            </a>{' '}
            (coming soon)
          </p>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-slate-500">
        Bureau v1.0 • Built for solo founders running AI agent businesses
      </footer>
    </div>
  );
}
