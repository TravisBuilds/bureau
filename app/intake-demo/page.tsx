'use client';

import { useState } from 'react';
import IntakeReviewModal from '@/components/IntakeReviewModal';
import { IntakeResponse } from '@/lib/intake-types';
import { MockProvider } from '@/lib/providers/MockProvider';
import PrototypeBanner from '@/components/PrototypeBanner';

export default function IntakeDemoPage() {
  const [intake, setIntake] = useState<IntakeResponse | null>(null);
  const [streamType, setStreamType] = useState<'day-job' | 'contract' | 'project'>('day-job');
  
  const mockProvider = new MockProvider();

  const handleRequestIntake = async () => {
    const response = await mockProvider.requestIntake('demo-stream', streamType);
    setIntake(response);
  };

  return (
    <div className="min-h-screen bg-white">
      <PrototypeBanner />
      <div className="max-w-4xl mx-auto p-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Intake Review Demo</h1>
        <p className="text-slate-600 mb-8">
          This page demonstrates the agent intake review modal with SAMPLE data from MockProvider.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Stream Type
            </label>
            <select
              value={streamType}
              onChange={(e) => setStreamType(e.target.value as any)}
              className="px-4 py-2 border border-slate-300 rounded-lg"
            >
              <option value="day-job">Day Job</option>
              <option value="contract">Contract</option>
              <option value="project">Project</option>
            </select>
          </div>

          <button
            onClick={handleRequestIntake}
            className="px-6 py-3 bg-highstreet-purple text-white rounded-lg hover:bg-highstreet-purple-hover font-medium"
          >
            Request Intake from Mock Agent
          </button>
        </div>

        {intake && (
          <IntakeReviewModal
            intake={intake}
            onApprove={() => {
              alert('Approved! Data would be imported here.');
              setIntake(null);
            }}
            onReject={() => {
              alert('Rejected!');
              setIntake(null);
            }}
            onClose={() => setIntake(null)}
          />
        )}
      </div>
    </div>
  );
}
