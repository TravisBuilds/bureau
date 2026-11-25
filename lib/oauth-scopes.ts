/**
 * OAuth scope definitions and resolution logic
 */

export const ALLOWED_SCOPES = [
  'ingest:write',
  'clone:write',
  'questions:read',
  'questions:write',
  'team:read'
] as const;

export type Scope = typeof ALLOWED_SCOPES[number];

// Employee default scopes (team:read is opt-in for owner/admin)
export const DEFAULT_SCOPES: Scope[] = [
  'ingest:write',
  'clone:write',
  'questions:read',
  'questions:write'
];

// Owner/admin scopes include team:read
export const LEADER_SCOPES: Scope[] = [
  ...DEFAULT_SCOPES,
  'team:read'
];

export const SCOPE_DESCRIPTIONS: Record<Scope, string> = {
  'ingest:write': 'Post costs and activity to your streams',
  'clone:write': 'Post daily check-ins and update your profile',
  'questions:read': 'Read questions asked of you',
  'questions:write': 'Answer and escalate questions',
  'team:read': "See your team's check-ins and status"
};

/**
 * Resolve scopes for a user based on their role
 * @param requestedScopes - Scopes requested by the client (may be empty)
 * @param userRole - User's workspace role (owner, admin, member, or null)
 * @returns Final list of scopes to grant
 */
export function resolveScopes(
  requestedScopes: string[] | undefined,
  userRole: 'owner' | 'admin' | 'member' | null
): Scope[] {
  // If client requested specific scopes, validate and return those
  if (requestedScopes && requestedScopes.length > 0) {
    const validated = requestedScopes.filter((s): s is Scope => 
      ALLOWED_SCOPES.includes(s as Scope)
    );
    return validated.length > 0 ? validated : DEFAULT_SCOPES;
  }
  
  // For owner/admin with no explicit request, grant leader scopes
  if (userRole === 'owner' || userRole === 'admin') {
    return LEADER_SCOPES;
  }
  
  // Members and others get default scopes
  return DEFAULT_SCOPES;
}
