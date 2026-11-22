/**
 * Mock Agent Provider
 * Simulates async task lifecycle for development (no paid API calls)
 */

import {
  AgentProvider,
  AgentCredentials,
  ConnectedAgent,
  TaskDispatchResult,
  AgentTask,
} from '../agent-provider-interface';

// In-memory task storage for mock
const mockTasks = new Map<string, AgentTask>();
const mockConversations = new Map<string, string[]>();

export class MockProvider implements AgentProvider {
  type = 'mock' as const;
  
  async connect(params: { apiKey?: string }): Promise<AgentCredentials> {
    // Simulate connection with mock credentials
    return {
      providerId: 'mock-provider',
      type: 'mock',
      encrypted: Buffer.from(params.apiKey || 'mock-key').toString('base64'),
      createdAt: new Date().toISOString(),
    };
  }
  
  async listAgents(): Promise<ConnectedAgent[]> {
    // Return mock agents
    return [
      {
        id: 'mock-agent-1',
        providerId: 'mock-provider',
        providerType: 'mock',
        displayName: 'Mock Agent Alpha',
        capabilities: ['code', 'research', 'testing'],
        status: 'connected',
        lastActivity: new Date().toISOString(),
      },
      {
        id: 'mock-agent-2',
        providerId: 'mock-provider',
        providerType: 'mock',
        displayName: 'Mock Agent Beta',
        capabilities: ['code', 'documentation'],
        status: 'connected',
        lastActivity: new Date().toISOString(),
      },
    ];
  }
  
  async dispatchTask(
    agentId: string,
    brief: string,
    context?: string
  ): Promise<TaskDispatchResult> {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const task: AgentTask = {
      id: taskId,
      agentId,
      projectName: 'Mock Project',
      brief,
      context,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    
    mockTasks.set(taskId, task);
    
    // Simulate async task execution
    this.simulateTaskExecution(taskId);
    
    return {
      taskId,
      agentId,
      status: 'queued',
    };
  }
  
  private async simulateTaskExecution(taskId: string) {
    const task = mockTasks.get(taskId);
    if (!task) return;
    
    // Simulate queued -> running transition
    setTimeout(() => {
      const t = mockTasks.get(taskId);
      if (t) {
        t.status = 'running';
        t.startedAt = new Date().toISOString();
        mockTasks.set(taskId, t);
      }
    }, 500);
    
    // Simulate completion after 3 seconds
    setTimeout(() => {
      const t = mockTasks.get(taskId);
      if (t) {
        t.status = 'completed';
        t.completedAt = new Date().toISOString();
        t.result = `[MOCK RESULT]\n\nTask completed: "${t.brief}"\n\nThis is a simulated result from the mock provider. In production, this would be the actual agent's output.\n\nContext received: ${t.context ? 'Yes' : 'No'}\n\nSimulated execution time: 3 seconds`;
        mockTasks.set(taskId, t);
      }
    }, 3000);
  }
  
  async getTaskStatus(taskId: string): Promise<AgentTask> {
    const task = mockTasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    return task;
  }
  
  async *streamTask(taskId: string): AsyncIterableIterator<string> {
    // Simulate streaming updates
    yield 'Task queued...\n';
    await new Promise(resolve => setTimeout(resolve, 500));
    
    yield 'Task started...\n';
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    yield 'Processing brief...\n';
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    yield 'Generating response...\n';
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const task = await this.getTaskStatus(taskId);
    yield `Task completed: ${task.result}\n`;
  }
  
  async getTaskResult(taskId: string): Promise<string> {
    const task = await this.getTaskStatus(taskId);
    return task.result || 'No result yet';
  }
  
  async sendMessage(
    agentId: string,
    message: string,
    conversationId?: string
  ): Promise<{ messageId: string; response: string }> {
    const convId = conversationId || `conv-${Date.now()}`;
    const messageId = `msg-${Date.now()}`;
    
    // Store conversation
    if (!mockConversations.has(convId)) {
      mockConversations.set(convId, []);
    }
    mockConversations.get(convId)!.push(message);
    
    // Simulate response
    const response = `[MOCK RESPONSE from ${agentId}]\n\nReceived: "${message}"\n\nThis is a simulated response. In production, this would be a real agent response through the provider's chat API.`;
    
    mockConversations.get(convId)!.push(response);
    
    return { messageId, response };
  }
}
