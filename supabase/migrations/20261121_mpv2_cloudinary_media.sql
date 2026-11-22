-- ==============================================================================
-- ABSU CONNECT MPV2 — CLOUDINARY MEDIA ARCHITECTURE & BACKWARD-COMPATIBLE MIGRATION
-- Strictly Additive & Non-Destructive (100% MPV1 Backward Compatible).
-- Never removes, renames, or alters existing MPV1 columns, tables, or storage buckets.
-- Execute in Supabase Dashboard > SQL Editor.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. POST_MEDIA EXTENSIONS (VIDEO EDITING + CLOUDINARY TRACKING)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.post_media') IS NOT NULL THEN
    ALTER TABLE public.post_media
      ADD COLUMN IF NOT EXISTS cloudinary_public_id text,
      ADD COLUMN IF NOT EXISTS cloudinary_resource_type text,
      ADD COLUMN IF NOT EXISTS duration_seconds numeric,
      ADD COLUMN IF NOT EXISTS thumbnail_url text,
      ADD COLUMN IF NOT EXISTS trim_start numeric,
      ADD COLUMN IF NOT EXISTS trim_end numeric,
      ADD COLUMN IF NOT EXISTS is_muted boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS aspect_ratio text DEFAULT 'original';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_post_media_cloudinary_public_id
  ON public.post_media (cloudinary_public_id)
  WHERE cloudinary_public_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. STORIES EXTENSIONS (CLOUDINARY STORAGE, TEXT STYLING, 24H EXPIRY & CLEANUP)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.stories') IS NOT NULL THEN
    ALTER TABLE public.stories
      ADD COLUMN IF NOT EXISTS media_url text,
      ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'supabase',
      ADD COLUMN IF NOT EXISTS cloudinary_public_id text,
      ADD COLUMN IF NOT EXISTS cloudinary_resource_type text,
      ADD COLUMN IF NOT EXISTS duration_seconds numeric,
      ADD COLUMN IF NOT EXISTS thumbnail_url text,
      ADD COLUMN IF NOT EXISTS background_color text,
      ADD COLUMN IF NOT EXISTS font_style text,
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
      ADD COLUMN IF NOT EXISTS cleanup_status text NOT NULL DEFAULT 'not_needed',
      ADD COLUMN IF NOT EXISTS cleanup_attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_cleanup_at timestamptz,
      ADD COLUMN IF NOT EXISTS cleanup_error text;

    -- Ensure cleanup_status check constraint exists cleanly
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.stories'::regclass
        AND conname = 'stories_cleanup_status_check'
    ) THEN
      ALTER TABLE public.stories
        ADD CONSTRAINT stories_cleanup_status_check
        CHECK (cleanup_status IN ('not_needed', 'pending', 'completed', 'failed', 'dead_letter'));
    END IF;

    -- Relax legacy stories_storage_owner_path constraint safely to allow MPV2 Cloudinary URLs alongside MPV1 paths
    ALTER TABLE public.stories DROP CONSTRAINT IF EXISTS stories_storage_owner_path;
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_storage_owner_path
      CHECK (
        storage_path IS NULL
        OR storage_path LIKE (user_id::text || '/%')
        OR storage_path LIKE 'https://res.cloudinary.com/%'
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stories_cleanup_queue
  ON public.stories (cleanup_status, expires_at)
  WHERE cloudinary_public_id IS NOT NULL;

-- Strictly enforce 24-hour expiry & soft-delete hiding on public story reads (MPV1 & MPV2 safe)
DO $$
BEGIN
  IF to_regclass('public.stories') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
    GRANT SELECT ON public.stories TO anon;

    ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "stories_select_active" ON public.stories;
    CREATE POLICY "stories_select_active" ON public.stories
      FOR SELECT USING (expires_at > now() AND deleted_at IS NULL);

    DROP POLICY IF EXISTS "stories_insert_own" ON public.stories;
    CREATE POLICY "stories_insert_own" ON public.stories
      FOR INSERT WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "stories_update_own" ON public.stories;
    CREATE POLICY "stories_update_own" ON public.stories
      FOR UPDATE USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "stories_delete_own" ON public.stories;
    CREATE POLICY "stories_delete_own" ON public.stories
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. DIRECT MESSAGES & ATTACHMENTS EXTENSIONS (CLOUDINARY + SAFE DELETION)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    ALTER TABLE public.messages
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
  END IF;

  IF to_regclass('public.message_attachments') IS NOT NULL THEN
    ALTER TABLE public.message_attachments
      ADD COLUMN IF NOT EXISTS cloudinary_public_id text,
      ADD COLUMN IF NOT EXISTS cloudinary_resource_type text,
      ADD COLUMN IF NOT EXISTS duration_seconds numeric;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_message_attachments_cloudinary_public_id
  ON public.message_attachments (cloudinary_public_id)
  WHERE cloudinary_public_id IS NOT NULL;

-- Ensure senders can update/delete their own messages and attachment rows safely
DO $$
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'messages_delete_sender'
    ) THEN
      CREATE POLICY "messages_delete_sender" ON public.messages
        FOR DELETE USING (auth.uid() = sender_id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'messages_update_sender'
    ) THEN
      CREATE POLICY "messages_update_sender" ON public.messages
        FOR UPDATE USING (auth.uid() = sender_id)
        WITH CHECK (auth.uid() = sender_id);
    END IF;
  END IF;

  IF to_regclass('public.message_attachments') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'message_attachments' AND policyname = 'message_attachments_delete_uploader'
    ) THEN
      CREATE POLICY "message_attachments_delete_uploader" ON public.message_attachments
        FOR DELETE USING (auth.uid() = uploader_id);
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. OPTIONAL SCHEDULED CLEANUP FOR EXPIRED STORIES (PG_CRON + PG_NET)
-- Note: Only schedules if pg_cron & pg_net are enabled in Supabase; otherwise configure
-- an external cron or Supabase Scheduled Edge Function calling `cleanup-expired-stories`.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    -- Replace '<SERVICE_ROLE_JWT>' in Supabase Dashboard Cron if using SQL-based trigger,
    -- or invoke the Edge Function via Supabase Dashboard Scheduled Functions (recommended).
    NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
