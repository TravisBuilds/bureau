/**
 * Clone lookup and name resolution
 * Finds digital clones by handle, display name, email, or partial matches
 */

export interface CloneLookupResult {
  id: string;
  display_name: string;
  handle: string;
  owner_email: string;
  owner_user_id: string;
}

export interface LookupResponse {
  found: boolean;
  clone?: CloneLookupResult;
  ambiguous: boolean;
  candidates?: CloneLookupResult[];
  error?: string;
}

/**
 * Find a clone by query string in a workspace
 * Matches against handle, display_name, owner_email
 * Supports partial matches (e.g. "jack" -> "jack-claude")
 * 
 * @param query - Search string (handle, name, email, or prefix)
 * @param workspaceId - Workspace UUID
 * @param client - Database client (must be in withUser context)
 * @returns LookupResponse with clone or candidates
 */
export async function lookupClone(
  query: string,
  workspaceId: string,
  client: any
): Promise<LookupResponse> {
  if (!query || !query.trim()) {
    return { found: false, ambiguous: false, error: 'Query is required' };
  }

  const q = query.trim().toLowerCase();

  // Try exact matches first (case-insensitive)
  const exactMatches = await client.query(
    `SELECT id, display_name, handle, owner_email, owner_user_id
     FROM bureau.digital_clones
     WHERE workspace_id = $1
     AND (
       lower(handle) = $2
       OR lower(display_name) = $2
       OR lower(owner_email) = $2
       OR lower(slack_handle) = $2
     )`,
    [workspaceId, q]
  );

  if (exactMatches.rows.length === 1) {
    return {
      found: true,
      clone: exactMatches.rows[0],
      ambiguous: false
    };
  }

  if (exactMatches.rows.length > 1) {
    return {
      found: false,
      ambiguous: true,
      candidates: exactMatches.rows
    };
  }

  // Try prefix/partial matches
  const partialMatches = await client.query(
    `SELECT id, display_name, handle, owner_email, owner_user_id
     FROM bureau.digital_clones
     WHERE workspace_id = $1
     AND (
       lower(handle) LIKE $2 || '%'
       OR lower(display_name) LIKE '%' || $2 || '%'
       OR lower(owner_email) LIKE $2 || '%'
     )
     LIMIT 10`,
    [workspaceId, q]
  );

  if (partialMatches.rows.length === 0) {
    return {
      found: false,
      ambiguous: false,
      error: `No clone found matching "${query}"`
    };
  }

  if (partialMatches.rows.length === 1) {
    return {
      found: true,
      clone: partialMatches.rows[0],
      ambiguous: false
    };
  }

  // Multiple partial matches - ambiguous
  return {
    found: false,
    ambiguous: true,
    candidates: partialMatches.rows
  };
}

/**
 * Format candidates list for user disambiguation
 */
export function formatCandidates(candidates: CloneLookupResult[]): string {
  return candidates
    .map(c => `- ${c.display_name} (@${c.handle}, ${c.owner_email})`)
    .join('\n');
}
