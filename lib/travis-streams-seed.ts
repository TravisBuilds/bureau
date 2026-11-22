/**
 * Travis's Real Income Streams
 * User #1: Someone with many streams, checks in briefly from day job
 */

export interface IncomeStream {
  id: string;
  name: string;
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
  
  // Metrics (only if connected)
  users?: number;
  earnings?: number;
  spending?: number;
  needsYou?: number;
  timeAskedHours?: number;
  
  // Activity
  lastActivity?: string;
  status: 'active' | 'paused' | 'not-connected';
}

export const travisStreams: IncomeStream[] = [
  // 1. Plum List - HAS REAL DATA
  {
    id: 'plum-list',
    name: 'Plum List',
    description: 'Restaurant saves from influencer reels',
    agents: [
      { name: 'Plumlist Agent', role: 'Product & Ops', connected: true },
    ],
    connected: true,
    signal: 'push',
    signalReason: 'Critical blocker: return tracking not measurable',
    users: 26,
    earnings: 0,
    spending: 9.97,
    needsYou: 1,
    timeAskedHours: 0.75, // 45 min total from 3 actions
    lastActivity: '2 hours ago',
    status: 'active',
  },
  
  // 2. DuckDuckGoose - NOT CONNECTED
  {
    id: 'duckduckgoose',
    name: 'DuckDuckGoose',
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
    description: 'Chrome extension for friends and family',
    agents: [
      { name: 'StarringYou Agent', role: 'Extension Dev', connected: false },
    ],
    connected: false,
    lastActivity: 'Never',
    status: 'not-connected',
  },
  
  // 7. Test One - NOT CONNECTED
  {
    id: 'test-one',
    name: 'Test One',
    description: 'Machine-readable product catalog cited by AI shoppers',
    agents: [
      { name: 'Chief of Staff', role: 'Catalog Management', connected: false },
    ],
    connected: false,
    lastActivity: 'Never',
    status: 'not-connected',
  },
  
  // 8. Bureau - NOT CONNECTED
  {
    id: 'bureau',
    name: 'Bureau',
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
  const connectedStreams = streams.filter(s => s.connected && s.spending !== undefined);
  
  return {
    totalStreams: streams.length,
    connectedStreams: connectedStreams.length,
    totalUsers: connectedStreams.reduce((sum, s) => sum + (s.users || 0), 0),
    totalEarnings: connectedStreams.reduce((sum, s) => sum + (s.earnings || 0), 0),
    totalSpending: connectedStreams.reduce((sum, s) => sum + (s.spending || 0), 0),
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
