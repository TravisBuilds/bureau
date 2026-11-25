/** Scopes shared by the authorize, device and DCR endpoints. */
export const ALLOWED_SCOPES = ['ingest:write', 'clone:write', 'questions:read', 'questions:write', 'team:read'];

/** What an employee's bot gets when the client asks for nothing (team:read is opt-in). */
export const DEFAULT_SCOPES = ['ingest:write', 'clone:write', 'questions:read', 'questions:write'];

/** Accepts a space-separated string or an array; empty/missing -> DEFAULT_SCOPES. */
export function resolveScopes(input: string | string[] | null | undefined): string[] {
  const list = Array.isArray(input) ? input : (input || '').split(' ');
  const cleaned = [...new Set(list.map(s => String(s).trim()).filter(Boolean))];
  return cleaned.length ? cleaned : [...DEFAULT_SCOPES];
}
