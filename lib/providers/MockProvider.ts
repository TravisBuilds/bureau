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
import { IntakeResponse, StreamType } from '../intake-types';

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
  
  async listAgents(credentials?: AgentCredentials): Promise<ConnectedAgent[]> {
    // Return mock agents
    return [
      {
        id: 'mock-agent-1',
        providerId: 'mock-provider',
        providerType: 'mock',
        displayName: 'Mock Agent Alpha',
        capabilities: ['code', 'research', 'testing'],
        costTier: 'moderate',
        speedTier: 'fast',
        status: 'connected',
        lastActivity: new Date().toISOString(),
      },
      {
        id: 'mock-agent-2',
        providerId: 'mock-provider',
        providerType: 'mock',
        displayName: 'Mock Agent Beta',
        capabilities: ['code', 'content'],
        costTier: 'moderate',
        speedTier: 'fast',
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
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
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
  
  async requestIntake(
    streamId: string,
    streamType: StreamType,
    credentials?: AgentCredentials
  ): Promise<IntakeResponse> {
    // Return SAMPLE data clearly labeled
    if (streamType === 'day-job') {
      // SAMPLE: Agency designer with variable income based on case load
      const monthlyPay = [
        { month: '2026-06', gross: 7200, net: 5280, hours: 160, billable: 128, cases: 2 },
        { month: '2026-07', gross: 8400, net: 6160, hours: 168, billable: 148, cases: 3 },
        { month: '2026-08', gross: 6800, net: 4990, hours: 152, billable: 112, cases: 2 },
        { month: '2026-09', gross: 9100, net: 6680, hours: 176, billable: 158, cases: 4 },
        { month: '2026-10', gross: 7800, net: 5720, hours: 160, billable: 136, cases: 3 },
        { month: '2026-11', gross: 8200, net: 6020, hours: 168, billable: 142, cases: 3 },
      ];
      
      return {
        streamId,
        streamType: 'day-job',
        data: {
          employer: 'SAMPLE Creative Agency',
          role: 'Senior Designer',
          payStructure: {
            basePay: 4000,
            variablePay: true,
            payType: 'salary-variable' as const,
          },
          endClients: [
            { name: 'SAMPLE: Google', isActive: true },
            { name: 'SAMPLE: Amazon', isActive: true },
            { name: 'SAMPLE: Meta', isActive: false },
          ],
          cases: [
            {
              id: 'case-001',
              clientName: 'SAMPLE: Google',
              caseName: 'SAMPLE: Search redesign',
              startDate: '2026-10-15',
              endDate: '2026-11-30',
              hoursLogged: 48,
              billableHours: 48,
              status: 'active',
            },
            {
              id: 'case-002',
              clientName: 'SAMPLE: Amazon',
              caseName: 'SAMPLE: Prime branding',
              startDate: '2026-11-01',
              hoursLogged: 32,
              billableHours: 32,
              status: 'active',
            },
            {
              id: 'case-003',
              clientName: 'SAMPLE: Google',
              caseName: 'SAMPLE: Ads campaign',
              startDate: '2026-09-20',
              endDate: '2026-10-30',
              hoursLogged: 56,
              billableHours: 56,
              status: 'completed',
            },
          ],
          utilization: {
            currentMonth: 84.5,  // 142 billable / 168 total
            average6Month: 81.3,
          },
          monthlyPayHistory: monthlyPay.map(m => ({
            month: m.month,
            grossPay: m.gross,
            netPay: m.net,
            hoursLogged: m.hours,
            billableHours: m.billable,
            caseCount: m.cases,
          })),
          recentPayStubs: [
            {
              date: '2026-11-15',
              grossPay: 4100,  // Variable amount
              netPay: 3010,
              period: '2026-11-01 to 2026-11-15',
            },
            {
              date: '2026-10-31',
              grossPay: 3900,  // Variable amount
              netPay: 2860,
              period: '2026-10-16 to 2026-10-31',
            },
          ],
          benefits: ['SAMPLE Health insurance', 'SAMPLE 401k match (3%)'],
        },
        dataSource: 'Mock Agent Alpha (SAMPLE DATA - not real employment)',
        asOf: new Date().toISOString(),
        requiresReview: true,
      };
    }
    
    if (streamType === 'contract') {
      return {
        streamId,
        streamType: 'contract',
        data: {
          clients: [
            {
              name: 'SAMPLE Startup Inc',
              hourlyRate: 125,
              isActive: true,
            },
            {
              name: 'SAMPLE Agency Co',
              hourlyRate: 150,
              isActive: false,
            },
          ],
          recentInvoices: [
            {
              id: 'INV-001',
              clientName: 'SAMPLE Startup Inc',
              amount: 3750,
              dateIssued: '2026-11-01',
              dateDue: '2026-11-15',
              datePaid: '2026-11-14',
              status: 'paid',
              hoursWorked: 30,
            },
            {
              id: 'INV-002',
              clientName: 'SAMPLE Startup Inc',
              amount: 2500,
              dateIssued: '2026-11-15',
              dateDue: '2026-11-29',
              status: 'sent',
              hoursWorked: 20,
            },
          ],
          monthlyHours: 50,
        },
        dataSource: 'Mock Agent Beta (SAMPLE DATA - not real)',
        asOf: new Date().toISOString(),
        requiresReview: true,
      };
    }
    
    // Project type
    return {
      streamId,
      streamType: 'project',
      data: {
        users: { total: 26, active: 6, growth: '+0 this week' },
        revenue: { total: 0, thisMonth: 0, trend: 'no revenue yet' },
        costs: [
          { service: 'Google Places API', amount: 8.72, period: 'monthly' },
          { service: 'Gemini API', amount: 1.25, period: 'monthly' },
        ],
        metrics: [
          { name: 'Saves', value: 633, unit: 'total', trend: '+0 today' },
          { name: 'Return rate', value: 0, unit: '%', trend: 'unknown' },
        ],
        decisions: [
          { title: 'Fix return tracking', priority: 1, timeAsk: '15 min', signal: 'push' },
          { title: 'Push 4 unpushed syncs', priority: 2, timeAsk: '10 min', signal: 'push' },
        ],
      },
      dataSource: 'Mock Agent (Real project data, not SAMPLE)',
      asOf: new Date().toISOString(),
      requiresReview: true,
    };
  }
}
