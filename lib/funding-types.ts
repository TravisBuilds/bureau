/**
 * Bureau - Micro-Funding Types
 * 
 * PROTOTYPE ONLY - No real money, not an offer of securities
 */

export type OfferTermsType = 'revenue-share' | 'dividend' | 'equity';

/**
 * Revenue share terms
 * Investor receives X% of revenue until they've received Y multiple of investment
 */
export interface RevenueShareTerms {
  type: 'revenue-share';
  percentage: number;        // e.g., 10 = 10% of revenue
  cap: number;               // e.g., 1.5 = investor gets 1.5x back, then stops
}

/**
 * Dividend terms
 * Investor receives X% of profits as dividends
 */
export interface DividendTerms {
  type: 'dividend';
  percentage: number;        // e.g., 5 = 5% of profits
  duration?: string;         // Optional: "5 years", "indefinite"
}

/**
 * Equity terms
 * Investor receives X% ownership
 */
export interface EquityTerms {
  type: 'equity';
  percentage: number;        // e.g., 2 = 2% ownership
}

export type OfferTerms = RevenueShareTerms | DividendTerms | EquityTerms;

/**
 * Funding offer created by stream owner
 */
export interface FundingOffer {
  id: string;
  streamId: string;
  
  // Offer details
  targetAmount: number;         // Total amount sought
  minimumTicket: number;        // Minimum investment (e.g., $500)
  terms: OfferTerms;
  
  // Pitch
  headline: string;
  story: string;                // Markdown
  useOfFunds: Array<{
    item: string;
    amount: number;
  }>;
  
  // Status
  status: 'draft' | 'active' | 'funded' | 'closed';
  createdAt: string;
  expiresAt?: string;
  
  // Simulated commitments
  totalCommitted: number;
  commitmentCount: number;
}

/**
 * Simulated investor commitment
 * 
 * PROTOTYPE: No real money changes hands
 */
export interface InvestorCommitment {
  id: string;
  offerId: string;
  streamId: string;
  
  // Investor (simulated)
  investorName: string;
  investorEmail: string;
  
  // Commitment
  amount: number;
  committedAt: string;
  
  // Status
  status: 'pending' | 'simulated-confirmed' | 'cancelled';
  
  // Payout tracking (simulated)
  totalPaidOut: number;        // Simulated total paid to date
  lastPayoutDate?: string;
  payoutHistory: Array<{
    date: string;
    amount: number;
    source: string;             // e.g., "November 2026 revenue"
  }>;
}

/**
 * Calculate projected payouts based on historical trend
 * 
 * This is a PROJECTION, not a promise. Used for investor education only.
 */
export interface PayoutProjection {
  investmentAmount: number;
  terms: OfferTerms;
  
  // Historical baseline
  currentMonthlyRevenue: number;
  recentGrowthRate: number;    // e.g., 0.10 = 10% monthly
  
  // Projections
  projectedMonthlyPayouts: Array<{
    month: string;
    projectedRevenue: number;
    projectedPayout: number;
    cumulativePayout: number;
  }>;
  
  // Summary
  estimatedMonthsToBreakeven?: number;
  estimatedTotalReturn?: number;
  
  // Warnings
  disclaimer: string;
}

/**
 * Calculate simulated payout based on actual revenue
 * 
 * For revenue share: payout = revenue * percentage, up to cap
 */
export function calculateRevenueShareSimulatedPayout(
  commitment: InvestorCommitment,
  monthlyRevenue: number,
  terms: RevenueShareTerms
): number {
  const { amount, totalPaidOut } = commitment;
  const capAmount = amount * terms.cap;
  
  if (totalPaidOut >= capAmount) {
    return 0; // Already paid out to cap
  }
  
  const rawPayout = monthlyRevenue * (terms.percentage / 100);
  const remainingToPay = capAmount - totalPaidOut;
  
  return Math.min(rawPayout, remainingToPay);
}

/**
 * Generate payout projection for education
 */
export function generatePayoutProjection(
  investmentAmount: number,
  terms: OfferTerms,
  currentMonthlyRevenue: number,
  recentGrowthRate: number,
  monthsToProject: number = 24
): PayoutProjection {
  const projectedMonthlyPayouts: PayoutProjection['projectedMonthlyPayouts'] = [];
  let cumulativePayout = 0;
  let monthsToBreakeven: number | undefined;
  
  if (terms.type === 'revenue-share') {
    const capAmount = investmentAmount * terms.cap;
    
    for (let i = 0; i < monthsToProject; i++) {
      const projectedRevenue = currentMonthlyRevenue * Math.pow(1 + recentGrowthRate, i);
      const rawPayout = projectedRevenue * (terms.percentage / 100);
      const remainingToPay = capAmount - cumulativePayout;
      const projectedPayout = Math.min(rawPayout, remainingToPay);
      
      cumulativePayout += projectedPayout;
      
      const date = new Date();
      date.setMonth(date.getMonth() + i);
      const month = date.toISOString().substring(0, 7);
      
      projectedMonthlyPayouts.push({
        month,
        projectedRevenue: Math.round(projectedRevenue),
        projectedPayout: Math.round(projectedPayout),
        cumulativePayout: Math.round(cumulativePayout),
      });
      
      if (!monthsToBreakeven && cumulativePayout >= investmentAmount) {
        monthsToBreakeven = i + 1;
      }
      
      if (cumulativePayout >= capAmount) {
        break; // Reached cap
      }
    }
  }
  
  return {
    investmentAmount,
    terms,
    currentMonthlyRevenue,
    recentGrowthRate,
    projectedMonthlyPayouts,
    estimatedMonthsToBreakeven: monthsToBreakeven,
    estimatedTotalReturn: Math.round(cumulativePayout),
    disclaimer: 'This is a projection based on historical trends, not a promise. Actual results may vary significantly. Past performance does not guarantee future results.',
  };
}

/**
 * Default funding offer for new streams
 */
export const DEFAULT_FUNDING_OFFER: Partial<FundingOffer> = {
  status: 'draft',
  minimumTicket: 500,
  terms: {
    type: 'revenue-share',
    percentage: 10,
    cap: 1.5,
  },
  useOfFunds: [],
};
