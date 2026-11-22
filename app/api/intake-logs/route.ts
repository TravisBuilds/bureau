import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    const logs = await withUser(user.id, user.email, async (client) => {
      const result = await client.query(
        `SELECT 
          il.id, il.token_id, it.name as token_name,
          il.payload, il.status,
          il.created_at, il.reviewed_at, il.reviewed_by
         FROM bureau.ingest_log il
         JOIN bureau.ingest_tokens it ON it.id = il.token_id
         WHERE il.workspace_id = $1
         ORDER BY il.created_at DESC
         LIMIT 100`,
        [user.workspaceId]
      );
      return result.rows;
    });
    
    return NextResponse.json({ logs });
    
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error fetching intake logs:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch logs'
    }, { status: 500 });
  }
}
