import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { deleteIdentityLink } from '@/lib/ground-truth/integrations';

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await requireWorkspaceUser();
    const ok = await withUser(user.id, user.email, (c) => deleteIdentityLink(c, user.workspaceId, id));
    return ok ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'Failed to unlink account' }, { status: 500 });
  }
}
