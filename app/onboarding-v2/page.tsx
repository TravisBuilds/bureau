'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type LifecycleState = 'draft' | 'finished' | 'published' | 'abandoned';
type UsageSource = 'csv' | 'file' | 'agent' | 'manual';

interface Output {
  id: string;
  name: string;
  type: string; // 'video' | 'short' | 'episode' | 'reel'
  lifecycle: LifecycleState;
  url?: string;
}

interface CostAttempt {
  id: string;
  description: string;
  costUsd?: number;
  hfCredits?: number;
  elChars?: number;
  failed: boolean;
  trust?: 'verified' | 'estimated';
}

export default function OnboardingV2Page() {
  const router = useRouter();
  const [step, setStep] = useState<'output' | 'source' | 'assign' | 'review'>('output');
  const [output, setOutput] = useState<Output>({
    id: '',
    name: '',
    type: 'video',
    lifecycle: 'published',
  });
  const [source, setSource] = useState<UsageSource>('manual');
  const [attempts, setAttempts] = useState<CostAttempt[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());

  const handleAddOutput = () => {
    if (!output.name) return;
    setStep('source');
  };

  const handleSourceSelected = () => {
    // REAL Ember Ep12 data from ep12-manifest.json
    if (source === 'manual') {
      setAttempts([
        { id: '1', description: 'Higgsfield stills', costUsd: 8.125, hfCredits: 325, failed: false, trust: 'verified' },
        { id: '2', description: 'Higgsfield clips', costUsd: 22.75, hfCredits: 169, failed: false, trust: 'verified' },
        { id: '3', description: 'ElevenLabs VO', costUsd: 0.05, failed: false, trust: 'estimated' },
      ]);
    }
    setStep('assign');
  };

  const toggleAssign = (id: string) => {
    const newAssigned = new Set(assigned);
    if (newAssigned.has(id)) {
      newAssigned.delete(id);
    } else {
      newAssigned.add(id);
    }
    setAssigned(newAssigned);
  };

  const handleReview = () => {
    setStep('review');
  };

  const handleFinish = () => {
    router.push('/top-floor');
  };

  const assignedCost = attempts
    .filter(a => assigned.has(a.id))
    .reduce((sum, a) => sum + (a.costUsd || 0), 0);

  const assignedHF = attempts
    .filter(a => assigned.has(a.id))
    .reduce((sum, a) => sum + (a.hfCredits || 0), 0);

  const assignedEL = attempts
    .filter(a => assigned.has(a.id))
    .reduce((sum, a) => sum + (a.elChars || 0), 0);

  const failedCost = attempts
    .filter(a => a.failed && assigned.has(a.id))
    .reduce((sum, a) => sum + (a.costUsd || 0), 0);

  const unallocated = attempts.filter(a => !assigned.has(a.id)).length;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Cost your last video</h1>
          <p className="text-gray-600">
            Know what your last video cost before you make the next one.
          </p>
        </div>

        {/* Progress */}
        <div className="mb-8 flex gap-2">
          {['output', 'source', 'assign', 'review'].map((s, i) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full ${
                step === s ? 'bg-blue-600' : i < ['output', 'source', 'assign', 'review'].indexOf(step) ? 'bg-blue-300' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Step 1: What output? */}
        {step === 'output' && (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">What output do you want to cost?</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Output name</label>
                <input
                  type="text"
                  placeholder="Ember Episode 12"
                  className="w-full border rounded-md px-3 py-2"
                  value={output.name}
                  onChange={(e) => setOutput({ ...output, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  className="w-full border rounded-md px-3 py-2"
                  value={output.type}
                  onChange={(e) => setOutput({ ...output, type: e.target.value })}
                >
                  <option value="video">Video / Episode</option>
                  <option value="short">Short / Reel</option>
                  <option value="live">Live stream</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  className="w-full border rounded-md px-3 py-2"
                  value={output.lifecycle}
                  onChange={(e) => setOutput({ ...output, lifecycle: e.target.value as LifecycleState })}
                >
                  <option value="draft">Draft - still working on it</option>
                  <option value="finished">Finished - ready to publish</option>
                  <option value="published">Published - live now</option>
                  <option value="abandoned">Abandoned - not shipping</option>
                </select>
              </div>
              <button
                onClick={handleAddOutput}
                disabled={!output.name}
                className="w-full bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Next: Choose usage source
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Usage source */}
        {step === 'source' && (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Where should we look for costs?</h2>
            <div className="space-y-3 mb-6">
              <button
                onClick={() => setSource('agent')}
                className={`w-full text-left border rounded-lg p-4 hover:border-blue-500 ${
                  source === 'agent' ? 'border-blue-600 bg-blue-50' : ''
                }`}
              >
                <div className="font-medium">Agent push (recommended)</div>
                <div className="text-sm text-gray-600">Your agent sends costs directly</div>
              </button>
              <button
                onClick={() => setSource('csv')}
                className={`w-full text-left border rounded-lg p-4 hover:border-blue-500 ${
                  source === 'csv' ? 'border-blue-600 bg-blue-50' : ''
                }`}
              >
                <div className="font-medium">Upload CSV or usage file</div>
                <div className="text-sm text-gray-600">Export from ElevenLabs, Higgsfield, etc.</div>
              </button>
              <button
                onClick={() => setSource('manual')}
                className={`w-full text-left border rounded-lg p-4 hover:border-blue-500 ${
                  source === 'manual' ? 'border-blue-600 bg-blue-50' : ''
                }`}
              >
                <div className="font-medium">Enter manually</div>
                <div className="text-sm text-gray-600">Type in the charges one by one</div>
              </button>
            </div>
            <button
              onClick={handleSourceSelected}
              className="w-full bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700"
            >
              Next: Assign costs
            </button>
          </div>
        )}

        {/* Step 3: Assign attempts */}
        {step === 'assign' && (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Which attempts went into &ldquo;{output.name}&rdquo;?</h2>
            <div className="space-y-2 mb-6">
              {attempts.map((attempt) => (
                <label
                  key={attempt.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                    assigned.has(attempt.id) ? 'border-blue-600 bg-blue-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={assigned.has(attempt.id)}
                    onChange={() => toggleAssign(attempt.id)}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="font-medium">{attempt.description}</div>
                    <div className="text-sm text-gray-600">
                      {attempt.costUsd !== undefined && attempt.costUsd > 0 && `$${attempt.costUsd.toFixed(2)}`}
                      {attempt.costUsd !== undefined && attempt.costUsd > 0 && (attempt.hfCredits || attempt.elChars) && ' • '}
                      {attempt.hfCredits !== undefined && attempt.hfCredits > 0 && `${attempt.hfCredits.toLocaleString()} HF credits`}
                      {attempt.hfCredits !== undefined && attempt.hfCredits > 0 && attempt.elChars && ' • '}
                      {attempt.elChars !== undefined && attempt.elChars > 0 && `${attempt.elChars.toLocaleString()} EL chars`}
                      {attempt.failed && <span className="ml-2 text-red-600">(Failed)</span>}
                      {attempt.costUsd === 0 && !attempt.hfCredits && !attempt.elChars && ' $0.00'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <button
              onClick={handleReview}
              disabled={assigned.size === 0}
              className="w-full bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Review cost card
            </button>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 'review' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Your cost card for &ldquo;{output.name}&rdquo;</h2>
              <div className="space-y-4">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Assigned cost</span>
                  <span className="font-semibold">${assignedCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Native credits</span>
                  <div className="text-right">
                    {assignedHF > 0 && <div>{assignedHF.toLocaleString()} Higgsfield credits</div>}
                    {assignedEL > 0 && <div>{assignedEL.toLocaleString()} EL chars</div>}
                    {assignedHF === 0 && assignedEL === 0 && <div className="text-gray-400">Not recorded</div>}
                    {assignedHF > 0 && assignedEL === 0 && <div className="text-xs text-gray-400 mt-1">ElevenLabs not recorded</div>}
                  </div>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Failed attempts</span>
                  <span className={failedCost > 0 ? "text-red-600" : "text-gray-400"}>
                    {attempts.some(a => a.failed) ? `$${failedCost.toFixed(2)}` : 'Not recorded'}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Unallocated</span>
                  <span className="text-gray-500">{unallocated} charges</span>
                </div>
              </div>

              {/* Charge breakdown */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Charges assigned:</h3>
                <div className="space-y-2">
                  {attempts.filter(a => assigned.has(a.id)).map(attempt => (
                    <div key={attempt.id} className="flex justify-between items-center text-sm py-2 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700">{attempt.description}</span>
                        {attempt.trust === 'verified' && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">✓ Verified</span>
                        )}
                        {attempt.trust === 'estimated' && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">~ Estimated</span>
                        )}
                      </div>
                      <span className="font-medium text-gray-900">${attempt.costUsd?.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
                💡 This cost includes: assigned cash charges ({assigned.size} items)
                {(assignedHF > 0 || assignedEL > 0) && (
                  <>, native credits ({[assignedHF > 0 && 'HF', assignedEL > 0 && 'EL'].filter(Boolean).join(', ')})</>
                )}
                {assignedHF === 0 && assignedEL === 0 && (
                  <>. Credits not recorded</>
                )}.
                {' '}Failed attempts and unallocated charges ({unallocated}) are not included.
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-2">Which output would you like to compare next?</h3>
              <p className="text-gray-600 mb-4">
                Compare costs across your published outputs to see what works
              </p>
              <div className="space-y-2">
                <button
                  onClick={handleFinish}
                  className="w-full bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700"
                >
                  Go to dashboard
                </button>
                <button
                  onClick={() => {
                    setStep('output');
                    setOutput({ id: '', name: '', type: 'video', lifecycle: 'published' });
                    setAssigned(new Set());
                  }}
                  className="w-full border border-gray-300 text-gray-700 rounded-md px-4 py-2 hover:bg-gray-50"
                >
                  Cost another output
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
