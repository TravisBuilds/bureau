/**
 * LLM-Powered Weekly Review Generator
 * 
 * IMPORTANT: This module makes PAID API calls to Claude/OpenAI.
 * It is DISABLED BY DEFAULT and requires explicit opt-in via:
 * - BUREAU_ENABLE_LLM_REVIEW=true
 * - ANTHROPIC_API_KEY or OPENAI_API_KEY set
 * 
 * Travis Wu has NOT approved paid API spend for this feature.
 * Do not enable without explicit approval.
 */

export interface LLMReviewConfig {
  enabled: boolean;
  provider: 'anthropic' | 'openai' | null;
  model: string | null;
}

export function getLLMConfig(): LLMReviewConfig {
  const enabled = process.env.BUREAU_ENABLE_LLM_REVIEW === 'true';
  
  if (!enabled) {
    return { enabled: false, provider: null, model: null };
  }
  
  // Check for API keys
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      enabled: true,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
    };
  }
  
  if (process.env.OPENAI_API_KEY) {
    return {
      enabled: true,
      provider: 'openai',
      model: 'gpt-4o',
    };
  }
  
  // Env var set but no API key
  console.warn('BUREAU_ENABLE_LLM_REVIEW=true but no API keys found');
  return { enabled: false, provider: null, model: null };
}

export async function generateLLMReview(data: {
  recentOutputs: Array<{ name: string; cost: number; views: number }>;
  currentBudget: number;
}): Promise<{
  objective: string;
  constraint: string;
  moves: Array<{ description: string; feasible: boolean; reason: string }>;
}> {
  const config = getLLMConfig();
  
  if (!config.enabled) {
    throw new Error('LLM review is disabled. Set BUREAU_ENABLE_LLM_REVIEW=true and add API keys.');
  }
  
  // This is where the actual LLM call would happen
  // NOT IMPLEMENTED - Requires explicit approval from Travis Wu
  
  throw new Error(
    'LLM review implementation requires Travis Wu approval for paid API spend. ' +
    'Currently using rule-based fallback.'
  );
}
