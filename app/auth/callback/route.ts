import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { query, execute } from '@/lib/db';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const code = requestUrl.searchParams.get('code'); // PKCE flow
  const next = requestUrl.searchParams.get('next') || '/';

  // Check if this is a Supabase auth callback (magic link or PKCE)
  if ((token_hash && type) || code) {
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

    // Verify the auth code (OTP or PKCE)
    let authData;
    
    if (token_hash && type) {
      // Magic link (OTP) flow
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
      
      authData = data;
    } else if (code) {
      // PKCE flow
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('Supabase code exchange error:', error);
        return NextResponse.redirect(
          new URL('/auth/signin?error=invalid-token', request.url)
        );
      }
      
      authData = data;
    } else {
      return NextResponse.redirect(
        new URL('/auth/signin?error=missing-params', request.url)
      );
    }

    if (!authData.user || !authData.session) {
      return NextResponse.redirect(
        new URL('/auth/signin?error=invalid-token', request.url)
      );
    }

    const userId = authData.user.id;
    const email = authData.user.email!;

    try {
      // Note: DO NOT insert into auth.users - Supabase Auth owns that table
      // Bureau only creates workspace/membership records

      // Use withUser to set JWT claims for RLS
      const { withUser, query } = await import('@/lib/db');
      
      // Read invite code from cookie
      const inviteCode = cookieStore.get('bureau_invite')?.value;
      
      // Claim invite if provided
      let inviteClaimed = false;
      if (inviteCode) {
        const claimResult = await query<{ claim_pilot_invite: boolean }>(
          'SELECT bureau.claim_pilot_invite($1, $2) as claim_pilot_invite',
          [inviteCode, userId]
        );
        inviteClaimed = claimResult[0]?.claim_pilot_invite || false;
        
        // Clear the cookie
        cookieStore.delete('bureau_invite');
      }
      
      const workspaceId = await withUser(userId, email, async (client) => {
        // Check if user has a workspace
        const workspaces = await client.query(
          `SELECT w.id FROM bureau.workspaces w
           JOIN bureau.workspace_members wm ON wm.workspace_id = w.id
           WHERE wm.user_id = $1::uuid`,
          [userId]
        );

        if (workspaces.rows.length === 0) {
          // Check if user has a valid claimed invite
          const invites = await client.query(
            `SELECT code FROM bureau.pilot_invites 
             WHERE claimed_by = $1
             AND expires_at > NOW()`,
            [userId]
          );
          
          if (invites.rows.length === 0 && !inviteClaimed) {
            // No workspace and no valid invite - redirect to invite required page
            throw new Error('INVITE_REQUIRED');
          }
          
          // Create workspace using SECURITY DEFINER function
          const workspaceName = `${email.split('@')[0]}'s Workspace`;
          const result = await client.query(
            'SELECT bureau.bootstrap_workspace($1, $2) as workspace_id',
            [workspaceName, email]
          );
          return result.rows[0].workspace_id;
        }

        return workspaces.rows[0].id;
      });

      // Check if this was a new workspace (redirect to onboarding)
      const isNew = await withUser(userId, email, async (client) => {
        const result = await client.query(
          `SELECT signup_completed_at FROM bureau.onboarding_progress 
           WHERE workspace_id = $1 
           AND signup_completed_at > NOW() - INTERVAL '1 minute'`,
          [workspaceId]
        );
        return result.rows.length > 0;
      });

      if (isNew) {
        return NextResponse.redirect(new URL('/onboarding', request.url));
      }

      // User has workspace, go to top floor
      return NextResponse.redirect(new URL(next === '/' ? '/top-floor' : next, request.url));
    } catch (error) {
      if (error instanceof Error && error.message === 'INVITE_REQUIRED') {
        return NextResponse.redirect(
          new URL('/auth/signup?error=invite-required', request.url)
        );
      }
      console.error('Error checking/creating workspace:', error);
      return NextResponse.redirect(
        new URL('/auth/signin?error=workspace-error', request.url)
      );
    }
  }

  // Not a Supabase callback, redirect to signin
  return NextResponse.redirect(new URL('/auth/signin', request.url));
}
