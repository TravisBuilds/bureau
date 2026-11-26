import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { deleteIntegration, rotateGithubSecret, updateIntegration, IntegrationInputError } from '@/lib/ground-truth/integrations';

/** PATCH: pause/resume, relabel, project_map, replace a vendor secret/key, or {rotate_secret:true} (GitHub). DELETE: disconnect. */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await requireWorkspaceUser();
    const body = await request.json().catch(() => ({}));
    const out = await withUser(user.id, user.email, async (c) => {
      if (body?.rotate_secret === true) {
        const secret = await rotateGithubSecret(c, user.workspaceId, id);
        return secret ? { signing_secret: secret } : null;
      }
      const integration = await updateIntegration(c, user.workspaceId, id, body || {});
      return integration ? { integration } : null;
    });
    if (!out) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(out);
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    if (error instanceof IntegrationInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Error updating integration:', (error instanceof Error ? error.message : 'error'));
    return NextResponse.json({ error: 'Failed to update integration' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await requireWorkspaceUser();
    const ok = await withUser(user.id, user.email, (c) => deleteIntegration(c, user.workspaceId, id));
    return ok ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    console.error('Error deleting integration:', (error instanceof Error ? error.message : 'error'));
    return NextResponse.json({ error: 'Failed to delete integration' }, { status: 500 });
  }
}
