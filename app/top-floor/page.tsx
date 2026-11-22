import { redirect } from 'next/navigation';
import { withUser } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-helpers';
import TopFloorPageContent from './page-content';

export default async function TopFloorPage() {
  // Get authenticated user
  const user = await getAuthUser();
  
  if (!user) {
    redirect('/auth/signin');
  }

  // User signed in but has no workspace (no invite claimed)
  if (!user.workspaceId) {
    redirect('/auth/signup?error=invite-required');
  }

  // Fetch real workspace data
  const data = await withUser(user.id, user.email, async (client) => {
    // Get streams with per-stream costs and log counts
    const streamsResult = await client.query(
      `SELECT 
        s.id, s.name, s.type, s.status,
        COUNT(DISTINCT il.id) FILTER (
          WHERE il.payload->>'stream_id' IS NOT NULL 
          AND (il.payload->>'stream_id')::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND (il.payload->>'stream_id')::uuid = s.id
        ) as log_count,
        COALESCE(SUM(
          CASE 
            WHEN il.payload->>'stream_id' IS NOT NULL
            AND (il.payload->>'stream_id')::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND (il.payload->>'stream_id')::uuid = s.id
            AND il.payload->'metadata'->>'cost_usd' IS NOT NULL
            AND il.payload->'metadata'->>'cost_usd' ~ '^[0-9]+\.?[0-9]*$'
            THEN (il.payload->'metadata'->>'cost_usd')::numeric
            ELSE 0
          END
        ), 0) as total_cost
       FROM bureau.streams s
       LEFT JOIN bureau.ingest_log il ON il.workspace_id = s.workspace_id
       WHERE s.workspace_id = $1
       GROUP BY s.id, s.name, s.type, s.status
       ORDER BY s.created_at DESC`,
      [user.workspaceId]
    );

    // Get recent ingest logs
    const logsResult = await client.query(
      `SELECT 
        il.id, il.payload, il.created_at, il.status,
        s.name as stream_name
       FROM bureau.ingest_log il
       LEFT JOIN bureau.streams s ON (
         il.payload->>'stream_id' IS NOT NULL
         AND (il.payload->>'stream_id')::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND s.id = (il.payload->>'stream_id')::uuid
       )
       WHERE il.workspace_id = $1
       ORDER BY il.created_at DESC
       LIMIT 10`,
      [user.workspaceId]
    );

    // Get tokens count
    const tokensResult = await client.query(
      `SELECT COUNT(*) as count
       FROM bureau.ingest_tokens
       WHERE workspace_id = $1
       AND revoked_at IS NULL`,
      [user.workspaceId]
    );

    return {
      streams: streamsResult.rows,
      recentLogs: logsResult.rows,
      tokensCount: parseInt(tokensResult.rows[0].count),
    };
  });

  return <TopFloorPageContent 
    streams={data.streams} 
    recentLogs={data.recentLogs}
    tokensCount={data.tokensCount}
    userEmail={user.email}
  />;
}
