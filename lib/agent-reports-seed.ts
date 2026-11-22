/**
 * Bureau - Agent Report Fixtures
 * Realistic project agent reports
 */

import { AgentReport } from './agent-report-types';

/**
 * Plum List - Real agent report (Nov 21, 2026)
 * Built ONLY from actual facts, no invented numbers
 */
export const plumListAgentReport: AgentReport = {
  projectName: 'Plum List',
  reportDate: '2026-11-21T00:00:00Z',
  productDescription: 'AI-powered place discovery app. Users save places, get curated recommendations.',
  
  releaseState: {
    platform: ['Android'],
    version: 'v14',
    distribution: 'private-preview',
    location: "Founder's Google Drive (APK)",
    invitedTesters: 0,
    notes: 'Not in app stores. No iOS. No launch date set.',
  },
  
  userMetrics: {
    total: 26,
    founder: {
      accountIds: ['founder-account'],
      activeOverDays: 33, // 33 days of founder usage
    },
    nonFounder: {
      total: 25, // 26 - 1 founder
      active: 6, // users with saves
      withBehavior: 6, // same as active for now
    },
    activeDaysThreshold: 1, // "3 accounts active on >1 day"
  },
  
  eventTracking: {
    tracked: [
      'saves (633 total, 591 matched) - stored in Supabase',
      'list/search sessions - stored in Supabase',
    ],
    notTracked: [
      'directions tap - PostHog wrapper has no key',
      'website tap - PostHog wrapper has no key',
      'book tap - PostHog wrapper has no key',
      'reel tap - PostHog wrapper has no key',
      'map tap - PostHog wrapper has no key',
      'place view - no event exists',
      'call - no event exists',
      "'been there' - no event exists (button doesn't exist yet)",
    ],
    blockers: [
      'Later-day return to saved place - NOT measurable without place-view or been-there event',
      'User retention - cannot measure without return tracking',
    ],
  },
  
  costs: [
    {
      source: 'Google Places API',
      amountUSD: 8.72,
      period: 'Nov 2026',
      isEstimate: true,
      notes: 'Estimate from app logs, not invoice',
    },
    {
      source: 'Gemini API',
      amountUSD: 1.25,
      period: 'since mid-Oct',
      isEstimate: true,
      notes: 'Estimate from app logs, not invoice',
    },
    {
      source: 'Supabase',
      amountUSD: 0,
      period: 'Nov 2026',
      isEstimate: false,
      notes: 'Free tier',
    },
  ],
  
  revenue: 0,
  
  openWork: {
    unpushedCommits: 3, // syncs 26-29 = 3 unpushed
    openPRs: 2,
  },
  
  pendingWork: [
    {
      description: 'Return-tracking fix: app_events table + "Been there" button',
      type: 'approval',
      estimatedMinutes: 60, // ~1-1.5h build
      reasoning: 'Blocks measuring later-day returns, which blocks open-to-users decision',
      agentDesigned: true,
      requiredApproval: 'Apply migration to live DB (creates app_events table). Add "Been there" button to place screen.',
    },
  ],
  
  founderTimeUnknown: true,
  dataSource: 'Plum List agent (Grok Bot)',
};

/**
 * Example: Unconnected project (placeholder)
 */
export const exampleUnconnectedProject: AgentReport = {
  projectName: 'Project 2',
  reportDate: '2026-11-21T00:00:00Z',
  productDescription: 'Not connected',
  releaseState: {
    platform: [],
    distribution: 'unreleased',
  },
  userMetrics: {
    total: 0,
    founder: { accountIds: [], activeOverDays: 0 },
    nonFounder: { total: 0, active: 0, withBehavior: 0 },
  },
  eventTracking: {
    tracked: [],
    notTracked: [],
    blockers: [],
  },
  costs: [],
  revenue: 0,
  openWork: {},
  pendingWork: [],
  founderTimeUnknown: true,
};
