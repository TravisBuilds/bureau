-- Add 'admin' role value before phase1
-- Date: 2026-11-24
-- Purpose: Idempotent admin role addition (phase1 uses it at line 64)

SET search_path TO bureau, extensions;

-- Add admin to member_role enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'admin' 
    AND enumtypid = 'bureau.member_role'::regtype
  ) THEN
    ALTER TYPE bureau.member_role ADD VALUE 'admin';
  END IF;
END $$;
