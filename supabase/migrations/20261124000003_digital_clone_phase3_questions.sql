-- Digital Clone Phase 3: Question Inbox
-- Date: 2026-11-24
-- Purpose: Question routing between humans and clones with escalation

SET search_path TO bureau, extensions;

-- Enum for question status
CREATE TYPE bureau.question_status AS ENUM ('open', 'answered', 'escalated', 'closed');

-- Enum for question source
CREATE TYPE bureau.question_source AS ENUM ('web', 'slack', 'mcp');

-- Questions table
CREATE TABLE bureau.questions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  asker_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  asker_name TEXT,
  asker_slack_user_id TEXT,
  target_clone_id UUID REFERENCES bureau.digital_clones(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source bureau.question_source NOT NULL DEFAULT 'web',
  question_text TEXT NOT NULL,
  answer_text TEXT,
  answered_by_clone BOOLEAN DEFAULT FALSE,
  answered_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status bureau.question_status NOT NULL DEFAULT 'open',
  escalation_reason TEXT,
  asked_at TIMESTAMPTZ DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_questions_workspace ON bureau.questions(workspace_id);
CREATE INDEX idx_questions_target_clone ON bureau.questions(target_clone_id);
CREATE INDEX idx_questions_target_user ON bureau.questions(target_user_id);
CREATE INDEX idx_questions_status ON bureau.questions(status);
CREATE INDEX idx_questions_asked_at ON bureau.questions(asked_at DESC);

COMMENT ON TABLE bureau.questions IS 'Questions asked to clones, with routing and escalation';

-- Enable RLS on questions
ALTER TABLE bureau.questions ENABLE ROW LEVEL SECURITY;

-- Policy: workspace members can view questions
CREATE POLICY questions_select ON bureau.questions
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

-- Policy: workspace members can insert questions
CREATE POLICY questions_insert ON bureau.questions
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

-- Policy: workspace members can update questions
CREATE POLICY questions_update ON bureau.questions
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

-- Function: get questions for a clone (via MCP)
CREATE OR REPLACE FUNCTION bureau.get_clone_questions(
  p_clone_id UUID,
  p_status bureau.question_status DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  asker_name TEXT,
  question_text TEXT,
  status bureau.question_status,
  asked_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id,
    COALESCE(q.asker_name, au.email) as asker_name,
    q.question_text,
    q.status,
    q.asked_at
  FROM bureau.questions q
  LEFT JOIN auth.users au ON au.id = q.asker_user_id
  WHERE q.target_clone_id = p_clone_id
    AND (p_status IS NULL OR q.status = p_status)
  ORDER BY q.asked_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION bureau.get_clone_questions TO bureau_app;

-- Function: answer question (via MCP)
CREATE OR REPLACE FUNCTION bureau.answer_question(
  p_question_id UUID,
  p_answer_text TEXT,
  p_answered_by_clone BOOLEAN DEFAULT TRUE
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, extensions
AS $$
BEGIN
  UPDATE bureau.questions
  SET 
    answer_text = p_answer_text,
    answered_by_clone = p_answered_by_clone,
    status = 'answered',
    answered_at = NOW()
  WHERE id = p_question_id AND status = 'open';
  
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION bureau.answer_question TO bureau_app;

-- Function: escalate question (via MCP)
CREATE OR REPLACE FUNCTION bureau.escalate_question(
  p_question_id UUID,
  p_escalation_reason TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, extensions
AS $$
DECLARE
  v_target_user_id UUID;
BEGIN
  -- Get target user from clone
  SELECT owner_user_id INTO v_target_user_id
  FROM bureau.questions q
  JOIN bureau.digital_clones dc ON dc.id = q.target_clone_id
  WHERE q.id = p_question_id;
  
  UPDATE bureau.questions
  SET 
    status = 'escalated',
    escalation_reason = p_escalation_reason,
    escalated_at = NOW(),
    target_user_id = v_target_user_id
  WHERE id = p_question_id AND status = 'open';
  
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION bureau.escalate_question TO bureau_app;

-- Function: ask question (via web/MCP)
CREATE OR REPLACE FUNCTION bureau.ask_question(
  p_workspace_id UUID,
  p_asker_user_id UUID DEFAULT NULL,
  p_asker_name TEXT DEFAULT NULL,
  p_asker_slack_user_id TEXT DEFAULT NULL,
  p_target_clone_id UUID DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL,
  p_source bureau.question_source DEFAULT 'web',
  p_question_text TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, extensions
AS $$
DECLARE
  v_question_id UUID;
BEGIN
  IF p_target_clone_id IS NULL AND p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Must specify either target_clone_id or target_user_id';
  END IF;
  
  INSERT INTO bureau.questions (
    workspace_id, asker_user_id, asker_name, asker_slack_user_id,
    target_clone_id, target_user_id, source, question_text
  ) VALUES (
    p_workspace_id, p_asker_user_id, p_asker_name, p_asker_slack_user_id,
    p_target_clone_id, p_target_user_id, p_source, p_question_text
  )
  RETURNING id INTO v_question_id;
  
  RETURN v_question_id;
END;
$$;

GRANT EXECUTE ON FUNCTION bureau.ask_question TO bureau_app;

COMMENT ON FUNCTION bureau.get_clone_questions IS 'Get questions for a clone (via MCP)';
COMMENT ON FUNCTION bureau.answer_question IS 'Answer a question from clone (via MCP)';
COMMENT ON FUNCTION bureau.escalate_question IS 'Escalate question to human owner (via MCP)';
COMMENT ON FUNCTION bureau.ask_question IS 'Ask a question to a clone or user';
