'use client';

import { useState } from 'react';
import ConnectionPrompt from '@/components/ConnectionPrompt';
import { ConnectionRequirement } from '@/lib/connection-types';

export default function ConnectionPromptDemoPage() {
  const [showPrompt, setShowPrompt] = useState(true);

  const requirement: ConnectionRequirement = {
    provider: 'x-twitter',
    method: ['oauth'],
    requiredScopes: ['read'],
    scopeExplanation: 'Bureau will read your followers and engagement stats',
    neverDoes: ['Post tweets', 'Follow users', 'Send DMs'],
    manualEntryAvailable: true,
    manualEntryFields: [
      { id: 'followers', label: 'Followers', type: 'number' },
      { id: 'engagement', label: 'Engagement Rate', type: 'number', unit: '%' },
    ],
  };

  return (
    <div className="min-h-screen bg-slate-100 p-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Connection Prompt Demo</h1>
        <p className="text-slate-600 mb-8">
          This demonstrates the in-context permission prompt that appears when adding a stream
          or enabling a metric that requires a connection.
        </p>

        <button
          onClick={() => setShowPrompt(true)}
          className="px-6 py-3 bg-highstreet-purple text-white rounded-lg hover:bg-opacity-90 font-medium"
        >
          Show Connection Prompt
        </button>

        {showPrompt && (
          <ConnectionPrompt
            streamName="Elon"
            metricLabel="followers and engagement"
            requirement={requirement}
            onConnect={(method) => {
              alert(`Selected connection method: ${method}`);
              setShowPrompt(false);
            }}
            onSkip={() => setShowPrompt(false)}
          />
        )}
      </div>
    </div>
  );
}
