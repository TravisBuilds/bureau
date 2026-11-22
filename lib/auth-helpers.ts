/**
 * Authentication helpers for API routes and server components
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { query } from './db';

export interface AuthUser {
  id: string;
  email: string;
  workspaceId: string;
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
  try {
    const workspaces = await query<{ id: string }>(
      'SELECT * FROM bureau.user_workspaces($1)',
      [user.id]
    );

    // User authenticated but no workspace (signed in without invite)
    if (workspaces.length === 0) {
      return {
        id: user.id,
        email: user.email,
        workspaceId: '', // Empty string indicates no workspace
      };
    }

    return {
      id: user.id,
      email: user.email,
      workspaceId: workspaces[0].id,
    };
  } catch (error) {
    console.error('Error fetching user workspace:', error);
    // Return user without workspace on DB error
    return {
      id: user.id,
      email: user.email,
      workspaceId: '',
    };
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
