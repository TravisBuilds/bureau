import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { deleteWorkUnit, hideWorkUnit } from '@/lib/ground-truth/work-events';

/** PATCH {hidden:true}: mark one of your units personal (content erased). DELETE: remove it. Own units only. */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await requireWorkspaceUser();
    const body = await request.json().catch(() => ({}));
    if (body?.hidden !== true) return NextResponse.json({ error: 'Only {"hidden": true} is supported' }, { status: 400 });
    const ok = await withUser(user.id, user.email, (c) => hideWorkUnit(c, id, user.id));
    return ok ? NextResponse.json({ hidden: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'Failed to hide' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await requireWorkspaceUser();
    const ok = await withUser(user.id, user.email, (c) => deleteWorkUnit(c, id, user.id));
    return ok ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
