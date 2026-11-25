import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { deleteActivity, hideActivity } from '@/lib/activity-log';

type Ctx = { params: Promise<{ id: string }> };

/** PATCH { hidden: true }: mark one of your own entries personal (content erased). */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const user = await requireWorkspaceUser();
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    if (body?.hidden !== true) return NextResponse.json({ error: 'Only { "hidden": true } is supported' }, { status: 400 });
    const ok = await withUser(user.id, user.email, (client) => hideActivity(client, id, user.id));
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ hidden: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Error hiding activity:', error);
    return NextResponse.json({ error: 'Failed to hide entry' }, { status: 500 });
  }
}

/** DELETE: remove one of your own entries completely. */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  try {
    const user = await requireWorkspaceUser();
    const { id } = await ctx.params;
    const ok = await withUser(user.id, user.email, (client) => deleteActivity(client, id, user.id));
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Error deleting activity:', error);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }
}
