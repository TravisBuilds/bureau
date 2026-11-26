import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/activity-auth';
import { activityKeyConfigured } from '@/lib/activity-crypto';
import { isLeader } from '@/lib/activity-log';
import { createIntegration, listIntegrations, IntegrationInputError } from '@/lib/ground-truth/integrations';

/**
 * GET  /api/integrations - connected sources you can see (leaders: all workspace sources + every
 *      personal one; members: their own personal ones). Secrets are never returned.
 * POST /api/integrations - connect a source. Workspace sources (GitHub, Vercel, Linear, Sentry,
 *      Higgsfield) need an owner/admin (RLS); personal ones (ElevenLabs) are yours.
 *      GitHub returns its generated signing secret once, in this response only.
 */
export async function GET() {
  try {
    const user = await requireWorkspaceUser();
    const out = await withUser(user.id, user.email, async (c) => ({
      is_leader: await isLeader(c, user.workspaceId),
      integrations: await listIntegrations(c, user.workspaceId),
    }));
    return NextResponse.json({ ...out, configured: activityKeyConfigured(), google_configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Error listing integrations:', error);
    return NextResponse.json({ error: 'Failed to list integrations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireWorkspaceUser();
    if (!activityKeyConfigured()) return NextResponse.json({ error: 'Activity encryption key is not configured' }, { status: 503 });
    const body = await request.json().catch(() => ({}));
    if (body?.provider === 'google_drive') return NextResponse.json({ error: 'Use /api/integrations/google/start to connect Google Drive' }, { status: 400 });
    const out = await withUser(user.id, user.email, (c) => createIntegration(c, { ...body, workspaceId: user.workspaceId, userId: user.id }));
    return NextResponse.json(out, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    if (error instanceof IntegrationInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if ((error as { code?: string } | null)?.code === '42501') return NextResponse.json({ error: 'Only workspace owners and admins can connect workspace sources' }, { status: 403 });
    console.error('Error creating integration:', (error instanceof Error ? error.message : 'error'));
    return NextResponse.json({ error: 'Failed to create integration' }, { status: 500 });
  }
}
