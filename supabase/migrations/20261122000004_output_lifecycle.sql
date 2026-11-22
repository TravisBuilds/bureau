-- Add lifecycle states to output_costs
-- draft: still working on it
-- finished: ready to publish
-- published: live now
-- abandoned: not shipping

SET search_path TO bureau, extensions;

ALTER TABLE bureau.output_costs
  ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'published' 
    CHECK (lifecycle IN ('draft', 'finished', 'published', 'abandoned'));

-- Add age tracking for published outputs
ALTER TABLE bureau.output_costs
  ADD COLUMN published_age_days INTEGER;

-- Add fields to track what cost covers
ALTER TABLE bureau.output_costs
  ADD COLUMN includes_subscription_share BOOLEAN DEFAULT false,
  ADD COLUMN includes_unallocated BOOLEAN DEFAULT false,
  ADD COLUMN cost_coverage_note TEXT;

-- Update the view/comparison logic:
-- Only compare views among published outputs at same age
-- Unpublished outputs show 'not yet published' instead of 0 views

COMMENT ON COLUMN bureau.output_costs.lifecycle IS 
  'Output lifecycle state: draft (working), finished (ready), published (live), abandoned (not shipping)';
COMMENT ON COLUMN bureau.output_costs.published_age_days IS 
  'Days since published_at, null if not published. Use for age-matched comparisons.';
COMMENT ON COLUMN bureau.output_costs.cost_coverage_note IS 
  'Human-readable description of what this cost figure includes (e.g., "Direct costs + 2 failed renders, excluding subscription share")';
