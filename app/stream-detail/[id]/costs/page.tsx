'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatFullDateTime } from '@/lib/timezone-utils';

interface OutputCost {
  output_id: string;
  output_name: string;
  output_type: string;
  generation_cost_usd: number;
  failed_renders_cost_usd: number;
  elevenlabs_characters: number | null;
  elevenlabs_cost_usd: number | null;
  higgsfield_credits: number | null;
  higgsfield_cost_usd: number | null;
  views: number | null;
  trust_level: 'verified' | 'declared' | 'estimated';
  verified_sources: string[];
  costPerView: number | null;
  costPer1kViews: number | null;
  created_at: string;
  published_at: string | null;
  lifecycle?: 'draft' | 'finished' | 'published' | 'abandoned';
  cost_coverage_note?: string;
}

interface Summary {
  total_outputs: number;
  total_cost: number;
  total_views: number;
  avg_cost_per_view: number;
  avg_cost_per_1k_views: number;
}

function TrustBadge({ level, sources, costCoverageNote }: { level: string; sources: string[]; costCoverageNote?: string }) {
  // Check if this is mixed trust (verified + estimated)
  const hasEstimated = costCoverageNote?.toLowerCase().includes('estimated') || 
                       sources.some(s => s.includes('_est'));
  const isMixed = level === 'verified' && hasEstimated;
  
  const badges = {
    verified: { 
      label: isMixed ? 'Verified · 1 estimated line' : 'Verified',
      bg: 'bg-green-100', 
      text: 'text-green-800',
      icon: '✓'
    },
    declared: { 
      label: 'Declared', 
      bg: 'bg-blue-100', 
      text: 'text-blue-800',
      icon: '📝'
    },
    estimated: { 
      label: 'Estimated', 
      bg: 'bg-slate-100', 
      text: 'text-slate-600',
      icon: '~'
    },
  };
  
  const badge = badges[level as keyof typeof badges] || badges.estimated;
  
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        <span>{badge.icon}</span>
        {badge.label}
      </span>
      {sources.length > 0 && (
        <span className="text-xs text-slate-400">
          {sources.slice(0, 2).join(', ')}
        </span>
      )}
    </div>
  );
}

export default function StreamCostsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [outputs, setOutputs] = useState<OutputCost[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetch(`/api/streams/${id}/costs`)
      .then(res => res.json())
      .then(data => {
        setOutputs(data.outputs || []);
        setSummary(data.summary);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch costs:', err);
        setLoading(false);
      });
  }, [id]);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-slate-500">Loading costs...</div>
      </div>
    );
  }
  
  if (outputs.length === 0) {
    return (
      <div className="min-h-screen bg-white p-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 flex items-center gap-4">
            <button 
              onClick={() => router.back()}
              className="text-slate-600 hover:text-slate-900"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-semibold text-slate-900">Costs</h1>
          </div>
          
          {/* Empty state */}
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-16 text-center">
            <div className="mb-4 text-6xl">📊</div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No costs tracked yet
            </h3>
            <p className="text-slate-600 mb-8 max-w-md mx-auto">
              Track generation costs per output (episode, video, Short) to understand your cost per view.
            </p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => alert('API connector coming soon!')}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
              >
                Connect API key
              </button>
              <button 
                onClick={() => alert('CSV import coming soon!')}
                className="px-6 py-3 border border-slate-300 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Import CSV
              </button>
              <button 
                onClick={() => alert('Manual entry coming soon!')}
                className="px-6 py-3 border border-slate-300 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Enter manually
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <button 
            onClick={() => router.back()}
            className="text-slate-600 hover:text-slate-900"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-semibold text-slate-900">Output Costs</h1>
        </div>
        
        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
              <div className="text-xs font-medium text-slate-600 mb-1">Total Cost</div>
              <div className="text-2xl font-semibold text-slate-900">${summary.total_cost.toFixed(2)}</div>
            </div>
            <div className="p-4 border border-slate-200 rounded-lg">
              <div className="text-xs font-medium text-slate-600 mb-1">Total Views</div>
              <div className="text-2xl font-semibold text-slate-900">{summary.total_views.toLocaleString()}</div>
            </div>
            <div className="p-4 border border-slate-200 rounded-lg">
              <div className="text-xs font-medium text-slate-600 mb-1">Cost per View</div>
              <div className="text-2xl font-semibold text-slate-900">${summary.avg_cost_per_view.toFixed(3)}</div>
            </div>
            <div className="p-4 border border-slate-200 rounded-lg">
              <div className="text-xs font-medium text-slate-600 mb-1">Outputs</div>
              <div className="text-2xl font-semibold text-slate-900">{summary.total_outputs}</div>
            </div>
          </div>
        )}
        
        {/* Outputs table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">Output</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-slate-600">Status</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-600">Cost</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-600">Views</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-600">$/View</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-600">$/1K Views</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-slate-600">Trust</th>
              </tr>
            </thead>
            <tbody>
              {outputs.map((output) => {
                const isPublished = output.lifecycle === 'published' || !output.lifecycle;
                const lifecycleLabels = {
                  draft: { text: 'Draft', color: 'text-slate-600 bg-slate-100' },
                  finished: { text: 'Ready', color: 'text-blue-600 bg-blue-100' },
                  published: { text: 'Live', color: 'text-green-600 bg-green-100' },
                  abandoned: { text: 'Abandoned', color: 'text-gray-500 bg-gray-100' },
                };
                const lifecycle = output.lifecycle || 'published';
                
                return (
                  <tr key={output.output_id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-4 px-4">
                      <div className="font-medium text-slate-900">{output.output_name}</div>
                      <div className="text-xs text-slate-500">
                        {output.output_type}
                        {output.higgsfield_credits && (
                          <span className="ml-2">• {output.higgsfield_credits.toFixed(1)} HF credits</span>
                        )}
                        {output.elevenlabs_characters && (
                          <span className="ml-2">• {output.elevenlabs_characters.toLocaleString()} EL chars</span>
                        )}
                      </div>
                      {output.cost_coverage_note && (
                        <div className="text-xs text-slate-400 mt-1">
                          💡 {output.cost_coverage_note}
                        </div>
                      )}
                    </td>
                    <td className="text-center py-4 px-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${lifecycleLabels[lifecycle].color}`}>
                        {lifecycleLabels[lifecycle].text}
                      </span>
                    </td>
                    <td className="text-right py-4 px-4">
                      <div className="font-semibold text-slate-900">
                        ${output.generation_cost_usd.toFixed(2)}
                      </div>
                      {output.failed_renders_cost_usd > 0 && (
                        <div className="text-xs text-red-600">
                          +${output.failed_renders_cost_usd.toFixed(2)} failed
                        </div>
                      )}
                    </td>
                    <td className="text-right py-4 px-4 text-slate-700">
                      {isPublished ? (
                        output.views !== null ? output.views.toLocaleString() : '—'
                      ) : (
                        <span className="text-xs text-slate-400">Not yet published</span>
                      )}
                    </td>
                    <td className="text-right py-4 px-4 font-medium text-slate-900">
                      {isPublished && output.costPerView !== null ? `$${output.costPerView.toFixed(3)}` : '—'}
                    </td>
                    <td className="text-right py-4 px-4 text-slate-700">
                      {isPublished && output.costPer1kViews !== null ? `$${output.costPer1kViews.toFixed(2)}` : '—'}
                    </td>
                    <td className="text-center py-4 px-4">
                      <TrustBadge 
                        level={output.trust_level} 
                        sources={output.verified_sources} 
                        costCoverageNote={output.cost_coverage_note}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        <div className="mt-4 text-xs text-slate-500">
          Last updated: {formatFullDateTime(new Date().toISOString())}
        </div>
      </div>
    </div>
  );
}
