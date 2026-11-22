/**
 * Bureau Stream Metrics Definition Layer
 * 
 * Each stream type defines its own headline metrics and visualization.
 * Money is one dimension, not the only one.
 */

export type MetricKind = 'count' | 'currency' | 'rate' | 'growth' | 'percentage' | 'duration';
export type ChartType = 'sparkline' | 'bar' | 'line' | 'none';

/**
 * Metric definition - what this stream tracks
 */
export interface MetricDefinition {
  id: string;
  label: string;              // e.g., "Followers", "Episodes Published"
  unit: string;               // e.g., "followers", "episodes", "$", "%"
  kind: MetricKind;
  preferredChart: ChartType;
  isHeadline: boolean;        // Show on stream card (2-4 headline metrics)
}

/**
 * Metric value at a point in time
 */
export interface MetricValue {
  metricId: string;
  value: number;
  timestamp: string;
  source?: string;            // Where this came from
}

/**
 * Stream type with metrics
 */
export type StreamCategory = 
  | 'audience'               // X/Twitter, followers, engagement
  | 'production'             // Video studio, generative production
  | 'content-distribution'   // YouTube, episodes, views
  | 'project'                // Generic project with users/revenue
  | 'day-job'                // Agency work
  | 'contract';              // Freelance clients

/**
 * Stream with metric definitions
 */
export interface MetricStream {
  id: string;
  name: string;
  category: StreamCategory;
  description: string;
  
  // Metric definitions for this stream
  metricDefinitions: MetricDefinition[];
  
  // Current metric values
  currentMetrics: MetricValue[];
  
  // Historical values (for sparklines)
  historicalMetrics: MetricValue[];
  
  // Connection status
  connected: boolean;
  dataSource?: string;
  lastUpdated?: string;
  
  // Visibility
  visible: boolean;          // Show in building or hide for now
}

/**
 * Metric definitions for different stream categories
 */

// Audience stream (e.g., Elon's X/Twitter)
export const AUDIENCE_METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    id: 'followers',
    label: 'Followers',
    unit: 'followers',
    kind: 'count',
    preferredChart: 'sparkline',
    isHeadline: true,
  },
  {
    id: 'follower-growth',
    label: 'Growth (30d)',
    unit: 'followers',
    kind: 'growth',
    preferredChart: 'sparkline',
    isHeadline: true,
  },
  {
    id: 'impressions',
    label: 'Impressions',
    unit: 'impressions',
    kind: 'count',
    preferredChart: 'sparkline',
    isHeadline: true,
  },
  {
    id: 'engagement-rate',
    label: 'Engagement Rate',
    unit: '%',
    kind: 'percentage',
    preferredChart: 'none',
    isHeadline: true,
  },
];

// Production stream (e.g., DuckDuckGoose video studio, Studio Peak Glow Up)
export const PRODUCTION_METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    id: 'output-produced',
    label: 'Output Produced',
    unit: 'videos',
    kind: 'count',
    preferredChart: 'bar',
    isHeadline: true,
  },
  {
    id: 'pipeline-success',
    label: 'Pipeline Success',
    unit: '%',
    kind: 'percentage',
    preferredChart: 'sparkline',
    isHeadline: true,
  },
  {
    id: 'generation-spend',
    label: 'Generation Spend',
    unit: '$',
    kind: 'currency',
    preferredChart: 'line',
    isHeadline: true,
  },
  {
    id: 'cost-per-output',
    label: 'Cost per Output',
    unit: '$/video',
    kind: 'currency',
    preferredChart: 'sparkline',
    isHeadline: true,
  },
];

// Content & distribution stream (e.g., Ember YouTube channel)
export const CONTENT_DISTRIBUTION_METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    id: 'episodes',
    label: 'Episodes',
    unit: 'episodes',
    kind: 'count',
    preferredChart: 'bar',
    isHeadline: true,
  },
  {
    id: 'shorts-published',
    label: 'Shorts',
    unit: 'shorts',
    kind: 'count',
    preferredChart: 'bar',
    isHeadline: true,
  },
  {
    id: 'views',
    label: 'Views',
    unit: 'views',
    kind: 'count',
    preferredChart: 'sparkline',
    isHeadline: true,
  },
  {
    id: 'subscribers',
    label: 'Subscribers',
    unit: 'subscribers',
    kind: 'count',
    preferredChart: 'sparkline',
    isHeadline: true,
  },
  {
    id: 'cost-per-episode',
    label: 'Cost per Episode',
    unit: '$/episode',
    kind: 'currency',
    preferredChart: 'none',
    isHeadline: false,
  },
];

/**
 * Travis's current 4 visible streams (no invented data)
 */
export const TRAVIS_CURRENT_STREAMS: MetricStream[] = [
  {
    id: 'duckduckgoose',
    name: 'DuckDuckGoose',
    category: 'production',
    description: 'Video-episode studio / Hands-Free Video Generator',
    metricDefinitions: PRODUCTION_METRIC_DEFINITIONS,
    currentMetrics: [],
    historicalMetrics: [],
    connected: false,
    visible: true,
  },
  {
    id: 'elon',
    name: 'Elon',
    category: 'audience',
    description: "Travis's personal X/Twitter - engagement and growth",
    metricDefinitions: AUDIENCE_METRIC_DEFINITIONS,
    currentMetrics: [],
    historicalMetrics: [],
    connected: false,
    visible: true,
  },
  {
    id: 'studio-peak-glow-up',
    name: 'Studio · Peak Glow Up',
    category: 'production',
    description: 'Dome-resort generative production',
    metricDefinitions: PRODUCTION_METRIC_DEFINITIONS,
    currentMetrics: [],
    historicalMetrics: [],
    connected: false,
    visible: true,
  },
  {
    id: 'ember',
    name: 'Ember',
    category: 'content-distribution',
    description: "Bedtime with Ember / Yellow Duck Labs kids' content",
    metricDefinitions: CONTENT_DISTRIBUTION_METRIC_DEFINITIONS,
    currentMetrics: [],
    historicalMetrics: [],
    connected: false,
    visible: true,
  },
];

/**
 * Cross-stream rollup
 */
export interface StreamRollup {
  totalSpendThisMonth: number;
  totalIncome: number;
  attentionItems: number;
  connectedStreams: number;
  totalStreams: number;
}

/**
 * Calculate cross-stream rollup
 */
export function calculateStreamRollup(streams: MetricStream[]): StreamRollup {
  const visibleStreams = streams.filter(s => s.visible);
  const connectedStreams = visibleStreams.filter(s => s.connected);
  
  // Sum up spend and income from metric values
  let totalSpend = 0;
  let totalIncome = 0;
  
  connectedStreams.forEach(stream => {
    stream.currentMetrics.forEach(metric => {
      const def = stream.metricDefinitions.find(d => d.id === metric.metricId);
      if (def?.kind === 'currency') {
        if (def.id.includes('spend') || def.id.includes('cost')) {
          totalSpend += metric.value;
        } else if (def.id.includes('income') || def.id.includes('revenue')) {
          totalIncome += metric.value;
        }
      }
    });
  });
  
  return {
    totalSpendThisMonth: totalSpend,
    totalIncome,
    attentionItems: 0, // Will be calculated from automation/decision records
    connectedStreams: connectedStreams.length,
    totalStreams: visibleStreams.length,
  };
}

/**
 * Format metric value for display
 */
export function formatMetricValue(value: number, def: MetricDefinition): string {
  switch (def.kind) {
    case 'currency':
      return `$${value.toLocaleString()}`;
    case 'percentage':
      return `${value.toFixed(1)}%`;
    case 'rate':
      return `${value.toFixed(2)}${def.unit}`;
    case 'growth':
      const sign = value >= 0 ? '+' : '';
      return `${sign}${value.toLocaleString()} ${def.unit}`;
    case 'count':
      return value.toLocaleString();
    case 'duration':
      return `${value}${def.unit}`;
    default:
      return value.toString();
  }
}
