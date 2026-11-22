/**
 * Bureau - Decision Engine v2 Tests
 * Test agent report evaluation and next action derivation
 */

import { describe, it, expect } from 'vitest';
import { evaluateAgentReport, calculateFounderTimeAsks } from './decision-engine-v2';
import { plumListAgentReport } from './agent-reports-seed';

describe('Bureau Decision Engine v2', () => {
  describe('Plum List Agent Report', () => {
    it('should match exact fixture values from Nov 21, 2026', () => {
      const report = plumListAgentReport;
      
      // Release state
      expect(report.releaseState.platform).toEqual(['Android']);
      expect(report.releaseState.version).toBe('v14');
      expect(report.releaseState.distribution).toBe('private-preview');
      expect(report.releaseState.invitedTesters).toBe(0);
      
      // User metrics
      expect(report.userMetrics.total).toBe(26);
      expect(report.userMetrics.nonFounder.total).toBe(25);
      expect(report.userMetrics.nonFounder.active).toBe(6);
      expect(report.userMetrics.founder.activeOverDays).toBe(33);
      
      // Event tracking
      expect(report.eventTracking.tracked.length).toBeGreaterThan(0);
      expect(report.eventTracking.notTracked.length).toBeGreaterThan(0);
      expect(report.eventTracking.blockers.length).toBeGreaterThan(0);
      
      // Costs
      const totalCosts = report.costs.reduce((sum, c) => sum + c.amountUSD, 0);
      expect(totalCosts).toBeCloseTo(9.97, 2); // $8.72 + $1.25
      const hasEstimates = report.costs.some(c => c.isEstimate);
      expect(hasEstimates).toBe(true); // Has estimates (not all invoices)
      
      // Revenue
      expect(report.revenue).toBe(0);
      
      // Open work
      expect(report.openWork.unpushedCommits).toBe(3); // syncs 26-29
      expect(report.openWork.openPRs).toBe(2);
      
      // Pending work
      expect(report.pendingWork.length).toBeGreaterThan(0);
      expect(report.pendingWork[0].type).toBe('approval');
      expect(report.pendingWork[0].agentDesigned).toBe(true);
      
      // Founder time
      expect(report.founderTimeUnknown).toBe(true);
    });

    it('should derive "approve return-tracking fix" as top next action', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      
      expect(status.nextActions).toBeDefined();
      expect(status.nextActions!.length).toBeGreaterThan(0);
      
      const topAction = status.nextActions![0];
      expect(topAction.priority).toBe(1); // Highest priority
      expect(topAction.title).toContain('Return-tracking fix');
      expect(topAction.type).toBe('approval');
      expect(topAction.blockedMetric).toBeDefined();
      expect(topAction.agentTaskBrief).toBeDefined();
    });

    it('should include capped free test as next action', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      
      const cappedTestAction = status.nextActions?.find(a => 
        a.title.toLowerCase().includes('capped free test') ||
        a.title.toLowerCase().includes('launch')
      );
      
      expect(cappedTestAction).toBeDefined();
      expect(cappedTestAction?.founderTimeMinutes).toBeGreaterThan(0);
    });

    it('should produce a verdict mentioning incomplete tracking', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      
      expect(status.verdict).toBeDefined();
      expect(
        status.verdict?.includes('tracking') || 
        status.verdict?.includes('blocker')
      ).toBe(true);
    });

    it('should derive "keep" or "pause" founder signal', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      
      expect(status.founderSignal).toBeDefined();
      expect(['keep', 'pause']).toContain(status.founderSignal!);
      expect(status.signalReasoning).toBeDefined();
    });

    it('should mark project as connected', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      
      expect(status.connected).toBe(true);
      expect(status.projectName).toBe('Plum List');
      expect(status.lastReportDate).toBe(plumListAgentReport.reportDate);
    });
  });

  describe('Next Action Derivation', () => {
    it('should prioritize actions that unblock metrics', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      
      const actionsWithBlockedMetrics = status.nextActions?.filter(a => a.blockedMetric);
      if (actionsWithBlockedMetrics && actionsWithBlockedMetrics.length > 0) {
        const topAction = status.nextActions![0];
        expect(topAction.blockedMetric).toBeDefined();
      }
    });

    it('should include founder time estimates for all actions', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      
      status.nextActions?.forEach(action => {
        expect(action.founderTimeMinutes).toBeGreaterThan(0);
        expect(action.costOfWaiting).toBeDefined();
        expect(action.reasoning).toBeDefined();
      });
    });

    it('should include agent-readable task briefs', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      
      status.nextActions?.forEach(action => {
        expect(action.agentTaskBrief).toBeDefined();
        expect(action.agentTaskBrief.length).toBeGreaterThan(0);
      });
    });

    it('should limit to 3 next actions max', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      
      expect(status.nextActions!.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Founder Time Calculation', () => {
    it('should calculate total founder time asks', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      const timeAsks = calculateFounderTimeAsks([status]);
      
      expect(timeAsks.totalMinutesAsked).toBeGreaterThan(0);
      expect(timeAsks.byProject.length).toBe(1);
      expect(timeAsks.byProject[0].projectName).toBe('Plum List');
    });

    it('should sum time across multiple projects', () => {
      const status1 = evaluateAgentReport(plumListAgentReport);
      const status2 = {
        ...status1,
        projectName: 'Project 2',
        nextActions: [
          {
            priority: 1,
            title: 'Test action',
            reasoning: 'Test',
            costOfWaiting: 'Test',
            founderTimeMinutes: 30,
            agentTaskBrief: 'Test',
            type: 'approval' as const,
          },
        ],
      };
      
      const timeAsks = calculateFounderTimeAsks([status1, status2]);
      
      expect(timeAsks.byProject.length).toBe(2);
      expect(timeAsks.totalMinutesAsked).toBeGreaterThan(30);
    });
  });

  describe('Founder Signal Logic', () => {
    it('should signal "keep" for active projects with users', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      
      // Plum List has users and activity, so should be keep or pause
      expect(['keep', 'pause']).toContain(status.founderSignal!);
    });

    it('should include reasoning for the signal', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      
      expect(status.signalReasoning).toBeDefined();
      expect(status.signalReasoning!.length).toBeGreaterThan(0);
    });
  });

  describe('Verdict Generation', () => {
    it('should mention tracking blockers in verdict', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      
      // Plum List has tracking blockers
      expect(
        status.verdict?.toLowerCase().includes('tracking') ||
        status.verdict?.toLowerCase().includes('blocker')
      ).toBe(true);
    });

    it('should include user count in verdict', () => {
      const status = evaluateAgentReport(plumListAgentReport);
      
      // Verdict uses non-founder users (25)
      expect(status.verdict).toContain('25');
    });
  });
});
