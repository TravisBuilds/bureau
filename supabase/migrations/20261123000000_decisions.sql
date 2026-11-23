-- Decision Records Migration
-- Adds decision tracking with follow-through for founders

SET search_path TO bureau, extensions;

-- Enum for decision verdicts
CREATE TYPE bureau.decision_verdict AS ENUM ('worked', 'didnt-work', 'inconclusive', 'pending');

-- Decisions table
CREATE TABLE bureau.decisions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  stream_id UUID REFERENCES bureau.streams(id) ON DELETE SET NULL,
  
  -- Decision details
  title TEXT NOT NULL,
  action TEXT NOT NULL,
  
  -- Metric to track
  metric_name TEXT NOT NULL,
  baseline_value NUMERIC,
  baseline_unit TEXT,
  
  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  review_date DATE NOT NULL,
  reviewed_at TIMESTAMPTZ,
  
  -- Outcome (filled when reviewed)
  outcome_value NUMERIC,
  outcome_notes TEXT,
  verdict bureau.decision_verdict DEFAULT 'pending',
  
  -- Metadata
  created_by UUID NOT NULL REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE bureau.decisions ENABLE ROW LEVEL SECURITY;

-- RLS policy - users can access decisions in their workspaces
CREATE POLICY decision_access ON bureau.decisions
  USING (
    workspace_id IN (
      SELECT bureau.user_workspaces()
    )
  );

-- Policy for INSERT
CREATE POLICY decision_insert ON bureau.decisions
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT bureau.user_workspaces()
    )
  );

-- Policy for UPDATE
CREATE POLICY decision_update ON bureau.decisions
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT bureau.user_workspaces()
    )
  );

-- Policy for DELETE
CREATE POLICY decision_delete ON bureau.decisions
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT bureau.user_workspaces()
    )
  );

-- Indexes
CREATE INDEX idx_decisions_workspace ON bureau.decisions(workspace_id);
CREATE INDEX idx_decisions_stream ON bureau.decisions(stream_id) WHERE stream_id IS NOT NULL;
CREATE INDEX idx_decisions_review_date ON bureau.decisions(review_date) WHERE verdict = 'pending';
CREATE INDEX idx_decisions_verdict ON bureau.decisions(verdict);

-- Grant privileges to bureau_app
GRANT SELECT, INSERT, UPDATE, DELETE ON bureau.decisions TO bureau_app;

COMMENT ON TABLE bureau.decisions IS 'Decision records with follow-through tracking. Records what founder decided, metric to move, baseline, review date, and later outcome.';
COMMENT ON COLUMN bureau.decisions.baseline_value IS 'Starting value of metric (can be auto-filled from ingest data if available)';
COMMENT ON COLUMN bureau.decisions.review_date IS 'When to review this decision and record the outcome';
COMMENT ON COLUMN bureau.decisions.verdict IS 'Result after review: worked, didnt-work, inconclusive, or pending (not yet reviewed)';
