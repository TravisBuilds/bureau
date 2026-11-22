/**
 * Bureau - Decision Engine
 * Pure functions for deterministic business evaluation
 * No LLM calls - all logic is inspectable and testable
 */

import {
  BusinessInputs,
  BureauDecision,
  VerdictLevel,
  ConfidenceLevel,
  KeyFact,
  PricingRecommendation,
  OpenToUsersRecommendation,
  BreakEvenMetrics,
} from './types';

/**
 * Main decision function - evaluates a business and returns a complete decision
 */
export function evaluateBusiness(inputs: BusinessInputs): BureauDecision {
  const timestamp = new Date().toISOString();
  
  // Calculate all metrics
  const breakEvenMetrics = calculateBreakEven(inputs);
  const missingData = identifyMissingData(inputs);
  const keyFacts = extractKeyFacts(inputs, breakEvenMetrics);
  const confidence = determineConfidence(inputs, missingData);
  
  // Make core verdict
  const verdict = determineVerdict(inputs, breakEvenMetrics, missingData);
  
  // Generate recommendations
  const pricingRecommendation = generatePricingRecommendation(
    inputs,
    breakEvenMetrics,
    verdict
  );
  
  const openToUsersRecommendation = generateOpenToUsersRecommendation(
    inputs,
    breakEvenMetrics,
    verdict,
    pricingRecommendation
  );
  
  // Create overall agent action brief
  const agentActionBrief = generateAgentActionBrief(
    verdict,
    pricingRecommendation,
    openToUsersRecommendation,
    missingData
  );
  
  return {
    verdict,
    confidence,
    keyFacts,
    pricingRecommendation,
    openToUsersRecommendation,
    breakEvenMetrics,
    missingData: missingData.length > 0 ? missingData : undefined,
    timestamp,
    agentActionBrief,
  };
}

/**
 * Calculate break-even metrics
 */
function calculateBreakEven(inputs: BusinessInputs): BreakEvenMetrics {
  const { agentTasks, servingCosts, userMetrics } = inputs;
  
  // Calculate cost per task
  const costPerTask: { [taskName: string]: number } = {};
  let totalOneTimeCosts = 0;
  let totalMonthlyCosts = 0;
  
  agentTasks.forEach(task => {
    costPerTask[task.name] = task.costUSD;
    
    // Accumulate recurring costs
    if (task.frequency === 'per_user') {
      totalMonthlyCosts += task.costUSD * userMetrics.totalUsers;
    } else if (task.frequency === 'per_action') {
      totalMonthlyCosts += task.costUSD * userMetrics.actionsPerUserPerMonth * userMetrics.totalUsers;
    } else if (task.frequency === 'monthly') {
      totalMonthlyCosts += task.costUSD;
    } else if (task.frequency === 'weekly') {
      totalMonthlyCosts += task.costUSD * 4;
    } else if (task.frequency === 'daily') {
      totalMonthlyCosts += task.costUSD * 30;
    } else if (task.frequency === 'one_time') {
      totalOneTimeCosts += task.costUSD;
    }
  });
  
  // Add serving costs
  servingCosts.forEach(cost => {
    const monthlyCost = cost.costPerAction * cost.actionsPerUser * userMetrics.totalUsers;
    totalMonthlyCosts += monthlyCost;
  });
  
  // Calculate cost per user
  const costPerUser = userMetrics.totalUsers > 0 
    ? totalMonthlyCosts / userMetrics.totalUsers 
    : 0;
  
  // Break-even price per user
  const breakEvenPricePerUser = costPerUser;
  
  const calculation = `
Monthly costs: $${totalMonthlyCosts.toFixed(2)}
Total users: ${userMetrics.totalUsers}
Cost per user: $${costPerUser.toFixed(2)}
Break-even price: $${breakEvenPricePerUser.toFixed(2)}/user/month
  `.trim();
  
  return {
    costPerUser,
    costPerTask,
    breakEvenPricePerUser,
    monthlyBurnRate: totalMonthlyCosts - inputs.revenue.monthlyRevenue,
    calculation,
  };
}

/**
 * Identify missing or insufficient data
 */
function identifyMissingData(inputs: BusinessInputs): string[] {
  const missing: string[] = [];
  
  if (!inputs.agentTasks || inputs.agentTasks.length === 0) {
    missing.push('Agent task costs and frequencies');
  }
  
  if (inputs.userMetrics.totalUsers === 0) {
    missing.push('User data (currently 0 users)');
  }
  
  if (inputs.userMetrics.actionsPerUserPerMonth === 0) {
    missing.push('User engagement data (actions per user per month)');
  }
  
  if (!inputs.userMetrics.returnRate && inputs.userMetrics.returnRate !== 0) {
    missing.push('User retention data (return rate)');
  }
  
  if (inputs.revenue.monthlyRevenue === 0 && !inputs.revenue.revenuePerUser) {
    missing.push('Revenue data or pricing model');
  }
  
  if (!inputs.revenue.contributionMargin && inputs.revenue.contributionMargin !== 0) {
    missing.push('Contribution margin (revenue after variable costs)');
  }
  
  if (!inputs.founderTime.hoursPerWeek || inputs.founderTime.hoursPerWeek === 0) {
    missing.push('Founder time investment (hours per week)');
  }
  
  return missing;
}

/**
 * Extract key facts from inputs and calculations
 */
function extractKeyFacts(
  inputs: BusinessInputs,
  breakEven: BreakEvenMetrics
): KeyFact[] {
  const facts: KeyFact[] = [];
  
  // User base
  facts.push({
    label: 'User Base',
    value: inputs.userMetrics.totalUsers,
    interpretation: inputs.userMetrics.totalUsers === 0 
      ? 'No users yet - still in development'
      : `${inputs.userMetrics.activeUsers} active of ${inputs.userMetrics.totalUsers} total`,
    inputs: ['userMetrics.totalUsers', 'userMetrics.activeUsers'],
  });
  
  // Actions per user
  if (inputs.userMetrics.actionsPerUserPerMonth === 0) {
    facts.push({
      label: 'User Engagement',
      value: 'unknown',
      interpretation: 'Actions per user per month: unknown',
      inputs: ['userMetrics.actionsPerUserPerMonth'],
    });
  }
  
  // Cost per user
  facts.push({
    label: 'Cost per User',
    value: breakEven.costPerUser === 0 
      ? 'unknown' 
      : `$${breakEven.costPerUser.toFixed(2)}/month`,
    interpretation: breakEven.costPerUser === 0
      ? 'Cannot calculate without usage data'
      : `Each user costs $${breakEven.costPerUser.toFixed(2)}/month to serve`,
    calculation: breakEven.calculation,
    inputs: ['agentTasks', 'servingCosts', 'userMetrics'],
  });
  
  // Revenue
  const monthlyRevenue = inputs.revenue.monthlyRevenue;
  const revenuePerUser = inputs.userMetrics.totalUsers > 0
    ? monthlyRevenue / inputs.userMetrics.totalUsers
    : 0;
  
  facts.push({
    label: 'Monthly Revenue',
    value: `$${monthlyRevenue.toFixed(2)}`,
    interpretation: monthlyRevenue === 0
      ? 'Not monetized yet'
      : `$${revenuePerUser.toFixed(2)} per user`,
    inputs: ['revenue.monthlyRevenue', 'userMetrics.totalUsers'],
  });
  
  // Total costs to date (sum of all one-time costs)
  const oneTimeCosts = inputs.agentTasks
    .filter(task => task.frequency === 'one_time')
    .reduce((sum, task) => sum + task.costUSD, 0);
  
  if (oneTimeCosts > 0 || breakEven.monthlyBurnRate !== 0) {
    facts.push({
      label: 'Total Costs to Date',
      value: `$${oneTimeCosts.toFixed(2)}`,
      interpretation: oneTimeCosts === 0
        ? 'No costs recorded'
        : `One-time serving costs since launch`,
      calculation: inputs.agentTasks
        .filter(task => task.frequency === 'one_time')
        .map(task => `${task.name}: $${task.costUSD}`)
        .join('\n'),
      inputs: ['agentTasks'],
    });
  }
  
  // Founder time
  const founderTimeUnknown = !inputs.founderTime.hoursPerWeek || inputs.founderTime.hoursPerWeek === 0;
  facts.push({
    label: 'Founder Time',
    value: founderTimeUnknown ? 'unknown' : `${inputs.founderTime.hoursPerWeek}h/week`,
    interpretation: founderTimeUnknown
      ? 'Time investment not tracked'
      : inputs.founderTime.hoursPerWeek > 40
      ? 'More than full-time commitment'
      : inputs.founderTime.hoursPerWeek > 20
      ? 'Significant part-time commitment'
      : 'Limited time investment',
    inputs: ['founderTime.hoursPerWeek'],
  });
  
  return facts;
}

/**
 * Determine confidence level based on data completeness
 */
function determineConfidence(
  inputs: BusinessInputs,
  missingData: string[]
): ConfidenceLevel {
  if (missingData.length === 0) {
    return 'high';
  } else if (missingData.length <= 2) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Determine the verdict
 */
function determineVerdict(
  inputs: BusinessInputs,
  breakEven: BreakEvenMetrics,
  missingData: string[]
): VerdictLevel {
  // If critical data is missing, return not_enough_evidence
  if (missingData.length >= 3) {
    return 'not_enough_evidence';
  }
  
  const { monthlyRevenue, contributionMargin } = inputs.revenue;
  const { monthlyBurnRate, costPerUser } = breakEven;
  const { totalUsers, churnRate } = inputs.userMetrics;
  const { incomeTarget } = inputs;
  
  // No users yet
  if (totalUsers === 0) {
    return 'not_enough_evidence';
  }
  
  // Calculate monthly profit
  const monthlyProfit = -monthlyBurnRate; // negative burn = profit
  
  // Calculate effective margin (consider contribution margin if available)
  const revenuePerUser = totalUsers > 0 ? monthlyRevenue / totalUsers : 0;
  const profitPerUser = revenuePerUser - costPerUser;
  
  // Check if meeting income target
  if (incomeTarget) {
    const targetMet = monthlyProfit >= incomeTarget.monthlyTargetUSD;
    const halfway = monthlyProfit >= incomeTarget.monthlyTargetUSD * 0.5;
    
    if (targetMet && monthlyProfit > 0) {
      return 'quit_your_day_job';
    } else if (monthlyProfit > 0 && halfway) {
      return 'keep_going'; // Making profit, halfway to target
    } else if (monthlyProfit > 0) {
      // Profitable but not enough yet
      return 'keep_going';
    } else if (monthlyRevenue > 0 && profitPerUser > -costPerUser * 0.5) {
      // Has revenue and not too far from break-even
      return 'not_yet';
    } else {
      // Fundamentally broken: high burn, no path to profitability
      return 'stop';
    }
  }
  
  // Without income target, evaluate sustainability and growth potential
  
  // Check for fundamental problems
  const highChurn = churnRate && churnRate > 0.3; // 30% monthly churn is very high
  const negativeMargin = profitPerUser < 0;
  const heavyBurn = monthlyBurnRate > monthlyRevenue * 2; // Burning more than 2x revenue
  
  if (negativeMargin && heavyBurn && monthlyRevenue > 0) {
    // Losing money fast with no clear path
    return 'stop';
  }
  
  // Positive scenarios
  if (monthlyProfit > 0 && profitPerUser > costPerUser * 0.5) {
    // Profitable with healthy margins (revenue > 1.5x costs)
    return 'keep_going';
  } else if (monthlyProfit > 0) {
    // Profitable but tight margins
    return 'keep_going';
  } else if (monthlyProfit >= -costPerUser * totalUsers * 0.2) {
    // Close to break-even (within 20% of costs)
    return 'not_yet';
  } else if (monthlyRevenue > 0) {
    // Has revenue but losing money
    return 'not_yet';
  } else {
    // No revenue model
    return 'not_enough_evidence';
  }
}

/**
 * Generate pricing recommendation
 */
function generatePricingRecommendation(
  inputs: BusinessInputs,
  breakEven: BreakEvenMetrics,
  verdict: VerdictLevel
): PricingRecommendation {
  const { costPerUser, breakEvenPricePerUser } = breakEven;
  const { totalUsers } = inputs.userMetrics;
  const { monthlyRevenue } = inputs.revenue;
  
  // If no users yet or very early stage
  if (totalUsers === 0 || verdict === 'not_enough_evidence') {
    return {
      strategy: 'free_with_cap',
      monthlyCostCap: 50, // Conservative cap for testing
      reviewDate: getReviewDate(30),
      reasoning: 'No users yet. Start with free tier and $50/month cost cap to validate product-market fit without excessive burn.',
      agentActionBrief: 'Set up cost monitoring alerts at $40/month. Plan product validation tests with first 10-20 users.',
    };
  }
  
  // If currently free and burning money
  if (monthlyRevenue === 0 && costPerUser > 0) {
    const suggestedPrice = Math.ceil(breakEvenPricePerUser * 1.5); // 50% markup
    
    return {
      strategy: 'free_with_cap',
      recommendedPricePerUser: suggestedPrice,
      monthlyCostCap: costPerUser * Math.min(totalUsers * 2, 100), // Cap at 2x current or 100 users
      reviewDate: getReviewDate(30),
      reasoning: `Cost per user is $${costPerUser.toFixed(2)}/month. Free tier is unsustainable beyond ${Math.floor(50 / costPerUser)} users. Consider $${suggestedPrice}/user/month or implement cost cap at $${(costPerUser * Math.min(totalUsers * 2, 100)).toFixed(2)}/month.`,
      agentActionBrief: `Draft pricing page with $${suggestedPrice}/user/month option. Prepare cost cap implementation at $${(costPerUser * Math.min(totalUsers * 2, 100)).toFixed(2)}/month threshold.`,
    };
  }
  
  // If profitable
  if (monthlyRevenue > costPerUser * totalUsers) {
    return {
      strategy: 'set_price',
      recommendedPricePerUser: monthlyRevenue / totalUsers,
      reasoning: `Current pricing ($${(monthlyRevenue / totalUsers).toFixed(2)}/user) is profitable. Maintain current pricing while growing user base.`,
      agentActionBrief: 'Focus on user acquisition and retention. Monitor unit economics monthly.',
    };
  }
  
  // Default: needs pricing strategy
  const suggestedPrice = Math.ceil(breakEvenPricePerUser * 1.5);
  return {
    strategy: 'set_price',
    recommendedPricePerUser: suggestedPrice,
    reasoning: `Need $${breakEvenPricePerUser.toFixed(2)}/user to break even. Recommend $${suggestedPrice}/user/month (50% margin for growth).`,
    agentActionBrief: `Create pricing tier: $${suggestedPrice}/user/month. Prepare grandfather clause for existing free users.`,
  };
}

/**
 * Generate open-to-users recommendation
 */
function generateOpenToUsersRecommendation(
  inputs: BusinessInputs,
  breakEven: BreakEvenMetrics,
  verdict: VerdictLevel,
  pricing: PricingRecommendation
): OpenToUsersRecommendation {
  const { costPerUser } = breakEven;
  const { totalUsers } = inputs.userMetrics;
  const { monthlyRevenue } = inputs.revenue;
  
  // Model: cost grows linearly with users, revenue grows linearly with paid users
  const currentPayingRate = monthlyRevenue > 0 && totalUsers > 0
    ? monthlyRevenue / (costPerUser * totalUsers)
    : 0;
  
  // Not ready to open if no cost controls
  if (verdict === 'not_enough_evidence' || totalUsers === 0) {
    return {
      recommendation: 'keep_closed',
      reasoning: 'Insufficient data to model cost scaling. Need baseline metrics with real users before opening.',
      conditions: [
        'Test with 10-20 invited users',
        'Measure actual cost per user',
        'Validate core value proposition',
      ],
      reviewDate: getReviewDate(14),
      agentActionBrief: 'Set up private beta: invite 10-20 users, implement usage tracking, measure per-user costs for 2 weeks.',
    };
  }
  
  // Can open with limits if cost is manageable
  if (costPerUser > 0 && pricing.monthlyCostCap) {
    const maxUsers = Math.floor(pricing.monthlyCostCap / costPerUser);
    
    return {
      recommendation: 'open_with_limits',
      reasoning: `Cost scales at $${costPerUser.toFixed(2)}/user. With $${pricing.monthlyCostCap}/month cap, can safely serve up to ${maxUsers} users. ${pricing.strategy === 'free_with_cap' ? 'Free tier with hard cost limits.' : 'Monitor costs closely.'}`,
      conditions: [
        `Cap total users at ${maxUsers}`,
        `Implement cost alerts at $${(pricing.monthlyCostCap * 0.8).toFixed(2)}`,
        'Review economics weekly',
      ],
      reviewDate: getReviewDate(30),
      agentActionBrief: `Implement waitlist after ${maxUsers} users. Set up cost monitoring dashboard. Configure automated user cap at ${maxUsers}.`,
    };
  }
  
  // Can open if profitable or break-even
  if (monthlyRevenue >= costPerUser * totalUsers) {
    return {
      recommendation: 'open_now',
      reasoning: 'Unit economics are positive. Each user generates more than they cost. Safe to scale.',
      reviewDate: getReviewDate(90),
      agentActionBrief: 'Remove waitlist. Focus on growth marketing. Set up automated unit economics tracking.',
    };
  }
  
  // Default: needs review
  return {
    recommendation: 'review_needed',
    reasoning: 'Cost-to-revenue ratio unclear. Need pricing strategy before scaling user base.',
    conditions: [
      'Implement pricing or cost controls',
      'Measure user lifetime value',
      'Validate willingness to pay',
      ],
    reviewDate: getReviewDate(7),
    agentActionBrief: 'Survey existing users on willingness to pay. Test pricing with next 50 sign-ups. Calculate LTV.',
  };
}

/**
 * Generate overall agent action brief
 */
function generateAgentActionBrief(
  verdict: VerdictLevel,
  pricing: PricingRecommendation,
  openToUsers: OpenToUsersRecommendation,
  missingData: string[]
): string {
  const actions: string[] = [];
  
  // Add verdict-specific actions
  switch (verdict) {
    case 'quit_your_day_job':
      actions.push('VERDICT: Business is profitable and meeting income target.');
      actions.push('PRIORITY: Focus on sustainable growth and operations.');
      break;
    case 'keep_going':
      actions.push('VERDICT: Business shows positive trajectory.');
      actions.push('PRIORITY: Optimize unit economics and scale user acquisition.');
      break;
    case 'not_enough_evidence':
      actions.push('VERDICT: Insufficient data to make recommendation.');
      actions.push(`PRIORITY: Collect missing data: ${missingData.join(', ')}`);
      break;
    case 'not_yet':
      actions.push('VERDICT: Business not viable yet, but path exists.');
      actions.push('PRIORITY: Implement pricing/cost controls to reach sustainability.');
      break;
    case 'stop':
      actions.push('VERDICT: Business model not viable.');
      actions.push('PRIORITY: Pivot or shut down. Fundamental economics are broken.');
      break;
  }
  
  // Add pricing action
  actions.push(`PRICING: ${pricing.agentActionBrief}`);
  
  // Add open-to-users action
  actions.push(`ACCESS: ${openToUsers.agentActionBrief}`);
  
  return actions.join('\n');
}

/**
 * Helper: get a review date N days from now
 */
function getReviewDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}
