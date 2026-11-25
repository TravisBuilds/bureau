import { requireAuth, type AuthUser } from './auth-helpers';
import { ensureDefaultWorkspaceMembership } from './post-login';

/** Signed-in user with a workspace (auto-joins the default workspace like the other team APIs). */
export async function requireWorkspaceUser(): Promise<AuthUser & { workspaceId: string }> {
  const user = await requireAuth();
  if (!user.workspaceId) {
    const joined = await ensureDefaultWorkspaceMembership(user.id, user.email);
    if (joined) user.workspaceId = joined;
  }
  if (!user.workspaceId) {
    throw new Response(JSON.stringify({ error: 'No workspace found' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  return user as AuthUser & { workspaceId: string };
}
