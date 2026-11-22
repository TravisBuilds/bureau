/**
 * Bureau - Seed Data & Business Archetypes
 * Test fixtures with realistic business scenarios
 */

import { BusinessArchetype } from './types';

/**
 * Plum List - Real baseline from founder's data
 * AI-powered consumer app for curated recommendations
 * Data from milestone1-baseline.md (actual numbers, Nov 2026)
 */
export const plumListBaseline: BusinessArchetype = {
  name: 'Plum List',
  description: 'AI-powered curated recommendation app (real baseline data from milestone1-baseline.md)',
  inputs: {
    businessName: 'Plum List',
    agentTasks: [
      {
        name: 'Places API (Nov)',
        costUSD: 8.72,
        timeMinutes: 0,
        frequency: 'one_time',
        description: 'Google Places API costs for November (estimate, not invoice)',
      },
      {
        name: 'Gemini API (since mid-Oct)',
        costUSD: 1.25,
        timeMinutes: 0,
        frequency: 'one_time',
        description: 'Gemini API costs since mid-October (estimate, not invoice)',
      },
    ],
    servingCosts: [],
    userMetrics: {
      totalUsers: 26, // All anonymous auth users
      activeUsers: 6, // Users with saves (excluding founder)
      actionsPerUserPerMonth: 0, // UNKNOWN - cannot calculate without time window
      returnRate: 0, // 0 confirmed later-day returns to saved places
      churnRate: undefined,
    },
    revenue: {
      monthlyRevenue: 0,
      revenuePerUser: 0,
      contributionMargin: undefined,
    },
    founderTime: {
      hoursPerWeek: 0, // UNKNOWN
      valuePerHour: undefined,
    },
    dataSource: 'milestone1-baseline.md (real data)',
    dataDate: '2026-11-22',
  },
  expectedVerdict: 'not_enough_evidence',
};

/**
 * Profitable SaaS - Well-established product
 */
export const profitableSaaS: BusinessArchetype = {
  name: 'DocuFlow Pro',
  description: 'AI document processing SaaS - profitable',
  inputs: {
    businessName: 'DocuFlow Pro',
    agentTasks: [
      {
        name: 'Document Processing',
        costUSD: 0.50,
        timeMinutes: 5,
        frequency: 'per_action',
        description: 'AI extracts and processes document data',
      },
      {
        name: 'Customer Support Bot',
        costUSD: 0.10,
        timeMinutes: 2,
        frequency: 'per_action',
        description: 'AI handles customer questions',
      },
    ],
    servingCosts: [
      {
        name: 'Storage & Hosting',
        costPerAction: 0.05,
        actionsPerUser: 20,
        description: 'Document storage and processing infrastructure',
      },
    ],
    userMetrics: {
      totalUsers: 50,
      activeUsers: 45,
      actionsPerUserPerMonth: 20,
      returnRate: 0.9,
      churnRate: 0.05,
    },
    revenue: {
      monthlyRevenue: 2500,
      revenuePerUser: 50,
      contributionMargin: 0.7,
    },
    founderTime: {
      hoursPerWeek: 25,
      valuePerHour: 100,
    },
    incomeTarget: {
      monthlyTargetUSD: 2000,
      reasoning: 'Need to cover living expenses before quitting day job',
    },
    dataSource: 'synthetic',
  },
  expectedVerdict: 'quit_your_day_job',
};

/**
 * Local Bakery - Traditional business
 */
export const localBakery: BusinessArchetype = {
  name: 'Sweet Dreams Bakery',
  description: 'Local bakery using AI for inventory and orders',
  inputs: {
    businessName: 'Sweet Dreams Bakery',
    agentTasks: [
      {
        name: 'Inventory Forecasting',
        costUSD: 1.00,
        timeMinutes: 10,
        frequency: 'daily',
        description: 'AI predicts daily ingredient needs',
      },
      {
        name: 'Order Management',
        costUSD: 0.05,
        timeMinutes: 1,
        frequency: 'per_action',
        description: 'AI processes online orders',
      },
      {
        name: 'Social Media Posts',
        costUSD: 0.50,
        timeMinutes: 5,
        frequency: 'daily',
        description: 'AI generates daily social content',
      },
    ],
    servingCosts: [
      {
        name: 'Ingredients & Materials',
        costPerAction: 3.50,
        actionsPerUser: 2,
        description: 'Cost of goods sold per order',
      },
    ],
    userMetrics: {
      totalUsers: 200,
      activeUsers: 180,
      actionsPerUserPerMonth: 2,
      returnRate: 0.75,
    },
    revenue: {
      monthlyRevenue: 8000,
      revenuePerUser: 40,
      contributionMargin: 0.6,
    },
    founderTime: {
      hoursPerWeek: 50,
    },
    incomeTarget: {
      monthlyTargetUSD: 4000,
    },
    dataSource: 'synthetic',
  },
  expectedVerdict: 'keep_going',
};

/**
 * Restaurant - Medium complexity
 */
export const casualRestaurant: BusinessArchetype = {
  name: 'Fresh Fork Bistro',
  description: 'Casual restaurant with AI for operations',
  inputs: {
    businessName: 'Fresh Fork Bistro',
    agentTasks: [
      {
        name: 'Menu Optimization',
        costUSD: 2.00,
        timeMinutes: 20,
        frequency: 'weekly',
        description: 'AI analyzes sales and suggests menu changes',
      },
      {
        name: 'Reservation Management',
        costUSD: 0.03,
        timeMinutes: 1,
        frequency: 'per_action',
        description: 'AI handles booking and confirmations',
      },
      {
        name: 'Staffing Forecast',
        costUSD: 1.50,
        timeMinutes: 15,
        frequency: 'weekly',
        description: 'AI predicts staffing needs',
      },
    ],
    servingCosts: [
      {
        name: 'Food & Labor',
        costPerAction: 15.00,
        actionsPerUser: 1.5,
        description: 'Per-meal COGS and labor',
      },
    ],
    userMetrics: {
      totalUsers: 400,
      activeUsers: 320,
      actionsPerUserPerMonth: 1.5,
      returnRate: 0.6,
    },
    revenue: {
      monthlyRevenue: 24000,
      revenuePerUser: 60,
      contributionMargin: 0.35,
    },
    founderTime: {
      hoursPerWeek: 60,
    },
    incomeTarget: {
      monthlyTargetUSD: 6000,
    },
    dataSource: 'synthetic',
  },
  expectedVerdict: 'keep_going',
};

/**
 * Failed Startup - Burning money
 */
export const failedStartup: BusinessArchetype = {
  name: 'AgiWear',
  description: 'AI fashion app - unsustainable unit economics',
  inputs: {
    businessName: 'AgiWear',
    agentTasks: [
      {
        name: 'Style Recommendations',
        costUSD: 1.50,
        timeMinutes: 10,
        frequency: 'per_action',
        description: 'AI generates personalized outfits',
      },
      {
        name: 'Image Generation',
        costUSD: 2.00,
        timeMinutes: 15,
        frequency: 'per_action',
        description: 'AI creates outfit visualizations',
      },
      {
        name: 'User Engagement',
        costUSD: 0.50,
        timeMinutes: 5,
        frequency: 'per_user',
        description: 'AI sends personalized messages',
      },
    ],
    servingCosts: [
      {
        name: 'Image Hosting',
        costPerAction: 0.30,
        actionsPerUser: 15,
        description: 'CDN and storage costs',
      },
    ],
    userMetrics: {
      totalUsers: 1000,
      activeUsers: 200,
      actionsPerUserPerMonth: 15,
      returnRate: 0.2,
      churnRate: 0.4,
    },
    revenue: {
      monthlyRevenue: 500,
      revenuePerUser: 0.5,
    },
    founderTime: {
      hoursPerWeek: 70,
      valuePerHour: 150,
    },
    incomeTarget: {
      monthlyTargetUSD: 5000,
    },
    dataSource: 'synthetic',
  },
  expectedVerdict: 'stop',
};

/**
 * Boutique Vineyard - High-margin specialty
 */
export const boutiqueVineyard: BusinessArchetype = {
  name: 'Sunset Vines',
  description: 'Boutique vineyard using AI for wine club and sales',
  inputs: {
    businessName: 'Sunset Vines',
    agentTasks: [
      {
        name: 'Wine Recommendations',
        costUSD: 0.20,
        timeMinutes: 3,
        frequency: 'per_action',
        description: 'AI suggests wines based on preferences',
      },
      {
        name: 'Wine Club Newsletter',
        costUSD: 5.00,
        timeMinutes: 60,
        frequency: 'monthly',
        description: 'AI writes monthly newsletter',
      },
      {
        name: 'Inventory Management',
        costUSD: 2.00,
        timeMinutes: 20,
        frequency: 'weekly',
        description: 'AI tracks vintages and stock',
      },
    ],
    servingCosts: [
      {
        name: 'Wine & Shipping',
        costPerAction: 25.00,
        actionsPerUser: 0.5,
        description: 'Cost per bottle plus shipping',
      },
    ],
    userMetrics: {
      totalUsers: 80,
      activeUsers: 65,
      actionsPerUserPerMonth: 0.5,
      returnRate: 0.85,
    },
    revenue: {
      monthlyRevenue: 3200,
      revenuePerUser: 40,
      contributionMargin: 0.5,
    },
    founderTime: {
      hoursPerWeek: 35,
    },
    incomeTarget: {
      monthlyTargetUSD: 3000,
    },
    dataSource: 'synthetic',
  },
  expectedVerdict: 'keep_going',
};

/**
 * Real Estate Agent - Service business
 */
export const realEstateAgent: BusinessArchetype = {
  name: 'Metro Homes Realty',
  description: 'Solo real estate agent using AI for lead gen',
  inputs: {
    businessName: 'Metro Homes Realty',
    agentTasks: [
      {
        name: 'Lead Qualification',
        costUSD: 0.30,
        timeMinutes: 5,
        frequency: 'per_action',
        description: 'AI qualifies incoming leads',
      },
      {
        name: 'Property Descriptions',
        costUSD: 0.50,
        timeMinutes: 10,
        frequency: 'per_action',
        description: 'AI writes listing descriptions',
      },
      {
        name: 'Market Analysis',
        costUSD: 3.00,
        timeMinutes: 30,
        frequency: 'weekly',
        description: 'AI analyzes local market trends',
      },
      {
        name: 'Follow-up Emails',
        costUSD: 0.10,
        timeMinutes: 2,
        frequency: 'per_action',
        description: 'AI sends personalized follow-ups',
      },
    ],
    servingCosts: [
      {
        name: 'Marketing & Ads',
        costPerAction: 20.00,
        actionsPerUser: 0.1,
        description: 'Cost per qualified lead',
      },
    ],
    userMetrics: {
      totalUsers: 30,
      activeUsers: 25,
      actionsPerUserPerMonth: 8,
      returnRate: 0.5,
    },
    revenue: {
      monthlyRevenue: 8000,
      revenuePerUser: 266,
      contributionMargin: 0.8,
    },
    founderTime: {
      hoursPerWeek: 45,
    },
    incomeTarget: {
      monthlyTargetUSD: 6000,
    },
    dataSource: 'synthetic',
  },
  expectedVerdict: 'keep_going',
};

/**
 * Content Creator/Dancer - Creator economy
 */
export const contentCreator: BusinessArchetype = {
  name: 'Dance Flow Studio',
  description: 'Solo dance instructor with AI-enhanced online courses',
  inputs: {
    businessName: 'Dance Flow Studio',
    agentTasks: [
      {
        name: 'Video Editing',
        costUSD: 1.00,
        timeMinutes: 20,
        frequency: 'per_action',
        description: 'AI assists with video editing',
      },
      {
        name: 'Social Media Content',
        costUSD: 0.30,
        timeMinutes: 5,
        frequency: 'daily',
        description: 'AI generates posts and captions',
      },
      {
        name: 'Student Q&A',
        costUSD: 0.15,
        timeMinutes: 3,
        frequency: 'per_action',
        description: 'AI answers student questions',
      },
    ],
    servingCosts: [
      {
        name: 'Video Hosting',
        costPerAction: 2.00,
        actionsPerUser: 1,
        description: 'Per-student video streaming costs',
      },
    ],
    userMetrics: {
      totalUsers: 120,
      activeUsers: 90,
      actionsPerUserPerMonth: 4,
      returnRate: 0.7,
      churnRate: 0.1,
    },
    revenue: {
      monthlyRevenue: 3600,
      revenuePerUser: 30,
      contributionMargin: 0.75,
    },
    founderTime: {
      hoursPerWeek: 30,
    },
    incomeTarget: {
      monthlyTargetUSD: 3000,
    },
    dataSource: 'synthetic',
  },
  expectedVerdict: 'keep_going',
};

/**
 * Early Stage - Just starting
 */
export const earlyStageIdea: BusinessArchetype = {
  name: 'RecipeAI',
  description: 'AI recipe generator - very early stage',
  inputs: {
    businessName: 'RecipeAI',
    agentTasks: [
      {
        name: 'Recipe Generation',
        costUSD: 0.25,
        timeMinutes: 5,
        frequency: 'per_action',
        description: 'AI creates custom recipes',
      },
    ],
    servingCosts: [],
    userMetrics: {
      totalUsers: 5,
      activeUsers: 3,
      actionsPerUserPerMonth: 8,
    },
    revenue: {
      monthlyRevenue: 0,
    },
    founderTime: {
      hoursPerWeek: 15,
    },
    dataSource: 'synthetic',
  },
  expectedVerdict: 'not_enough_evidence',
};

/**
 * Consulting Business - Service-based
 */
export const consultingBusiness: BusinessArchetype = {
  name: 'Strategy Plus',
  description: 'Solo consultant using AI for research and deliverables',
  inputs: {
    businessName: 'Strategy Plus',
    agentTasks: [
      {
        name: 'Research & Analysis',
        costUSD: 2.00,
        timeMinutes: 60,
        frequency: 'per_action',
        description: 'AI conducts market research',
      },
      {
        name: 'Report Generation',
        costUSD: 1.50,
        timeMinutes: 45,
        frequency: 'per_action',
        description: 'AI drafts client reports',
      },
      {
        name: 'Proposal Writing',
        costUSD: 1.00,
        timeMinutes: 30,
        frequency: 'per_action',
        description: 'AI creates project proposals',
      },
    ],
    servingCosts: [],
    userMetrics: {
      totalUsers: 8,
      activeUsers: 6,
      actionsPerUserPerMonth: 2,
      returnRate: 0.9,
    },
    revenue: {
      monthlyRevenue: 12000,
      revenuePerUser: 1500,
      contributionMargin: 0.9,
    },
    founderTime: {
      hoursPerWeek: 40,
      valuePerHour: 200,
    },
    incomeTarget: {
      monthlyTargetUSD: 8000,
    },
    dataSource: 'synthetic',
  },
  expectedVerdict: 'quit_your_day_job',
};

/**
 * All business archetypes for testing
 */
export const businessArchetypes: BusinessArchetype[] = [
  plumListBaseline,
  profitableSaaS,
  localBakery,
  casualRestaurant,
  failedStartup,
  boutiqueVineyard,
  realEstateAgent,
  contentCreator,
  earlyStageIdea,
  consultingBusiness,
];
