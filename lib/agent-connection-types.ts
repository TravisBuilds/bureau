/**
 * Bureau - Agent Connection Types
 * Support for multiple agents per project
 */

import { NextAction } from './agent-report-types';

// Agent provider types
export type AgentProvider = 'grok-bot' | 'chatgpt' | 'claude' | 'gemini' | 'custom';

// Agent connection
export interface AgentConnection {
  id: string; // unique connection ID
  projectName: string;
  provider: AgentProvider;
  displayName: string; // e.g. "Grok Bot", "ChatGPT 4"
  status: 'active' | 'disconnected';
  lastReportDate?: string;
  lastActivity?: string;
  metadata?: Record<string, any>;
}

// Agent "take" on a Bureau decision
export interface AgentTake {
  connectionId: string;
  provider: AgentProvider;
  displayName: string;
  recommendation: 'approve' | 'reject' | 'modify' | 'defer';
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  modifications?: string; // if recommendation is 'modify'
  timestamp: string;
}

// Decision with multiple agent takes
export interface DecisionWithTakes {
  decision: NextAction;
  takes: AgentTake[];
  agreement: 'unanimous' | 'majority' | 'split' | 'none';
  bureauVerdict: {
    decision: 'approve' | 'reject' | 'review';
    reasoning: string;
    tie: boolean; // true if Bureau broke a tie
  };
}

// Chat message
export interface ChatMessage {
  id: string;
  connectionId: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
}

// Chat adapter interface (for plugging in real APIs)
export interface ChatAdapter {
  provider: AgentProvider;
  sendMessage(message: string, context?: string): Promise<string>;
  fetchTake(decisionContext: string): Promise<AgentTake>;
}

// Mock chat adapter for prototype
export class MockChatAdapter implements ChatAdapter {
  provider: AgentProvider;
  connectionId: string;
  
  constructor(provider: AgentProvider, connectionId: string) {
    this.provider = provider;
    this.connectionId = connectionId;
  }
  
  async sendMessage(message: string): Promise<string> {
    // Mock response - founder copies prompt, pastes reply
    return `[EXAMPLE RESPONSE from ${this.provider}]\n\nThis is a mock response. In production, this would be a real API call to ${this.provider}. For now, copy the prompt and paste the agent's reply here.`;
  }
  
  async fetchTake(decisionContext: string): Promise<AgentTake> {
    // Mock take for demonstration
    return {
      connectionId: this.connectionId,
      provider: this.provider,
      displayName: this.provider === 'grok-bot' ? 'Grok Bot' : 'ChatGPT',
      recommendation: 'approve',
      reasoning: `[EXAMPLE TAKE] Based on the context, I recommend approving this action. This is a mock response for demonstration.`,
      confidence: 'medium',
      timestamp: new Date().toISOString(),
    };
  }
}

// Context pack for agents
export interface BureauContextPack {
  projectName: string;
  currentFacts: {
    users: number;
    costs: number;
    revenue: number;
    blockers: string[];
  };
  pendingDecision: NextAction;
  question: string; // what Bureau is asking the agent
}

/**
 * Generate copyable context pack for agents
 */
export function generateContextPack(
  projectName: string,
  report: any,
  decision: NextAction
): string {
  const totalCosts = report.costs?.reduce((sum: number, c: any) => sum + c.amountUSD, 0) || 0;
  
  return `Bureau Context Pack for ${projectName}

**Current Facts:**
- Users: ${report.userMetrics?.nonFounder?.total || 0} (non-founder)
- Costs: $${totalCosts.toFixed(2)}
- Revenue: $${report.revenue || 0}
- Blockers: ${report.eventTracking?.blockers?.join(', ') || 'none'}

**Pending Decision:**
${decision.title}
Priority: ${decision.priority}
Founder time: ${decision.founderTimeMinutes} minutes
Reasoning: ${decision.reasoning}
Cost of waiting: ${decision.costOfWaiting}

**Agent Task if Approved:**
${decision.agentTaskBrief}

**Question for you:**
Bureau's deterministic engine recommends this action. Do you agree? Provide your take:
- Recommendation: approve | reject | modify | defer
- Reasoning: Why?
- Confidence: high | medium | low
- Modifications (if any): What changes would you suggest?

Respond in this format:
{
  "recommendation": "approve",
  "reasoning": "Your reasoning here",
  "confidence": "medium",
  "modifications": "Any suggested changes (optional)"
}`;
}
