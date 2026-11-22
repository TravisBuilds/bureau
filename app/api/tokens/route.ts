import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import crypto from 'crypto';

/**
 * Generate ingest tokens for agents
 * 
 * POST /api/tokens - create new token
 * GET /api/tokens - list workspace tokens
 */

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { name, stream_id } = await request.json();
    
    if (!name) {
      return NextResponse.json({ error: 'Token name required' }, { status: 400 });
    }
    
    // Generate secure token
    const token = `bureau_${crypto.randomBytes(32).toString('hex')}`;
    
    // Create token in database with RLS
    const result = await withUser(user.id, user.email, async (client) => {
      const rows = await client.query(
        `INSERT INTO bureau.ingest_tokens (workspace_id, name, token, stream_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, token`,
        [user.workspaceId, name, token, stream_id || null]
      );
      return rows.rows[0];
    });
    
    return NextResponse.json({
      success: true,
      token: result.token,
      id: result.id,
      name
    });
    
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error creating token:', error);
    return NextResponse.json({ 
      error: 'Failed to create token',
      details: String(error)
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    const tokens = await withUser(user.id, user.email, async (client) => {
      const result = await client.query(
        `SELECT 
          t.id, t.name, t.token,
          t.created_at, t.last_used_at, t.revoked_at
         FROM bureau.ingest_tokens t
         WHERE t.workspace_id = $1
         ORDER BY t.created_at DESC`,
        [user.workspaceId]
      );
      return result.rows;
    });
    
    return NextResponse.json({ tokens });
    
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error listing tokens:', error);
    return NextResponse.json({ 
      error: 'Failed to list tokens',
      details: String(error)
    }, { status: 500 });
  }
}
