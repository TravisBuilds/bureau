/**
 * Real stream data collected 2026-11-21, 8:24 PM PT
 * 
 * These are actual values with sources and asOf timestamps, not SAMPLE data.
 * Anything marked not-connected renders as empty state with connect CTA.
 */

import { MetricStream, MetricValue, StreamRollup } from './stream-metrics-types';

// Source timestamps
const DATA_COLLECTED_AT = '2026-11-21T20:24:00-08:00'; // 8:24 PM PT
const GITHUB_WINDOW_START = '2026-10-22T00:00:00-08:00'; // 30 days
const X_API_TIME = '2026-11-21T20:19:00-08:00'; // 8:19 PM PT
const STUDIO_EP05_LOCKED = '2026-10-31T00:00:00-08:00';

/**
 * 1) DuckDuckGoose - Production/Repo stream
 * Source: GitHub TravisBuilds/DuckDuckGoose, 30 days from 2026-10-22
 */
const DUCKDUCKGOOSE_METRICS: MetricValue[] = [
  {
    metricId: 'commits-30d',
    value: 296,
    timestamp: DATA_COLLECTED_AT,
    source: 'GitHub TravisBuilds/DuckDuckGoose',
  },
  {
    metricId: 'prs-merged-30d',
    value: 36,
    timestamp: DATA_COLLECTED_AT,
    source: 'GitHub TravisBuilds/DuckDuckGoose',
  },
  {
    metricId: 'prs-opened',
    value: 41,
    timestamp: DATA_COLLECTED_AT,
    source: 'GitHub TravisBuilds/DuckDuckGoose',
  },
  {
    metricId: 'prs-open',
    value: 6,
    timestamp: DATA_COLLECTED_AT,
    source: 'GitHub TravisBuilds/DuckDuckGoose',
  },
  {
    metricId: 'stars',
    value: 0,
    timestamp: DATA_COLLECTED_AT,
    source: 'GitHub TravisBuilds/DuckDuckGoose',
  },
  {
    metricId: 'forks',
    value: 1,
    timestamp: DATA_COLLECTED_AT,
    source: 'GitHub TravisBuilds/DuckDuckGoose',
  },
];

/**
 * 2) Elon - Audience stream (@SadCreatorTalks on X)
 * Source: X API, 8:19 PM PT
 * Growth is NEGATIVE - show honestly
 */
const ELON_METRICS: MetricValue[] = [
  {
    metricId: 'followers',
    value: 18972,
    timestamp: X_API_TIME,
    source: 'X API @SadCreatorTalks',
  },
  {
    metricId: 'follower-growth',
    value: -62, // Negative growth since Nov 5
    timestamp: X_API_TIME,
    source: 'X API @SadCreatorTalks',
  },
  {
    metricId: 'engagement-rate',
    value: 5.27,
    timestamp: X_API_TIME,
    source: 'X API @SadCreatorTalks',
  },
  {
    metricId: 'impressions',
    value: 74304,
    timestamp: X_API_TIME,
    source: 'X API @SadCreatorTalks',
  },
  {
    metricId: 'posts-29',
    value: 29,
    timestamp: X_API_TIME,
    source: 'X API @SadCreatorTalks (Nov 12–21)',
  },
  {
    metricId: 'likes-29-posts',
    value: 3120,
    timestamp: X_API_TIME,
    source: 'X API @SadCreatorTalks (last 29 posts)',
  },
  {
    metricId: 'reposts-29-posts',
    value: 655,
    timestamp: X_API_TIME,
    source: 'X API @SadCreatorTalks (last 29 posts)',
  },
  {
    metricId: 'replies-29-posts',
    value: 139,
    timestamp: X_API_TIME,
    source: 'X API @SadCreatorTalks (last 29 posts)',
  },
  {
    metricId: 'following',
    value: 169,
    timestamp: X_API_TIME,
    source: 'X API @SadCreatorTalks',
  },
  {
    metricId: 'posts-total',
    value: 3271,
    timestamp: X_API_TIME,
    source: 'X API @SadCreatorTalks',
  },
];

// Follower history for Elon
const ELON_FOLLOWER_HISTORY: MetricValue[] = [
  { metricId: 'followers', value: 19034, timestamp: '2026-11-05T00:00:00-08:00', source: 'X API' },
  { metricId: 'followers', value: 19011, timestamp: '2026-11-11T00:00:00-08:00', source: 'X API' },
  { metricId: 'followers', value: 19004, timestamp: '2026-11-13T00:00:00-08:00', source: 'X API' },
  { metricId: 'followers', value: 18993, timestamp: '2026-11-16T00:00:00-08:00', source: 'X API' },
  { metricId: 'followers', value: 18972, timestamp: '2026-11-21T20:19:00-08:00', source: 'X API' },
];

/**
 * 3) Studio · Peak Glow Up - Production stream
 * Credits and USD are NOT additive - show separately
 */
const STUDIO_METRICS: MetricValue[] = [
  {
    metricId: 'episodes-locked',
    value: 5,
    timestamp: STUDIO_EP05_LOCKED,
    source: 'Private Drive',
  },
  {
    metricId: 'episodes-published',
    value: 0,
    timestamp: DATA_COLLECTED_AT,
    source: 'Private Drive',
  },
  {
    metricId: 'ep05-cost-usd',
    value: 88.04,
    timestamp: STUDIO_EP05_LOCKED,
    source: 'Studio ledger',
  },
  {
    metricId: 'ep01-higgsfield-credits',
    value: 6576.5,
    timestamp: DATA_COLLECTED_AT,
    source: 'Higgsfield',
  },
  {
    metricId: 'ep02-higgsfield-credits',
    value: 3842.5,
    timestamp: DATA_COLLECTED_AT,
    source: 'Higgsfield',
  },
  {
    metricId: 'ep02-elevenlabs-credits',
    value: 3695.67,
    timestamp: DATA_COLLECTED_AT,
    source: 'ElevenLabs',
  },
  {
    metricId: 'winter-coat-cost-usd',
    value: 7.15,
    timestamp: DATA_COLLECTED_AT,
    source: 'Studio ledger (in progress)',
  },
];

/**
 * 4) Ember - Content/Distribution stream (YouTube @BedtimewithEmber-i9n)
 */
const EMBER_METRICS: MetricValue[] = [
  {
    metricId: 'episodes-locked',
    value: 12,
    timestamp: DATA_COLLECTED_AT,
    source: 'Private archive',
  },
  {
    metricId: 'shorts-published',
    value: 12,
    timestamp: DATA_COLLECTED_AT,
    source: 'YouTube @BedtimewithEmber-i9n',
  },
  {
    metricId: 'views',
    value: 212,
    timestamp: DATA_COLLECTED_AT,
    source: 'YouTube @BedtimewithEmber-i9n',
  },
  {
    metricId: 'subscribers',
    value: 3,
    timestamp: DATA_COLLECTED_AT,
    source: 'YouTube @BedtimewithEmber-i9n',
  },
  {
    metricId: 'ep11-cost-usd',
    value: 30.63,
    timestamp: DATA_COLLECTED_AT,
    source: 'Production ledger',
  },
  {
    metricId: 'ep12-cost-usd',
    value: 30.93,
    timestamp: DATA_COLLECTED_AT,
    source: 'Production ledger',
  },
];

// Top Shorts by views
export const EMBER_TOP_SHORTS = [
  { name: 'Ep12', views: 49 },
  { name: 'Too Many Trees', views: 34 },
  { name: 'Embers', views: 21 },
  { name: 'Ep11', views: 15 },
];

/**
 * Shared resources (need attribution rules, not split)
 */
export const SHARED_ELEVENLABS = {
  charactersUsed: 1962,
  charactersTotal: 62263,
  plan: 'Starter',
  resetsAt: '2026-12-12T00:00:00-08:00',
  source: 'ElevenLabs API',
  asOf: DATA_COLLECTED_AT,
};

export const SHARED_HIGGSFIELD = {
  creditsRemaining: 3953,
  plan: 'Ultimate',
  source: 'Higgsfield (connector account)',
  asOf: DATA_COLLECTED_AT,
  note: 'May not be the harness billing account',
};

/**
 * Real streams with actual data
 */
export const REAL_STREAMS: MetricStream[] = [
  {
    id: 'duckduckgoose',
    name: 'DuckDuckGoose',
    category: 'production',
    description: 'Video-episode studio / Hands-Free Video Generator',
    metricDefinitions: [
      { id: 'commits-30d', label: 'Commits (30d)', unit: 'commits', kind: 'count', preferredChart: 'bar', isHeadline: true },
      { id: 'prs-merged-30d', label: 'PRs Merged (30d)', unit: 'PRs', kind: 'count', preferredChart: 'bar', isHeadline: true },
      { id: 'prs-open', label: 'PRs Open', unit: 'PRs', kind: 'count', preferredChart: 'none', isHeadline: true },
      { id: 'stars', label: 'Stars', unit: 'stars', kind: 'count', preferredChart: 'none', isHeadline: false },
    ],
    currentMetrics: DUCKDUCKGOOSE_METRICS,
    historicalMetrics: [],
    connected: true,
    dataSource: 'GitHub TravisBuilds/DuckDuckGoose',
    lastUpdated: DATA_COLLECTED_AT,
    visible: true,
  },
  {
    id: 'elon',
    name: 'Elon',
    category: 'audience',
    description: "Travis's personal X/Twitter - engagement and growth",
    metricDefinitions: [
      { id: 'followers', label: 'Followers', unit: 'followers', kind: 'count', preferredChart: 'sparkline', isHeadline: true },
      { id: 'follower-growth', label: 'Growth (since Nov 5)', unit: 'followers', kind: 'growth', preferredChart: 'none', isHeadline: true },
      { id: 'engagement-rate', label: 'Engagement Rate', unit: '%', kind: 'percentage', preferredChart: 'none', isHeadline: true },
      { id: 'impressions', label: 'Impressions', unit: 'impressions', kind: 'count', preferredChart: 'sparkline', isHeadline: true },
    ],
    currentMetrics: ELON_METRICS,
    historicalMetrics: ELON_FOLLOWER_HISTORY,
    connected: true,
    dataSource: 'X API @SadCreatorTalks',
    lastUpdated: X_API_TIME,
    visible: true,
  },
  {
    id: 'studio-peak-glow-up',
    name: 'Studio · Peak Glow Up',
    category: 'production',
    description: 'Dome-resort generative production',
    metricDefinitions: [
      { id: 'episodes-locked', label: 'Episodes Locked', unit: 'episodes', kind: 'count', preferredChart: 'none', isHeadline: true },
      { id: 'episodes-published', label: 'Published', unit: 'episodes', kind: 'count', preferredChart: 'none', isHeadline: true },
      { id: 'ep05-cost-usd', label: 'Latest Episode Cost', unit: '$', kind: 'currency', preferredChart: 'none', isHeadline: true },
    ],
    currentMetrics: STUDIO_METRICS,
    historicalMetrics: [],
    connected: true,
    dataSource: 'Private Drive + Studio ledger',
    lastUpdated: DATA_COLLECTED_AT,
    visible: true,
  },
  {
    id: 'ember',
    name: 'Ember',
    category: 'content-distribution',
    description: "Bedtime with Ember / Yellow Duck Labs kids' content",
    metricDefinitions: [
      { id: 'shorts-published', label: 'Shorts Published', unit: 'shorts', kind: 'count', preferredChart: 'bar', isHeadline: true },
      { id: 'views', label: 'Views', unit: 'views', kind: 'count', preferredChart: 'none', isHeadline: true },
      { id: 'subscribers', label: 'Subscribers', unit: 'subscribers', kind: 'count', preferredChart: 'none', isHeadline: true },
      { id: 'episodes-locked', label: 'Episodes Locked', unit: 'episodes', kind: 'count', preferredChart: 'none', isHeadline: true },
    ],
    currentMetrics: EMBER_METRICS,
    historicalMetrics: [],
    connected: true,
    dataSource: 'YouTube @BedtimewithEmber-i9n',
    lastUpdated: DATA_COLLECTED_AT,
    visible: true,
  },
];

/**
 * Attention items derived from real data
 */
export interface AttentionItem {
  id: string;
  streamId: string;
  streamName: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  detectedAt: string;
}

export const ATTENTION_ITEMS: AttentionItem[] = [
  {
    id: 'elon-negative-growth',
    streamId: 'elon',
    streamName: 'Elon',
    severity: 'warning',
    title: 'Follower decline',
    description: 'Lost 62 followers since Nov 5 (-0.33%). Down from 19,034 to 18,972.',
    detectedAt: X_API_TIME,
  },
  {
    id: 'studio-unpublished',
    streamId: 'studio-peak-glow-up',
    streamName: 'Studio · Peak Glow Up',
    severity: 'warning',
    title: '5 episodes ready, 0 published',
    description: 'Ep01–Ep05 locked in private Drive. No public distribution yet.',
    detectedAt: DATA_COLLECTED_AT,
  },
];

/**
 * Calculate real rollup (no total monthly spend - not reconcilable)
 */
export function calculateRealRollup(): StreamRollup {
  return {
    totalSpendThisMonth: 0, // Not reconcilable - show 'known spend' instead
    totalIncome: 0, // $0 / not connected across all four
    attentionItems: ATTENTION_ITEMS.length,
    connectedStreams: REAL_STREAMS.filter(s => s.connected).length,
    totalStreams: REAL_STREAMS.length,
  };
}
