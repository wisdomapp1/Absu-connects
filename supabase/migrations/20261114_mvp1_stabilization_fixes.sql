-- ==============================================================================
-- ABSU CONNECT — MVP 1 STABILIZATION & DATABASE REPAIR MIGRATION
-- Execute in Supabase Dashboard > SQL Editor
-- Idempotent: safe to run multiple times
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FIX `uuid = text` OPERATOR MISMATCH ON NOTIFICATIONS & NOTIFICATION TRIGGERS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'entity_id'
      AND data_type <> 'text'
  ) THEN
    ALTER TABLE public.notifications
      ALTER COLUMN entity_id TYPE text USING entity_id::text;
  END IF;
END $$;

-- Drop custom non-system triggers on social interaction & media tables that may contain
-- broken uuid = text comparisons against notifications.entity_id or non-existent NEW.file_name fields
DO $$
DECLARE
  trig RECORD;
BEGIN
  FOR trig IN
    SELECT tgname, relname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND c.relname IN ('comments', 'post_reactions', 'comment_reactions', 'story_views', 'story_reactions', 'post_media')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I;', trig.tgname, trig.relname);
  END LOOP;
END $$;

-- Ensure notification_type enum allows story/comment/reaction values safely
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    BEGIN
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reaction';
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'comment';
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN
      ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'message';
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. STORIES, STORY VIEWS & STORY REACTIONS + PRIVATE `story-media` BUCKET
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('text', 'image', 'video')),
  storage_path text,
  text_content text,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.stories
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours');

CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON public.stories (expires_at DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_stories_user_id ON public.stories (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.story_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS public.story_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction text NOT NULL DEFAULT 'like',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, user_id)
);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('stories', 'story_views', 'story_reactions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, pol.tablename);
  END LOOP;
END $$;

CREATE POLICY "stories_select_active" ON public.stories
  FOR SELECT USING (expires_at > now() OR auth.uid() = user_id);

CREATE POLICY "stories_insert_own" ON public.stories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "stories_delete_own" ON public.stories
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "story_views_select_owner_or_viewer" ON public.story_views
  FOR SELECT USING (
    auth.uid() = viewer_id
    OR EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_views.story_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "story_views_insert_self" ON public.story_views
  FOR INSERT WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "story_reactions_select_auth" ON public.story_reactions
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "story_reactions_insert_self" ON public.story_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "story_reactions_delete_self" ON public.story_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Ensure private `story-media` storage bucket and policies
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('story-media', 'story-media', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400;

DO $$
BEGIN
  DROP POLICY IF EXISTS "story_media_insert_own" ON storage.objects;
  DROP POLICY IF EXISTS "story_media_select_auth" ON storage.objects;
  DROP POLICY IF EXISTS "story_media_delete_own" ON storage.objects;
END $$;

CREATE POLICY "story_media_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'story-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "story_media_select_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'story-media');

CREATE POLICY "story_media_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'story-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------------------------
-- 3. COMMENTS RECURSION FIX (42P17), THREADED REPLIES & INDEPENDENT LIKES
-- ------------------------------------------------------------------------------
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_comments_post_parent_created
  ON public.comments (post_id, parent_comment_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction text NOT NULL DEFAULT 'like',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment
  ON public.comment_reactions (comment_id, user_id);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('comments', 'comment_reactions', 'post_reactions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Non-recursive policies on comments
CREATE POLICY "comments_select_all" ON public.comments
  FOR SELECT USING (true);

CREATE POLICY "comments_insert_own" ON public.comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "comments_update_own" ON public.comments
  FOR UPDATE USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

CREATE POLICY "comments_delete_own" ON public.comments
  FOR DELETE USING (auth.uid() = author_id);

-- Independent comment_reactions policies
CREATE POLICY "comment_reactions_select_all" ON public.comment_reactions
  FOR SELECT USING (true);

CREATE POLICY "comment_reactions_insert_own" ON public.comment_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comment_reactions_delete_own" ON public.comment_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Independent post_reactions policies
CREATE POLICY "post_reactions_select_all" ON public.post_reactions
  FOR SELECT USING (true);

CREATE POLICY "post_reactions_insert_own" ON public.post_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "post_reactions_update_own" ON public.post_reactions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "post_reactions_delete_own" ON public.post_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Ensure clean, non-broken RLS policies on post_media & post-media storage bucket
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'post_media'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.post_media;', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "post_media_select_all" ON public.post_media
  FOR SELECT USING (true);

CREATE POLICY "post_media_insert_own" ON public.post_media
  FOR INSERT WITH CHECK (auth.uid() = uploader_id);

CREATE POLICY "post_media_delete_own" ON public.post_media
  FOR DELETE USING (auth.uid() = uploader_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('post-media', 'post-media', false, 26214400)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 26214400;

DO $$
BEGIN
  DROP POLICY IF EXISTS "post_media_bucket_insert_own" ON storage.objects;
  DROP POLICY IF EXISTS "post_media_bucket_select_auth" ON storage.objects;
  DROP POLICY IF EXISTS "post_media_bucket_delete_own" ON storage.objects;
END $$;

CREATE POLICY "post_media_bucket_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'post-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "post_media_bucket_select_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'post-media');

CREATE POLICY "post_media_bucket_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'post-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow voice note audio MIME types alongside photos, videos, and PDFs in chat-attachments
UPDATE storage.buckets
SET
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac',
    'application/pdf'
  ]
WHERE id = 'chat-attachments';

-- Clean type-safe notification triggers for comments & reactions (using ::text casts)
CREATE OR REPLACE FUNCTION public.notify_on_comment_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipient uuid;
  v_parent_author uuid;
BEGIN
  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT author_id INTO v_parent_author FROM public.comments WHERE id = NEW.parent_comment_id;
    IF v_parent_author IS NOT NULL AND v_parent_author <> NEW.author_id THEN
      INSERT INTO public.notifications (recipient_id, actor_id, type, entity_type, entity_id, title, body)
      VALUES (v_parent_author, NEW.author_id, 'comment', 'post', NEW.post_id::text, 'New Comment Reply', 'replied to your comment.')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  SELECT author_id INTO v_recipient FROM public.posts WHERE id = NEW.post_id;
  IF v_recipient IS NOT NULL AND v_recipient <> NEW.author_id AND (v_parent_author IS NULL OR v_recipient <> v_parent_author) THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, entity_type, entity_id, title, body)
    VALUES (v_recipient, NEW.author_id, 'comment', 'post', NEW.post_id::text, 'New Comment', 'commented on your post.')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_comment_insert
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_comment_insert();

CREATE OR REPLACE FUNCTION public.notify_on_post_reaction_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipient uuid;
BEGIN
  SELECT author_id INTO v_recipient FROM public.posts WHERE id = NEW.post_id;
  IF v_recipient IS NOT NULL AND v_recipient <> NEW.user_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, entity_type, entity_id, title, body)
    VALUES (v_recipient, NEW.user_id, 'reaction', 'post', NEW.post_id::text, 'New Reaction', 'liked your post.')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_post_reaction_insert
  AFTER INSERT ON public.post_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_post_reaction_insert();

-- ------------------------------------------------------------------------------
-- 4. CONVERSATIONS RLS & RPCs (`create_or_get_direct_conversation`, `reply_to_story`)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  );
$$;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('conversations', 'conversation_members')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, pol.tablename);
  END LOOP;
END $$;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select_member_or_creator" ON public.conversations
  FOR SELECT USING (
    auth.uid() = created_by
    OR public.is_conversation_member(id, auth.uid())
  );

CREATE POLICY "conversations_insert_creator" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "conversations_update_member" ON public.conversations
  FOR UPDATE USING (public.is_conversation_member(id, auth.uid()) OR auth.uid() = created_by);

CREATE POLICY "conversation_members_select_member" ON public.conversation_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_conversation_member(conversation_id, auth.uid())
  );

CREATE POLICY "conversation_members_insert_self_or_creator" ON public.conversation_members
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_id AND c.created_by = auth.uid()
      )
    )
  );

CREATE POLICY "conversation_members_update_self" ON public.conversation_members
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "conversation_members_delete_self" ON public.conversation_members
  FOR DELETE USING (user_id = auth.uid());

-- Canonical 1-on-1 Direct Conversation RPC
CREATE OR REPLACE FUNCTION public.create_or_get_direct_conversation(p_target_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_conv_id uuid;
  v_target_name text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_target_user_id IS NULL OR p_target_user_id = v_caller THEN
    RAISE EXCEPTION 'Invalid target user';
  END IF;

  SELECT c.id INTO v_conv_id
  FROM public.conversations c
  JOIN public.conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = v_caller
  JOIN public.conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = p_target_user_id
  WHERE COALESCE(c.is_group, false) = false
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  SELECT COALESCE(display_name, username, 'Direct Message')
    INTO v_target_name
  FROM public.profiles
  WHERE id = p_target_user_id;

  INSERT INTO public.conversations (is_group, title, created_by, last_message_at)
  VALUES (false, COALESCE(v_target_name, 'Direct Message'), v_caller, now())
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id, last_read_at)
  VALUES (v_conv_id, v_caller, now())
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  INSERT INTO public.conversation_members (conversation_id, user_id, last_read_at)
  VALUES (v_conv_id, p_target_user_id, NULL)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN v_conv_id;
END;
$$;

-- Canonical Story Reply -> Direct Message RPC
CREATE OR REPLACE FUNCTION public.reply_to_story(p_story_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner_id uuid;
  v_conv_id uuid;
  v_msg_id uuid;
  v_trimmed text := trim(COALESCE(p_body, ''));
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF length(v_trimmed) = 0 THEN
    RAISE EXCEPTION 'Reply body cannot be empty';
  END IF;

  SELECT user_id INTO v_owner_id FROM public.stories WHERE id = p_story_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Story not found or expired';
  END IF;
  IF v_owner_id = v_caller THEN
    RAISE EXCEPTION 'Cannot reply to your own story';
  END IF;

  v_conv_id := public.create_or_get_direct_conversation(v_owner_id);

  INSERT INTO public.messages (conversation_id, sender_id, body, created_at)
  VALUES (v_conv_id, v_caller, format('Replied to your story: "%s"', v_trimmed), now())
  RETURNING id INTO v_msg_id;

  UPDATE public.conversations
  SET last_message_at = now()
  WHERE id = v_conv_id;

  INSERT INTO public.notifications (recipient_id, actor_id, type, entity_type, entity_id, title, body, read_at)
  VALUES (v_owner_id, v_caller, 'message', 'conversation', v_conv_id::text, 'Story Reply', 'replied to your story.', NULL)
  ON CONFLICT DO NOTHING;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_or_get_direct_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_to_story(uuid, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. DISABLE EVENTS & COMMUNITIES DATA CLEANUP (TABLES & SCHEMAS PRESERVED)
-- ------------------------------------------------------------------------------
UPDATE public.posts
SET community_id = NULL
WHERE community_id IS NOT NULL;

DELETE FROM public.event_participants;
DELETE FROM public.saved_events;
DELETE FROM public.campus_events;
DELETE FROM public.community_members;
DELETE FROM public.communities;

-- Cleanup leftover probe conversations if still present
DELETE FROM public.conversations
WHERE id IN (
  '7b0908a8-f080-4f86-9c83-a650e893dbde',
  '30503b30-d367-47a1-84ac-63cac98bd56a'
);
