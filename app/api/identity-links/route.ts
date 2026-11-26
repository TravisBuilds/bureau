import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { isLeader } from '@/lib/activity-log';
import { addIdentityLink, listIdentityLinks, IntegrationInputError } from '@/lib/ground-truth/integrations';

/** GET: linked vendor accounts (leaders see everyone's; members their own). POST: link one (yourself, or anyone if leader). */
export async function GET() {
  try {
    const user = await requireWorkspaceUser();
    const out = await withUser(user.id, user.email, async (c) => {
      const leader = await isLeader(c, user.workspaceId);
      return { is_leader: leader, links: await listIdentityLinks(c, user.workspaceId, leader ? null : user.id) };
    });
    return NextResponse.json(out);
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'Failed to list identity links' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireWorkspaceUser();
    const body = await request.json().catch(() => ({}));
    const out = await withUser(user.id, user.email, (c) => addIdentityLink(c, user.workspaceId, user.id, body || {}));
    return NextResponse.json(out, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    if (error instanceof IntegrationInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if ((error as { code?: string } | null)?.code === '42501') return NextResponse.json({ error: 'You can only link your own accounts' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to link account' }, { status: 500 });
  }
}
