/**
 * Authentication helpers for API routes and server components
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { query } from './db';

export interface AuthUser {
  id: string;
  email: string;
  workspaceId: string | null;
  role: 'owner' | 'admin' | 'member' | null;
}

/**
 * Get authenticated user from Supabase session and their workspace ID
 * Returns null if not authenticated
 * Returns user with workspaceId=null if no workspace (needs invite)
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set() {},
      remove() {},
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user || !user.email) {
    return null;
  }

  // Get user's workspace via SECURITY DEFINER function (bureau_app can execute)
  // user_workspaces() takes no params - it reads auth.uid() from JWT claims
  try {
    const { withUser } = await import('./db');
    const { workspaceId, role } = await withUser(user.id, user.email, async (client) => {
      const result = await client.query(
        'SELECT id FROM bureau.user_workspaces() AS id'
      );
      const workspaceId: string | null = result.rows.length > 0 ? result.rows[0].id : null;
      if (!workspaceId) return { workspaceId: null, role: null };
      // Role in that workspace (workspace_members RLS lets a member read their own workspace's rows)
      const roleRows = await client.query(
        `SELECT role::text AS role FROM bureau.workspace_members
         WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL LIMIT 1`,
        [workspaceId, user.id]
      );
      return { workspaceId, role: (roleRows.rows[0]?.role ?? null) as AuthUser['role'] };
    });

    // User authenticated but no workspace (signed in without invite)
    if (!workspaceId) {
      return {
        id: user.id,
        email: user.email,
        workspaceId: null, // null indicates no workspace
        role: null,
      };
    }

    return {
      id: user.id,
      email: user.email,
      workspaceId,
      role,
    };
  } catch (error) {
    console.error('Error fetching user workspace:', error);
    throw new Error(`Failed to fetch workspace: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Require authentication - returns AuthUser or throws 401 response
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getAuthUser();
  
  if (!user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return user;
}
