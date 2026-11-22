/**
 * Bureau - Agent Provider Interface
 * Real auth and task dispatch for connected agents
 * 
 * Key principle: Provider differences stay inside the adapter.
 * UI sees capabilities (code, research), not brands (ChatGPT, Claude).
 */

export type ProviderType = 'openai' | 'cursor-agents' | 'webhook' | 'mcp' | 'mock';

// Agent capabilities (what they can do)
export type Capability = 'code' | 'research' | 'content' | 'ops' | 'design' | 'data' | 'testing';

// Cost tier for routing decisions
export type CostTier = 'cheap' | 'moderate' | 'expensive';

// Speed tier for routing decisions
export type SpeedTier = 'fast' | 'medium' | 'slow';

export interface AgentCredentials {
  providerId: string;
  type: ProviderType;
  encrypted: string; // Never exposed to client
  createdAt: string;
  expiresAt?: string;
}

export interface ConnectedAgent {
  id: string;
  providerId: string;
  providerType: ProviderType;
  displayName: string;
  
  // What this agent can do
  capabilities: Capability[];
  
  // Routing metadata
  costTier: CostTier;
  speedTier: SpeedTier;
  
  // Health
  status: 'connected' | 'disconnected' | 'error';
  lastActivity?: string;
  
  // Budget (per agent, not per stream)
  monthlyBudget?: number;
  spent?: number;
}

export interface AgentTask {
  id: string;
  agentId: string;
  projectName: string;
  brief: string;
  context?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'needs-founder';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  error?: string;
  founderAction?: 'approved' | 'rejected';
}

export interface TaskDispatchResult {
  taskId: string;
  agentId: string;
  status: 'queued' | 'running';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
}

/**
 * Agent Provider Interface
 * Each provider (OpenAI, Cursor, webhook) implements this
 */
export interface AgentProvider {
  type: ProviderType;
  
  /**
   * Authenticate and connect to the provider
   * Returns encrypted credentials (server-side only)
   */
  connect(params: {
    apiKey?: string;
    oauthCode?: string;
    webhookUrl?: string;
    mcpConfig?: any;
  }): Promise<AgentCredentials>;
  
  /**
   * List available agents for this provider
   */
  listAgents(credentials?: AgentCredentials): Promise<ConnectedAgent[]>;
  
  /**
   * Dispatch a task to an agent
   */
  dispatchTask(
    agentId: string,
    brief: string,
    context?: string,
    credentials?: AgentCredentials
  ): Promise<TaskDispatchResult>;
  
  /**
   * Get task status
   */
  getTaskStatus(taskId: string, credentials?: AgentCredentials): Promise<AgentTask>;
  
  /**
   * Stream task updates (for real-time progress)
   */
  streamTask?(taskId: string, credentials?: AgentCredentials): AsyncIterableIterator<string>;
  
  /**
   * Get task result
   */
  getTaskResult(taskId: string, credentials?: AgentCredentials): Promise<string>;
  
  /**
   * Send a chat message
   */
  sendMessage(
    agentId: string,
    message: string,
    conversationId?: string,
    credentials?: AgentCredentials
  ): Promise<{ messageId: string; response: string }>;
}

/**
 * Provider capabilities and documentation
 */
export const PROVIDER_INFO: Record<ProviderType, {
  name: string;
  authType: 'api-key' | 'oauth' | 'webhook' | 'config';
  supportsDispatch: boolean;
  supportsChat: boolean;
  supportsStreaming: boolean;
  documentation: string;
  setupInstructions: string;
}> = {
  'openai': {
    name: 'OpenAI (ChatGPT)',
    authType: 'api-key',
    supportsDispatch: true,
    supportsChat: true,
    supportsStreaming: true,
    documentation: 'https://platform.openai.com/docs/api-reference',
    setupInstructions: 'Get API key from https://platform.openai.com/api-keys. Use Assistants API for task dispatch.',
  },
  'cursor-agents': {
    name: 'Cursor Cloud Agents',
    authType: 'api-key',
    supportsDispatch: true,
    supportsChat: false,
    supportsStreaming: true,
    documentation: 'https://docs.cursor.com/agents-api (if public)',
    setupInstructions: 'Get API key from Cursor Dashboard > Cloud Agents > API Keys.',
  },
  'webhook': {
    name: 'Generic Webhook',
    authType: 'webhook',
    supportsDispatch: true,
    supportsChat: false,
    supportsStreaming: false,
    documentation: 'POST task brief to webhook URL, poll for result',
    setupInstructions: 'Provide webhook URL that accepts POST with {brief, context} and returns {taskId}.',
  },
  'mcp': {
    name: 'MCP Server',
    authType: 'config',
    supportsDispatch: true,
    supportsChat: true,
    supportsStreaming: false,
    documentation: 'https://modelcontextprotocol.io',
    setupInstructions: 'Configure MCP server connection (stdio or SSE).',
  },
  'mock': {
    name: 'Mock Provider (Dev)',
    authType: 'api-key',
    supportsDispatch: true,
    supportsChat: true,
    supportsStreaming: true,
    documentation: 'Mock provider for development - simulates async task lifecycle',
    setupInstructions: 'No setup needed. Simulates 3-second task execution.',
  },
};
