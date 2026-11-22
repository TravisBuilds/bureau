/**
 * Sample Corner Bakery - Auditable Track Record for Micro-Funding Demo
 * 
 * SAMPLE DATA - clearly labeled, excluded from Travis's real totals
 */

import { StreamAuditTrail, IncomeEntry, CostEntry, HoursEntry, DecisionEntry, MetricEntry } from './audit-types';

/**
 * Generate 6 months of sample bakery data
 */
export function generateSampleBakeryAuditTrail(): StreamAuditTrail {
  const streamId = 'sample-corner-bakery';
  const entries: any[] = [];
  
  // Generate data for last 6 months
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  const baseRevenue = 3200;
  const baseCustomers = 60;
  
  months.forEach((month, i) => {
    const growth = i * 0.1; // 10% monthly growth
    const revenue = Math.round(baseRevenue * (1 + growth));
    const customers = Math.round(baseCustomers * (1 + growth));
    const timestamp = `${month}-28T10:00:00Z`;
    
    // Income entry
    entries.push({
      id: `income-${month}`,
      timestamp,
      source: 'SAMPLE Bakery Agent (SAMPLE DATA)',
      streamId,
      type: 'income',
      amount: revenue,
      period: month,
      description: `${customers} customers this month`,
      category: 'sales',
    } as IncomeEntry);
    
    // Cost entries
    entries.push({
      id: `cost-ingredients-${month}`,
      timestamp,
      source: 'SAMPLE Bakery Agent (SAMPLE DATA)',
      streamId,
      type: 'cost',
      amount: Math.round(revenue * 0.35),
      period: month,
      service: 'Ingredients & supplies',
      category: 'cogs',
      recurring: true,
    } as CostEntry);
    
    entries.push({
      id: `cost-rent-${month}`,
      timestamp,
      source: 'SAMPLE Bakery Agent (SAMPLE DATA)',
      streamId,
      type: 'cost',
      amount: 1200,
      period: month,
      service: 'Kitchen rent',
      category: 'overhead',
      recurring: true,
    } as CostEntry);
    
    entries.push({
      id: `cost-utilities-${month}`,
      timestamp,
      source: 'SAMPLE Bakery Agent (SAMPLE DATA)',
      streamId,
      type: 'cost',
      amount: 180,
      period: month,
      service: 'Utilities',
      category: 'overhead',
      recurring: true,
    } as CostEntry);
    
    // Hours entry
    entries.push({
      id: `hours-${month}`,
      timestamp,
      source: 'Manual entry by founder',
      streamId,
      type: 'hours',
      hours: 160,
      period: month,
      description: 'Baking, deliveries, customer service',
    } as HoursEntry);
    
    // Metric entry
    entries.push({
      id: `metric-customers-${month}`,
      timestamp,
      source: 'SAMPLE Bakery Agent (SAMPLE DATA)',
      streamId,
      type: 'metric',
      name: 'Monthly customers',
      value: customers,
      unit: 'customers',
      period: month,
      trend: i > 0 ? `+${Math.round((customers - (baseCustomers * (1 + (i-1) * 0.1))) / (baseCustomers * (1 + (i-1) * 0.1)) * 100)}%` : 'baseline',
    } as MetricEntry);
  });
  
  // Add a recent decision entry
  entries.push({
    id: 'decision-nov-2026',
    timestamp: '2026-11-20T14:00:00Z',
    source: 'Bureau decision engine',
    streamId,
    type: 'decision',
    signal: 'keep',
    reasoning: 'SAMPLE: Steady 10% monthly growth, healthy margin',
    actions: ['Expand to weekend farmers market', 'Add 2 new specialty items'],
    priority: 2,
    verdict: 'Keep going - this is working',
  } as DecisionEntry);
  
  return {
    streamId,
    entries,
    createdAt: '2026-06-01T00:00:00Z',
    lastUpdated: '2026-11-22T04:00:00Z',
  };
}

/**
 * Sample bakery pitch for public view
 */
export const SAMPLE_BAKERY_PITCH = {
  headline: 'Fresh sourdough and pastries for the neighborhood',
  story: `Corner Bakery started in June 2026 when I turned my weekend hobby into a small business. I bake fresh sourdough, croissants, and seasonal pastries in a shared commercial kitchen, selling at a local farmers market and through pre-orders.

The model is simple: quality ingredients, no waste, and direct customer relationships. Every loaf is hand-shaped, every croissant is laminated by hand.

Revenue has grown 10% monthly as word spreads. I'm at capacity with current equipment and time. This raise would fund a small deck oven ($8,000) and packaging supplies ($2,000), letting me double output without doubling hours.`,
  useOfFunds: [
    { item: 'Deck oven (used)', amount: 8000 },
    { item: 'Packaging & supplies', amount: 2000 },
  ],
  targetAmount: 10000,
  minimumTicket: 500,
  terms: {
    type: 'revenue-share' as const,
    percentage: 10,
    cap: 1.5, // 1.5x multiple
  },
};
