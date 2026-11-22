/**
 * Team & Member Types for Bureau
 * 
 * Supports 1-3 people per income stream.
 * Default: single founder (no team UI clutter).
 * When second person added: show team section.
 */

export interface TeamMember {
  id: string;
  name: string;
  role: string; // "Founder", "Co-founder", "Collaborator", "Advisor"
  email?: string;
  
  // Time availability
  hoursPerWeek: number; // How much time they can contribute
  
  // Permissions
  canApprove: boolean; // Can approve tasks/spending
  canInviteHelpers: boolean; // Can connect new helper agents
  canSeeMoney: boolean; // Can see spending/earnings
  
  // Tracking
  joinedAt: string;
  lastActive: string;
}

export interface TaskAssignment {
  taskId: string;
  assignedTo: 'person' | 'helper';
  assigneeId: string; // TeamMember.id or Helper.id
  estimatedHours?: number;
  actualHours?: number;
}

export interface PersonalTimeTracking {
  memberId: string;
  weekOf: string; // ISO date of week start
  hoursSpent: number;
  tasksCompleted: number;
}

export interface IncomeStreamTeam {
  streamId: string;
  members: TeamMember[];
  totalHoursAvailable: number; // Sum of all members' hoursPerWeek
  totalHoursAsked: number; // Sum of all task estimates
}

/**
 * Helper function: Check if stream has a team (2+ people)
 */
export function hasTeam(members: TeamMember[]): boolean {
  return members.length > 1;
}

/**
 * Helper function: Get time pressure across team
 */
export function getTeamTimePressure(team: IncomeStreamTeam): {
  available: number;
  asked: number;
  pressure: 'low' | 'medium' | 'high' | 'over';
} {
  const { totalHoursAvailable, totalHoursAsked } = team;
  const ratio = totalHoursAsked / totalHoursAvailable;
  
  let pressure: 'low' | 'medium' | 'high' | 'over' = 'low';
  if (ratio > 1.0) pressure = 'over';
  else if (ratio > 0.8) pressure = 'high';
  else if (ratio > 0.5) pressure = 'medium';
  
  return {
    available: totalHoursAvailable,
    asked: totalHoursAsked,
    pressure,
  };
}

/**
 * Example: Single founder
 */
export const singleFounderExample: TeamMember = {
  id: 'founder-1',
  name: 'You',
  role: 'Founder',
  hoursPerWeek: 10,
  canApprove: true,
  canInviteHelpers: true,
  canSeeMoney: true,
  joinedAt: '2026-01-01',
  lastActive: 'Now',
};

/**
 * Example: Small team (founder + collaborator)
 */
export const smallTeamExample: TeamMember[] = [
  {
    id: 'founder-1',
    name: 'Travis',
    role: 'Founder',
    email: 'travis@example.com',
    hoursPerWeek: 10,
    canApprove: true,
    canInviteHelpers: true,
    canSeeMoney: true,
    joinedAt: '2026-01-01',
    lastActive: 'Now',
  },
  {
    id: 'collaborator-1',
    name: 'Jordan',
    role: 'Co-founder',
    email: 'jordan@example.com',
    hoursPerWeek: 5,
    canApprove: true,
    canInviteHelpers: false,
    canSeeMoney: true,
    joinedAt: '2026-02-15',
    lastActive: '2 days ago',
  },
];
