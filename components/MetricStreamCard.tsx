'use client';

import { TrendingUp, Users, Video, FileText, AlertCircle } from 'lucide-react';
import { MetricStream, formatMetricValue } from '@/lib/stream-metrics-types';
import { formatFullDateTime } from '@/lib/timezone-utils';

interface Props {
  stream: MetricStream;
  onClick: () => void;
}

export default function MetricStreamCard({ stream, onClick }: Props) {
  const headlineMetrics = stream.metricDefinitions.filter(d => d.isHeadline);
  const hasData = stream.connected && stream.currentMetrics.length > 0;

  const getCategoryIcon = () => {
    switch (stream.category) {
      case 'audience':
        return <Users className="w-5 h-5" />;
      case 'production':
        return <Video className="w-5 h-5" />;
      case 'content-distribution':
        return <FileText className="w-5 h-5" />;
      default:
        return <TrendingUp className="w-5 h-5" />;
    }
  };

  const getCategoryColor = () => {
    switch (stream.category) {
      case 'audience':
        return 'bg-blue-100 text-blue-600';
      case 'production':
        return 'bg-purple-100 text-purple-600';
      case 'content-distribution':
        return 'bg-green-100 text-green-600';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <button
      onClick={onClick}
      className="w-full p-6 bg-white border border-slate-200 rounded-xl hover:border-highstreet-purple hover:shadow-sm transition-all text-left"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-900 mb-1">{stream.name}</h3>
          <p className="text-sm text-slate-500">{stream.description}</p>
        </div>
        <div className={`p-2 rounded-lg ${getCategoryColor()}`}>
          {getCategoryIcon()}
        </div>
      </div>

      {/* Metrics */}
      {hasData ? (
        <div className="grid grid-cols-2 gap-4">
          {headlineMetrics.slice(0, 4).map((def) => {
            const metricValue = stream.currentMetrics.find(m => m.metricId === def.id);
            
            return (
              <div key={def.id}>
                <div className="text-xs text-slate-500 mb-1">
                  {def.label}
                  {def.id === 'cost-per-episode-partial' && (
                    <span className="ml-1 text-slate-400">(partial)</span>
                  )}
                </div>
                {metricValue ? (
                  <div className={`text-lg font-semibold ${
                    def.kind === 'growth' && metricValue.value < 0 
                      ? 'text-red-600' 
                      : def.id === 'episodes-published' && metricValue.value === 0
                      ? 'text-amber-600'
                      : 'text-slate-900'
                  }`}>
                    {def.id === 'cost-per-episode-partial' 
                      ? `$${metricValue.value.toFixed(2)}/ep`
                      : formatMetricValue(metricValue.value, def)
                    }
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">—</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-6 text-center border-2 border-dashed border-slate-200 rounded-lg">
          <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-500">Not connected</p>
          <p className="text-xs text-slate-400 mt-1">
            Connect to see {stream.category === 'audience' ? 'engagement' : 
                           stream.category === 'production' ? 'output' : 
                           'content'} metrics
          </p>
        </div>
      )}

      {/* Last Updated */}
      {hasData && stream.lastUpdated && (
        <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
          Updated {formatFullDateTime(stream.lastUpdated)}
        </div>
      )}
    </button>
  );
}
