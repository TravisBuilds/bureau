import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import crypto from 'crypto';

/**
 * Generate ingest tokens for agents
 * 
 * POST /api/tokens - create new token
 * GET /api/tokens - list workspace tokens
 */

export async function POST(request: NextRequest) {
  try {
    // For now, we'll use a hardcoded workspace ID (Travis's workspace)
    // In production, this would come from the session
    const workspaceId = '3713a630-8284-4c87-ba4d-8d4c47e13473';
    
    const { name, streamId } = await request.json();
    
    if (!name) {
      return NextResponse.json({ error: 'Token name required' }, { status: 400 });
    }
    
    // Generate secure token
    const token = `bureau_${crypto.randomBytes(32).toString('hex')}`;
    
    // Create token in database
    const rows = await query<{ id: string; token: string }>(
      `INSERT INTO ingest_tokens (workspace_id, name, token)
       VALUES ($1, $2, $3)
       RETURNING id, token`,
      [workspaceId, name, token]
    );
    
    return NextResponse.json({
      success: true,
      token: rows[0].token,
      id: rows[0].id,
      name
    });
    
  } catch (error) {
    console.error('Error creating token:', error);
    return NextResponse.json({ 
      error: 'Failed to create token',
      details: String(error)
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // For now, hardcoded workspace
    const workspaceId = '3713a630-8284-4c87-ba4d-8d4c47e13473';
    
    const tokens = await query<{
      id: string;
      name: string;
      token: string;
      created_at: Date;
      last_used_at: Date | null;
      revoked_at: Date | null;
    }>(
      `SELECT 
        t.id, t.name, t.token,
        t.created_at, t.last_used_at, t.revoked_at
       FROM ingest_tokens t
       WHERE t.workspace_id = $1
       ORDER BY t.created_at DESC`,
      [workspaceId]
    );
    
    return NextResponse.json({ tokens });
    
  } catch (error) {
    console.error('Error listing tokens:', error);
    return NextResponse.json({ 
      error: 'Failed to list tokens',
      details: String(error)
    }, { status: 500 });
  }
}
