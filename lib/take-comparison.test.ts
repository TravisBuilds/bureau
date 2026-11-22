/**
 * Bureau - Take Comparison Tests
 * Test multi-agent take comparison and Bureau's tie-breaking logic
 */

import { describe, it, expect } from 'vitest';
import { compareAgentTakes, findDisagreements } from './take-comparison';
import { grokBotTakeExample, chatGPTTakeExample, unanimousApprovalExample } from './agent-takes-seed';
import { NextAction } from './agent-report-types';

const mockDecision: NextAction = {
  priority: 1,
  title: 'Approve return-tracking fix',
  reasoning: 'Blocks retention measurement',
  costOfWaiting: 'Cannot measure retention',
  founderTimeMinutes: 60,
  agentTaskBrief: 'Apply migration',
  blockedMetric: 'Later-day return to saved place',
  type: 'approval',
};

describe('Take Comparison Logic', () => {
  describe('Agreement Detection', () => {
    it('should detect unanimous agreement', () => {
      const result = compareAgentTakes(mockDecision, unanimousApprovalExample);
      
      expect(result.agreement).toBe('unanimous');
      expect(result.takes.length).toBe(2);
      expect(result.takes.every(t => t.recommendation === 'approve')).toBe(true);
    });

    it('should detect split decision', () => {
      const result = compareAgentTakes(mockDecision, [grokBotTakeExample, chatGPTTakeExample]);
      
      // Grok Bot approves, ChatGPT modifies
      expect(result.agreement).toBe('split');
      expect(result.takes[0].recommendation).toBe('approve');
      expect(result.takes[1].recommendation).toBe('modify');
    });

    it('should handle single agent as unanimous', () => {
      const result = compareAgentTakes(mockDecision, [grokBotTakeExample]);
      
      expect(result.agreement).toBe('unanimous');
    });

    it('should handle no agents', () => {
      const result = compareAgentTakes(mockDecision, []);
      
      expect(result.agreement).toBe('none');
      expect(result.takes.length).toBe(0);
    });
  });

  describe("Bureau's Verdict (Tie-Breaking)", () => {
    it('should approve when all agents agree to approve', () => {
      const result = compareAgentTakes(mockDecision, unanimousApprovalExample);
      
      expect(result.bureauVerdict.decision).toBe('approve');
      expect(result.bureauVerdict.tie).toBe(false);
      expect(result.bureauVerdict.reasoning).toContain('All connected agents agree');
    });

    it('should break ties when agents split and decision blocks a metric', () => {
      const result = compareAgentTakes(mockDecision, [grokBotTakeExample, chatGPTTakeExample]);
      
      // Split decision + blocked metric = Bureau breaks tie
      expect(result.bureauVerdict.tie).toBe(true);
      expect(result.bureauVerdict.reasoning).toContain('breaks tie');
      expect(result.bureauVerdict.reasoning).toContain(mockDecision.blockedMetric!);
    });

    it('should approve low-time-cost decisions even when split', () => {
      const lowTimeDecision: NextAction = {
        ...mockDecision,
        founderTimeMinutes: 5,
        blockedMetric: undefined,
      };
      
      const result = compareAgentTakes(lowTimeDecision, [grokBotTakeExample, chatGPTTakeExample]);
      
      expect(result.bureauVerdict.decision).toBe('approve');
      expect(result.bureauVerdict.tie).toBe(true);
      expect(result.bureauVerdict.reasoning).toContain('low founder time');
    });

    it('should flag for review when agents unanimously reject', () => {
      const rejectTakes = [
        { ...grokBotTakeExample, recommendation: 'reject' as const },
        { ...chatGPTTakeExample, recommendation: 'reject' as const },
      ];
      
      const result = compareAgentTakes(mockDecision, rejectTakes);
      
      expect(result.bureauVerdict.decision).toBe('review');
      expect(result.bureauVerdict.reasoning).toContain('recommend rejection');
    });
  });

  describe('Disagreement Detection', () => {
    it('should find recommendation disagreements', () => {
      const disagreements = findDisagreements([grokBotTakeExample, chatGPTTakeExample]);
      
      const recommendationDisagreement = disagreements.find(d => d.point === 'Recommendation');
      expect(recommendationDisagreement).toBeDefined();
      expect(recommendationDisagreement!.positions.length).toBe(2);
    });

    it('should find confidence disagreements', () => {
      const takes = [
        { ...grokBotTakeExample, confidence: 'high' as const },
        { ...chatGPTTakeExample, confidence: 'low' as const },
      ];
      
      const disagreements = findDisagreements(takes);
      
      const confidenceDisagreement = disagreements.find(d => d.point === 'Confidence');
      expect(confidenceDisagreement).toBeDefined();
    });

    it('should find no disagreements when agents agree', () => {
      const disagreements = findDisagreements(unanimousApprovalExample);
      
      expect(disagreements.length).toBe(0);
    });

    it('should handle single agent (no disagreements)', () => {
      const disagreements = findDisagreements([grokBotTakeExample]);
      
      expect(disagreements.length).toBe(0);
    });
  });

  describe('Multiple Agents Integration', () => {
    it('should handle three agents with majority', () => {
      const threeAgents = [
        grokBotTakeExample,
        chatGPTTakeExample,
        { ...grokBotTakeExample, connectionId: 'conn-3', displayName: 'Agent 3' },
      ];
      
      const result = compareAgentTakes(mockDecision, threeAgents);
      
      // 2 approve, 1 modify = majority approve
      expect(result.agreement).toBe('majority');
      expect(result.bureauVerdict).toBeDefined();
    });

    it('should preserve all takes in result', () => {
      const result = compareAgentTakes(mockDecision, [grokBotTakeExample, chatGPTTakeExample]);
      
      expect(result.takes.length).toBe(2);
      expect(result.takes[0].displayName).toBe('Grok Bot');
      expect(result.takes[1].displayName).toBe('ChatGPT 4');
    });
  });

  describe('Example Takes Validation', () => {
    it('should validate Grok Bot example take structure', () => {
      expect(grokBotTakeExample.provider).toBe('grok-bot');
      expect(grokBotTakeExample.recommendation).toBe('approve');
      expect(grokBotTakeExample.confidence).toBe('high');
      expect(grokBotTakeExample.reasoning).toContain('[EXAMPLE TAKE]');
    });

    it('should validate ChatGPT example take structure', () => {
      expect(chatGPTTakeExample.provider).toBe('chatgpt');
      expect(chatGPTTakeExample.recommendation).toBe('modify');
      expect(chatGPTTakeExample.confidence).toBe('medium');
      expect(chatGPTTakeExample.modifications).toBeDefined();
      expect(chatGPTTakeExample.reasoning).toContain('[EXAMPLE TAKE]');
    });
  });
});
