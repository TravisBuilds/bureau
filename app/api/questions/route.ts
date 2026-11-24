import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { query } from '@/lib/db';

/**
 * GET /api/questions - List questions
 * POST /api/questions - Ask a question
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }

    const { withUser } = await import('@/lib/db');
    
    const questions = await withUser(user.id, user.email, async (client): Promise<Array<{
      id: string;
      asker_name: string;
      question_text: string;
      answer_text: string | null;
      status: string;
      target_clone_id: string | null;
      target_user_id: string | null;
      clone_display_name: string | null;
      asked_at: Date;
      answered_at: Date | null;
    }>> => {
      const result = await client.query(
      `SELECT 
        q.id,
        COALESCE(q.asker_name, wm.email) as asker_name,
        q.question_text,
        q.answer_text,
        q.status,
        q.target_clone_id,
        q.target_user_id,
        dc.display_name as clone_display_name,
        q.asked_at,
        q.answered_at
       FROM bureau.questions q
       LEFT JOIN bureau.workspace_members wm ON wm.workspace_id = q.workspace_id AND wm.user_id = q.asker_user_id AND wm.removed_at IS NULL
       LEFT JOIN bureau.digital_clones dc ON dc.id = q.target_clone_id
       WHERE q.workspace_id = $1
       ORDER BY q.asked_at DESC
       LIMIT 100`,
        [user.workspaceId]
      );
      return result.rows;
    });

    return NextResponse.json({ questions });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error fetching questions:', error);
    return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }

    const body = await request.json();
    const { target_clone_id, question_text } = body;

    if (!target_clone_id || !question_text) {
      return NextResponse.json({ error: 'Missing target_clone_id or question_text' }, { status: 400 });
    }

    const { withUser } = await import('@/lib/db');
    
    const result = await withUser(user.id, user.email, async (client): Promise<Array<{ ask_question: string }>> => {
      // Verify target_clone_id is in this workspace
      const cloneCheck = await client.query(
        `SELECT EXISTS(SELECT 1 FROM bureau.digital_clones WHERE id = $1 AND workspace_id = $2) as exists`,
        [target_clone_id, user.workspaceId]
      );
      
      if (!cloneCheck.rows[0]?.exists) {
        throw new Error('Clone not found in your workspace');
      }
      
      const questionResult = await client.query(
        `SELECT bureau.ask_question($1, $2, $3, NULL, NULL, $4, NULL, 'web') as ask_question`,
        [user.workspaceId, question_text, user.id, target_clone_id]
      );
      return questionResult.rows;
    });

    return NextResponse.json({ 
      success: true,
      questionId: result[0].ask_question 
    });
  } catch (error: any) {
    if (error instanceof Response) {
      return error;
    }
    if (error.message === 'Clone not found in your workspace') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Error asking question:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to ask question' 
    }, { status: 500 });
  }
}
