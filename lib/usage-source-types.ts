/**
 * Bureau Usage Source Adapters
 * 
 * Tracks costs per stream through each bot and service.
 * Stream cost = sum of bots + subscriptions.
 */

export type UsageSourceType = 
  | 'grok-bot'           // Grok Bot credits/usage
  | 'cursor-agent'       // Cursor Cloud Agent usage
  | 'openai'             // OpenAI API tokens/costs
  | 'google-places'      // Google Places API
  | 'google-gemini'      // Gemini API
  | 'anthropic'          // Claude API
  | 'subscription'       // Fixed subscription cost
  | 'manual'             // Manual entry
  | 'csv-import';        // CSV imported data

export type UsageUnit = 
  | 'credits'            // Grok credits
  | 'tokens'             // OpenAI/Anthropic tokens
  | 'api-calls'          // API request count
  | 'hours'              // Compute hours
  | 'usd';               // Direct USD amount

/**
 * Usage record from a source
 */
export interface UsageRecord {
  id: string;
  streamId: string;
  botId?: string;              // Which bot (if applicable)
  botName?: string;
  
  // Source
  sourceType: UsageSourceType;
  sourceName: string;          // e.g., "Plumlist Agent", "Google Places API"
  
  // Usage
  units: number;               // Amount used
  unitType: UsageUnit;
  costUSD: number;             // Dollar cost
  
  // Time range
  periodStart: string;         // ISO date
  periodEnd: string;           // ISO date
  asOf: string;                // When this was recorded
  
  // Budget
  budgetCap?: number;          // Monthly cap (if set)
  thresholdWarning?: number;   // Warning at X% (e.g., 80)
  
  // Status
  status: 'active' | 'approaching-cap' | 'at-cap' | 'paused' | 'disconnected';
  
  // Metadata
  raw?: any;                   // Raw data from source API
}

/**
 * Usage source adapter interface
 */
export interface UsageSourceAdapter {
  type: UsageSourceType;
  
  /**
   * Fetch current usage for a bot or service
   */
  fetchUsage(params: {
    botId?: string;
    projectKey?: string;
    apiKey?: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<UsageRecord>;
  
  /**
   * Check if adapter is properly configured
   */
  isConfigured(): boolean;
}

/**
 * Grok Bot usage adapter
 * 
 * Tracks Grok credits and on-demand $ per bot
 */
export class GrokBotUsageAdapter implements UsageSourceAdapter {
  type: UsageSourceType = 'grok-bot';
  
  constructor(private apiKey?: string) {}
  
  async fetchUsage(params: { botId?: string; periodStart: string; periodEnd: string }): Promise<UsageRecord> {
    // In real implementation, would call Grok Bot API
    // For now, return mock data
    return {
      id: `usage-${Date.now()}`,
      streamId: 'unknown',
      botId: params.botId,
      botName: 'Grok Bot',
      sourceType: 'grok-bot',
      sourceName: 'Grok Bot Usage API',
      units: 0,
      unitType: 'credits',
      costUSD: 0,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      asOf: new Date().toISOString(),
      status: 'disconnected',
    };
  }
  
  isConfigured(): boolean {
    return false; // Will be true once Travis supplies API key
  }
}

/**
 * OpenAI usage adapter
 * 
 * Tracks tokens and $ per project/key
 */
export class OpenAIUsageAdapter implements UsageSourceAdapter {
  type: UsageSourceType = 'openai';
  
  constructor(private adminKey?: string) {}
  
  async fetchUsage(params: { projectKey?: string; periodStart: string; periodEnd: string }): Promise<UsageRecord> {
    // In real implementation, would call OpenAI Usage API
    // Needs admin key from Travis
    return {
      id: `usage-${Date.now()}`,
      streamId: 'unknown',
      sourceType: 'openai',
      sourceName: 'OpenAI Usage API',
      units: 0,
      unitType: 'tokens',
      costUSD: 0,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      asOf: new Date().toISOString(),
      status: 'disconnected',
    };
  }
  
  isConfigured(): boolean {
    return !!this.adminKey;
  }
}

/**
 * Google Cloud usage adapter
 * 
 * Tracks Places API, Gemini API, etc.
 */
export class GoogleCloudUsageAdapter implements UsageSourceAdapter {
  type: UsageSourceType = 'google-places';
  
  constructor(
    private projectId?: string,
    private serviceAccountKey?: string,
    private service: 'places' | 'gemini' = 'places'
  ) {}
  
  async fetchUsage(params: { periodStart: string; periodEnd: string }): Promise<UsageRecord> {
    // In real implementation, would call Google Cloud Billing API
    return {
      id: `usage-${Date.now()}`,
      streamId: 'unknown',
      sourceType: this.service === 'places' ? 'google-places' : 'google-gemini',
      sourceName: this.service === 'places' ? 'Google Places API' : 'Gemini API',
      units: 0,
      unitType: 'api-calls',
      costUSD: 0,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      asOf: new Date().toISOString(),
      status: 'disconnected',
    };
  }
  
  isConfigured(): boolean {
    return !!this.projectId && !!this.serviceAccountKey;
  }
}

/**
 * Manual/CSV usage source
 * 
 * For costs tracked outside APIs
 */
export class ManualUsageSource implements UsageSourceAdapter {
  type: UsageSourceType = 'manual';
  
  async fetchUsage(): Promise<UsageRecord> {
    throw new Error('Manual usage must be entered directly, not fetched');
  }
  
  isConfigured(): boolean {
    return true; // Always available
  }
}

/**
 * Seed real Plum List usage from baseline
 * 
 * From uploads/milestone1-baseline.md:
 * - Google Places API: ~$8.72/month
 * - Gemini API: ~$1.25/month (estimated from baseline context)
 */
export const PLUM_LIST_REAL_USAGE: UsageRecord[] = [
  {
    id: 'plum-places-nov2026',
    streamId: 'plum-list',
    sourceType: 'google-places',
    sourceName: 'Google Places API',
    units: 2180,              // Approximate calls based on cost
    unitType: 'api-calls',
    costUSD: 8.72,            // Real figure from baseline
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    asOf: '2026-11-22T03:00:00Z',
    status: 'active',
  },
  {
    id: 'plum-gemini-nov2026',
    streamId: 'plum-list',
    sourceType: 'google-gemini',
    sourceName: 'Gemini API',
    units: 125000,            // Approximate tokens
    unitType: 'tokens',
    costUSD: 1.25,            // Estimated from baseline
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    asOf: '2026-11-22T03:00:00Z',
    status: 'active',
  },
];

/**
 * Calculate total cost for a stream
 */
export function calculateStreamCost(usageRecords: UsageRecord[]): {
  totalCost: number;
  bySource: Array<{ source: string; cost: number; units: number; unitType: UsageUnit }>;
  status: 'ok' | 'approaching-cap' | 'at-cap';
} {
  const totalCost = usageRecords.reduce((sum, record) => sum + record.costUSD, 0);
  
  const bySource = usageRecords.map(record => ({
    source: record.sourceName,
    cost: record.costUSD,
    units: record.units,
    unitType: record.unitType,
  }));
  
  // Check if any record is approaching or at cap
  const hasApproachingCap = usageRecords.some(r => r.status === 'approaching-cap');
  const hasAtCap = usageRecords.some(r => r.status === 'at-cap');
  
  const status = hasAtCap ? 'at-cap' : hasApproachingCap ? 'approaching-cap' : 'ok';
  
  return { totalCost, bySource, status };
}

/**
 * Calculate total AI spend across all streams
 */
export function calculateTotalAISpend(allRecords: UsageRecord[]): {
  totalSpend: number;
  byStream: Array<{ streamId: string; streamName: string; cost: number }>;
} {
  const totalSpend = allRecords.reduce((sum, record) => sum + record.costUSD, 0);
  
  // Group by stream
  const byStreamMap = new Map<string, { streamName: string; cost: number }>();
  
  allRecords.forEach(record => {
    const existing = byStreamMap.get(record.streamId) || { streamName: record.streamId, cost: 0 };
    existing.cost += record.costUSD;
    byStreamMap.set(record.streamId, existing);
  });
  
  const byStream = Array.from(byStreamMap.entries()).map(([streamId, data]) => ({
    streamId,
    streamName: data.streamName,
    cost: data.cost,
  }));
  
  return { totalSpend, byStream };
}
