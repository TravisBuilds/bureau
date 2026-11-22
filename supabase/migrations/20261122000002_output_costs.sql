-- Output costs tracking for cost-per-output P&L
-- Tracks generation costs per output (episode, video, Short) with views and trust levels

SET search_path TO bureau, extensions;

CREATE TABLE bureau.output_costs (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  stream_id UUID NOT NULL REFERENCES bureau.streams(id) ON DELETE CASCADE,
  output_id TEXT NOT NULL, -- e.g., "ep12", "short-too-many-trees"
  output_name TEXT NOT NULL,
  output_type TEXT NOT NULL, -- episode, short, video, post, image
  generation_cost_usd NUMERIC NOT NULL,
  failed_renders_cost_usd NUMERIC DEFAULT 0,
  
  -- Cost breakdown
  elevenlabs_characters INTEGER,
  elevenlabs_cost_usd NUMERIC,
  higgsfield_credits NUMERIC,
  higgsfield_cost_usd NUMERIC,
  other_costs JSONB, -- [{provider: "...", units: N, cost: N}]
  
  -- Performance metrics
  views INTEGER DEFAULT 0,
  watch_time_seconds INTEGER,
  subscribers_gained INTEGER DEFAULT 0,
  revenue_usd NUMERIC DEFAULT 0,
  
  -- Trust level and verification
  trust_level TEXT NOT NULL CHECK (trust_level IN ('verified', 'declared', 'estimated')),
  verified_sources TEXT[], -- ["elevenlabs-api", "youtube-api", "manual-entry"]
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  
  UNIQUE(stream_id, output_id)
);

-- Enable RLS
ALTER TABLE bureau.output_costs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see output costs for streams in their workspaces
CREATE POLICY output_costs_workspace_isolation ON bureau.output_costs
  FOR ALL
  USING (
    stream_id IN (
      SELECT s.id FROM bureau.streams s
      JOIN bureau.workspace_members wm ON wm.workspace_id = s.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_output_costs_stream ON bureau.output_costs(stream_id);
CREATE INDEX idx_output_costs_trust ON bureau.output_costs(trust_level);
CREATE INDEX idx_output_costs_published ON bureau.output_costs(published_at);

-- Seed data for Ember stream (YouTube Shorts)
-- Note: stream_id will be inserted after workspace/stream setup
-- This is example data structure for reference

COMMENT ON TABLE bureau.output_costs IS 'Cost-per-output P&L tracking for AI-generated content. Each output (episode, video, Short) has generation costs linked to views and performance.';
COMMENT ON COLUMN bureau.output_costs.trust_level IS 'verified = API-sourced, declared = manually entered, estimated = formula-based';
COMMENT ON COLUMN bureau.output_costs.verified_sources IS 'Array of data sources used: elevenlabs-api, higgsfield-api, youtube-api, manual-entry, csv-import';
