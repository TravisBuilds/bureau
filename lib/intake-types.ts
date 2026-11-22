/**
 * Bureau - Agent Intake Types
 * Structured data requests for agent-populated streams
 */

export type StreamType = 'day-job' | 'contract' | 'project';

// Day Job Intake - What agents send about agency work (variable income)
export interface DayJobIntake {
  employer: string;              // The agency
  role: string;                  // e.g., "Senior Designer"
  payStructure: {
    basePay?: number;            // Fixed monthly component (if any)
    variablePay: boolean;        // True for agency designers
    payType: 'salary-variable' | 'hourly' | 'case-based';
  };
  
  // End clients (agencies source work from big clients)
  endClients: Array<{
    name: string;                // e.g., "Google", "Amazon", "Meta"
    isActive: boolean;
  }>;
  
  // Cases/assignments from end clients
  cases: Array<{
    id: string;
    clientName: string;          // Which end client
    caseName: string;            // Project name
    startDate: string;
    endDate?: string;
    hoursLogged: number;
    billableHours: number;
    status: 'active' | 'completed' | 'on-hold';
  }>;
  
  // Utilization and billing
  utilization: {
    currentMonth: number;        // % of hours that are billable
    average6Month: number;
  };
  
  // Monthly pay history (varying amounts)
  monthlyPayHistory: Array<{
    month: string;               // YYYY-MM
    grossPay: number;
    netPay: number;
    hoursLogged: number;
    billableHours: number;
    caseCount: number;
  }>;
  
  // Recent pay stubs (amounts vary)
  recentPayStubs: Array<{
    date: string;
    grossPay: number;
    netPay: number;
    period: string;
  }>;
  
  benefits?: string[];
}

// Contract Intake - What agents send about freelance work
export interface ContractIntake {
  clients: Array<{
    name: string;
    hourlyRate?: number;
    projectRate?: number;
    isActive: boolean;
  }>;
  recentInvoices: Array<{
    id: string;
    clientName: string;
    amount: number;
    dateIssued: string;
    dateDue: string;
    datePaid?: string;
    status: 'draft' | 'sent' | 'paid' | 'overdue';
    hoursWorked?: number;
  }>;
  monthlyHours?: number;
}

// Project Intake - What agents send about side projects
export interface ProjectIntake {
  users: { total: number; active: number; growth: string };
  revenue: { total: number; thisMonth: number; trend: string };
  costs: Array<{ service: string; amount: number; period: string }>;
  metrics: Array<{ name: string; value: number; unit: string; trend: string }>;
  decisions: Array<{ title: string; priority: number; timeAsk: string; signal: string }>;
}

// Unified intake response
export interface IntakeResponse {
  streamId: string;
  streamType: StreamType;
  data: DayJobIntake | ContractIntake | ProjectIntake;
  dataSource: string; // e.g., "Plumlist Agent" or "Mock Agent Alpha (SAMPLE DATA - not real)"
  asOf: string; // ISO date string
  requiresReview: boolean;
}
