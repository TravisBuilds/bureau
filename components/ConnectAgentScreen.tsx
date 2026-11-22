'use client';

import { useState } from 'react';
import { AgentReport } from '@/lib/agent-report-types';
import { generateAgentPrompt } from '@/lib/agent-prompt';

interface Props {
  onClose: () => void;
  onReportAdded: (report: AgentReport) => void;
}

export default function ConnectAgentScreen({ onClose, onReportAdded }: Props) {
  const [importJson, setImportJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const bureauUrl = typeof window !== 'undefined' 
    ? window.location.origin 
    : 'http://localhost:43123';
  
  const agentPrompt = generateAgentPrompt(bureauUrl);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(agentPrompt);
    alert('Agent prompt copied! Paste it into your project agent (Grok Bot, ChatGPT, etc.)');
  };

  const handleImport = () => {
    try {
      const report: AgentReport = JSON.parse(importJson);
      
      // Validate required fields
      if (!report.projectName || !report.reportDate || !report.userMetrics) {
        setError('Missing required fields: projectName, reportDate, userMetrics');
        return;
      }
      
      onReportAdded(report);
      setError(null);
    } catch (e) {
      setError('Invalid JSON: ' + (e as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Connect an Agent</h1>
              <p className="text-sm text-slate-600 mt-1">
                Get your project agent to report to Bureau
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors text-sm font-medium"
            >
              ← Back
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-3">
            📋 How it works
          </h2>
          <ol className="space-y-2 text-sm text-blue-800">
            <li>1. Copy the agent prompt below</li>
            <li>2. Paste it into your project agent (Grok Bot, ChatGPT, etc.)</li>
            <li>3. The agent will gather project data and POST it to Bureau</li>
            <li>4. Bureau will analyze the report and show you what to do next</li>
          </ol>
        </div>

        {/* Agent Prompt */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Agent Prompt (Copy This)
            </h2>
            <button
              onClick={handleCopyPrompt}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
            >
              📋 Copy Prompt
            </button>
          </div>
          
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-96 overflow-y-auto">
            <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
              {agentPrompt}
            </pre>
          </div>
          
          <div className="mt-4 flex items-center gap-3 text-sm text-slate-600">
            <span>API endpoint:</span>
            <code className="bg-slate-100 px-2 py-1 rounded font-mono text-xs">
              {bureauUrl}/api/reports
            </code>
            <a
              href={`${bureauUrl}/api/reports/schema`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              View schema →
            </a>
          </div>
        </div>

        {/* Alternative: Import JSON */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Or Import JSON Directly
          </h2>
          
          <p className="text-sm text-slate-600 mb-4">
            If your agent saved the report as a file, paste the JSON here:
          </p>
          
          <textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='{"projectName": "My App", "reportDate": "2026-11-21T00:00:00Z", ...}'
            className="w-full h-64 font-mono text-sm p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            spellCheck={false}
          />
          
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          
          <button
            onClick={handleImport}
            className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
          >
            Import Report
          </button>
        </div>

        {/* Example */}
        <details className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <summary className="text-lg font-semibold text-slate-900 cursor-pointer">
            📘 Example Report (Plum List)
          </summary>
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-96 overflow-y-auto">
            <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
              {JSON.stringify(
                {
                  projectName: 'Plum List',
                  reportDate: '2026-11-21T00:00:00Z',
                  productDescription: 'AI-powered place discovery app',
                  releaseState: {
                    platform: ['Android'],
                    version: 'v14',
                    distribution: 'private-preview',
                  },
                  userMetrics: {
                    total: 26,
                    founder: { accountIds: ['founder'], activeOverDays: 33 },
                    nonFounder: { total: 25, active: 6, withBehavior: 6 },
                  },
                  eventTracking: {
                    tracked: ['saves - stored in Supabase'],
                    notTracked: ['directions tap - no key'],
                    blockers: ['Later-day return - NOT measurable'],
                  },
                  costs: [
                    { source: 'Google Places API', amountUSD: 8.72, isEstimate: true },
                  ],
                  revenue: 0,
                  openWork: { unpushedCommits: 3, openPRs: 2 },
                  pendingWork: [
                    {
                      description: 'Return-tracking fix',
                      type: 'approval',
                      estimatedMinutes: 60,
                      reasoning: 'Blocks retention measurement',
                    },
                  ],
                  founderTimeUnknown: true,
                },
                null,
                2
              )}
            </pre>
          </div>
        </details>
      </main>
    </div>
  );
}
