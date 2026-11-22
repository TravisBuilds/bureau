/**
 * Bureau - Take Comparison Logic
 * Compare agent takes and derive Bureau's verdict
 */

import { AgentTake, DecisionWithTakes } from './agent-connection-types';
import { NextAction } from './agent-report-types';

/**
 * Compare agent takes and generate Bureau's verdict
 */
export function compareAgentTakes(
  decision: NextAction,
  takes: AgentTake[]
): DecisionWithTakes {
  // Determine agreement level
  const agreement = determineAgreement(takes);
  
  // Generate Bureau's verdict
  const bureauVerdict = generateBureauVerdict(decision, takes, agreement);
  
  return {
    decision,
    takes,
    agreement,
    bureauVerdict,
  };
}

/**
 * Determine agreement level among agent takes
 */
function determineAgreement(takes: AgentTake[]): 'unanimous' | 'majority' | 'split' | 'none' {
  if (takes.length === 0) return 'none';
  if (takes.length === 1) return 'unanimous';
  
  const recommendations = takes.map(t => t.recommendation);
  const uniqueRecommendations = new Set(recommendations);
  
  // All agree
  if (uniqueRecommendations.size === 1) {
    return 'unanimous';
  }
  
  // Count approves
  const approveCount = recommendations.filter(r => r === 'approve').length;
  const rejectCount = recommendations.filter(r => r === 'reject').length;
  
  // Majority (>50%)
  if (approveCount > takes.length / 2 || rejectCount > takes.length / 2) {
    return 'majority';
  }
  
  // Split decision
  return 'split';
}

/**
 * Generate Bureau's deterministic verdict
 * Bureau uses its own logic, breaking ties when agents disagree
 */
function generateBureauVerdict(
  decision: NextAction,
  takes: AgentTake[],
  agreement: string
): { decision: 'approve' | 'reject' | 'review'; reasoning: string; tie: boolean } {
  // If unanimous approval, approve
  if (agreement === 'unanimous' && takes.length > 0 && takes[0].recommendation === 'approve') {
    return {
      decision: 'approve',
      reasoning: 'All connected agents agree: approve. Bureau concurs based on deterministic analysis.',
      tie: false,
    };
  }
  
  // If unanimous rejection, review (but Bureau decides)
  if (agreement === 'unanimous' && takes.length > 0 && takes[0].recommendation === 'reject') {
    return {
      decision: 'review',
      reasoning: 'All agents recommend rejection. Bureau flags for founder review. Agents may be missing context.',
      tie: false,
    };
  }
  
  // If majority approval and high priority, approve
  if (agreement === 'majority' && decision.priority === 1) {
    const approveCount = takes.filter(t => t.recommendation === 'approve').length;
    if (approveCount > takes.length / 2) {
      return {
        decision: 'approve',
        reasoning: `Majority approval (${approveCount}/${takes.length}) + Priority 1. Bureau approves based on urgency and cost of waiting.`,
        tie: false,
      };
    }
  }
  
  // If split and blocks critical metric, approve (Bureau breaks tie)
  if (agreement === 'split' && decision.blockedMetric) {
    return {
      decision: 'approve',
      reasoning: `Split decision, but this unblocks: ${decision.blockedMetric}. Bureau breaks tie: approve. Cost of waiting is too high.`,
      tie: true,
    };
  }
  
  // If split and low founder time (<10 min), approve
  if (agreement === 'split' && decision.founderTimeMinutes < 10) {
    return {
      decision: 'approve',
      reasoning: 'Split decision, but low founder time cost (< 10 min). Bureau breaks tie: approve. Quick win.',
      tie: true,
    };
  }
  
  // Default: flag for review when agents disagree
  return {
    decision: 'review',
    reasoning: 'Agents disagree. Bureau flags for founder review. See individual takes below.',
    tie: true,
  };
}

/**
 * Find where agents disagree
 */
export function findDisagreements(takes: AgentTake[]): {
  point: string;
  positions: { agent: string; stance: string }[];
}[] {
  if (takes.length < 2) return [];
  
  const disagreements: {
    point: string;
    positions: { agent: string; stance: string }[];
  }[] = [];
  
  // Check recommendation disagreement
  const recommendations = takes.map(t => t.recommendation);
  const uniqueRecommendations = new Set(recommendations);
  
  if (uniqueRecommendations.size > 1) {
    disagreements.push({
      point: 'Recommendation',
      positions: takes.map(t => ({
        agent: t.displayName,
        stance: t.recommendation,
      })),
    });
  }
  
  // Check confidence disagreement
  const confidences = takes.map(t => t.confidence);
  const uniqueConfidences = new Set(confidences);
  
  if (uniqueConfidences.size > 1) {
    disagreements.push({
      point: 'Confidence',
      positions: takes.map(t => ({
        agent: t.displayName,
        stance: t.confidence,
      })),
    });
  }
  
  return disagreements;
}
