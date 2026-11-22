/**
 * Bureau - Decision Engine v2
 * Takes agent reports, derives next actions and founder signals
 */

import { AgentReport, NextAction, ProjectStatus } from './agent-report-types';

/**
 * Evaluate an agent report and derive next actions
 */
export function evaluateAgentReport(report: AgentReport): ProjectStatus {
  const nextActions = deriveNextActions(report);
  const verdict = deriveVerdict(report);
  const founderSignal = deriveFounderSignal(report, nextActions);
  
  return {
    projectName: report.projectName,
    connected: true,
    lastReportDate: report.reportDate,
    verdict,
    nextActions,
    founderSignal: founderSignal.signal,
    signalReasoning: founderSignal.reasoning,
  };
}

/**
 * Derive next actions from agent report
 * Returns 1-3 decisions only the founder can make, ranked by priority
 */
function deriveNextActions(report: AgentReport): NextAction[] {
  const actions: NextAction[] = [];
  
  // Check for pending work that blocks metrics
  report.pendingWork.forEach((work, index) => {
    if (work.type === 'approval' && work.agentDesigned) {
      const blocksMetric = report.eventTracking.blockers.find(blocker => 
        blocker.toLowerCase().includes('return') || 
        blocker.toLowerCase().includes('retention')
      );
      
      actions.push({
        priority: blocksMetric ? 1 : 2, // High priority if blocks a metric
        title: `Approve: ${work.description}`,
        reasoning: work.reasoning,
        costOfWaiting: blocksMetric 
          ? 'Cannot measure retention or validate open-to-users decision'
          : 'Delays feature development',
        founderTimeMinutes: 5, // just review and approve
        agentTaskBrief: work.requiredApproval || work.description,
        blockedMetric: blocksMetric,
        type: 'approval',
      });
    }
  });
  
  // Check for unreleased product with users
  if (report.releaseState.distribution === 'private-preview' && 
      report.userMetrics.nonFounder.total > 0) {
    const hasInvoicedCosts = report.costs.some(c => !c.isEstimate && c.amountUSD > 0);
    
    if (!hasInvoicedCosts) {
      actions.push({
        priority: 2,
        title: 'Decide: Launch capped free test',
        reasoning: 'Have real users but still private preview. Need to validate demand before scaling.',
        costOfWaiting: 'Unknown if users would pay; burning money on estimates not invoices',
        founderTimeMinutes: 15,
        agentTaskBrief: 'Set up cost monitoring, implement $50/month cap, open to 50 users max. Track conversion.',
        type: 'decision',
      });
    }
  }
  
  // Check for unpushed work or open PRs
  if (report.openWork.unpushedCommits && report.openWork.unpushedCommits > 0) {
    actions.push({
      priority: 3,
      title: `Review: ${report.openWork.unpushedCommits} unpushed commits`,
      reasoning: 'Work completed but not shared. Risk of losing progress.',
      costOfWaiting: 'Potential merge conflicts, lost work if machine fails',
      founderTimeMinutes: 10,
      agentTaskBrief: 'Push commits: git push origin main',
      type: 'review',
    });
  }
  
  // Sort by priority and return top 3
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 3);
}

/**
 * Derive one-line verdict
 */
function deriveVerdict(report: AgentReport): string {
  const totalUsers = report.userMetrics.nonFounder.total;
  const hasRevenue = report.revenue > 0;
  const totalCosts = report.costs.reduce((sum, c) => sum + c.amountUSD, 0);
  const hasBlockedMetrics = report.eventTracking.blockers.length > 0;
  
  if (totalUsers === 0) {
    return 'No users yet - still building';
  }
  
  if (hasBlockedMetrics) {
    return `${totalUsers} users, tracking incomplete - fix blockers to evaluate`;
  }
  
  if (totalCosts === 0 && !hasRevenue) {
    return `${totalUsers} users, free tier - validate willingness to pay`;
  }
  
  if (hasRevenue && report.revenue > totalCosts) {
    return `Profitable: $${report.revenue}/mo revenue, $${totalCosts.toFixed(2)} costs`;
  }
  
  return `${totalUsers} users, $${totalCosts.toFixed(2)} costs, no revenue - need pricing`;
}

/**
 * Derive founder signal: keep / pause / kill / push
 */
function deriveFounderSignal(
  report: AgentReport,
  nextActions: NextAction[]
): { signal: 'keep' | 'pause' | 'kill' | 'push'; reasoning: string } {
  const totalUsers = report.userMetrics.nonFounder.total;
  const activeUsers = report.userMetrics.nonFounder.active;
  const hasRevenue = report.revenue > 0;
  const totalCosts = report.costs.reduce((sum, c) => sum + c.amountUSD, 0);
  const hasCriticalBlockers = nextActions.some(a => a.priority === 1 && a.blockedMetric);
  
  // Kill signals
  if (totalUsers === 0 && report.releaseState.distribution === 'unreleased') {
    return {
      signal: 'kill',
      reasoning: 'No users, no launch, no progress. Cut losses.',
    };
  }
  
  // Pause signals
  if (hasCriticalBlockers && report.founderTimeUnknown) {
    return {
      signal: 'pause',
      reasoning: 'Blocked on founder decisions but no time allocated. Pause until time is available.',
    };
  }
  
  // Push signals (ready to scale)
  if (hasRevenue && report.revenue > totalCosts * 2 && activeUsers > 10) {
    return {
      signal: 'push',
      reasoning: 'Profitable with healthy margins and active users. Time to scale.',
    };
  }
  
  // Keep signals (default for active projects)
  if (totalUsers > 0 && activeUsers > 0) {
    const engagement = activeUsers / totalUsers;
    if (engagement > 0.2) {
      return {
        signal: 'keep',
        reasoning: `${Math.round(engagement * 100)}% engagement rate. Users are interested. ${hasCriticalBlockers ? 'Unblock metrics to decide next.' : 'Validate pricing.'}`,
      };
    } else {
      return {
        signal: 'keep',
        reasoning: `Low engagement (${Math.round(engagement * 100)}%), but early. Fix tracking to understand retention.`,
      };
    }
  }
  
  return {
    signal: 'keep',
    reasoning: 'Early stage. Continue building and testing.',
  };
}

/**
 * Calculate founder time asks across all projects
 */
export function calculateFounderTimeAsks(statuses: ProjectStatus[]): {
  totalMinutesAsked: number;
  byProject: { projectName: string; minutes: number }[];
} {
  const byProject = statuses.map(status => ({
    projectName: status.projectName,
    minutes: status.nextActions?.reduce((sum, action) => sum + action.founderTimeMinutes, 0) || 0,
  }));
  
  return {
    totalMinutesAsked: byProject.reduce((sum, p) => sum + p.minutes, 0),
    byProject,
  };
}
