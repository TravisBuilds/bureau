/**
 * Bureau - Decision Engine Types
 * Core data structures for business evaluation
 */

// Agent task with cost and time
export interface AgentTask {
  name: string;
  costUSD: number;
  costCredits?: number;
  timeMinutes: number;
  frequency: 'per_user' | 'per_action' | 'one_time' | 'daily' | 'weekly' | 'monthly';
  description?: string;
}

// Business serving costs
export interface ServingCost {
  name: string;
  costPerAction: number;
  actionsPerUser: number;
  description?: string;
}

// User engagement metrics
export interface UserMetrics {
  totalUsers: number;
  activeUsers: number;
  actionsPerUserPerMonth: number;
  returnRate?: number; // 0-1, percentage returning after first use
  churnRate?: number; // 0-1, monthly churn
}

// Revenue and contribution
export interface Revenue {
  monthlyRevenue: number;
  revenuePerUser?: number;
  contributionMargin?: number; // 0-1, after variable costs
}

// Founder time investment
export interface FounderTime {
  hoursPerWeek: number;
  valuePerHour?: number; // optional opportunity cost
}

// Optional income target
export interface IncomeTarget {
  monthlyTargetUSD: number;
  reasoning?: string;
}

// Complete business inputs
export interface BusinessInputs {
  businessName: string;
  agentTasks: AgentTask[];
  servingCosts: ServingCost[];
  userMetrics: UserMetrics;
  revenue: Revenue;
  founderTime: FounderTime;
  incomeTarget?: IncomeTarget;
  dataSource?: string; // where this data came from
  dataDate?: string; // when this data was collected
}

// Verdict levels
export type VerdictLevel = 
  | 'quit_your_day_job'   // Strong positive: profitable, sustainable, meeting target
  | 'keep_going'          // Positive: viable path, needs growth
  | 'not_enough_evidence' // Insufficient data
  | 'not_yet'             // Not viable yet, but could be with changes
  | 'stop';               // Not viable, fundamental issues

// Confidence levels
export type ConfidenceLevel = 'high' | 'medium' | 'low';

// Key fact supporting a decision
export interface KeyFact {
  label: string;
  value: string | number;
  interpretation: string;
  calculation?: string; // how this was computed
  inputs?: string[]; // which input fields contributed
}

// Pricing recommendation
export interface PricingRecommendation {
  strategy: 'set_price' | 'free_with_cap' | 'invite_only' | 'closed';
  recommendedPricePerUser?: number;
  monthlyCostCap?: number;
  reviewDate?: string;
  reasoning: string;
  agentActionBrief: string; // what an agent should do with this
}

// Open-to-users recommendation
export interface OpenToUsersRecommendation {
  recommendation: 'open_now' | 'open_with_limits' | 'keep_closed' | 'review_needed';
  reasoning: string;
  conditions?: string[];
  reviewDate?: string;
  agentActionBrief: string;
}

// Break-even calculations
export interface BreakEvenMetrics {
  costPerUser: number;
  costPerTask: { [taskName: string]: number };
  breakEvenPricePerUser: number;
  monthlyBurnRate: number;
  calculation: string;
}

// Final decision output
export interface BureauDecision {
  verdict: VerdictLevel;
  confidence: ConfidenceLevel;
  keyFacts: KeyFact[];
  pricingRecommendation: PricingRecommendation;
  openToUsersRecommendation: OpenToUsersRecommendation;
  breakEvenMetrics: BreakEvenMetrics;
  missingData?: string[]; // what data would improve confidence
  timestamp: string;
  agentActionBrief: string; // overall next action for agents to execute
}

// Business archetype for testing/seeding
export interface BusinessArchetype {
  name: string;
  description: string;
  inputs: BusinessInputs;
  expectedVerdict?: VerdictLevel; // for testing
}
