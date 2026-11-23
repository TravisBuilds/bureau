import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-helpers';

/**
 * GET /api/decisions/[id]
 * Get a single decision by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser();
    if (!user || !user.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decision = await withUser(user.id, user.email, async (client) => {
      const result = await client.query(
        `SELECT 
          d.*,
          s.name as stream_name,
          s.category as stream_category
        FROM bureau.decisions d
        LEFT JOIN bureau.streams s ON s.id = d.stream_id
        WHERE d.id = $1 AND d.workspace_id = $2`,
        [params.id, user.workspaceId]
      );

      return result.rows[0] || null;
    });

    if (!decision) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }

    return NextResponse.json({ decision });
  } catch (error) {
    console.error('Failed to fetch decision:', error);
    return NextResponse.json({ error: 'Failed to fetch decision' }, { status: 500 });
  }
}

/**
 * PATCH /api/decisions/[id]
 * Update a decision (for recording outcomes)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser();
    if (!user || !user.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { outcome_value, outcome_notes, verdict } = body;

    // Validate verdict if provided
    const validVerdicts = ['worked', 'didnt-work', 'inconclusive', 'pending'];
    if (verdict && !validVerdicts.includes(verdict)) {
      return NextResponse.json(
        { error: `Invalid verdict. Must be one of: ${validVerdicts.join(', ')}` },
        { status: 400 }
      );
    }

    const decision = await withUser(user.id, user.email, async (client) => {
      // Check decision exists and belongs to user's workspace
      const checkResult = await client.query(
        `SELECT id FROM bureau.decisions WHERE id = $1 AND workspace_id = $2`,
        [params.id, user.workspaceId]
      );

      if (checkResult.rows.length === 0) {
        throw new Error('DECISION_NOT_FOUND');
      }

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (outcome_value !== undefined) {
        updates.push(`outcome_value = $${paramIndex}`);
        values.push(outcome_value);
        paramIndex++;
      }

      if (outcome_notes !== undefined) {
        updates.push(`outcome_notes = $${paramIndex}`);
        values.push(outcome_notes);
        paramIndex++;
      }

      if (verdict !== undefined) {
        updates.push(`verdict = $${paramIndex}`);
        values.push(verdict);
        paramIndex++;
        
        // Set reviewed_at when verdict changes from pending
        if (verdict !== 'pending') {
          updates.push(`reviewed_at = NOW()`);
        }
      }

      if (updates.length === 0) {
        throw new Error('NO_UPDATES');
      }

      values.push(params.id, user.workspaceId);

      const result = await client.query(
        `UPDATE bureau.decisions 
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND workspace_id = $${paramIndex + 1}
         RETURNING *`,
        values
      );

      return result.rows[0];
    });

    return NextResponse.json({ decision });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg === 'DECISION_NOT_FOUND') {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }

    if (errorMsg === 'NO_UPDATES') {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    console.error('Failed to update decision:', error);
    return NextResponse.json({ error: 'Failed to update decision' }, { status: 500 });
  }
}

/**
 * DELETE /api/decisions/[id]
 * Delete a decision
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser();
    if (!user || !user.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await withUser(user.id, user.email, async (client) => {
      const result = await client.query(
        `DELETE FROM bureau.decisions 
         WHERE id = $1 AND workspace_id = $2
         RETURNING id`,
        [params.id, user.workspaceId]
      );

      if (result.rows.length === 0) {
        throw new Error('DECISION_NOT_FOUND');
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg === 'DECISION_NOT_FOUND') {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }

    console.error('Failed to delete decision:', error);
    return NextResponse.json({ error: 'Failed to delete decision' }, { status: 500 });
  }
}
