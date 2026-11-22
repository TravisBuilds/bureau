/**
 * Travis's Real Income Streams (7 projects, 0 day-jobs, 0 contracts)
 * User #1: Someone with many streams, checks in briefly from day job
 */

export type StreamType = 'day-job' | 'contract' | 'project';

export interface IncomeStream {
  id: string;
  name: string;
  type: StreamType;
  description: string;
  agents: Array<{
    name: string;
    role: string;
    connected: boolean;
  }>;
  
  // State
  connected: boolean;
  signal?: 'push' | 'keep' | 'pause' | 'kill';
  signalReason?: string;
  
  // Financial metrics (all types)
  monthlyIncome?: number;
  monthlyCosts?: number;
  monthlyHours?: number;
  
  // Project-specific metrics
  users?: number;
  needsYou?: number;
  timeAskedHours?: number;
  
  // Activity
  lastActivity?: string;
  status: 'active' | 'paused' | 'not-connected';
  
  // Data freshness
  dataSource?: string;
  dataAsOf?: string;
}

export const travisStreams: IncomeStream[] = [
  // 1. Plum List - HAS REAL DATA
  {
    id: 'plum-list',
    name: 'Plum List',
    type: 'project',
    description: 'Restaurant saves from influencer reels',
    agents: [
      { name: 'Plumlist Agent', role: 'Product & Ops', connected: true },
    ],
    connected: true,
    signal: 'push',
    signalReason: 'Critical blocker: return tracking not measurable',
    users: 26,
    monthlyIncome: 0,
    monthlyCosts: 9.97,
    needsYou: 1,
    timeAskedHours: 0.75, // 45 min total from 3 actions
    lastActivity: '2 hours ago',
    status: 'active',
    dataSource: 'Plumlist Agent',
    dataAsOf: new Date().toISOString(),
  },
  
  // 2. DuckDuckGoose - NOT CONNECTED
  {
    id: 'duckduckgoose',
    name: 'DuckDuckGoose',
    type: 'project',
    description: 'Video-episode studio / Hands-Free Video Generator',
    agents: [
      { name: 'DuckDuckGoose Agent', role: 'Video Production', connected: false },
    ],
    connected: false,
    lastActivity: 'Never',
    status: 'not-connected',
  },
  
  // 3. Bedtime with Ember - NOT CONNECTED, MULTIPLE AGENTS
  {
    id: 'bedtime-ember',
    name: 'Bedtime with Ember / Yellow Duck Labs',
    type: 'project',
    description: "Kids' generative content",
    agents: [
      { name: 'Ember Agent', role: 'Content Creation', connected: false },
      { name: 'Grower', role: 'Distribution', connected: false },
    ],
    connected: false,
    lastActivity: 'Never',
    status: 'not-connected',
  },
  
  // 4. Quacked Concierge Peak Glow Up - NOT CONNECTED
  {
    id: 'peak-glow-up',
    name: 'Quacked Concierge Peak Glow Up',
    type: 'project',
    description: 'Dome resort IP content',
    agents: [
      { name: 'Studio Peak Glow Up Agent', role: 'Content Studio', connected: false },
    ],
    connected: false,
    lastActivity: 'Never',
    status: 'not-connected',
  },
  
  // 5. Offkey - NOT CONNECTED
  {
    id: 'offkey',
    name: 'Offkey',
    type: 'project',
    description: 'Mobile karaoke app offkey.fm',
    agents: [
      { name: 'Offkey PM Agent', role: 'Product Management', connected: false },
    ],
    connected: false,
    lastActivity: 'Never',
    status: 'not-connected',
  },
  
  // 6. StarringYou - NOT CONNECTED
  {
    id: 'starringyou',
    name: 'StarringYou',
    type: 'project',
    description: 'Chrome extension for friends and family',
    agents: [
      { name: 'StarringYou Agent', role: 'Extension Dev', connected: false },
    ],
    connected: false,
    lastActivity: 'Never',
    status: 'not-connected',
  },
  
  // 7. Bureau - NOT CONNECTED
  {
    id: 'bureau',
    name: 'Bureau',
    type: 'project',
    description: 'Command center for solopreneurs with AI helpers',
    agents: [
      { name: 'Bureau Agent', role: 'Product & Design', connected: false },
    ],
    connected: false,
    lastActivity: 'Never',
    status: 'not-connected',
  },
];

/**
 * Portfolio rollup (only connected streams with data)
 */
export function getPortfolioRollup(streams: IncomeStream[]) {
  const connectedStreams = streams.filter(s => s.connected && s.monthlyCosts !== undefined);
  
  return {
    totalStreams: streams.length,
    connectedStreams: connectedStreams.length,
    totalUsers: connectedStreams.reduce((sum, s) => sum + (s.users || 0), 0),
    totalIncome: connectedStreams.reduce((sum, s) => sum + (s.monthlyIncome || 0), 0),
    totalCosts: connectedStreams.reduce((sum, s) => sum + (s.monthlyCosts || 0), 0),
    needsYou: connectedStreams.reduce((sum, s) => sum + (s.needsYou || 0), 0),
    timeAskedHours: connectedStreams.reduce((sum, s) => sum + (s.timeAskedHours || 0), 0),
  };
}

/**
 * Today's queue: top priority items across all streams (capped at 5)
 */
export interface TodayItem {
  streamId: string;
  streamName: string;
  priority: number;
  title: string;
  timeMinutes: number;
}

export const todayQueue: TodayItem[] = [
  {
    streamId: 'plum-list',
    streamName: 'Plum List',
    priority: 1,
    title: 'Approve: Return-tracking fix',
    timeMinutes: 15,
  },
  {
    streamId: 'plum-list',
    streamName: 'Plum List',
    priority: 2,
    title: 'Push: 4 syncs unpushed, 2 open PRs',
    timeMinutes: 10,
  },
  {
    streamId: 'plum-list',
    streamName: 'Plum List',
    priority: 3,
    title: 'Review: Session tracking gaps',
    timeMinutes: 20,
  },
  // More would come from other connected streams
];
