import { redirect } from 'next/navigation';
import { withUser } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-helpers';
import StreamDetailPageClient from './StreamDetailPageClient';

export default async function StreamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Get authenticated user
  const user = await getAuthUser();
  
  if (!user) {
    redirect('/auth/signin');
  }

  if (!user.workspaceId) {
    redirect('/auth/signup?error=invite-required');
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    redirect('/top-floor');
  }

  // Fetch real stream data
  const streamData = await withUser(user.id, user.email, async (client) => {
    // Get stream with basic info
    const streamResult = await client.query(
      `SELECT 
        s.id, s.name, s.category, s.description,
        s.connected, s.data_source, s.last_updated,
        COUNT(DISTINCT il.id) FILTER (
          WHERE il.payload->>'stream_id' IS NOT NULL 
          AND s.id::text = il.payload->>'stream_id'
        ) as log_count,
        COALESCE(SUM(
          CASE 
            WHEN il.payload->'metadata'->>'cost_usd' IS NOT NULL
            AND il.payload->'metadata'->>'cost_usd' ~ '^[0-9]+\.?[0-9]*$'
            AND s.id::text = il.payload->>'stream_id'
            THEN (il.payload->'metadata'->>'cost_usd')::numeric
            ELSE 0
          END
        ), 0) as total_cost
       FROM bureau.streams s
       LEFT JOIN bureau.ingest_log il ON il.workspace_id = s.workspace_id
       WHERE s.id = $1 AND s.workspace_id = $2
       GROUP BY s.id, s.name, s.category, s.description, s.connected, s.data_source, s.last_updated`,
      [id, user.workspaceId]
    );

    if (streamResult.rows.length === 0) {
      return null; // Stream not found or access denied
    }

    // Get recent logs for this stream
    const logsResult = await client.query(
      `SELECT 
        il.id,
        il.payload->>'type' as type,
        il.payload->>'content' as content,
        il.payload->'metadata'->>'cost_usd' as cost_usd,
        il.created_at,
        il.status
       FROM bureau.ingest_log il
       WHERE il.workspace_id = $1
       AND il.payload->>'stream_id' = $2::text
       ORDER BY il.created_at DESC
       LIMIT 20`,
      [user.workspaceId, id]
    );

    return {
      stream: streamResult.rows[0],
      recentLogs: logsResult.rows,
    };
  });

  if (!streamData) {
    redirect('/top-floor');
  }

  return (
    <StreamDetailPageClient 
      stream={streamData.stream}
      recentLogs={streamData.recentLogs}
    />
  );
}
