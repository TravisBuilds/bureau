import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { query, execute } from '@/lib/db';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const next = requestUrl.searchParams.get('next') || '/';

  // Check if this is a Supabase auth callback
  if (token_hash && type) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration');
      return NextResponse.redirect(
        new URL('/auth/signin?error=config-error', request.url)
      );
    }

    const cookieStore = await cookies();

    // Create Supabase client with cookie handling (manages refresh tokens)
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Route handler can set cookies
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Route handler can remove cookies
          }
        },
      },
    });

    // Verify the OTP - this sets the session cookies automatically
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as any,
    });

    if (error) {
      console.error('Supabase OTP verification error:', error);
      return NextResponse.redirect(
        new URL('/auth/signin?error=invalid-token', request.url)
      );
    }

    if (!data.user || !data.session) {
      return NextResponse.redirect(
        new URL('/auth/signin?error=invalid-token', request.url)
      );
    }

    const userId = data.user.id;
    const email = data.user.email!;

    try {
      // Note: DO NOT insert into auth.users - Supabase Auth owns that table
      // Bureau only creates workspace/membership records

      // Check if user has a workspace
      const workspaces = await query<{ id: string }>(
        `SELECT w.id FROM bureau.workspaces w
         JOIN bureau.workspace_members wm ON wm.workspace_id = w.id
         WHERE wm.user_id = $1::uuid`,
        [userId]
      );

      if (workspaces.length === 0) {
        // Create workspace for new user
        const workspaceName = `${email.split('@')[0]}'s Workspace`;

        const newWorkspace = await query<{ id: string }>(
          'INSERT INTO bureau.workspaces (name, created_by) VALUES ($1, $2::uuid) RETURNING id',
          [workspaceName, userId]
        );

        const workspaceId = newWorkspace[0].id;

        // Add user as owner
        await execute(
          `INSERT INTO bureau.workspace_members (workspace_id, user_id, role, joined_at)
           VALUES ($1::uuid, $2::uuid, 'owner', NOW())`,
          [workspaceId, userId]
        );

        // Track onboarding
        await execute(
          'INSERT INTO bureau.onboarding_progress (workspace_id, signup_completed_at) VALUES ($1::uuid, NOW())',
          [workspaceId]
        );

        // Redirect to onboarding
        return NextResponse.redirect(new URL('/onboarding', request.url));
      }

      // User has workspace, go to top floor
      return NextResponse.redirect(new URL(next === '/' ? '/top-floor' : next, request.url));
    } catch (error) {
      console.error('Error checking/creating workspace:', error);
      return NextResponse.redirect(
        new URL('/auth/signin?error=workspace-error', request.url)
      );
    }
  }

  // Not a Supabase callback, redirect to signin
  return NextResponse.redirect(new URL('/auth/signin', request.url));
}
