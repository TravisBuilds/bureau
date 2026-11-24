-- Digital Clone Phase 0: Device Flow Client
-- Date: 2026-11-24
-- Purpose: Add script-device client for CLI/script OAuth device flow

SET search_path TO bureau, extensions;

-- Add script-device client for device flow
INSERT INTO bureau.oauth_clients (
  client_id, 
  client_name, 
  redirect_uris, 
  registration, 
  vendor, 
  verified,
  metadata
) VALUES (
  'script-device',
  'Bureau CLI/Script (Device Flow)',
  ARRAY['urn:ietf:wg:oauth:2.0:oob'],
  'static',
  'script',
  true,
  '{"description": "OAuth device flow for CLI scripts and automation tools"}'::jsonb
)
ON CONFLICT (client_id) DO NOTHING;

COMMENT ON TABLE bureau.oauth_clients IS 'Added script-device client for device flow';
