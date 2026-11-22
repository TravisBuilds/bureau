/**
 * Bureau Pricing Model Configuration
 * 
 * All costs with sources and as-of dates
 * See docs/UNIT-ECONOMICS.md for detailed analysis
 */

export const PRICING_MODEL = {
  /**
   * Last updated
   */
  lastUpdated: '2026-11-22',

  /**
   * Target pricing per user per month
   */
  pricing: {
    standard: 39, // $39/mo per user
    team: 19, // Future: team discount
  },

  /**
   * Fixed platform costs (monthly)
   */
  fixedCosts: {
    // Free tier (0-50 users)
    free: {
      hosting: { amount: 0, service: 'Vercel Free', source: 'https://vercel.com/pricing' },
      database: { amount: 0, service: 'Supabase Free', source: 'https://supabase.com/pricing' },
      email: { amount: 0, service: 'Resend Free', source: 'https://resend.com/pricing' },
      domain: { amount: 1, service: 'Domain registration', source: 'Namecheap' },
      total: 1,
    },

    // Pro tier (50-5000 users)
    pro: {
      hosting: { amount: 20, service: 'Vercel Pro', source: 'https://vercel.com/pricing' },
      database: { amount: 25, service: 'Supabase Pro', source: 'https://supabase.com/pricing' },
      email: { amount: 20, service: 'Resend Pro', source: 'https://resend.com/pricing' },
      domain: { amount: 1, service: 'Domain registration', source: 'Namecheap' },
      total: 66,
    },

    // Enterprise tier (5000+ users)
    enterprise: {
      hosting: { amount: 20, service: 'Vercel Pro', source: 'https://vercel.com/pricing' },
      database: { amount: 599, service: 'Supabase Team', source: 'https://supabase.com/pricing' },
      email: { amount: 20, service: 'Resend Pro', source: 'https://resend.com/pricing' },
      domain: { amount: 1, service: 'Domain registration', source: 'Namecheap' },
      total: 640,
    },
  },

  /**
   * Optional add-ons (monthly)
   */
  optionalCosts: {
    xApi: { amount: 100, service: 'X API Basic', source: 'https://developer.x.com/en/portal/products/basic', note: 'Required for X/Twitter data' },
  },

  /**
   * Variable costs per user per month
   */
  variableCosts: {
    /**
     * LLM costs for weekly reviews and findings
     */
    llm: {
      // Using Claude 3.5 Haiku
      weeklyReviewInputTokens: 2000,
      weeklyReviewOutputTokens: 500,
      reviewsPerMonth: 4,
      pricePerInputToken: 0.003 / 1000, // $3 per 1M tokens
      pricePerOutputToken: 0.015 / 1000, // $15 per 1M tokens
      costPerReview: 0.0135, // (2000 * 0.003 + 500 * 0.015) / 1000
      monthlyPerUser: 0.054, // 4 reviews * $0.0135
      source: 'https://www.anthropic.com/pricing',
    },

    /**
     * Database storage per user
     */
    database: {
      bytesPerUser: 84 * 1024, // 84KB per user
      freeLimit: 500 * 1024 * 1024, // 500MB free
      overageCostPerGB: 0.125,
      breaksAtUsers: 5952, // 500MB / 84KB
      monthlyPerUser: 0, // Free up to 5K users
    },

    /**
     * Email sends per user
     */
    email: {
      sendsPerMonth: 6, // Magic links + weekly reminders
      includedInPro: 50000,
      overageCostPerEmail: 0.001, // $1 per 1000
      monthlyPerUser: 0, // Included in Resend Pro
    },

    /**
     * API sync calls
     */
    sync: {
      githubCallsPerMonth: 540,
      youtubeQuotaPerMonth: 1500,
      monthlyPerUser: 0, // Free APIs
    },

    /**
     * Total variable cost per user per month
     */
    total: 0.054, // $0.054 = ~5.4¢
  },

  /**
   * Free tier limits and break points
   */
  freeTierLimits: {
    vercelBandwidth: { limit: '100GB/mo', breaksAtUsers: 50, upgradeCost: 20 },
    supabaseDB: { limit: '500MB', breaksAtUsers: 100, upgradeCost: 25 },
    supabaseDBPro: { limit: '8GB', breaksAtUsers: 1000, upgradeCost: 574 }, // Upgrade to Team
    resendEmails: { limit: '3000/mo', breaksAtUsers: 600, upgradeCost: 20 },
    youtubeQuota: { limit: '10K units/day', breaksAtUsers: 200, upgradeCost: 0, note: 'Request increase (free)' },
  },

  /**
   * Cost per user at different scales
   */
  scaleAnalysis: [
    {
      users: 5,
      revenue: 195, // 5 * $39
      fixedCosts: 1,
      variableCosts: 0.27, // 5 * $0.054
      totalCosts: 1.27,
      profit: 193.73,
      margin: 0.993,
      costPerUser: 0.25,
    },
    {
      users: 50,
      revenue: 1950,
      fixedCosts: 66,
      variableCosts: 2.70,
      totalCosts: 68.70,
      profit: 1881.30,
      margin: 0.965,
      costPerUser: 1.37,
    },
    {
      users: 500,
      revenue: 19500,
      fixedCosts: 66,
      variableCosts: 27,
      totalCosts: 93,
      profit: 19407,
      margin: 0.995,
      costPerUser: 0.19,
    },
    {
      users: 5000,
      revenue: 195000,
      fixedCosts: 66,
      variableCosts: 270,
      totalCosts: 336,
      profit: 194664,
      margin: 0.998,
      costPerUser: 0.067,
    },
  ],

  /**
   * Break-even analysis
   */
  breakEven: {
    atStandardPricing: 2, // Need 2 users to cover $66/mo fixed costs
    atLowerPricing: 4, // At $19/mo, need 4 users
  },

  /**
   * Payment processing (future)
   */
  paymentProcessing: {
    stripeFeePercent: 0.029, // 2.9%
    stripeFeeFixed: 0.30, // $0.30 per transaction
    effectivePrice: 37.57, // $39 - 2.9% - $0.30
    marginImpact: 0.037, // 3.7% reduction
    source: 'https://stripe.com/pricing',
  },
} as const;

/**
 * Calculate total cost for a given number of users
 */
export function calculateCosts(users: number): {
  tier: 'free' | 'pro' | 'enterprise';
  fixedCosts: number;
  variableCosts: number;
  totalCosts: number;
  costPerUser: number;
  revenue: number;
  profit: number;
  margin: number;
} {
  const tier = users <= 50 ? 'free' : users <= 5000 ? 'pro' : 'enterprise';
  const fixedCosts = PRICING_MODEL.fixedCosts[tier].total;
  const variableCosts = users * PRICING_MODEL.variableCosts.total;
  const totalCosts = fixedCosts + variableCosts;
  const revenue = users * PRICING_MODEL.pricing.standard;
  const profit = revenue - totalCosts;
  const margin = revenue > 0 ? profit / revenue : 0;

  return {
    tier,
    fixedCosts,
    variableCosts,
    totalCosts,
    costPerUser: users > 0 ? totalCosts / users : 0,
    revenue,
    profit,
    margin,
  };
}

/**
 * Check which free tier limits are approaching
 */
export function checkFreeTierLimits(users: number): Array<{
  service: string;
  limit: string;
  breaksAtUsers: number;
  usagePercent: number;
  needsUpgrade: boolean;
  upgradeCost: number;
}> {
  const limits = PRICING_MODEL.freeTierLimits;
  
  return Object.entries(limits).map(([key, value]) => ({
    service: key,
    limit: value.limit,
    breaksAtUsers: value.breaksAtUsers,
    usagePercent: (users / value.breaksAtUsers) * 100,
    needsUpgrade: users >= value.breaksAtUsers,
    upgradeCost: value.upgradeCost,
  }));
}
