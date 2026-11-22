/**
 * Bureau - Example Agent Takes
 * Example takes from Grok Bot and ChatGPT for demonstration
 */

import { AgentTake, AgentConnection } from './agent-connection-types';

/**
 * Example connections for Plum List
 */
export const plumListConnections: AgentConnection[] = [
  {
    id: 'conn-grok-1',
    projectName: 'Plum List',
    provider: 'grok-bot',
    displayName: 'Grok Bot',
    status: 'active',
    lastReportDate: '2026-11-21T00:00:00Z',
    lastActivity: '2026-11-21T10:30:00Z',
  },
  {
    id: 'conn-chatgpt-1',
    projectName: 'Plum List',
    provider: 'chatgpt',
    displayName: 'ChatGPT 4',
    status: 'active',
    lastReportDate: '2026-11-21T00:00:00Z',
    lastActivity: '2026-11-21T10:35:00Z',
  },
];

/**
 * Example take from Grok Bot on return-tracking fix
 * [CLEARLY LABELED AS EXAMPLE]
 */
export const grokBotTakeExample: AgentTake = {
  connectionId: 'conn-grok-1',
  provider: 'grok-bot',
  displayName: 'Grok Bot',
  recommendation: 'approve',
  reasoning: '[EXAMPLE TAKE] Approve immediately. This unblocks retention measurement, which is critical for the open-to-users decision. The founder needs data before scaling. Building the "Been there" button and app_events table is straightforward (~1h), and applying the migration to live DB is low-risk with Supabase\'s migration system. Cost of waiting: every day without tracking is a lost opportunity to measure user behavior.',
  confidence: 'high',
  timestamp: '2026-11-21T10:30:00Z',
};

/**
 * Example take from ChatGPT on return-tracking fix
 * [CLEARLY LABELED AS EXAMPLE]
 */
export const chatGPTTakeExample: AgentTake = {
  connectionId: 'conn-chatgpt-1',
  provider: 'chatgpt',
  displayName: 'ChatGPT 4',
  recommendation: 'modify',
  reasoning: '[EXAMPLE TAKE] I recommend modifying this approach slightly. While I agree tracking is essential, I suggest implementing it in two phases: (1) Add the app_events table and "Been there" button first, test with the founder\'s own usage for 2-3 days. (2) Then apply to all users once validated. This reduces risk of a bad migration affecting 26 users. The cost is an extra 2-3 days, but the benefit is confidence that the tracking works before rolling out.',
  confidence: 'medium',
  modifications: 'Two-phase rollout: founder-only test first (2-3 days), then all users.',
  timestamp: '2026-11-21T10:35:00Z',
};

/**
 * Example: Unanimous approval (both agents agree)
 */
export const unanimousApprovalExample: AgentTake[] = [
  {
    connectionId: 'conn-grok-1',
    provider: 'grok-bot',
    displayName: 'Grok Bot',
    recommendation: 'approve',
    reasoning: '[EXAMPLE] Approve. The logic is sound and the cost is manageable.',
    confidence: 'high',
    timestamp: '2026-11-21T10:30:00Z',
  },
  {
    connectionId: 'conn-chatgpt-1',
    provider: 'chatgpt',
    displayName: 'ChatGPT 4',
    recommendation: 'approve',
    reasoning: '[EXAMPLE] I concur. This is the right next step.',
    confidence: 'high',
    timestamp: '2026-11-21T10:35:00Z',
  },
];
