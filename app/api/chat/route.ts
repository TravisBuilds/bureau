import { NextRequest, NextResponse } from 'next/server';
import { MockProvider } from '@/lib/providers/MockProvider';
import { getCredentials, sanitizeForClient } from '@/lib/credential-storage';

/**
 * POST /api/chat
 * Send a chat message to an agent (live chat through provider)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectName, agentId, message, conversationId } = body;
    
    if (!projectName || !agentId || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: projectName, agentId, message' },
        { status: 400 }
      );
    }
    
    // Get credentials (server-side only)
    const apiKey = getCredentials(projectName, 'mock-provider');
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'No connection found', message: 'Connect to provider first' },
        { status: 401 }
      );
    }
    
    // Send message through provider
    const provider = new MockProvider();
    const result = await provider.sendMessage(agentId, message, conversationId);
    
    return NextResponse.json(sanitizeForClient(result), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Chat message failed', message: (error as Error).message },
      { status: 500 }
    );
  }
}
