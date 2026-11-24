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

    const questions = await query<{
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
    }>(
      `SELECT 
        q.id,
        COALESCE(q.asker_name, au.email) as asker_name,
        q.question_text,
        q.answer_text,
        q.status,
        q.target_clone_id,
        q.target_user_id,
        dc.display_name as clone_display_name,
        q.asked_at,
        q.answered_at
       FROM bureau.questions q
       LEFT JOIN auth.users au ON au.id = q.asker_user_id
       LEFT JOIN bureau.digital_clones dc ON dc.id = q.target_clone_id
       WHERE q.workspace_id = $1
       ORDER BY q.asked_at DESC
       LIMIT 100`,
      [user.workspaceId]
    );

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

    const result = await query<{ ask_question: string }>(
      `SELECT bureau.ask_question($1, $2, NULL, NULL, $3, NULL, 'web', $4) as ask_question`,
      [user.workspaceId, user.id, target_clone_id, question_text]
    );

    return NextResponse.json({ 
      success: true,
      questionId: result[0].ask_question 
    });
  } catch (error: any) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error asking question:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to ask question' 
    }, { status: 500 });
  }
}
