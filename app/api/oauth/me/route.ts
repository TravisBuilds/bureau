import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { firstNameFromEmail } from '@/lib/display-name';

/**
 * GET /api/oauth/me - who is approving (for the consent/device screens' default agent name).
 * Returns only the signed-in user's own email, a first-name guess and their workspace role
 * (owner/admin see the extra team:read line on consent).
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(
    { email: user.email, first_name: firstNameFromEmail(user.email), has_workspace: !!user.workspaceId, role: user.role },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
