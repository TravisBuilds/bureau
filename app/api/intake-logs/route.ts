import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Hardcoded workspace for now
    const workspaceId = '3713a630-8284-4c87-ba4d-8d4c47e13473';
    
    const logs = await query<{
      id: string;
      token_id: string;
      token_name: string;
      payload: any;
      status: string;
      created_at: Date;
      reviewed_at: Date | null;
      reviewed_by: string | null;
    }>(
      `SELECT 
        il.id, il.token_id, it.name as token_name,
        il.payload, il.status,
        il.created_at, il.reviewed_at, il.reviewed_by
       FROM ingest_log il
       JOIN ingest_tokens it ON it.id = il.token_id
       WHERE il.workspace_id = $1
       ORDER BY il.created_at DESC
       LIMIT 100`,
      [workspaceId]
    );
    
    return NextResponse.json({ logs });
    
  } catch (error) {
    console.error('Error fetching intake logs:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch logs',
      details: String(error)
    }, { status: 500 });
  }
}
