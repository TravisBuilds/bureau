'use client';

import { DollarSign, TrendingUp, AlertCircle, Plus, Link as LinkIcon } from 'lucide-react';
import { UsageRecord, calculateStreamCost } from '@/lib/usage-source-types';

interface Props {
  streamId: string;
  streamName: string;
  usageRecords: UsageRecord[];
  onConnectSource: () => void;
  onSetBudgetCap: (sourceId: string) => void;
}

export default function StreamCostsTab({ 
  streamId, 
  streamName, 
  usageRecords,
  onConnectSource,
  onSetBudgetCap 
}: Props) {
  const { totalCost, bySource, status } = calculateStreamCost(usageRecords);
  
  const hasData = usageRecords.length > 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Costs</h2>
          <p className="text-sm text-slate-500 mt-1">Track spending per bot and service</p>
        </div>
        <button
          onClick={onConnectSource}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-highstreet-purple border border-highstreet-purple rounded-lg hover:bg-highstreet-purple hover:text-white transition-colors"
        >
          <LinkIcon className="w-4 h-4" />
          Connect Usage Source
        </button>
      </div>

      {/* Total Cost Card */}
      <div className="p-6 bg-white border border-slate-200 rounded-xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-medium text-slate-500 mb-2">Total This Month</div>
            <div className="text-4xl font-bold text-slate-900">${totalCost.toFixed(2)}</div>
            {status === 'approaching-cap' && (
              <div className="mt-3 flex items-center gap-2 text-sm text-amber-600">
                <AlertCircle className="w-4 h-4" />
                Approaching budget cap
              </div>
            )}
            {status === 'at-cap' && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                Budget cap reached
              </div>
            )}
          </div>
          <div className="p-3 bg-blue-100 rounded-lg">
            <DollarSign className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Usage by Source */}
      {hasData ? (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Breakdown by Source</h3>
          <div className="space-y-3">
            {usageRecords.map((record) => {
              const percentOfTotal = totalCost > 0 ? (record.costUSD / totalCost) * 100 : 0;
              const capPercentage = record.budgetCap ? (record.costUSD / record.budgetCap) * 100 : 0;
              
              return (
                <div key={record.id} className="p-4 border border-slate-200 rounded-lg">
                  {/* Source Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-medium text-slate-900">{record.sourceName}</div>
                      {record.botName && (
                        <div className="text-sm text-slate-500 mt-1">Bot: {record.botName}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-slate-900">
                        ${record.costUSD.toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {percentOfTotal.toFixed(0)}% of total
                      </div>
                    </div>
                  </div>

                  {/* Usage Details */}
                  <div className="flex items-center gap-6 text-sm text-slate-600 mb-3">
                    <div>
                      <span className="font-medium">{record.units.toLocaleString()}</span>
                      <span className="ml-1">{record.unitType}</span>
                    </div>
                    <div className="text-slate-400">
                      as of {new Date(record.asOf).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Budget Cap Progress */}
                  {record.budgetCap && (
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                        <span>Budget: ${record.costUSD.toFixed(2)} / ${record.budgetCap.toFixed(2)}</span>
                        <span>{capPercentage.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${
                            capPercentage >= 100 ? 'bg-red-500' :
                            capPercentage >= (record.thresholdWarning || 80) ? 'bg-amber-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(capPercentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-3 flex items-center gap-3">
                    {!record.budgetCap && (
                      <button
                        onClick={() => onSetBudgetCap(record.id)}
                        className="text-xs text-highstreet-purple hover:underline"
                      >
                        Set budget cap
                      </button>
                    )}
                    {record.status === 'disconnected' && (
                      <div className="text-xs text-slate-400">
                        Connect usage source to get live data
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
          <DollarSign className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <p className="text-slate-600 mb-2">No cost data yet</p>
          <p className="text-sm text-slate-400 mb-4">
            Connect usage sources to track spending
          </p>
          <button
            onClick={onConnectSource}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-highstreet-purple rounded-lg hover:bg-opacity-90"
          >
            <Plus className="w-4 h-4" />
            Connect First Source
          </button>
        </div>
      )}

      {/* How Costs Are Tracked */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">How costs are tracked</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Each bot's usage is tracked through its provider (Grok, OpenAI, Cursor)</li>
          <li>• Cloud API costs (Places, Gemini) tracked through billing APIs</li>
          <li>• Stream cost = sum of all bots + subscriptions</li>
          <li>• Budget caps and thresholds trigger automation rules</li>
        </ul>
      </div>
    </div>
  );
}
