import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { firstNameFromEmail } from '@/lib/display-name';
import { ensureDefaultWorkspaceMembership } from '@/lib/post-login';

/**
 * GET /api/oauth/me - who is approving (for the consent/device screens' default agent name).
 * Returns only the signed-in user's own email, a first-name guess and their workspace role.
 * Auto-joins the default workspace first if configured and the user has no membership yet.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let workspaceId = user.workspaceId;
  let role = user.role;
  if (!workspaceId) {
    workspaceId = await ensureDefaultWorkspaceMembership(user.id, user.email);
    if (workspaceId) {
      const refreshed = await getAuthUser();
      role = refreshed?.role ?? 'member';
    }
  }
  return NextResponse.json(
    { email: user.email, first_name: firstNameFromEmail(user.email), has_workspace: !!workspaceId, role },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
