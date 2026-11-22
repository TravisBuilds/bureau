/**
 * Bureau - Agent Report Types
 * Schema for project agents to report to Bureau
 */

// Cost entry with estimate vs invoice flag
export interface CostEntry {
  source: string;
  amountUSD: number;
  period?: string; // e.g. "Nov 2026", "since mid-Oct"
  isEstimate: boolean; // true = estimate from logs, false = actual invoice
  notes?: string;
}

// User metrics split by founder vs non-founder
export interface UserMetrics {
  total: number;
  founder: {
    accountIds: string[];
    activeOverDays: number;
  };
  nonFounder: {
    total: number;
    active: number;
    withBehavior: number; // e.g. users with saves
  };
  activeDaysThreshold?: number; // what counts as "active on >1 day"
}

// Event tracking status
export interface EventTracking {
  tracked: string[]; // events that ARE tracked
  notTracked: string[]; // events that are NOT tracked (and why)
  blockers: string[]; // metrics that can't be measured due to missing tracking
}

// Pending work awaiting founder
export interface PendingWork {
  description: string;
  type: 'build' | 'approval' | 'decision' | 'migration' | 'other';
  estimatedMinutes: number;
  reasoning: string; // why this matters / what it unblocks
  agentDesigned?: boolean; // true if agent already designed the fix
  requiredApproval?: string; // what founder must approve
}

// Open work (PRs, uncommitted changes)
export interface OpenWork {
  unpushedCommits?: number;
  openPRs?: number;
  branches?: string[];
}

// Release state
export interface ReleaseState {
  platform: string[]; // e.g. ["Android"], ["iOS", "Android"], ["Web"]
  version?: string;
  distribution: 'app-store' | 'private-preview' | 'beta' | 'unreleased' | 'live';
  location?: string; // e.g. "Google Drive", "TestFlight", "App Store"
  invitedTesters?: number;
  launchDate?: string;
  notes?: string;
}

// Complete agent report
export interface AgentReport {
  projectName: string;
  reportDate: string; // ISO 8601
  productDescription: string;
  releaseState: ReleaseState;
  userMetrics: UserMetrics;
  eventTracking: EventTracking;
  costs: CostEntry[];
  revenue: number;
  openWork: OpenWork;
  pendingWork: PendingWork[];
  founderTimeUnknown: boolean;
  dataSource?: string;
}

// Bureau's derived next action
export interface NextAction {
  priority: number; // 1 = highest
  title: string;
  reasoning: string;
  costOfWaiting: string;
  founderTimeMinutes: number;
  agentTaskBrief: string; // what agents will do after approval
  blockedMetric?: string; // if this action unblocks a metric
  type: 'approval' | 'decision' | 'build' | 'review';
}

// Project status in Bureau
export interface ProjectStatus {
  projectName: string;
  connected: boolean;
  lastReportDate?: string;
  verdict?: string; // one-line verdict
  nextActions?: NextAction[];
  founderSignal?: 'keep' | 'pause' | 'kill' | 'push';
  signalReasoning?: string;
}

// Founder time budget
export interface FounderTimeBudget {
  weeklyHours?: number; // optional, founder-set
  thisWeekUsed?: number;
  thisWeekAsked?: number; // sum of all next actions
}
