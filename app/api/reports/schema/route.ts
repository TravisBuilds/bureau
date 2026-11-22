import { NextResponse } from 'next/server';

/**
 * GET /api/reports/schema
 * Returns the JSON schema for agent reports
 */
export async function GET() {
  const schema = {
    endpoint: '/api/reports',
    method: 'POST',
    description: 'Project agents POST status reports to Bureau',
    
    schema: {
      projectName: 'string (required) - Name of your project',
      reportDate: 'string (required) - ISO 8601 timestamp',
      productDescription: 'string (required) - 1-2 sentence description',
      
      releaseState: {
        platform: 'string[] - e.g. ["Android", "iOS", "Web"]',
        version: 'string - e.g. "v1.0.2"',
        distribution: '"app-store" | "private-preview" | "beta" | "unreleased" | "live"',
        location: 'string - e.g. "Google Drive", "App Store"',
        invitedTesters: 'number - count of invited testers',
        launchDate: 'string - ISO date if set',
        notes: 'string - optional notes',
      },
      
      userMetrics: {
        total: 'number - total auth users',
        founder: {
          accountIds: 'string[] - founder account IDs',
          activeOverDays: 'number - days founder has used it',
        },
        nonFounder: {
          total: 'number - non-founder users',
          active: 'number - users with meaningful behavior',
          withBehavior: 'number - users who did something',
        },
        activeDaysThreshold: 'number - what counts as "active on >1 day"',
      },
      
      eventTracking: {
        tracked: 'string[] - events that ARE tracked',
        notTracked: 'string[] - events that are NOT tracked (with reasons)',
        blockers: 'string[] - metrics that cannot be measured',
      },
      
      costs: {
        type: 'CostEntry[]',
        schema: {
          source: 'string - cost source name',
          amountUSD: 'number - cost in USD',
          period: 'string - e.g. "Nov 2026"',
          isEstimate: 'boolean - true = estimate, false = actual invoice',
          notes: 'string - optional notes',
        },
      },
      
      revenue: 'number - monthly revenue in USD',
      
      openWork: {
        unpushedCommits: 'number - commits ahead of origin',
        openPRs: 'number - open pull requests',
        branches: 'string[] - active branches',
      },
      
      pendingWork: {
        type: 'PendingWork[]',
        schema: {
          description: 'string - what needs to be done',
          type: '"approval" | "build" | "decision" | "migration" | "other"',
          estimatedMinutes: 'number - time to complete',
          reasoning: 'string - why this matters',
          agentDesigned: 'boolean - if agent designed the solution',
          requiredApproval: 'string - what founder must approve',
        },
      },
      
      founderTimeUnknown: 'boolean - if founder time is not tracked',
      dataSource: 'string - optional, e.g. "Project Agent (Grok Bot)"',
    },
    
    example: {
      projectName: 'Plum List',
      reportDate: '2026-11-21T00:00:00Z',
      productDescription: 'AI-powered place discovery app',
      releaseState: {
        platform: ['Android'],
        version: 'v14',
        distribution: 'private-preview',
        location: "Founder's Google Drive",
        invitedTesters: 0,
      },
      userMetrics: {
        total: 26,
        founder: {
          accountIds: ['founder-account'],
          activeOverDays: 33,
        },
        nonFounder: {
          total: 25,
          active: 6,
          withBehavior: 6,
        },
      },
      eventTracking: {
        tracked: ['saves - stored in Supabase'],
        notTracked: ['directions tap - PostHog has no key'],
        blockers: ['Later-day return - NOT measurable'],
      },
      costs: [
        {
          source: 'Google Places API',
          amountUSD: 8.72,
          period: 'Nov 2026',
          isEstimate: true,
          notes: 'Estimate from logs',
        },
      ],
      revenue: 0,
      openWork: {
        unpushedCommits: 3,
        openPRs: 2,
      },
      pendingWork: [
        {
          description: 'Return-tracking fix',
          type: 'approval',
          estimatedMinutes: 60,
          reasoning: 'Blocks retention measurement',
          agentDesigned: true,
          requiredApproval: 'Apply migration to live DB',
        },
      ],
      founderTimeUnknown: true,
    },
  };
  
  return NextResponse.json(schema, { status: 200 });
}
