import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-helpers';

/**
 * GET /api/decisions
 * List all decisions for the user's workspace
 * Query params:
 *   ?due=true - only decisions due for review (review_date <= today and verdict = pending)
 *   ?stream_id=<uuid> - filter by stream
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user || !user.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dueOnly = searchParams.get('due') === 'true';
    const streamId = searchParams.get('stream_id');
    
    // Validate stream_id if provided
    if (streamId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(streamId)) {
        return NextResponse.json({ error: 'Invalid stream_id format' }, { status: 400 });
      }
    }

    const decisions = await withUser(user.id, user.email, async (client) => {
      let query = `
        SELECT 
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
      `;

      const params: any[] = [user.workspaceId];
      let paramIndex = 2;

      if (dueOnly) {
        query += ` AND d.review_date <= CURRENT_DATE AND d.verdict = 'pending'`;
      }

      if (streamId) {
        query += ` AND d.stream_id = $${paramIndex}`;
        params.push(streamId);
        paramIndex++;
      }

      query += ` ORDER BY d.review_date ASC, d.created_at DESC`;

      const result = await client.query(query, params);
      return result.rows;
    });

    return NextResponse.json({ decisions });
  } catch (error) {
    console.error('Failed to fetch decisions:', error);
    return NextResponse.json({ error: 'Failed to fetch decisions' }, { status: 500 });
  }
}

/**
 * POST /api/decisions
 * Create a new decision
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user || !user.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, action, metric_name, baseline_value, baseline_unit, review_date, stream_id } = body;

    // Validate required fields
    if (!title || !action || !metric_name || !review_date) {
      return NextResponse.json(
        { error: 'Missing required fields: title, action, metric_name, review_date' },
        { status: 400 }
      );
    }

    // Validate review_date is in the future
    const reviewDateObj = new Date(review_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (reviewDateObj < today) {
      return NextResponse.json(
        { error: 'review_date must be today or in the future' },
        { status: 400 }
      );
    }

    // Validate stream_id if provided
    if (stream_id) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(stream_id)) {
        return NextResponse.json({ error: 'Invalid stream_id format' }, { status: 400 });
      }
    }
    
    const decision = await withUser(user.id, user.email, async (client) => {
      // If stream_id provided, verify it exists and belongs to workspace
      if (stream_id) {
        const streamCheck = await client.query(
          `SELECT id FROM bureau.streams WHERE id = $1 AND workspace_id = $2`,
          [stream_id, user.workspaceId]
        );
        if (streamCheck.rows.length === 0) {
          throw new Error('STREAM_NOT_FOUND');
        }
      }

      // If baseline_value not provided but stream_id is, optionally fetch from recent metrics
      let finalBaselineValue = baseline_value;
      if (!finalBaselineValue && stream_id && metric_name) {
        // Try to get the most recent metric value
        const metricResult = await client.query(
          `SELECT value 
           FROM bureau.metric_values 
           WHERE stream_id = $1 AND metric_id = $2 
           ORDER BY timestamp DESC 
           LIMIT 1`,
          [stream_id, metric_name]
        );
        if (metricResult.rows.length > 0) {
          finalBaselineValue = metricResult.rows[0].value;
        }
      }

      const result = await client.query(
        `INSERT INTO bureau.decisions (
          workspace_id, stream_id, title, action, metric_name, 
          baseline_value, baseline_unit, review_date, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          user.workspaceId,
          stream_id || null,
          title,
          action,
          metric_name,
          finalBaselineValue || null,
          baseline_unit || null,
          review_date,
          user.id
        ]
      );

      return result.rows[0];
    });

    return NextResponse.json({ decision }, { status: 201 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg === 'STREAM_NOT_FOUND') {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    console.error('Failed to create decision:', error);
    return NextResponse.json({ error: 'Failed to create decision' }, { status: 500 });
  }
}
