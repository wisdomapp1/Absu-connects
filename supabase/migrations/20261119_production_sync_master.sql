-- ==============================================================================
-- ABSU CONNECT — MASTER PRODUCTION SYNCHRONIZATION MIGRATION (2026-11-19)
-- Idempotent & Strictly Non-Destructive (zero data deletion).
-- Execute in Supabase Dashboard > SQL Editor.
-- Consolidates & fixes:
--   1. Mr Anonymous auto-approve BEFORE INSERT trigger + pending backfill
--   2. Deep-link notification columns (post_id, comment_id, parent_comment_id),
--      backfill, 60s deduplicated triggers, and discovery RPCs
--   3. Communities, Campus Events, Saved Posts & non-recursive RLS
--   4. Fixed Posts / Pages / Media / Comments visibility RLS (no cm.membership_status bug)
--   5. Unified Android + Web FCM device_push_tokens, user_presence & storage buckets
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ANONYMOUS SUBMISSIONS AUTO-APPROVE TRIGGER & SAFE PUBLISHING
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_sub RECORD;
  v_post_id uuid;
  v_mr_anon_author_id constant uuid := 'b4f38505-fce6-44be-8727-8ebf04eb2ceb';
  v_mr_anon_page_id   constant uuid := '0c3240e3-ae39-461d-bd7a-4963859b9bc7';
BEGIN
  IF to_regclass('public.anonymous_submissions') IS NOT NULL THEN
    FOR v_sub IN
      SELECT id, page_id, body, published_post_id, created_at
      FROM public.anonymous_submissions
      WHERE status = 'pending'
      ORDER BY created_at ASC
    LOOP
      v_post_id := v_sub.published_post_id;

      IF v_post_id IS NULL THEN
        INSERT INTO public.posts (
          author_id,
          page_id,
          body,
          visibility,
          created_at,
          updated_at
        )
        VALUES (
          v_mr_anon_author_id,
          COALESCE(v_sub.page_id, v_mr_anon_page_id),
          v_sub.body,
          'public',
          COALESCE(v_sub.created_at, now()),
          now()
        )
        RETURNING id INTO v_post_id;
      END IF;

      UPDATE public.anonymous_submissions
      SET
        status = 'approved',
        reviewed_at = COALESCE(reviewed_at, now()),
        published_post_id = v_post_id,
        updated_at = now()
      WHERE id = v_sub.id
        AND status = 'pending';
    END LOOP;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.auto_approve_new_anonymous_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id uuid;
  v_mr_anon_author_id constant uuid := 'b4f38505-fce6-44be-8727-8ebf04eb2ceb';
  v_mr_anon_page_id   constant uuid := '0c3240e3-ae39-461d-bd7a-4963859b9bc7';
BEGIN
  IF (NEW.status IS NULL OR NEW.status = 'pending') AND NEW.published_post_id IS NULL THEN
    INSERT INTO public.posts (
      author_id,
      page_id,
      body,
      visibility,
      created_at,
      updated_at
    )
    VALUES (
      v_mr_anon_author_id,
      COALESCE(NEW.page_id, v_mr_anon_page_id),
      NEW.body,
      'public',
      COALESCE(NEW.created_at, now()),
      now()
    )
    RETURNING id INTO v_post_id;

    NEW.status := 'approved';
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
    NEW.published_post_id := v_post_id;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.anonymous_submissions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_auto_approve_anonymous_submission ON public.anonymous_submissions;
    CREATE TRIGGER trg_auto_approve_anonymous_submission
      BEFORE INSERT ON public.anonymous_submissions
      FOR EACH ROW
      EXECUTE FUNCTION public.auto_approve_new_anonymous_submission();
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'submit_anonymous_post'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.submit_anonymous_post(text) TO authenticated';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. NOTIFICATIONS SCHEMA, DEEP-LINK IDENTIFIERS, TRIGGERS & DISCOVERY RPCs
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

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS post_id uuid,
  ADD COLUMN IF NOT EXISTS comment_id uuid,
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'Users can view their own notifications'
  ) THEN
    CREATE POLICY "Users can view their own notifications"
      ON public.notifications FOR SELECT USING (auth.uid() = recipient_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'Users can update their own notifications'
  ) THEN
    CREATE POLICY "Users can update their own notifications"
      ON public.notifications FOR UPDATE USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'Authenticated users can create notifications'
  ) THEN
    CREATE POLICY "Authenticated users can create notifications"
      ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_post_id
  ON public.notifications (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_comment_id
  ON public.notifications (comment_id)
  WHERE comment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique_discovery_once
  ON public.notifications (recipient_id, entity_type)
  WHERE entity_type IN ('discovery_welcome', 'discovery_reminder');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reaction'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'comment'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'message'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'announcement'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'welcome_discovery'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'discovery_suggestion'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'discovery_reminder'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'community_post'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'event_reminder'; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;

-- Backfill legacy notification targets cleanly
UPDATE public.notifications n
SET post_id = n.entity_id::uuid
WHERE n.post_id IS NULL
  AND n.entity_type = 'post'
  AND n.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE public.notifications n
SET
  comment_id = c.id,
  post_id = COALESCE(n.post_id, c.post_id),
  parent_comment_id = COALESCE(n.parent_comment_id, c.parent_comment_id)
FROM public.comments c
WHERE n.entity_type IN ('comment', 'comment_reply', 'comment_reaction')
  AND n.entity_id = c.id::text
  AND (n.comment_id IS NULL OR n.post_id IS NULL);

-- Comment & reply notification trigger (deep-link columns + 60s dedupe)
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
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE recipient_id = v_parent_author
          AND actor_id = NEW.author_id
          AND type = 'comment'
          AND comment_id = NEW.id
          AND created_at > now() - interval '60 seconds'
      ) THEN
        INSERT INTO public.notifications (
          recipient_id, actor_id, type, entity_type, entity_id,
          post_id, comment_id, parent_comment_id, title, body
        )
        VALUES (
          v_parent_author, NEW.author_id, 'comment', 'comment_reply', NEW.id::text,
          NEW.post_id, NEW.id, NEW.parent_comment_id, 'New Comment Reply', 'replied to your comment.'
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  SELECT author_id INTO v_recipient FROM public.posts WHERE id = NEW.post_id;
  IF v_recipient IS NOT NULL AND v_recipient <> NEW.author_id AND (v_parent_author IS NULL OR v_recipient <> v_parent_author) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE recipient_id = v_recipient
        AND actor_id = NEW.author_id
        AND type = 'comment'
        AND post_id = NEW.post_id
        AND created_at > now() - interval '60 seconds'
    ) THEN
      INSERT INTO public.notifications (
        recipient_id, actor_id, type, entity_type, entity_id,
        post_id, comment_id, parent_comment_id, title, body
      )
      VALUES (
        v_recipient,
        NEW.author_id,
        'comment',
        CASE WHEN NEW.parent_comment_id IS NOT NULL THEN 'comment_reply' ELSE 'comment' END,
        NEW.id::text,
        NEW.post_id,
        NEW.id,
        NEW.parent_comment_id,
        CASE WHEN NEW.parent_comment_id IS NOT NULL THEN 'New Comment Reply' ELSE 'New Comment' END,
        CASE WHEN NEW.parent_comment_id IS NOT NULL THEN 'replied to a comment on your post.' ELSE 'commented on your post.' END
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_comment_insert ON public.comments;
CREATE TRIGGER trg_notify_on_comment_insert
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_comment_insert();

-- Post reaction notification trigger (deep-link post_id + 60s dedupe)
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
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE recipient_id = v_recipient
        AND actor_id = NEW.user_id
        AND type = 'reaction'
        AND entity_type = 'post'
        AND post_id = NEW.post_id
        AND created_at > now() - interval '60 seconds'
    ) THEN
      INSERT INTO public.notifications (
        recipient_id, actor_id, type, entity_type, entity_id, post_id, title, body
      )
      VALUES (
        v_recipient, NEW.user_id, 'reaction', 'post', NEW.post_id::text, NEW.post_id, 'New Reaction', 'liked your post.'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_post_reaction_insert ON public.post_reactions;
CREATE TRIGGER trg_notify_on_post_reaction_insert
  AFTER INSERT ON public.post_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_post_reaction_insert();

-- Comment reaction notification trigger (deep-link post_id, comment_id, parent_comment_id + 60s dedupe)
CREATE OR REPLACE FUNCTION public.notify_on_comment_reaction_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comment_author uuid;
  v_post_id uuid;
  v_parent_id uuid;
BEGIN
  SELECT author_id, post_id, parent_comment_id
    INTO v_comment_author, v_post_id, v_parent_id
  FROM public.comments
  WHERE id = NEW.comment_id;

  IF v_comment_author IS NOT NULL AND v_comment_author <> NEW.user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE recipient_id = v_comment_author
        AND actor_id = NEW.user_id
        AND type = 'reaction'
        AND entity_type = 'comment_reaction'
        AND comment_id = NEW.comment_id
        AND created_at > now() - interval '60 seconds'
    ) THEN
      INSERT INTO public.notifications (
        recipient_id, actor_id, type, entity_type, entity_id,
        post_id, comment_id, parent_comment_id, title, body
      )
      VALUES (
        v_comment_author, NEW.user_id, 'reaction', 'comment_reaction', NEW.comment_id::text,
        v_post_id, NEW.comment_id, v_parent_id, 'Comment Liked', 'liked your comment.'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.comment_reactions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_notify_on_comment_reaction_insert ON public.comment_reactions;
    CREATE TRIGGER trg_notify_on_comment_reaction_insert
      AFTER INSERT ON public.comment_reactions
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_on_comment_reaction_insert();
  END IF;
END $$;

-- Discovery RPC 1
CREATE OR REPLACE FUNCTION public.generate_welcome_discovery_notification(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_user_name text;
  v_dept text;
  v_faculty text;
  v_online_count integer := 0;
  v_dept_count integer := 0;
  v_faculty_count integer := 0;
  v_total_peers integer := 0;
  v_body text;
  v_notif_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_existing_id
  FROM public.notifications
  WHERE recipient_id = p_user_id AND entity_type = 'discovery_welcome'
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  SELECT
    COALESCE(NULLIF(trim(display_name), ''), NULLIF(trim(username), ''), 'Scholar'),
    NULLIF(trim(department), ''),
    NULLIF(trim(faculty), '')
  INTO v_user_name, v_dept, v_faculty
  FROM public.profiles
  WHERE id = p_user_id;

  IF to_regclass('public.user_presence') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_online_count
    FROM public.user_presence up
    WHERE up.user_id <> p_user_id AND up.last_seen_at > now() - interval '3 minutes';
  END IF;

  IF v_dept IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dept_count
    FROM public.profiles p
    WHERE p.id <> p_user_id AND lower(trim(COALESCE(p.department, ''))) = lower(v_dept);
  END IF;

  IF v_faculty IS NOT NULL THEN
    SELECT COUNT(*) INTO v_faculty_count
    FROM public.profiles p
    WHERE p.id <> p_user_id AND lower(trim(COALESCE(p.faculty, ''))) = lower(v_faculty);
  END IF;

  SELECT COUNT(*) INTO v_total_peers FROM public.profiles p WHERE p.id <> p_user_id;

  IF v_online_count > 0 AND v_dept_count > 0 THEN
    v_body := format(
      'Welcome to ABSU Connect, %s! %s %s online right now and %s %s in %s ready to connect. Tap to meet peers in Friend Navigator.',
      split_part(v_user_name, ' ', 1), v_online_count,
      CASE WHEN v_online_count = 1 THEN 'student is' ELSE 'students are' END,
      v_dept_count, CASE WHEN v_dept_count = 1 THEN 'coursemate' ELSE 'coursemates' END, v_dept
    );
  ELSIF v_online_count > 0 THEN
    v_body := format(
      'Welcome to ABSU Connect, %s! %s %s active online right now. Tap to discover coursemates and campus friends.',
      split_part(v_user_name, ' ', 1), v_online_count,
      CASE WHEN v_online_count = 1 THEN 'ABSU student is' ELSE 'ABSU students are' END
    );
  ELSIF v_dept_count > 0 THEN
    v_body := format(
      'Welcome to ABSU Connect, %s! %s %s from %s %s already here. Tap to discover and connect.',
      split_part(v_user_name, ' ', 1), v_dept_count,
      CASE WHEN v_dept_count = 1 THEN 'student' ELSE 'students' END,
      v_dept, CASE WHEN v_dept_count = 1 THEN 'is' ELSE 'are' END
    );
  ELSIF v_faculty_count > 0 THEN
    v_body := format(
      'Welcome to ABSU Connect, %s! %s %s from %s are waiting to connect. Open Friend Navigator to start.',
      split_part(v_user_name, ' ', 1), v_faculty_count,
      CASE WHEN v_faculty_count = 1 THEN 'student' ELSE 'students' END, v_faculty
    );
  ELSIF v_total_peers > 0 THEN
    v_body := format(
      'Welcome to ABSU Connect, %s! %s fellow ABSU students are on campus here. Tap to explore Friend Navigator.',
      split_part(v_user_name, ' ', 1), v_total_peers
    );
  ELSE
    v_body := format(
      'Welcome to ABSU Connect, %s! Your profile is live—open Friend Navigator to discover coursemates as students join.',
      split_part(v_user_name, ' ', 1)
    );
  END IF;

  INSERT INTO public.notifications (
    recipient_id, actor_id, type, entity_type, entity_id, title, body, read_at
  )
  VALUES (
    p_user_id, NULL, 'system', 'discovery_welcome', p_user_id::text, 'Welcome to ABSU Connect', v_body, NULL
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_notif_id;

  RETURN v_notif_id;
END;
$$;

-- Discovery RPC 2
CREATE OR REPLACE FUNCTION public.check_discovery_inactivity_reminder(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_created_at timestamptz;
  v_has_activity boolean := false;
  v_peer_count integer := 0;
  v_notif_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_existing_id
  FROM public.notifications
  WHERE recipient_id = p_user_id AND entity_type = 'discovery_reminder'
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  SELECT created_at INTO v_created_at FROM public.profiles WHERE id = p_user_id;
  IF v_created_at IS NULL OR v_created_at > now() - interval '24 hours' THEN
    RETURN NULL;
  END IF;

  SELECT (
    EXISTS (SELECT 1 FROM public.posts WHERE author_id = p_user_id)
    OR EXISTS (
      SELECT 1 FROM public.friendships
      WHERE requester_id = p_user_id OR addressee_id = p_user_id
    )
  ) INTO v_has_activity;

  IF v_has_activity THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_peer_count FROM public.profiles WHERE id <> p_user_id;

  INSERT INTO public.notifications (
    recipient_id, actor_id, type, entity_type, entity_id, title, body, read_at
  )
  VALUES (
    p_user_id, NULL, 'system', 'discovery_reminder', p_user_id::text, 'Connect With Coursemates',
    CASE
      WHEN v_peer_count > 0 THEN format('Ready to grow your campus circle? %s ABSU peers are waiting in Friend Navigator Discover.', v_peer_count)
      ELSE 'Ready to grow your campus circle? Open Friend Navigator Discover to find coursemates and faculty peers.'
    END,
    NULL
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_notif_id;

  RETURN v_notif_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_welcome_discovery_notification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_discovery_inactivity_reminder(uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. SAVED POSTS, COMMUNITIES & CAMPUS EVENTS SCHEMA + NON-RECURSIVE RLS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_posts_user_created
  ON public.saved_posts (user_id, created_at DESC);

ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "saved_posts_select_own" ON public.saved_posts;
  DROP POLICY IF EXISTS "saved_posts_insert_own" ON public.saved_posts;
  DROP POLICY IF EXISTS "saved_posts_delete_own" ON public.saved_posts;
END $$;

CREATE POLICY "saved_posts_select_own" ON public.saved_posts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saved_posts_insert_own" ON public.saved_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_posts_delete_own" ON public.saved_posts
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'General',
  image_url text,
  cover_image_url text,
  location text DEFAULT 'Uturu (Main Campus)',
  privacy text NOT NULL DEFAULT 'public' CHECK (privacy IN ('public', 'private')),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rules text,
  rules_list jsonb DEFAULT '[]'::jsonb,
  members_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'suspended')),
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'approved', 'pending', 'rejected', 'banned')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.campus_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Academic',
  organizer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  venue text NOT NULL DEFAULT 'Uturu Main Campus',
  campus text NOT NULL DEFAULT 'Uturu (Main Campus)',
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  poster_url text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'campus_only')),
  registration_link text,
  is_online boolean DEFAULT false,
  online_url text,
  capacity_limit integer,
  community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL,
  interested_count integer NOT NULL DEFAULT 0,
  going_count integer NOT NULL DEFAULT 0,
  views_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.campus_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response text NOT NULL CHECK (response IN ('interested', 'going')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.saved_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.campus_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE OR REPLACE FUNCTION public.is_community_member(p_community_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = p_community_id
      AND user_id = p_user_id
      AND status IN ('active', 'approved')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_community_manager(p_community_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = p_community_id AND c.creator_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.community_id = p_community_id
      AND cm.user_id = p_user_id
      AND cm.role IN ('owner', 'admin', 'moderator')
      AND cm.status IN ('active', 'approved')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_community_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_manager(uuid, uuid) TO authenticated;

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('communities', 'community_members', 'campus_events', 'event_participants', 'saved_events')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, pol.tablename);
  END LOOP;
END $$;

CREATE POLICY "communities_select_all" ON public.communities FOR SELECT USING (true);
CREATE POLICY "communities_insert_own" ON public.communities FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "communities_update_manager" ON public.communities FOR UPDATE USING (public.is_community_manager(id, auth.uid()));
CREATE POLICY "communities_delete_creator" ON public.communities FOR DELETE USING (auth.uid() = creator_id);

CREATE POLICY "community_members_select_all" ON public.community_members FOR SELECT USING (true);
CREATE POLICY "community_members_insert_self_or_manager" ON public.community_members
  FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_community_manager(community_id, auth.uid()));
CREATE POLICY "community_members_update_manager" ON public.community_members
  FOR UPDATE USING (auth.uid() = user_id OR public.is_community_manager(community_id, auth.uid()));
CREATE POLICY "community_members_delete_self_or_manager" ON public.community_members
  FOR DELETE USING (auth.uid() = user_id OR public.is_community_manager(community_id, auth.uid()));

CREATE POLICY "campus_events_select_all" ON public.campus_events FOR SELECT USING (true);
CREATE POLICY "campus_events_insert_own" ON public.campus_events FOR INSERT WITH CHECK (auth.uid() = organizer_id);
CREATE POLICY "campus_events_update_own" ON public.campus_events FOR UPDATE USING (auth.uid() = organizer_id);
CREATE POLICY "campus_events_delete_own" ON public.campus_events FOR DELETE USING (auth.uid() = organizer_id);

CREATE POLICY "event_participants_select_all" ON public.event_participants FOR SELECT USING (true);
CREATE POLICY "event_participants_insert_own" ON public.event_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "event_participants_update_own" ON public.event_participants
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "event_participants_delete_own" ON public.event_participants FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "saved_events_select_own" ON public.saved_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saved_events_insert_own" ON public.saved_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_events_delete_own" ON public.saved_events FOR DELETE USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 4. POSTS, PAGES, MEDIA, REACTIONS & COMMENTS VISIBILITY RLS (NON-RECURSIVE)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.pages') IS NOT NULL THEN
    GRANT SELECT ON public.pages TO anon, authenticated;
    ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "pages_select_active" ON public.pages;
    CREATE POLICY "pages_select_active" ON public.pages
      FOR SELECT USING (COALESCE(is_active, true) = true);
  END IF;
END $$;

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'posts' AND cmd = 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.posts;', pol.policyname);
    END LOOP;

    CREATE POLICY "posts_select_visible" ON public.posts
      FOR SELECT USING (
        NOT EXISTS (
          SELECT 1
          FROM public.user_blocks ub
          WHERE auth.uid() IS NOT NULL
            AND posts.page_id IS NULL
            AND (
              (ub.blocker_id = auth.uid() AND ub.blocked_id = posts.author_id)
              OR (ub.blocked_id = auth.uid() AND ub.blocker_id = posts.author_id)
            )
        )
        AND (
          (auth.uid() IS NOT NULL AND posts.author_id = auth.uid())
          OR (
            posts.visibility::text = 'public'
            AND (
              posts.community_id IS NULL
              OR NOT EXISTS (
                SELECT 1 FROM public.communities c
                WHERE c.id = posts.community_id AND c.privacy = 'private'
              )
              OR (
                auth.uid() IS NOT NULL
                AND (
                  public.is_community_member(posts.community_id, auth.uid())
                  OR public.is_community_manager(posts.community_id, auth.uid())
                )
              )
            )
          )
          OR (
            auth.uid() IS NOT NULL
            AND posts.visibility::text = 'campus'
          )
          OR (
            auth.uid() IS NOT NULL
            AND posts.visibility::text = 'friends'
            AND EXISTS (
              SELECT 1 FROM public.friendships f
              WHERE f.status = 'accepted'
                AND (
                  (f.requester_id = auth.uid() AND f.addressee_id = posts.author_id)
                  OR (f.addressee_id = auth.uid() AND f.requester_id = posts.author_id)
                )
            )
          )
        )
      );
  END IF;
END $$;

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.post_media') IS NOT NULL THEN
    ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'post_media' AND cmd = 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.post_media;', pol.policyname);
    END LOOP;
    CREATE POLICY "post_media_select_visible" ON public.post_media
      FOR SELECT USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_media.post_id));
  END IF;

  IF to_regclass('public.post_reactions') IS NOT NULL THEN
    ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'post_reactions' AND cmd = 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.post_reactions;', pol.policyname);
    END LOOP;
    CREATE POLICY "post_reactions_select_visible" ON public.post_reactions
      FOR SELECT USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_reactions.post_id));
  END IF;

  IF to_regclass('public.comments') IS NOT NULL THEN
    ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'comments' AND cmd = 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.comments;', pol.policyname);
    END LOOP;
    CREATE POLICY "comments_select_visible" ON public.comments
      FOR SELECT USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. FCM PUSH TOKENS (ANDROID + WEB), PRESENCE & STORAGE BUCKETS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.device_push_tokens
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

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

CREATE UNIQUE INDEX IF NOT EXISTS device_push_tokens_user_id_token_key
  ON public.device_push_tokens (user_id, token);

CREATE INDEX IF NOT EXISTS device_push_tokens_user_id_platform_idx
  ON public.device_push_tokens (user_id, platform, updated_at DESC);

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own device push tokens" ON public.device_push_tokens;
CREATE POLICY "Users can view their own device push tokens"
  ON public.device_push_tokens FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own device push tokens" ON public.device_push_tokens;
CREATE POLICY "Users can insert their own device push tokens"
  ON public.device_push_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own device push tokens" ON public.device_push_tokens;
CREATE POLICY "Users can update their own device push tokens"
  ON public.device_push_tokens FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own device push tokens" ON public.device_push_tokens;
CREATE POLICY "Users can delete their own device push tokens"
  ON public.device_push_tokens FOR DELETE USING (auth.uid() = user_id);

DO $$
BEGIN
  IF to_regclass('public.user_presence') IS NOT NULL THEN
    ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "user_presence_select_auth" ON public.user_presence;
    CREATE POLICY "user_presence_select_auth" ON public.user_presence
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('event-flyers', 'event-flyers', true, 15728640, ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']),
  ('community-images', 'community-images', true, 15728640, ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 15728640;

DO $$
BEGIN
  DROP POLICY IF EXISTS "event_flyers_insert_own" ON storage.objects;
  DROP POLICY IF EXISTS "event_flyers_select_public" ON storage.objects;
  DROP POLICY IF EXISTS "event_flyers_delete_own" ON storage.objects;
  DROP POLICY IF EXISTS "community_images_insert_own" ON storage.objects;
  DROP POLICY IF EXISTS "community_images_select_public" ON storage.objects;
  DROP POLICY IF EXISTS "community_images_delete_own" ON storage.objects;
END $$;

CREATE POLICY "event_flyers_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-flyers' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "event_flyers_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'event-flyers');
CREATE POLICY "event_flyers_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'event-flyers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "community_images_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "community_images_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'community-images');
CREATE POLICY "community_images_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'community-images' AND (storage.foldername(name))[1] = auth.uid()::text);
