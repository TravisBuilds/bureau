/**
 * Bureau Automation Rules & Logs
 * 
 * Standing rules execute routine decisions through connected agents.
 * Every run is logged and feeds the decision/outcome record.
 */

export type RuleTriggerType =
  | 'invoice-overdue'
  | 'budget-exceeded'
  | 'metric-threshold'
  | 'time-scheduled'
  | 'task-completed'
  | 'approval-received';

export type RuleActionType =
  | 'draft-message'      // Drafts message for approval
  | 'pause-agent'        // Pauses agent spending
  | 'send-notification'  // Sends notification (needs approval if external)
  | 'prepare-review'     // Prepares weekly/monthly review
  | 'update-metric'      // Updates a tracked metric
  | 'escalate';          // Escalates to founder's queue

/**
 * Standing rule set by owner
 */
export interface AutomationRule {
  id: string;
  streamId: string;
  name: string;
  enabled: boolean;
  
  // Trigger
  trigger: {
    type: RuleTriggerType;
    condition: string;           // e.g., "7 days overdue", "budget > $100"
    checkFrequency?: string;     // e.g., "hourly", "daily", "friday"
  };
  
  // Action
  action: {
    type: RuleActionType;
    details: string;             // e.g., "Draft polite reminder email"
    requiresApproval: boolean;   // Outward actions always need approval
    agentId?: string;            // Which agent executes this
  };
  
  // Metadata
  createdAt: string;
  lastTriggered?: string;
  triggerCount: number;
}

/**
 * Log entry for each automation run
 */
export interface AutomationLogEntry {
  id: string;
  streamId: string;
  ruleId: string;
  ruleName: string;
  
  // Trigger details
  triggeredAt: string;
  triggerType: RuleTriggerType;
  triggerReason: string;        // Human-readable: "Invoice #123 overdue 7 days"
  
  // Action details
  actionType: RuleActionType;
  actionTaken: string;          // What Bureau did
  agentId?: string;             // Which agent executed
  cost: number;                 // Cost of execution (API calls, etc.)
  
  // Outcome
  status: 'success' | 'failed' | 'pending-approval' | 'approved' | 'rejected';
  result?: string;              // What happened
  approvedBy?: string;          // Who approved (if needed)
  approvedAt?: string;
  
  // Links to decision record
  decisionId?: string;          // Links to decision/outcome entry
}

/**
 * Decision/Outcome Record Entry
 * 
 * Core unit: Bureau recommends a move, shows reasoning, remembers what you chose
 */
export interface DecisionOutcome {
  id: string;
  streamId: string;
  
  // The recommendation
  recommendedAt: string;
  recommendation: string;       // What Bureau recommends
  reasoning: string;            // Why (from agent report, automation trigger, etc.)
  signal: 'push' | 'keep' | 'pause' | 'kill';
  priority: number;
  
  // Source
  source: 'agent-report' | 'automation-rule' | 'manual-review';
  sourceId?: string;            // Rule ID or report ID
  
  // The choice
  chosenAction?: string;        // What founder chose
  chosenAt?: string;
  chosenBy: string;             // 'founder' or 'automation'
  
  // The outcome
  outcome?: string;             // What happened after
  outcomeRecordedAt?: string;
  cost?: number;                // Cost of executing the choice
  
  // Status
  status: 'pending' | 'chosen' | 'completed' | 'failed';
}

/**
 * Default automation rules for new streams
 */
export const DEFAULT_AUTOMATION_RULES: Partial<AutomationRule>[] = [
  {
    name: 'Weekly review preparation',
    enabled: true,
    trigger: {
      type: 'time-scheduled',
      condition: 'Every Friday at 4pm',
      checkFrequency: 'daily',
    },
    action: {
      type: 'prepare-review',
      details: 'Prepare weekly ten-hours review with priorities',
      requiresApproval: false,
    },
    triggerCount: 0,
  },
  {
    name: 'Budget cap warning',
    enabled: true,
    trigger: {
      type: 'budget-exceeded',
      condition: 'Agent spending reaches 80% of monthly cap',
      checkFrequency: 'hourly',
    },
    action: {
      type: 'send-notification',
      details: 'Notify founder that budget cap is approaching',
      requiresApproval: false,
    },
    triggerCount: 0,
  },
];

/**
 * Check if a rule should trigger based on current state
 */
export function shouldRuleTrigger(
  rule: AutomationRule,
  currentState: {
    invoices?: Array<{ daysOverdue: number }>;
    agentSpending?: number;
    budgetCap?: number;
    currentDay?: string;
    metrics?: Record<string, number>;
  }
): { shouldTrigger: boolean; reason?: string } {
  if (!rule.enabled) {
    return { shouldTrigger: false };
  }

  switch (rule.trigger.type) {
    case 'invoice-overdue': {
      const daysThreshold = parseInt(rule.trigger.condition.match(/\d+/)?.[0] || '7');
      const overdueInvoices = currentState.invoices?.filter(inv => inv.daysOverdue >= daysThreshold) || [];
      
      if (overdueInvoices.length > 0) {
        return {
          shouldTrigger: true,
          reason: `${overdueInvoices.length} invoice(s) overdue ${daysThreshold}+ days`,
        };
      }
      break;
    }

    case 'budget-exceeded': {
      if (currentState.agentSpending && currentState.budgetCap) {
        const percentage = (currentState.agentSpending / currentState.budgetCap) * 100;
        const threshold = parseInt(rule.trigger.condition.match(/\d+/)?.[0] || '80');
        
        if (percentage >= threshold) {
          return {
            shouldTrigger: true,
            reason: `Agent spending at ${percentage.toFixed(0)}% of budget cap`,
          };
        }
      }
      break;
    }

    case 'time-scheduled': {
      // Simple day-of-week check
      if (rule.trigger.condition.toLowerCase().includes('friday') && currentState.currentDay === 'Friday') {
        return {
          shouldTrigger: true,
          reason: 'Scheduled time reached: Friday',
        };
      }
      break;
    }

    case 'metric-threshold': {
      // Check if any metric crosses threshold
      const metricName = rule.trigger.condition.match(/^(\w+)/)?.[1];
      const threshold = parseInt(rule.trigger.condition.match(/\d+/)?.[0] || '0');
      
      if (metricName && currentState.metrics?.[metricName] !== undefined) {
        if (currentState.metrics[metricName] >= threshold) {
          return {
            shouldTrigger: true,
            reason: `${metricName} reached ${currentState.metrics[metricName]}`,
          };
        }
      }
      break;
    }
  }

  return { shouldTrigger: false };
}

/**
 * Execute a rule through the mock provider
 */
export async function executeAutomationRule(
  rule: AutomationRule,
  triggerReason: string
): Promise<Partial<AutomationLogEntry>> {
  // Simulate execution (in real implementation, would call agent provider)
  const cost = Math.random() * 0.5; // Small cost for automation
  
  let status: AutomationLogEntry['status'] = 'success';
  let result = '';
  
  switch (rule.action.type) {
    case 'draft-message':
      status = 'pending-approval';
      result = 'Draft prepared and sent to approval queue';
      break;
      
    case 'pause-agent':
      status = 'success';
      result = 'Agent paused to prevent budget overrun';
      break;
      
    case 'prepare-review':
      status = 'success';
      result = 'Weekly review prepared with top 3 priorities';
      break;
      
    case 'send-notification':
      if (rule.action.requiresApproval) {
        status = 'pending-approval';
        result = 'Notification draft ready for approval';
      } else {
        status = 'success';
        result = 'Internal notification sent';
      }
      break;
      
    default:
      status = 'success';
      result = 'Action completed';
  }
  
  return {
    triggeredAt: new Date().toISOString(),
    actionTaken: rule.action.details,
    cost,
    status,
    result,
  };
}
