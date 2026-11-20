-- Ensure `device_push_tokens` exists and supports both Android APK and Web Browser FCM tokens.
-- Idempotent migration: safe to run against existing ABSU Connect Supabase databases.

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure missing columns exist if table was created earlier without updated_at
ALTER TABLE public.device_push_tokens
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Drop any pre-existing CHECK constraint on platform regardless of its constraint name
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.device_push_tokens'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%platform%'
  LOOP
    EXECUTE format('ALTER TABLE public.device_push_tokens DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.device_push_tokens
  ADD CONSTRAINT device_push_tokens_platform_check
  CHECK (platform IN ('android', 'ios', 'web'));

-- Ensure unique (user_id, token) for idempotent client upserts
CREATE UNIQUE INDEX IF NOT EXISTS device_push_tokens_user_id_token_key
  ON public.device_push_tokens (user_id, token);

CREATE INDEX IF NOT EXISTS device_push_tokens_user_id_platform_idx
  ON public.device_push_tokens (user_id, platform, updated_at DESC);

-- Enable Row Level Security
ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own device push tokens" ON public.device_push_tokens;
CREATE POLICY "Users can view their own device push tokens"
  ON public.device_push_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own device push tokens" ON public.device_push_tokens;
CREATE POLICY "Users can insert their own device push tokens"
  ON public.device_push_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own device push tokens" ON public.device_push_tokens;
CREATE POLICY "Users can update their own device push tokens"
  ON public.device_push_tokens
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own device push tokens" ON public.device_push_tokens;
CREATE POLICY "Users can delete their own device push tokens"
  ON public.device_push_tokens
  FOR DELETE
  USING (auth.uid() = user_id);
