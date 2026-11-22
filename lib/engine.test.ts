/**
 * Bureau - Decision Engine Tests
 * Test all business scenarios and edge cases
 */

import { describe, it, expect } from 'vitest';
import { evaluateBusiness } from './engine';
import { businessArchetypes, plumListBaseline } from './seed-data';

describe('Bureau Decision Engine', () => {
  describe('Plum List Baseline', () => {
    it('should produce "not_enough_evidence" verdict for Plum List', () => {
      const decision = evaluateBusiness(plumListBaseline.inputs);
      
      expect(decision.verdict).toBe('not_enough_evidence');
      expect(decision.confidence).toBe('medium');
      expect(decision.missingData).toBeDefined();
      expect(decision.missingData?.length).toBeGreaterThan(0);
    });

    it('should recommend free tier with cost cap for Plum List', () => {
      const decision = evaluateBusiness(plumListBaseline.inputs);
      
      expect(decision.pricingRecommendation.strategy).toBe('free_with_cap');
      expect(decision.pricingRecommendation.monthlyCostCap).toBeDefined();
      expect(decision.pricingRecommendation.monthlyCostCap).toBeGreaterThan(0);
    });

    it('should recommend keeping closed or limited access for Plum List', () => {
      const decision = evaluateBusiness(plumListBaseline.inputs);
      
      expect(['keep_closed', 'open_with_limits']).toContain(
        decision.openToUsersRecommendation.recommendation
      );
    });

    it('should calculate cost per user for Plum List', () => {
      const decision = evaluateBusiness(plumListBaseline.inputs);
      
      expect(decision.breakEvenMetrics.costPerUser).toBeGreaterThan(0);
      expect(decision.breakEvenMetrics.costPerTask).toBeDefined();
    });

    it('should include agent action briefs for Plum List', () => {
      const decision = evaluateBusiness(plumListBaseline.inputs);
      
      expect(decision.agentActionBrief).toBeDefined();
      expect(decision.agentActionBrief.length).toBeGreaterThan(0);
      expect(decision.pricingRecommendation.agentActionBrief).toBeDefined();
      expect(decision.openToUsersRecommendation.agentActionBrief).toBeDefined();
    });
  });

  describe('Business Archetypes', () => {
    it('should evaluate profitable SaaS positively', () => {
      const saas = businessArchetypes.find(b => b.name === 'DocuFlow Pro')!;
      const decision = evaluateBusiness(saas.inputs);
      
      // Should be profitable and positive
      expect(['quit_your_day_job', 'keep_going']).toContain(decision.verdict);
      expect(decision.breakEvenMetrics.monthlyBurnRate).toBeLessThan(0); // negative burn = profit
      expect(decision.confidence).toBe('high');
    });

    it('should evaluate failed startup as "stop"', () => {
      const failed = businessArchetypes.find(b => b.name === 'AgiWear')!;
      const decision = evaluateBusiness(failed.inputs);
      
      expect(decision.verdict).toBe('stop');
    });

    it('should evaluate local bakery as profitable', () => {
      const bakery = businessArchetypes.find(b => b.name === 'Sweet Dreams Bakery')!;
      const decision = evaluateBusiness(bakery.inputs);
      
      expect(['quit_your_day_job', 'keep_going']).toContain(decision.verdict);
      expect(decision.breakEvenMetrics.monthlyBurnRate).toBeLessThan(0);
    });

    it('should evaluate restaurant as profitable', () => {
      const restaurant = businessArchetypes.find(b => b.name === 'Fresh Fork Bistro')!;
      const decision = evaluateBusiness(restaurant.inputs);
      
      expect(['quit_your_day_job', 'keep_going']).toContain(decision.verdict);
      expect(decision.breakEvenMetrics.monthlyBurnRate).toBeLessThan(0);
    });

    it('should evaluate early stage idea as "not_enough_evidence"', () => {
      const early = businessArchetypes.find(b => b.name === 'RecipeAI')!;
      const decision = evaluateBusiness(early.inputs);
      
      expect(decision.verdict).toBe('not_enough_evidence');
    });

    it('should evaluate consulting business as profitable', () => {
      const consulting = businessArchetypes.find(b => b.name === 'Strategy Plus')!;
      const decision = evaluateBusiness(consulting.inputs);
      
      expect(['quit_your_day_job', 'keep_going']).toContain(decision.verdict);
    });
  });

  describe('Break-even Calculations', () => {
    it('should calculate cost per user correctly', () => {
      businessArchetypes.forEach(archetype => {
        const decision = evaluateBusiness(archetype.inputs);
        
        expect(decision.breakEvenMetrics.costPerUser).toBeGreaterThanOrEqual(0);
        expect(decision.breakEvenMetrics.breakEvenPricePerUser).toBeGreaterThanOrEqual(0);
      });
    });

    it('should calculate cost per task for all agent tasks', () => {
      const saas = businessArchetypes.find(b => b.name === 'DocuFlow Pro')!;
      const decision = evaluateBusiness(saas.inputs);
      
      saas.inputs.agentTasks.forEach(task => {
        expect(decision.breakEvenMetrics.costPerTask[task.name]).toBeDefined();
        expect(decision.breakEvenMetrics.costPerTask[task.name]).toBe(task.costUSD);
      });
    });

    it('should calculate monthly burn rate', () => {
      businessArchetypes.forEach(archetype => {
        const decision = evaluateBusiness(archetype.inputs);
        
        expect(decision.breakEvenMetrics.monthlyBurnRate).toBeDefined();
        expect(typeof decision.breakEvenMetrics.monthlyBurnRate).toBe('number');
      });
    });
  });

  describe('Key Facts', () => {
    it('should extract key facts with calculations', () => {
      const saas = businessArchetypes.find(b => b.name === 'DocuFlow Pro')!;
      const decision = evaluateBusiness(saas.inputs);
      
      expect(decision.keyFacts.length).toBeGreaterThan(0);
      
      decision.keyFacts.forEach(fact => {
        expect(fact.label).toBeDefined();
        expect(fact.value).toBeDefined();
        expect(fact.interpretation).toBeDefined();
        expect(fact.inputs).toBeDefined();
      });
    });

    it('should include user base fact', () => {
      const decision = evaluateBusiness(plumListBaseline.inputs);
      const userFact = decision.keyFacts.find(f => f.label === 'User Base');
      
      expect(userFact).toBeDefined();
      expect(userFact?.value).toBe(15);
    });

    it('should include cost per user fact', () => {
      const decision = evaluateBusiness(plumListBaseline.inputs);
      const costFact = decision.keyFacts.find(f => f.label === 'Cost per User');
      
      expect(costFact).toBeDefined();
      expect(costFact?.calculation).toBeDefined();
    });
  });

  describe('Pricing Recommendations', () => {
    it('should recommend set price for profitable businesses', () => {
      const saas = businessArchetypes.find(b => b.name === 'DocuFlow Pro')!;
      const decision = evaluateBusiness(saas.inputs);
      
      expect(decision.pricingRecommendation.strategy).toBe('set_price');
      expect(decision.pricingRecommendation.recommendedPricePerUser).toBeGreaterThan(0);
    });

    it('should recommend free with cap for early stage', () => {
      const early = businessArchetypes.find(b => b.name === 'RecipeAI')!;
      const decision = evaluateBusiness(early.inputs);
      
      expect(decision.pricingRecommendation.strategy).toBe('free_with_cap');
      expect(decision.pricingRecommendation.monthlyCostCap).toBeGreaterThan(0);
    });

    it('should include reasoning for all pricing recommendations', () => {
      businessArchetypes.forEach(archetype => {
        const decision = evaluateBusiness(archetype.inputs);
        
        expect(decision.pricingRecommendation.reasoning).toBeDefined();
        expect(decision.pricingRecommendation.reasoning.length).toBeGreaterThan(0);
      });
    });

    it('should include review dates for risky strategies', () => {
      const decision = evaluateBusiness(plumListBaseline.inputs);
      
      if (decision.pricingRecommendation.strategy === 'free_with_cap') {
        expect(decision.pricingRecommendation.reviewDate).toBeDefined();
      }
    });
  });

  describe('Open to Users Recommendations', () => {
    it('should recommend open_now for profitable businesses', () => {
      const saas = businessArchetypes.find(b => b.name === 'DocuFlow Pro')!;
      const decision = evaluateBusiness(saas.inputs);
      
      expect(['open_now', 'open_with_limits']).toContain(
        decision.openToUsersRecommendation.recommendation
      );
    });

    it('should model cost scaling with users', () => {
      const failed = businessArchetypes.find(b => b.name === 'AgiWear')!;
      const decision = evaluateBusiness(failed.inputs);
      
      // High-cost-per-user business should have limits or closure recommendation
      expect(['keep_closed', 'open_with_limits', 'review_needed']).toContain(
        decision.openToUsersRecommendation.recommendation
      );
    });

    it('should provide conditions when recommending open_with_limits', () => {
      businessArchetypes.forEach(archetype => {
        const decision = evaluateBusiness(archetype.inputs);
        
        if (decision.openToUsersRecommendation.recommendation === 'open_with_limits') {
          expect(decision.openToUsersRecommendation.conditions).toBeDefined();
          expect(decision.openToUsersRecommendation.conditions!.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Agent Action Briefs', () => {
    it('should generate overall action brief for all businesses', () => {
      businessArchetypes.forEach(archetype => {
        const decision = evaluateBusiness(archetype.inputs);
        
        expect(decision.agentActionBrief).toBeDefined();
        expect(decision.agentActionBrief.length).toBeGreaterThan(0);
        expect(decision.agentActionBrief).toContain('VERDICT:');
        expect(decision.agentActionBrief).toContain('PRIORITY:');
        expect(decision.agentActionBrief).toContain('PRICING:');
        expect(decision.agentActionBrief).toContain('ACCESS:');
      });
    });

    it('should include pricing action brief', () => {
      const decision = evaluateBusiness(plumListBaseline.inputs);
      
      expect(decision.pricingRecommendation.agentActionBrief).toBeDefined();
      expect(decision.pricingRecommendation.agentActionBrief.length).toBeGreaterThan(0);
    });

    it('should include open-to-users action brief', () => {
      const decision = evaluateBusiness(plumListBaseline.inputs);
      
      expect(decision.openToUsersRecommendation.agentActionBrief).toBeDefined();
      expect(decision.openToUsersRecommendation.agentActionBrief.length).toBeGreaterThan(0);
    });
  });

  describe('Confidence Levels', () => {
    it('should have high confidence when all data is present', () => {
      const saas = businessArchetypes.find(b => b.name === 'DocuFlow Pro')!;
      const decision = evaluateBusiness(saas.inputs);
      
      expect(decision.confidence).toBe('high');
    });

    it('should have medium or low confidence when data is missing', () => {
      const decision = evaluateBusiness(plumListBaseline.inputs);
      
      expect(['medium', 'low']).toContain(decision.confidence);
    });

    it('should list missing data when confidence is not high', () => {
      businessArchetypes.forEach(archetype => {
        const decision = evaluateBusiness(archetype.inputs);
        
        if (decision.confidence !== 'high' && decision.verdict === 'not_enough_evidence') {
          expect(decision.missingData).toBeDefined();
          expect(decision.missingData!.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Income Target Integration', () => {
    it('should consider income target when present', () => {
      const saas = businessArchetypes.find(b => b.name === 'DocuFlow Pro')!;
      const decision = evaluateBusiness(saas.inputs);
      
      // Should evaluate against target and be positive
      if (saas.inputs.incomeTarget) {
        expect(['quit_your_day_job', 'keep_going']).toContain(decision.verdict);
        expect(decision.breakEvenMetrics.monthlyBurnRate).toBeLessThan(0);
      }
    });

    it('should work without income target', () => {
      const noTarget = { ...plumListBaseline.inputs };
      delete noTarget.incomeTarget;
      
      const decision = evaluateBusiness(noTarget);
      
      expect(decision.verdict).toBeDefined();
      expect(decision.keyFacts.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero users gracefully', () => {
      const zeroUsers = {
        ...plumListBaseline.inputs,
        userMetrics: {
          totalUsers: 0,
          activeUsers: 0,
          actionsPerUserPerMonth: 0,
        },
      };
      
      const decision = evaluateBusiness(zeroUsers);
      
      expect(decision.verdict).toBe('not_enough_evidence');
      expect(decision.breakEvenMetrics.costPerUser).toBe(0);
    });

    it('should handle zero revenue gracefully', () => {
      const zeroRevenue = {
        ...plumListBaseline.inputs,
        revenue: {
          monthlyRevenue: 0,
        },
      };
      
      const decision = evaluateBusiness(zeroRevenue);
      
      expect(decision.verdict).toBeDefined();
    });

    it('should handle businesses with no agent tasks', () => {
      const noTasks = {
        ...plumListBaseline.inputs,
        agentTasks: [],
      };
      
      const decision = evaluateBusiness(noTasks);
      
      expect(decision.missingData).toContain('Agent task costs and frequencies');
    });
  });
});
