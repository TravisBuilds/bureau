'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';

type TrustLevel = 'verified' | 'declared' | 'estimated';

interface Charge {
  id: string;
  date: string;
  description: string;
  costUsd?: number;
  hfCredits?: number;
  elChars?: number;
  trust: TrustLevel;
  failed: boolean;
  allocatedTo: string | null; // output ID or 'unallocated' or null
  splitPercent?: number; // for split allocations
}

interface Output {
  id: string;
  name: string;
  lifecycle: 'draft' | 'finished' | 'published' | 'abandoned';
}

export default function AllocatePage() {
  const params = useParams();
  const streamId = params.id as string;

  // Mock data
  const [outputs] = useState<Output[]>([
    { id: 'ep11', name: 'Ember Episode 11', lifecycle: 'published' },
    { id: 'ep12', name: 'Ember Episode 12', lifecycle: 'published' },
    { id: 'ep13', name: 'Ember Episode 13', lifecycle: 'draft' },
  ]);

  const [charges, setCharges] = useState<Charge[]>([
    {
      id: 'c1',
      date: '2026-11-15',
      description: 'Video generation (Higgsfield)',
      hfCredits: 6576.5,
      trust: 'verified',
      failed: false,
      allocatedTo: 'ep11',
    },
    {
      id: 'c2',
      date: '2026-11-16',
      description: 'Voice generation (ElevenLabs)',
      elChars: 3695,
      trust: 'verified',
      failed: false,
      allocatedTo: 'ep12',
    },
    {
      id: 'c3',
      date: '2026-11-17',
      description: 'Failed render attempt',
      hfCredits: 500,
      trust: 'verified',
      failed: true,
      allocatedTo: 'ep12',
    },
    {
      id: 'c4',
      date: '2026-11-18',
      description: 'Manual charge - stock footage',
      costUsd: 49.99,
      trust: 'declared',
      failed: false,
      allocatedTo: null,
    },
    {
      id: 'c5',
      date: '2026-11-19',
      description: 'Background music license',
      costUsd: 29.99,
      trust: 'declared',
      failed: false,
      allocatedTo: null,
    },
  ]);

  const [selectedCharges, setSelectedCharges] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<string>('');
  const [splitMode, setSplitMode] = useState(false);
  const [splitTargets, setSplitTargets] = useState<{ [outputId: string]: number }>({});

  const toggleCharge = (id: string) => {
    const newSelected = new Set(selectedCharges);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedCharges(newSelected);
  };

  const handleBulkAssign = () => {
    if (!bulkTarget || selectedCharges.size === 0) return;
    
    setCharges(charges.map(c => 
      selectedCharges.has(c.id) ? { ...c, allocatedTo: bulkTarget, splitPercent: undefined } : c
    ));
    setSelectedCharges(new Set());
    setBulkTarget('');
  };

  const handleSplitAssign = () => {
    if (selectedCharges.size === 0 || Object.keys(splitTargets).length === 0) return;

    const totalPercent = Object.values(splitTargets).reduce((sum, p) => sum + p, 0);
    if (Math.abs(totalPercent - 100) > 0.1) {
      alert('Split percentages must add up to 100%');
      return;
    }

    setCharges(charges.map(c => {
      if (!selectedCharges.has(c.id)) return c;
      
      // Create split allocation
      return {
        ...c,
        allocatedTo: 'split',
        splitPercent: undefined,
      };
    }));
    
    setSelectedCharges(new Set());
    setSplitTargets({});
    setSplitMode(false);
  };

  const getTrustBadge = (trust: TrustLevel) => {
    switch (trust) {
      case 'verified':
        return <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">✓ Verified</span>;
      case 'declared':
        return <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">📝 Declared</span>;
      case 'estimated':
        return <span className="text-xs bg-gray-100 text-gray-800 px-2 py-0.5 rounded">~ Estimated</span>;
    }
  };

  const unallocatedCharges = charges.filter(c => !c.allocatedTo);
  const allocatedCharges = charges.filter(c => c.allocatedTo && c.allocatedTo !== 'unallocated');

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Allocate charges</h1>
          <p className="text-gray-600">Assign generation costs to specific outputs</p>
        </div>

        {/* Bulk actions */}
        {selectedCharges.size > 0 && (
          <div className="mb-6 bg-white rounded-lg p-4 shadow-sm border-l-4 border-blue-600">
            <div className="flex items-center gap-4">
              <span className="font-medium">{selectedCharges.size} selected</span>
              
              {!splitMode ? (
                <>
                  <select
                    value={bulkTarget}
                    onChange={(e) => setBulkTarget(e.target.value)}
                    className="border rounded px-3 py-1.5"
                  >
                    <option value="">Assign to...</option>
                    {outputs.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                    <option value="unallocated">Unallocated</option>
                  </select>
                  <button
                    onClick={handleBulkAssign}
                    disabled={!bulkTarget}
                    className="bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Bulk assign
                  </button>
                  <button
                    onClick={() => setSplitMode(true)}
                    className="border border-gray-300 px-4 py-1.5 rounded hover:bg-gray-50"
                  >
                    Split across outputs
                  </button>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    {outputs.slice(0, 2).map(o => (
                      <div key={o.id} className="flex items-center gap-1">
                        <label className="text-sm">{o.name}:</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          placeholder="%"
                          className="w-16 border rounded px-2 py-1 text-sm"
                          value={splitTargets[o.id] || ''}
                          onChange={(e) => setSplitTargets({
                            ...splitTargets,
                            [o.id]: parseFloat(e.target.value) || 0
                          })}
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleSplitAssign}
                    className="bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700"
                  >
                    Apply split
                  </button>
                  <button
                    onClick={() => {
                      setSplitMode(false);
                      setSplitTargets({});
                    }}
                    className="text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* Unallocated */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              Unallocated
              <span className="text-sm font-normal text-gray-500">({unallocatedCharges.length})</span>
            </h2>
            <div className="space-y-2">
              {unallocatedCharges.map(charge => (
                <label
                  key={charge.id}
                  className={`block p-3 bg-white border rounded-lg cursor-pointer hover:bg-gray-50 ${
                    selectedCharges.has(charge.id) ? 'border-blue-600 bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedCharges.has(charge.id)}
                      onChange={() => toggleCharge(charge.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{charge.description}</span>
                        {getTrustBadge(charge.trust)}
                        {charge.failed && <span className="text-xs text-red-600">Failed</span>}
                      </div>
                      <div className="text-sm text-gray-600">
                        {charge.costUsd && `$${charge.costUsd.toFixed(2)}`}
                        {charge.hfCredits && `${charge.hfCredits.toLocaleString()} HF credits`}
                        {charge.elChars && `${charge.elChars.toLocaleString()} EL chars`}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{charge.date}</div>
                    </div>
                  </div>
                </label>
              ))}
              {unallocatedCharges.length === 0 && (
                <div className="text-center py-8 text-gray-500 bg-white rounded-lg border-2 border-dashed">
                  All charges allocated
                </div>
              )}
            </div>
          </div>

          {/* Allocated */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Allocated by output</h2>
            <div className="space-y-4">
              {outputs.map(output => {
                const outputCharges = charges.filter(c => c.allocatedTo === output.id);
                if (outputCharges.length === 0) return null;

                return (
                  <div key={output.id} className="bg-white rounded-lg p-4 border">
                    <h3 className="font-medium mb-2">{output.name}</h3>
                    <div className="space-y-1">
                      {outputCharges.map(charge => (
                        <div key={charge.id} className="text-sm flex justify-between items-center py-1">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-700">{charge.description}</span>
                            {getTrustBadge(charge.trust)}
                            {charge.failed && <span className="text-xs text-red-600">Failed</span>}
                          </div>
                          <span className="text-gray-600">
                            {charge.costUsd && `$${charge.costUsd.toFixed(2)}`}
                            {charge.hfCredits && `${charge.hfCredits.toLocaleString()} HF`}
                            {charge.elChars && `${charge.elChars.toLocaleString()} EL`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
