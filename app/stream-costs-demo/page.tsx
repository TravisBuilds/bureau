'use client';

import PrototypeBanner from '@/components/PrototypeBanner';
import StreamCostsTab from '@/components/StreamCostsTab';
import { PLUM_LIST_REAL_USAGE } from '@/lib/usage-source-types';

export default function StreamCostsDemoPage() {
  return (
    <div className="min-h-screen bg-white">
      <PrototypeBanner />
      
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Plum List - Costs</h1>
          <p className="text-slate-600 mt-1">Real usage data from baseline</p>
        </div>

        <StreamCostsTab
          streamId="plum-list"
          streamName="Plum List"
          usageRecords={PLUM_LIST_REAL_USAGE}
          onConnectSource={() => alert('Connect usage source modal would open here')}
          onSetBudgetCap={(sourceId) => alert(`Set budget cap for ${sourceId}`)}
        />
      </div>
    </div>
  );
}
