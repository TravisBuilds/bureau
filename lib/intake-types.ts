/**
 * Bureau - Agent Intake Types
 * Structured data requests for agent-populated streams
 */

export type StreamType = 'day-job' | 'contract' | 'project';

// Day Job Intake - What agents send about a 9-5
export interface DayJobIntake {
  employer: string;
  role: string;
  payType: 'salary' | 'hourly';
  annualSalary?: number;
  hourlyRate?: number;
  payFrequency: 'weekly' | 'biweekly' | 'monthly';
  hoursPerWeek: number;
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
