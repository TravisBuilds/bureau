import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { runSync } from '@/lib/ground-truth/ingest';

/** POST: sync one Drive / ElevenLabs / Higgsfield integration now (must be visible to you under RLS). */
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await requireWorkspaceUser();
    const visible = await withUser(user.id, user.email, async (c) =>
      (await c.query(
        `SELECT 1 FROM bureau.integrations WHERE id = $1 AND workspace_id = $2
           AND (owner_user_id = $3 OR (owner_user_id IS NULL AND bureau.is_workspace_leader(workspace_id)))`,
        [id, user.workspaceId, user.id]
      )).rows.length > 0
    );
    if (!visible) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [result] = await runSync(id);
    if (!result) return NextResponse.json({ error: 'Nothing to sync (paused, or not a sync source)' }, { status: 400 });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    console.error('Error syncing integration:', (error instanceof Error ? error.message : 'error'));
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
