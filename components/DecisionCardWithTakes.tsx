'use client';

import { useState } from 'react';
import { DecisionWithTakes } from '@/lib/agent-connection-types';
import { generateContextPack } from '@/lib/agent-connection-types';
import { findDisagreements } from '@/lib/take-comparison';

interface Props {
  decisionWithTakes: DecisionWithTakes;
  projectReport?: any;
}

export default function DecisionCardWithTakes({ decisionWithTakes, projectReport }: Props) {
  const { decision, takes, agreement, bureauVerdict } = decisionWithTakes;
  const [showContext, setShowContext] = useState(false);
  
  const disagreements = findDisagreements(takes);
  
  const contextPack = projectReport 
    ? generateContextPack(projectReport.projectName, projectReport, decision)
    : '';

  return (
    <div className="border border-slate-200 rounded-lg p-6 bg-white">
      {/* Decision Header */}
      <div className="mb-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-slate-900 text-lg">{decision.title}</h3>
          <span className="text-sm font-semibold text-blue-600">
            {decision.founderTimeMinutes}min
          </span>
        </div>
        <p className="text-sm text-slate-600">{decision.reasoning}</p>
      </div>

      {/* Bureau's Verdict (Tiebreaker) */}
      <div className={`mb-4 p-4 rounded-lg border-2 ${
        bureauVerdict.decision === 'approve' ? 'bg-green-50 border-green-300' :
        bureauVerdict.decision === 'reject' ? 'bg-red-50 border-red-300' :
        'bg-yellow-50 border-yellow-300'
      }`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-semibold text-sm text-slate-900">
            🏛️ Bureau Verdict: {bureauVerdict.decision.toUpperCase()}
          </span>
          {bureauVerdict.tie && (
            <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
              Tie-breaker
            </span>
          )}
        </div>
        <p className="text-sm text-slate-700">{bureauVerdict.reasoning}</p>
      </div>

      {/* Agreement Level */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-slate-600">Agent Agreement:</span>
        <span className={`text-sm font-semibold px-2 py-1 rounded ${
          agreement === 'unanimous' ? 'bg-green-100 text-green-800' :
          agreement === 'majority' ? 'bg-blue-100 text-blue-800' :
          agreement === 'split' ? 'bg-orange-100 text-orange-800' :
          'bg-slate-100 text-slate-800'
        }`}>
          {agreement.toUpperCase()}
        </span>
        <span className="text-sm text-slate-500">
          ({takes.length} {takes.length === 1 ? 'agent' : 'agents'})
        </span>
      </div>

      {/* Agent Takes Side by Side */}
      {takes.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Agent Takes:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {takes.map((take, i) => (
              <div
                key={i}
                className={`border rounded-lg p-4 ${
                  take.recommendation === 'approve' ? 'border-green-200 bg-green-50' :
                  take.recommendation === 'reject' ? 'border-red-200 bg-red-50' :
                  take.recommendation === 'modify' ? 'border-orange-200 bg-orange-50' :
                  'border-blue-200 bg-blue-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">
                      {take.displayName}
                    </span>
                    <span className="text-xs text-slate-500">
                      {take.provider}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${
                    take.confidence === 'high' ? 'bg-green-100 text-green-800' :
                    take.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {take.confidence}
                  </span>
                </div>
                
                <div className="mb-2">
                  <span className={`text-sm font-semibold ${
                    take.recommendation === 'approve' ? 'text-green-700' :
                    take.recommendation === 'reject' ? 'text-red-700' :
                    take.recommendation === 'modify' ? 'text-orange-700' :
                    'text-blue-700'
                  }`}>
                    {take.recommendation.toUpperCase()}
                  </span>
                </div>
                
                <p className="text-xs text-slate-700 leading-relaxed mb-2">
                  {take.reasoning}
                </p>
                
                {take.modifications && (
                  <div className="mt-2 p-2 bg-white rounded border border-orange-200">
                    <span className="text-xs font-semibold text-slate-700">Modifications:</span>
                    <p className="text-xs text-slate-600 mt-1">{take.modifications}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disagreements */}
      {disagreements.length > 0 && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded">
          <h5 className="text-xs font-semibold text-orange-900 mb-2">
            ⚠️ Agents Disagree On:
          </h5>
          {disagreements.map((dis, i) => (
            <div key={i} className="text-xs text-orange-800 mb-1">
              <span className="font-semibold">{dis.point}:</span>{' '}
              {dis.positions.map((pos, j) => (
                <span key={j}>
                  {pos.agent} → {pos.stance}
                  {j < dis.positions.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Context Pack for Agents */}
      <details className="mt-4 border-t border-slate-200 pt-4">
        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700 font-semibold">
          📋 Copy context pack for agents
        </summary>
        <div className="mt-3 p-3 bg-slate-50 rounded border border-slate-200">
          <pre className="text-xs text-slate-700 whitespace-pre-wrap mb-2">
            {contextPack}
          </pre>
          <button
            onClick={() => {
              navigator.clipboard.writeText(contextPack);
              alert('Context pack copied! Paste into your agent chat.');
            }}
            className="px-3 py-1 bg-slate-900 text-white text-xs rounded hover:bg-slate-800"
          >
            📋 Copy to clipboard
          </button>
        </div>
      </details>

      {/* Agent Task Brief */}
      <details className="mt-3">
        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
          Agent task brief (if approved)
        </summary>
        <div className="mt-2 p-3 bg-slate-50 rounded border border-slate-200">
          <pre className="text-xs text-slate-700 whitespace-pre-wrap">
            {decision.agentTaskBrief}
          </pre>
        </div>
      </details>
    </div>
  );
}
