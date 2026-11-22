/**
 * Bureau - Auditable Operating Record Types
 * 
 * Every stream maintains an append-only, immutable audit trail
 * of its financial and operational history. This is the single
 * source of truth for public and investor views.
 */

export type AuditEntryType = 
  | 'income'
  | 'cost'
  | 'hours'
  | 'decision'
  | 'metric'
  | 'correction';

/**
 * Base audit entry - all entries share these fields
 */
export interface BaseAuditEntry {
  id: string;                    // Unique entry ID
  timestamp: string;             // When recorded (ISO 8601)
  source: string;                // Who/what recorded it ("Plumlist Agent", "Manual entry by founder", "Bureau calculation")
  streamId: string;              // Which stream this belongs to
  type: AuditEntryType;
}

/**
 * Income entry - money coming into the stream
 */
export interface IncomeEntry extends BaseAuditEntry {
  type: 'income';
  amount: number;                // Amount in USD
  period: string;                // Which period (YYYY-MM for monthly)
  description?: string;          // Optional context
  category?: string;             // e.g., "subscriptions", "consulting", "sales"
}

/**
 * Cost entry - money going out of the stream
 */
export interface CostEntry extends BaseAuditEntry {
  type: 'cost';
  amount: number;                // Amount in USD
  period: string;                // Which period (YYYY-MM for monthly)
  service: string;               // What was purchased
  category: string;              // e.g., "infrastructure", "marketing", "tools"
  recurring?: boolean;           // Is this a recurring cost?
}

/**
 * Hours entry - time spent on the stream
 */
export interface HoursEntry extends BaseAuditEntry {
  type: 'hours';
  hours: number;                 // Hours worked
  period: string;                // Which day/period (YYYY-MM-DD for daily)
  description?: string;          // What was done
  personId?: string;             // Who worked (for multi-person teams)
}

/**
 * Decision entry - founder signals and actions
 */
export interface DecisionEntry extends BaseAuditEntry {
  type: 'decision';
  signal: 'push' | 'keep' | 'pause' | 'kill';
  reasoning: string;             // Why this signal
  actions?: string[];            // Recommended actions
  priority?: number;             // Priority ranking (1 = highest)
  verdict?: string;              // Human-readable summary
}

/**
 * Metric entry - quantitative measurement
 */
export interface MetricEntry extends BaseAuditEntry {
  type: 'metric';
  name: string;                  // e.g., "Active users", "Conversion rate"
  value: number;                 // The measurement
  unit: string;                  // e.g., "users", "%", "saves"
  period: string;                // Which period (YYYY-MM or YYYY-MM-DD)
  trend?: string;                // e.g., "+5 this week", "flat"
}

/**
 * Correction entry - fixes a previous entry
 * 
 * Never update or delete original entries. Add a correction
 * that references the original. Both stay in the trail.
 */
export interface CorrectionEntry extends BaseAuditEntry {
  type: 'correction';
  corrects: string;              // ID of the entry being corrected
  field: string;                 // Which field is being corrected
  oldValue: any;                 // Original value (for reference)
  newValue: any;                 // Corrected value
  reason: string;                // Why the correction was needed
}

/**
 * Union of all audit entry types
 */
export type AuditEntry = 
  | IncomeEntry
  | CostEntry
  | HoursEntry
  | DecisionEntry
  | MetricEntry
  | CorrectionEntry;

/**
 * Audit trail for a stream
 * 
 * Properties:
 * - Append-only: Never update or delete entries
 * - Immutable: Once written, entries cannot be changed
 * - Timestamped: Every entry has creation time
 * - Attributed: Every entry has a source
 * - Stream-scoped: Each stream has its own trail
 */
export interface StreamAuditTrail {
  streamId: string;
  entries: AuditEntry[];
  createdAt: string;             // When trail was created
  lastUpdated: string;           // When last entry was added
}

/**
 * Per-stream share settings for future public/investor views
 * 
 * Controls what data is visible in public or investor-only views.
 * Public views read ONLY from the auditable record, never from
 * draft or unverified data.
 */
export interface StreamShareSettings {
  visibility: 'private' | 'public-preview' | 'investor-only';
  
  /**
   * Per-field visibility for public/investor view
   * All fields default to false (private)
   */
  publicFields: {
    monthlyIncome: boolean;          // Show monthly income
    monthlyCosts: boolean;           // Show monthly costs breakdown
    monthlyHours: boolean;           // Show hours worked
    userMetrics: boolean;            // Show user count, growth
    decisions: boolean;              // Show decision history
    auditTrail: boolean;             // Show full audit trail
    effectiveHourlyRate: boolean;   // Show income per hour
    recentActivity: boolean;         // Show recent updates
  };
  
  /**
   * When this stream went public (if ever)
   */
  publicSince?: string; // ISO timestamp
  
  /**
   * Emails of investors who can see investor-only view
   * Future: replace with proper investor account management
   */
  investorEmails?: string[];
  
  /**
   * Custom message shown on public view
   */
  publicMessage?: string;
}

/**
 * Default share settings - private by default
 */
export const DEFAULT_SHARE_SETTINGS: StreamShareSettings = {
  visibility: 'private',
  publicFields: {
    monthlyIncome: false,
    monthlyCosts: false,
    monthlyHours: false,
    userMetrics: false,
    decisions: false,
    auditTrail: false,
    effectiveHourlyRate: false,
    recentActivity: false,
  },
};

/**
 * Query helpers for audit trail
 */

/**
 * Get latest value for a metric
 */
export function getLatestMetric(trail: StreamAuditTrail, metricName: string): MetricEntry | null {
  const metricEntries = trail.entries
    .filter((e): e is MetricEntry => e.type === 'metric' && e.name === metricName)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  return metricEntries[0] || null;
}

/**
 * Get total income for a period
 */
export function getTotalIncome(trail: StreamAuditTrail, period: string): number {
  return trail.entries
    .filter((e): e is IncomeEntry => e.type === 'income' && e.period === period)
    .reduce((sum, e) => sum + e.amount, 0);
}

/**
 * Get total costs for a period
 */
export function getTotalCosts(trail: StreamAuditTrail, period: string): number {
  return trail.entries
    .filter((e): e is CostEntry => e.type === 'cost' && e.period === period)
    .reduce((sum, e) => sum + e.amount, 0);
}

/**
 * Get total hours for a period
 */
export function getTotalHours(trail: StreamAuditTrail, period: string): number {
  return trail.entries
    .filter((e): e is HoursEntry => e.type === 'hours' && e.period.startsWith(period))
    .reduce((sum, e) => sum + e.hours, 0);
}

/**
 * Get decision history (most recent first)
 */
export function getDecisionHistory(trail: StreamAuditTrail, limit?: number): DecisionEntry[] {
  const decisions = trail.entries
    .filter((e): e is DecisionEntry => e.type === 'decision')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  return limit ? decisions.slice(0, limit) : decisions;
}

/**
 * Get entries that have been corrected
 */
export function getCorrectedEntries(trail: StreamAuditTrail): Array<{ original: AuditEntry; correction: CorrectionEntry }> {
  const corrections = trail.entries.filter((e): e is CorrectionEntry => e.type === 'correction');
  
  return corrections.map(correction => ({
    original: trail.entries.find(e => e.id === correction.corrects)!,
    correction,
  }));
}

/**
 * Check if entry has been corrected
 */
export function isEntryCorrected(trail: StreamAuditTrail, entryId: string): boolean {
  return trail.entries.some(e => e.type === 'correction' && (e as CorrectionEntry).corrects === entryId);
}

/**
 * Get effective value for an entry (applying corrections)
 */
export function getEffectiveValue(trail: StreamAuditTrail, entryId: string, field: string): any {
  const correction = trail.entries.find(
    e => e.type === 'correction' && (e as CorrectionEntry).corrects === entryId && (e as CorrectionEntry).field === field
  ) as CorrectionEntry | undefined;
  
  if (correction) {
    return correction.newValue;
  }
  
  const original = trail.entries.find(e => e.id === entryId);
  return original ? (original as any)[field] : null;
}
