'use client';

import { useState } from 'react';
import { KeyFact } from '@/lib/types';

interface Props {
  keyFacts: KeyFact[];
}

function KeyFactCard({ fact }: { fact: KeyFact }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-slate-700 text-sm">{fact.label}</h3>
        {(fact.calculation || fact.inputs) && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-slate-400 hover:text-slate-600 text-xs"
          >
            {showDetails ? '✕' : 'ℹ️'}
          </button>
        )}
      </div>
      
      <p className="text-2xl font-bold text-slate-900 mb-2">
        {fact.value}
      </p>
      
      <p className="text-sm text-slate-600">
        {fact.interpretation}
      </p>

      {showDetails && (
        <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
          {fact.calculation && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 mb-1">Calculation:</h4>
              <pre className="text-xs text-slate-600 bg-slate-50 p-2 rounded whitespace-pre-wrap">
                {fact.calculation}
              </pre>
            </div>
          )}
          {fact.inputs && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 mb-1">Based on:</h4>
              <ul className="text-xs text-slate-600 space-y-0.5">
                {fact.inputs.map((input, i) => (
                  <li key={i} className="font-mono">• {input}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function KeyFactsDisplay({ keyFacts }: Props) {
  return (
    <>
      {keyFacts.map((fact, i) => (
        <KeyFactCard key={i} fact={fact} />
      ))}
    </>
  );
}
