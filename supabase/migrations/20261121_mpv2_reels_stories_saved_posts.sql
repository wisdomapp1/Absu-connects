-- ==============================================================================
-- ABSU CONNECT MPV2 — REELS, SAVED POSTS, SEARCH INDEXES & PRIVACY HARDENING
-- Strictly Additive & 100% MPV1 Backward Compatible.
-- Never removes, renames, or modifies existing MPV1 columns/tables/endpoints.
-- Execute in Supabase Dashboard > SQL Editor.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SAVED_POSTS (BOOKMARKS FOR POSTS & REELS — ZERO MEDIA DUPLICATION)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.saved_posts'::regclass
      AND contype IN ('u', 'p')
      AND pg_get_constraintdef(oid) LIKE '%user_id%post_id%'
  ) THEN
    ALTER TABLE public.saved_posts
      ADD CONSTRAINT saved_posts_user_id_post_id_key UNIQUE (user_id, post_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_saved_posts_user_created
  ON public.saved_posts (user_id, created_at DESC);

ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_posts_select_own" ON public.saved_posts;
CREATE POLICY "saved_posts_select_own" ON public.saved_posts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_posts_insert_own" ON public.saved_posts;
CREATE POLICY "saved_posts_insert_own" ON public.saved_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_posts_delete_own" ON public.saved_posts;
CREATE POLICY "saved_posts_delete_own" ON public.saved_posts
  FOR DELETE USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. REELS DISCOVERY & SEARCH PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_post_media_kind_post_id
  ON public.post_media (kind, post_id, position);

CREATE INDEX IF NOT EXISTS idx_posts_visibility_created_at
  ON public.posts (visibility, created_at DESC);

-- Optional trigram indexes for fast ILIKE caption, hashtag, and username Reels search
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  IF to_regclass('public.posts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_posts_body_trgm
      ON public.posts USING gin (body gin_trgm_ops);
  END IF;
  IF to_regclass('public.profiles') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm
      ON public.profiles USING gin (display_name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm
      ON public.profiles USING gin (username gin_trgm_ops);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 3. STRICT PRIVACY ISOLATION BETWEEN REELS/POSTS AND DIRECT MESSAGE ATTACHMENTS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.message_attachments') IS NOT NULL
     AND to_regclass('public.messages') IS NOT NULL
     AND to_regclass('public.conversation_members') IS NOT NULL THEN
    ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "message_attachments_member_select_strict" ON public.message_attachments;
    CREATE POLICY "message_attachments_member_select_strict" ON public.message_attachments
      FOR SELECT USING (
        auth.uid() = uploader_id
        OR EXISTS (
          SELECT 1
          FROM public.messages m
          JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
          WHERE m.id = message_attachments.message_id
            AND cm.user_id = auth.uid()
        )
      );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
