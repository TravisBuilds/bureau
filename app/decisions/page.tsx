import { redirect } from 'next/navigation';
import { withUser } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-helpers';
import DecisionsPageContent from './page-content';

export default async function DecisionsPage() {
  const user = await getAuthUser();
  
  if (!user) {
    redirect('/auth/signin');
  }

  if (!user.workspaceId) {
    redirect('/auth/signup?error=invite-required');
  }

  const data = await withUser(user.id, user.email, async (client) => {
    // Get all decisions with stream info
    const decisionsResult = await client.query(
      `SELECT 
        d.id,
        d.stream_id,
        d.title,
        d.action,
        d.metric_name,
        d.baseline_value,
        d.baseline_unit,
        d.created_at,
        d.review_date,
        d.reviewed_at,
        d.outcome_value,
        d.outcome_notes,
        d.verdict,
        s.name as stream_name,
        s.category as stream_category
       FROM bureau.decisions d
       LEFT JOIN bureau.streams s ON s.id = d.stream_id
       WHERE d.workspace_id = $1
       ORDER BY 
         CASE WHEN d.verdict = 'pending' THEN 0 ELSE 1 END,
         d.review_date ASC,
         d.created_at DESC`,
      [user.workspaceId]
    );

    // Get streams for the create form
    const streamsResult = await client.query(
      `SELECT id, name, category
       FROM bureau.streams
       WHERE workspace_id = $1
       ORDER BY name ASC`,
      [user.workspaceId]
    );

    return {
      decisions: decisionsResult.rows,
      streams: streamsResult.rows
    };
  });

  return <DecisionsPageContent decisions={data.decisions} streams={data.streams} />;
}
