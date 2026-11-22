import { NextRequest, NextResponse } from 'next/server';
import { evaluateBusiness } from '@/lib/engine';
import { BusinessInputs } from '@/lib/types';

/**
 * Bureau API - Evaluate Business
 * 
 * POST /api/evaluate
 * 
 * Request body: BusinessInputs (JSON)
 * Response: BureauDecision (JSON)
 * 
 * This endpoint allows AI agents to submit business data and receive
 * deterministic decisions with agent-actionable briefs.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate that we have the required structure
    if (!body.businessName || !body.userMetrics || !body.revenue || !body.founderTime) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          message: 'Missing required fields: businessName, userMetrics, revenue, founderTime',
          schema: 'See /api/evaluate/schema for the full schema',
        },
        { status: 400 }
      );
    }

    // Evaluate the business
    const decision = evaluateBusiness(body as BusinessInputs);

    return NextResponse.json(decision, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Evaluation failed',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/evaluate
 * Returns the JSON schema for BusinessInputs
 */
export async function GET() {
  const schema = {
    endpoint: '/api/evaluate',
    method: 'POST',
    description: 'Evaluate a business and receive a decision with agent-actionable briefs',
    inputSchema: {
      businessName: 'string (required)',
      agentTasks: 'Array<AgentTask> (required)',
      servingCosts: 'Array<ServingCost> (optional)',
      userMetrics: {
        totalUsers: 'number (required)',
        activeUsers: 'number (required)',
        actionsPerUserPerMonth: 'number (required)',
        returnRate: 'number (optional, 0-1)',
        churnRate: 'number (optional, 0-1)',
      },
      revenue: {
        monthlyRevenue: 'number (required)',
        revenuePerUser: 'number (optional)',
        contributionMargin: 'number (optional, 0-1)',
      },
      founderTime: {
        hoursPerWeek: 'number (required)',
        valuePerHour: 'number (optional)',
      },
      incomeTarget: {
        monthlyTargetUSD: 'number (optional)',
        reasoning: 'string (optional)',
      },
    },
    agentTaskSchema: {
      name: 'string',
      costUSD: 'number',
      timeMinutes: 'number',
      frequency: 'per_user | per_action | one_time | daily | weekly | monthly',
      description: 'string (optional)',
    },
    outputSchema: {
      verdict: 'quit_your_day_job | keep_going | not_enough_evidence | not_yet | stop',
      confidence: 'high | medium | low',
      keyFacts: 'Array<KeyFact>',
      pricingRecommendation: 'PricingRecommendation',
      openToUsersRecommendation: 'OpenToUsersRecommendation',
      breakEvenMetrics: 'BreakEvenMetrics',
      missingData: 'Array<string> (optional)',
      agentActionBrief: 'string - Multi-line brief with VERDICT, PRIORITY, PRICING, ACCESS',
      timestamp: 'ISO 8601 string',
    },
    example: {
      businessName: 'My AI App',
      agentTasks: [
        {
          name: 'User Query Processing',
          costUSD: 0.10,
          timeMinutes: 2,
          frequency: 'per_action',
        },
      ],
      servingCosts: [],
      userMetrics: {
        totalUsers: 50,
        activeUsers: 40,
        actionsPerUserPerMonth: 10,
      },
      revenue: {
        monthlyRevenue: 500,
      },
      founderTime: {
        hoursPerWeek: 20,
      },
    },
  };

  return NextResponse.json(schema, { status: 200 });
}
