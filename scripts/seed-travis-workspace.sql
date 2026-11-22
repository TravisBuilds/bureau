-- Seed Travis's workspace with real cost data
-- Run AFTER Travis signs up: sudo -u postgres psql -d bureau -f scripts/seed-travis-workspace.sql
-- Replace USER_ID and WORKSPACE_ID with actual values from database

-- Variables (replace these after signup)
-- \set user_id 'REPLACE_WITH_REAL_USER_ID'
-- \set workspace_id 'REPLACE_WITH_REAL_WORKSPACE_ID'

-- For now, this script shows the data structure
-- Will be run programmatically after auth flow

DO $$
DECLARE
  v_user_id UUID;
  v_workspace_id UUID;
  v_ember_stream_id UUID;
  v_studio_stream_id UUID;
BEGIN
  -- Get Travis's user and workspace
  -- (This assumes Travis has already signed up)
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'travis@example.com' LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User not found. Sign up first at /auth/signup';
    RETURN;
  END IF;
  
  SELECT w.id INTO v_workspace_id 
  FROM workspaces w
  JOIN workspace_members wm ON wm.workspace_id = w.id
  WHERE wm.user_id = v_user_id
  LIMIT 1;
  
  IF v_workspace_id IS NULL THEN
    RAISE NOTICE 'Workspace not found. Complete auth flow first.';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Found user % and workspace %', v_user_id, v_workspace_id;
  
  -- Create Ember stream
  INSERT INTO streams (workspace_id, name, category, description, connected, data_source, visible)
  VALUES (
    v_workspace_id,
    'Ember',
    'content-distribution',
    'YouTube Shorts for Ember character. 12 Shorts published, 212 views total.',
    true,
    'YouTube @emberai + manual cost ledger',
    true
  )
  RETURNING id INTO v_ember_stream_id;
  
  RAISE NOTICE 'Created Ember stream: %', v_ember_stream_id;
  
  -- Ember output costs (REAL data from production ledger)
  INSERT INTO output_costs (
    stream_id, output_id, output_name, output_type,
    generation_cost_usd, failed_renders_cost_usd,
    elevenlabs_characters, elevenlabs_cost_usd,
    views, trust_level, verified_sources,
    created_at, published_at,
    lifecycle, cost_coverage_note
  ) VALUES
  (
    v_ember_stream_id,
    'ep11',
    'Ep11 Short',
    'short',
    30.63,
    0,
    NULL,
    NULL,
    15,
    'verified',
    ARRAY['production-ledger', 'youtube-api'],
    '2026-11-15'::timestamptz,
    '2026-11-15'::timestamptz,
    'published',
    'Direct Higgsfield costs only, no failed attempts'
  ),
  (
    v_ember_stream_id,
    'ep12',
    'Ep12 Short',
    'short',
    30.93,
    0,
    NULL,
    NULL,
    49,
    'verified',
    ARRAY['production-ledger', 'youtube-api'],
    '2026-11-18'::timestamptz,
    '2026-11-18'::timestamptz,
    'published',
    'Direct Higgsfield costs only, no failed attempts'
  );
  
  RAISE NOTICE 'Added Ember costs: Ep11 $30.63 (15 views), Ep12 $30.93 (49 views)';
  
  -- Create Studio stream
  INSERT INTO streams (workspace_id, name, category, description, connected, data_source, visible)
  VALUES (
    v_workspace_id,
    'Studio · Peak Glow Up',
    'production',
    'AI series production. 5 episodes completed, costs tracked in credits + USD.',
    true,
    'Manual ledger (SPEND.md) + Higgsfield + ElevenLabs APIs',
    true
  )
  RETURNING id INTO v_studio_stream_id;
  
  RAISE NOTICE 'Created Studio stream: %', v_studio_stream_id;
  
  -- Studio output costs (REAL data, credit units NOT converted)
  INSERT INTO output_costs (
    stream_id, output_id, output_name, output_type,
    generation_cost_usd, failed_renders_cost_usd,
    higgsfield_credits, elevenlabs_characters, elevenlabs_cost_usd,
    views, trust_level, verified_sources,
    created_at,
    lifecycle, cost_coverage_note
  ) VALUES
  (
    v_studio_stream_id,
    'ep01',
    'Ep01',
    'episode',
    0, -- Not converted to USD, kept as credits
    0,
    6576.5, -- Higgsfield credits
    NULL,
    NULL,
    NULL,
    'verified',
    ARRAY['higgsfield-api'],
    '2026-10-01'::timestamptz,
    'finished',
    '6,576.5 HF credits (not converted to USD)'
  ),
  (
    v_studio_stream_id,
    'ep02',
    'Ep02',
    'episode',
    0, -- Not converted to USD, kept as credits
    0,
    3842.5, -- Higgsfield credits
    3695.67, -- ElevenLabs characters (not converted)
    NULL,
    NULL,
    'verified',
    ARRAY['higgsfield-api', 'elevenlabs-api'],
    '2026-10-15'::timestamptz,
    'finished',
    '3,842.5 HF credits + 3,696 EL chars (not converted to USD)'
  ),
  (
    v_studio_stream_id,
    'ep05',
    'Ep05',
    'episode',
    88.04,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    'verified',
    ARRAY['spend-md'],
    '2026-11-10'::timestamptz,
    'finished',
    'Direct USD costs from SPEND.md ledger'
  );
  
  RAISE NOTICE 'Added Studio costs: Ep01 (6576.5 HF credits), Ep02 (3842.5 HF + 3695.67 EL chars), Ep05 ($88.04)';
  
  RAISE NOTICE 'Seed complete! Check /top-floor and /streams/[id]/costs';
END $$;
