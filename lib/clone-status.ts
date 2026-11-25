/**
 * The latest check-in (heartbeat) for one clone, used to answer "what is X working on?"
 * instantly while a question waits for the teammate's AI. Read-only; must run inside
 * withUser(...) so clone_heartbeats RLS limits it to the caller's workspace.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pg PoolClient-compatible
type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export interface LatestCheckin {
  date: string;            // YYYY-MM-DD the check-in is for
  days_old: number;        // today (DB clock) minus date
  top_priority: string | null;
  active: string[];
  blocked: string[];
  decisions_waiting_on_me: string[];
  shipped_since_last: string[];
  out_of_office: boolean;
  confidence: string | null;
}

export async function latestCheckin(client: Queryable, cloneId: string): Promise<LatestCheckin | null> {
  const { rows } = await client.query(
    `SELECT to_char(h.date, 'YYYY-MM-DD') AS date, (CURRENT_DATE - h.date)::int AS days_old,
            h.top_priority, COALESCE(h.active, '{}') AS active, COALESCE(h.blocked, '{}') AS blocked,
            COALESCE(h.decisions_waiting_on_me, '{}') AS decisions_waiting_on_me,
            COALESCE(h.shipped_since_last, '{}') AS shipped_since_last,
            COALESCE(h.out_of_office, false) AS out_of_office, h.confidence
       FROM bureau.clone_heartbeats h
      WHERE h.clone_id = $1
      ORDER BY h.date DESC, h.created_at DESC
      LIMIT 1`,
    [cloneId]
  );
  return rows[0] ?? null;
}
