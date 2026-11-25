import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { lookupClone } from '@/lib/clone-lookup';
import { latestCheckin } from '@/lib/clone-status';

/**
 * GET /api/questions - List questions
 * POST /api/questions - Ask a question
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    let workspaceId = user.workspaceId;
    if (!workspaceId) {
      const { ensureDefaultWorkspaceMembership } = await import('@/lib/post-login');
      workspaceId = await ensureDefaultWorkspaceMembership(user.id, user.email);
    }

    if (!workspaceId) {
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
        [workspaceId]
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

/**
 * POST /api/questions - Ask a teammate's clone.
 * Body: { question_text, target_clone_id } or { question_text, who } (name/handle/email).
 * Returns the question id plus `preview`: the target's latest check-in, read right away so
 * the asker gets an instant answer to "what are they working on?" while the question stays
 * open for their AI. `preview` is null when they have not checked in yet.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    let workspaceId = user.workspaceId;
    if (!workspaceId) {
      const { ensureDefaultWorkspaceMembership } = await import('@/lib/post-login');
      workspaceId = await ensureDefaultWorkspaceMembership(user.id, user.email);
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const target_clone_id = typeof body.target_clone_id === 'string' ? body.target_clone_id.trim() : '';
    const who = typeof body.who === 'string' ? body.who.trim() : '';
    const question_text = typeof body.question_text === 'string' ? body.question_text.trim() : '';

    if ((!target_clone_id && !who) || !question_text) {
      return NextResponse.json({ error: 'Missing target_clone_id (or who) or question_text' }, { status: 400 });
    }
    if (question_text.length > 2000) {
      return NextResponse.json({ error: 'question_text must be at most 2000 characters' }, { status: 400 });
    }

    const { withUser } = await import('@/lib/db');

    const out = await withUser(user.id, user.email, async (client) => {
      let clone: { id: string; display_name: string; handle: string };
      if (target_clone_id) {
        // Verify target_clone_id is in this workspace
        const rows = (await client.query(
          `SELECT id::text AS id, display_name, handle FROM bureau.digital_clones
           WHERE id::text = $1 AND workspace_id = $2`,
          [target_clone_id, workspaceId]
        )).rows;
        if (!rows[0]) return { kind: 'not_found' as const };
        clone = rows[0];
      } else {
        const match = await lookupClone(client, workspaceId, who);
        if (match.status === 'ambiguous') return { kind: 'ambiguous' as const, candidates: match.candidates };
        if (match.status === 'not_found') return { kind: 'not_found' as const };
        clone = match.clone;
      }

      const questionResult = await client.query(
        `SELECT bureau.ask_question($1, $2, $3, NULL, NULL, $4, NULL, 'web') as ask_question`,
        [workspaceId, question_text, user.id, clone.id]
      );
      const preview = await latestCheckin(client, clone.id);
      return { kind: 'asked' as const, questionId: questionResult.rows[0].ask_question as string, clone, preview };
    });

    if (out.kind === 'not_found') {
      return NextResponse.json({ error: 'Clone not found in your workspace' }, { status: 404 });
    }
    if (out.kind === 'ambiguous') {
      return NextResponse.json({
        error: 'More than one teammate matches. Pick one.',
        candidates: out.candidates.map(c => ({ id: c.id, display_name: c.display_name, handle: c.handle, owner_email: c.owner_email })),
      }, { status: 409 });
    }
    return NextResponse.json({
      success: true,
      questionId: out.questionId,
      target: { id: out.clone.id, display_name: out.clone.display_name, handle: out.clone.handle },
      preview: out.preview,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error asking question:', error);
    return NextResponse.json({ error: 'Failed to ask question' }, { status: 500 });
  }
}
