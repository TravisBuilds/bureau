/**
 * Bureau Connection & Permission System
 * 
 * Requirements:
 * - Ask in context, per stream
 * - Least privilege, read-only by default
 * - OAuth, API keys, agent intake, or manual entry
 * - Centralized management with audit trail
 * - Shared credentials across streams with attribution
 * - Team ownership (1-3 people)
 */

export type ConnectionProvider = 
  | 'x-twitter'
  | 'elevenlabs'
  | 'higgsfield'
  | 'openai'
  | 'grok-bot'
  | 'github'
  | 'youtube'
  | 'stripe'
  | 'gmail'
  | 'google-places'
  | 'google-gemini'
  | 'manual'
  | 'agent-intake';

export type ConnectionMethod = 
  | 'oauth'           // OAuth flow with provider
  | 'api-key'         // Paste API key
  | 'agent-intake'    // Agent provides data through intake
  | 'manual';         // User enters manually

export type ConnectionScope = 
  | 'read'            // Read data only (default)
  | 'write'           // Create/update data
  | 'act'             // Execute actions (post, dispatch tasks, spend money)
  | 'admin';          // Full admin access

export type ConnectionStatus = 
  | 'connected'       // Active and syncing
  | 'stale'          // Connected but hasn't synced recently
  | 'revoked'        // User revoked access
  | 'expired'        // OAuth token expired
  | 'error';         // Connection error

/**
 * Connection - A credential grant for a provider
 */
export interface Connection {
  id: string;
  provider: ConnectionProvider;
  method: ConnectionMethod;
  
  // Status
  status: ConnectionStatus;
  connectedAt: string;
  lastSyncAt?: string;
  expiresAt?: string;
  
  // Scopes
  scopes: ConnectionScope[];
  scopeDetails: string;         // Plain language: "Read followers, tweets, and engagement"
  
  // Ownership
  connectedBy: string;           // User ID
  connectedByName: string;       // Display name
  
  // Usage
  streamsUsing: Array<{
    streamId: string;
    streamName: string;
    attributionRule?: string;    // e.g., "project:ember" or "tag:kids-content"
  }>;
  
  // Credential (encrypted server-side, never sent to client)
  credentialEncrypted?: string;
  
  // OAuth specific
  oauthProvider?: string;
  oauthAccountId?: string;
  oauthAccountName?: string;
  
  // API key specific
  apiKeyType?: 'usage-only' | 'admin-key' | 'read-only';
  apiKeyHint?: string;           // Last 4 chars: "...abc123"
  
  // Health
  errorMessage?: string;
  errorAt?: string;
}

/**
 * Connection requirement - What a metric or feature needs
 */
export interface ConnectionRequirement {
  provider: ConnectionProvider;
  method: ConnectionMethod[];     // Acceptable methods (in preference order)
  requiredScopes: ConnectionScope[];
  scopeExplanation: string;       // "Bureau will read your followers and engagement stats"
  neverDoes: string[];           // ["Post tweets", "Follow users", "Send DMs"]
  
  // Manual entry alternative
  manualEntryAvailable: boolean;
  manualEntryFields?: Array<{
    id: string;
    label: string;
    type: 'text' | 'number' | 'date';
    unit?: string;
  }>;
}

/**
 * Connection prompt - In-context permission request
 */
export interface ConnectionPrompt {
  id: string;
  streamId: string;
  streamName: string;
  metricId?: string;
  metricLabel?: string;
  
  requirement: ConnectionRequirement;
  
  // Context
  triggeredBy: 'add-stream' | 'enable-metric' | 'automation-rule' | 'manual';
  promptedAt: string;
  
  // Response
  choice?: 'connect-oauth' | 'connect-api-key' | 'connect-agent' | 'manual-entry' | 'skip';
  chosenAt?: string;
  connectionId?: string;         // If connected
}

/**
 * Connection audit log entry
 */
export interface ConnectionAuditEntry {
  id: string;
  connectionId: string;
  provider: ConnectionProvider;
  
  action: 
    | 'connected'
    | 'scopes-upgraded'
    | 'scopes-downgraded'
    | 'revoked'
    | 'reconnected'
    | 'expired'
    | 'sync-success'
    | 'sync-failed'
    | 'stream-added'
    | 'stream-removed';
  
  timestamp: string;
  userId: string;
  userName: string;
  
  details?: string;
  scopesBefore?: ConnectionScope[];
  scopesAfter?: ConnectionScope[];
  streamId?: string;
  errorMessage?: string;
}

/**
 * Provider definitions
 */
export interface ProviderDefinition {
  id: ConnectionProvider;
  name: string;
  icon: string;                  // Emoji or icon name
  supportsOAuth: boolean;
  supportsApiKey: boolean;
  defaultScopes: ConnectionScope[];
  
  // Documentation
  whatBureauReads: string[];
  whatBureauNeverDoes: string[];
  apiKeyInstructions?: string;   // Where to get API key
  apiKeyLink?: string;
}

/**
 * All provider definitions
 */
export const PROVIDER_DEFINITIONS: Record<ConnectionProvider, ProviderDefinition> = {
  'x-twitter': {
    id: 'x-twitter',
    name: 'X (Twitter)',
    icon: '𝕏',
    supportsOAuth: true,
    supportsApiKey: false,
    defaultScopes: ['read'],
    whatBureauReads: ['Followers count', 'Tweet impressions', 'Engagement rate', 'Your tweets'],
    whatBureauNeverDoes: ['Post tweets', 'Follow/unfollow users', 'Like or retweet', 'Send DMs'],
  },
  'elevenlabs': {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    icon: '🎙️',
    supportsOAuth: false,
    supportsApiKey: true,
    defaultScopes: ['read'],
    whatBureauReads: ['API usage (characters generated)', 'Available credits', 'Voice library'],
    whatBureauNeverDoes: ['Generate speech', 'Create voices', 'Delete content'],
    apiKeyInstructions: 'Find your API key in ElevenLabs Settings → Profile',
    apiKeyLink: 'https://elevenlabs.io/settings/profile',
  },
  'higgsfield': {
    id: 'higgsfield',
    name: 'Higgsfield',
    icon: '🎬',
    supportsOAuth: false,
    supportsApiKey: true,
    defaultScopes: ['read'],
    whatBureauReads: ['API usage (videos generated)', 'Credit balance', 'Generation history'],
    whatBureauNeverDoes: ['Generate videos', 'Create projects', 'Delete content'],
    apiKeyInstructions: 'Get your API key from Higgsfield account settings',
  },
  'openai': {
    id: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    supportsOAuth: false,
    supportsApiKey: true,
    defaultScopes: ['read'],
    whatBureauReads: ['Token usage', 'API costs', 'Model usage'],
    whatBureauNeverDoes: ['Make API calls', 'Create completions', 'Fine-tune models'],
    apiKeyInstructions: 'Create a read-only API key in OpenAI → Organization → API Keys',
    apiKeyLink: 'https://platform.openai.com/api-keys',
  },
  'grok-bot': {
    id: 'grok-bot',
    name: 'Grok Bot',
    icon: '🤖',
    supportsOAuth: false,
    supportsApiKey: true,
    defaultScopes: ['read'],
    whatBureauReads: ['Credit usage', 'Task history', 'Bot status'],
    whatBureauNeverDoes: ['Dispatch tasks', 'Create bots', 'Delete tasks'],
  },
  'github': {
    id: 'github',
    name: 'GitHub',
    icon: '📦',
    supportsOAuth: true,
    supportsApiKey: true,
    defaultScopes: ['read'],
    whatBureauReads: ['Commits', 'PRs', 'CI status', 'Repository activity'],
    whatBureauNeverDoes: ['Push code', 'Create PRs', 'Merge', 'Delete repos'],
    apiKeyInstructions: 'Create a Personal Access Token with read-only repo scope',
    apiKeyLink: 'https://github.com/settings/tokens',
  },
  'youtube': {
    id: 'youtube',
    name: 'YouTube',
    icon: '📺',
    supportsOAuth: true,
    supportsApiKey: false,
    defaultScopes: ['read'],
    whatBureauReads: ['Video views', 'Subscribers', 'Watch time', 'Revenue (if monetized)'],
    whatBureauNeverDoes: ['Upload videos', 'Edit videos', 'Moderate comments', 'Manage channel'],
  },
  'stripe': {
    id: 'stripe',
    name: 'Stripe',
    icon: '💳',
    supportsOAuth: true,
    supportsApiKey: true,
    defaultScopes: ['read'],
    whatBureauReads: ['Charges', 'Customers', 'Subscriptions', 'Revenue'],
    whatBureauNeverDoes: ['Create charges', 'Refund payments', 'Create customers', 'Cancel subscriptions'],
    apiKeyInstructions: 'Use a Restricted API key with read-only access from Stripe Dashboard',
    apiKeyLink: 'https://dashboard.stripe.com/apikeys',
  },
  'gmail': {
    id: 'gmail',
    name: 'Gmail',
    icon: '📧',
    supportsOAuth: true,
    supportsApiKey: false,
    defaultScopes: ['read'],
    whatBureauReads: ['Unread count', 'Invoice emails', 'Receipt emails'],
    whatBureauNeverDoes: ['Send emails', 'Delete emails', 'Modify labels', 'Access personal emails'],
  },
  'google-places': {
    id: 'google-places',
    name: 'Google Places API',
    icon: '📍',
    supportsOAuth: false,
    supportsApiKey: true,
    defaultScopes: ['read'],
    whatBureauReads: ['API call count', 'API costs from Google Cloud Console'],
    whatBureauNeverDoes: ['Make Places API calls', 'Create requests', 'Modify billing'],
    apiKeyInstructions: 'View usage in Google Cloud Console → APIs & Services',
    apiKeyLink: 'https://console.cloud.google.com/apis/dashboard',
  },
  'google-gemini': {
    id: 'google-gemini',
    name: 'Gemini API',
    icon: '✨',
    supportsOAuth: false,
    supportsApiKey: true,
    defaultScopes: ['read'],
    whatBureauReads: ['Token usage', 'API costs from Google Cloud Console'],
    whatBureauNeverDoes: ['Generate text', 'Make API calls', 'Modify billing'],
    apiKeyInstructions: 'View usage in Google Cloud Console → AI Platform',
    apiKeyLink: 'https://console.cloud.google.com/apis/dashboard',
  },
  'manual': {
    id: 'manual',
    name: 'Manual Entry',
    icon: '✏️',
    supportsOAuth: false,
    supportsApiKey: false,
    defaultScopes: ['read'],
    whatBureauReads: ['What you manually enter'],
    whatBureauNeverDoes: ['Access external services'],
  },
  'agent-intake': {
    id: 'agent-intake',
    name: 'Agent Intake',
    icon: '🤖',
    supportsOAuth: false,
    supportsApiKey: false,
    defaultScopes: ['read'],
    whatBureauReads: ['Data provided by your connected agents'],
    whatBureauNeverDoes: ['Control your agents', 'Make decisions for you'],
  },
};

/**
 * Check if connection exists for a requirement
 */
export function findConnectionForRequirement(
  connections: Connection[],
  requirement: ConnectionRequirement
): Connection | null {
  return connections.find(c => 
    c.provider === requirement.provider &&
    c.status === 'connected' &&
    requirement.requiredScopes.every(scope => c.scopes.includes(scope))
  ) || null;
}

/**
 * Get connections used by a stream
 */
export function getStreamConnections(
  connections: Connection[],
  streamId: string
): Connection[] {
  return connections.filter(c =>
    c.streamsUsing.some(s => s.streamId === streamId)
  );
}

/**
 * Calculate connection freshness
 * Pass nowTimestamp to avoid new Date() during SSR/prerender
 */
export function getConnectionFreshness(
  connection: Connection, 
  nowTimestamp: number = Date.now()
): {
  status: 'fresh' | 'stale' | 'expired';
  message: string;
} {
  if (connection.status !== 'connected') {
    return { status: 'expired', message: 'Not connected' };
  }
  
  if (!connection.lastSyncAt) {
    return { status: 'stale', message: 'Never synced' };
  }
  
  const lastSync = new Date(connection.lastSyncAt);
  const hoursSince = (nowTimestamp - lastSync.getTime()) / (1000 * 60 * 60);
  
  if (hoursSince < 24) {
    return { status: 'fresh', message: `${Math.round(hoursSince)}h ago` };
  } else if (hoursSince < 168) { // 7 days
    return { status: 'fresh', message: `${Math.round(hoursSince / 24)}d ago` };
  } else {
    return { status: 'stale', message: `${Math.round(hoursSince / 24)}d ago` };
  }
}
