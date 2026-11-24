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
    const { name } = await request.json();
    
    if (!name) {
      return NextResponse.json({ error: 'Token name required' }, { status: 400 });
    }
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }
    
    // Generate secure token
    const token = `bureau_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenPrefix = token.substring(0, 15); // bureau_ + 8 chars
    
    // Create token in database with RLS (store hash, not plaintext)
    const result = await withUser(user.id, user.email, async (client) => {
      const rows = await client.query(
        `INSERT INTO bureau.ingest_tokens (workspace_id, name, token_hash, token_prefix)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [user.workspaceId, name, tokenHash, tokenPrefix]
      );
      return rows.rows[0];
    });
    
    // Return full token ONCE
    return NextResponse.json({
      success: true,
      token: token,
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
      details: 'An unexpected error occurred'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }
    
    const tokens = await withUser(user.id, user.email, async (client) => {
      const result = await client.query(
        `SELECT 
          t.id, t.name, t.token_prefix,
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
      details: 'An unexpected error occurred'
    }, { status: 500 });
  }
}
