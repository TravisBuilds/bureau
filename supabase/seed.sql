-- Bureau Seed Data
-- Travis's workspace with 4 real streams (Nov 21, 2026 data)

SET search_path TO bureau, extensions;

-- Create Travis's workspace
-- Note: This assumes auth.users has a user with known ID
-- In practice, this will be created on first login

-- Generate pilot invite codes
INSERT INTO bureau.pilot_invites (code, email, expires_at) VALUES
  ('BUREAU_PILOT_001', 'travis@example.com', NOW() + INTERVAL '90 days'),
  ('BUREAU_PILOT_002', NULL, NOW() + INTERVAL '90 days'),
  ('BUREAU_PILOT_003', NULL, NOW() + INTERVAL '90 days'),
  ('BUREAU_PILOT_004', NULL, NOW() + INTERVAL '90 days'),
  ('BUREAU_PILOT_005', NULL, NOW() + INTERVAL '90 days');

-- The rest of the seed data will be created when Travis signs up and completes onboarding
-- His workspace will be populated with:
-- 1. DuckDuckGoose stream (production/repo)
--    - 296 commits (30d), 36 PRs merged, 6 open PRs
--    - Source: GitHub TravisBuilds/DuckDuckGoose
-- 
-- 2. Elon stream (audience, @SadCreatorTalks)
--    - 18,972 followers (-62 since Nov 5)
--    - 5.27% engagement, 74,304 impressions
--    - Source: X API
--
-- 3. Studio · Peak Glow Up stream (production)
--    - 5 episodes locked, 0 published
--    - Ep05: $88.04
--    - Source: Private Drive + Studio ledger
--
-- 4. Ember stream (content/distribution, YouTube)
--    - 12 Shorts published, 212 views, 3 subscribers
--    - Cost per episode: $30.78 (Ep11-12 avg)
--    - Source: YouTube @BedtimewithEmber-i9n

-- This data will be inserted via the ingest API or manual entry during onboarding
-- See lib/real-stream-data.ts for the source data
