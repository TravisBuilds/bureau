import { NextRequest, NextResponse } from 'next/server';
import { MockProvider } from '@/lib/providers/MockProvider';
import { storeCredentials, listProjectCredentials, sanitizeForClient } from '@/lib/credential-storage';
import { PROVIDER_INFO } from '@/lib/agent-provider-interface';

/**
 * POST /api/connections
 * Connect to an agent provider (server-side only - handles credentials)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectName, providerType, apiKey, webhookUrl } = body;
    
    if (!projectName || !providerType) {
      return NextResponse.json(
        { error: 'Missing required fields: projectName, providerType' },
        { status: 400 }
      );
    }
    
    // For now, only mock provider is implemented (no paid API calls)
    if (providerType !== 'mock') {
      return NextResponse.json(
        {
          error: 'Provider not yet implemented',
          message: `${providerType} provider requires setup. See README for instructions.`,
          setupNeeded: PROVIDER_INFO[providerType as keyof typeof PROVIDER_INFO]?.setupInstructions,
        },
        { status: 501 }
      );
    }
    
    // Connect to provider
    const provider = new MockProvider();
    const credentials = await provider.connect({ apiKey });
    
    // Store credentials server-side (encrypted, never exposed to client)
    storeCredentials(
      projectName,
      credentials.providerId,
      providerType,
      apiKey || 'mock-key'
    );
    
    // List available agents
    const agents = await provider.listAgents(credentials);
    
    // Return sanitized response (no credentials)
    return NextResponse.json(
      sanitizeForClient({
        success: true,
        providerId: credentials.providerId,
        providerType,
        agents: agents.map(a => sanitizeForClient(a)),
      }),
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Connection failed', message: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/connections?projectName=X
 * List connections for a project (metadata only, no credentials)
 */
export async function GET(request: NextRequest) {
  try {
    const projectName = request.nextUrl.searchParams.get('projectName');
    
    if (!projectName) {
      return NextResponse.json(
        { error: 'Missing projectName parameter' },
        { status: 400 }
      );
    }
    
    const credentials = listProjectCredentials(projectName);
    
    // For mock provider, also list available agents
    const mockProvider = new MockProvider();
    const mockAgents = await mockProvider.listAgents({
      providerId: 'mock-provider',
      type: 'mock',
      encrypted: '',
      createdAt: new Date().toISOString(),
    });
    
    return NextResponse.json(
      sanitizeForClient({
        projectName,
        connections: credentials,
        availableAgents: mockAgents.map(a => sanitizeForClient(a)),
      }),
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list connections', message: (error as Error).message },
      { status: 500 }
    );
  }
}
