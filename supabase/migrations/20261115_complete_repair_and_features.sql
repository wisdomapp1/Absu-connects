-- ==============================================================================
-- ABSU CONNECT — COMPLETE STABILIZATION, FEATURE RESTORATION & SMART DISCOVERY
-- Execute in Supabase Dashboard > SQL Editor
-- Idempotent: safe to run multiple times; strictly non-destructive.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PERSISTENT BOOKMARKS (`public.saved_posts`)
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

-- Ensure posts supports pinned community posts cleanly
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------------------------
-- 2. MEDIA STORAGE BUCKETS: ENABLE IMAGES + VIDEOS UP TO 50MB
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-media',
  'post-media',
  false,
  52428800,
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg'
  ];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'story-media',
  'story-media',
  false,
  52428800,
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg'
  ];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-flyers',
  'event-flyers',
  true,
  15728640,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 15728640;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-images',
  'community-images',
  true,
  15728640,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 15728640;

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
  WITH CHECK (
    bucket_id = 'event-flyers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "event_flyers_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'event-flyers');

CREATE POLICY "event_flyers_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-flyers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "community_images_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "community_images_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'community-images');

CREATE POLICY "community_images_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------------------------
-- 3. RESTORE COMMUNITIES & CAMPUS EVENTS TABLES + NON-RECURSIVE RLS
--    (Zero destructive DELETE statements; all existing records preserved)
-- ------------------------------------------------------------------------------
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

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS location text DEFAULT 'Uturu (Main Campus)',
  ADD COLUMN IF NOT EXISTS privacy text DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS rules text,
  ADD COLUMN IF NOT EXISTS rules_list jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS members_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'approved', 'pending', 'rejected', 'banned')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

ALTER TABLE public.community_members
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now();

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

ALTER TABLE public.campus_events
  ADD COLUMN IF NOT EXISTS campus text DEFAULT 'Uturu (Main Campus)',
  ADD COLUMN IF NOT EXISTS end_time timestamptz,
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS registration_link text,
  ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_url text,
  ADD COLUMN IF NOT EXISTS capacity_limit integer,
  ADD COLUMN IF NOT EXISTS community_id uuid,
  ADD COLUMN IF NOT EXISTS interested_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS going_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

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

CREATE POLICY "communities_select_all" ON public.communities
  FOR SELECT USING (true);

CREATE POLICY "communities_insert_own" ON public.communities
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "communities_update_manager" ON public.communities
  FOR UPDATE USING (public.is_community_manager(id, auth.uid()));

CREATE POLICY "communities_delete_creator" ON public.communities
  FOR DELETE USING (auth.uid() = creator_id);

CREATE POLICY "community_members_select_all" ON public.community_members
  FOR SELECT USING (true);

CREATE POLICY "community_members_insert_self_or_manager" ON public.community_members
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR public.is_community_manager(community_id, auth.uid())
  );

CREATE POLICY "community_members_update_manager" ON public.community_members
  FOR UPDATE USING (
    auth.uid() = user_id OR public.is_community_manager(community_id, auth.uid())
  );

CREATE POLICY "community_members_delete_self_or_manager" ON public.community_members
  FOR DELETE USING (
    auth.uid() = user_id OR public.is_community_manager(community_id, auth.uid())
  );

CREATE POLICY "campus_events_select_all" ON public.campus_events
  FOR SELECT USING (true);

CREATE POLICY "campus_events_insert_own" ON public.campus_events
  FOR INSERT WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "campus_events_update_own" ON public.campus_events
  FOR UPDATE USING (auth.uid() = organizer_id);

CREATE POLICY "campus_events_delete_own" ON public.campus_events
  FOR DELETE USING (auth.uid() = organizer_id);

CREATE POLICY "event_participants_select_all" ON public.event_participants
  FOR SELECT USING (true);

CREATE POLICY "event_participants_insert_own" ON public.event_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "event_participants_update_own" ON public.event_participants
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "event_participants_delete_own" ON public.event_participants
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "saved_events_select_own" ON public.saved_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "saved_events_insert_own" ON public.saved_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "saved_events_delete_own" ON public.saved_events
  FOR DELETE USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 4. PRESENCE READABILITY FOR ACCURATE ONLINE STUDENT COUNTS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_presence'
  ) THEN
    ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "user_presence_select_auth" ON public.user_presence;
    CREATE POLICY "user_presence_select_auth" ON public.user_presence
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. SMART WELCOME & DISCOVERY NOTIFICATIONS + 60s TRIGGER DEDUPLICATION
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'welcome_discovery'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'discovery_suggestion'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'discovery_reminder'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'community_post'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'event_reminder'; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;

-- Strictly enforce at most ONE discovery_welcome and ONE discovery_reminder per recipient
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique_discovery_once
  ON public.notifications (recipient_id, entity_type)
  WHERE entity_type IN ('discovery_welcome', 'discovery_reminder');

-- Deduplicate comment & reaction trigger notifications within a 60s window
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
          AND entity_id = NEW.post_id::text
          AND created_at > now() - interval '60 seconds'
      ) THEN
        INSERT INTO public.notifications (recipient_id, actor_id, type, entity_type, entity_id, title, body)
        VALUES (v_parent_author, NEW.author_id, 'comment', 'post', NEW.post_id::text, 'New Comment Reply', 'replied to your comment.');
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
        AND entity_id = NEW.post_id::text
        AND created_at > now() - interval '60 seconds'
    ) THEN
      INSERT INTO public.notifications (recipient_id, actor_id, type, entity_type, entity_id, title, body)
      VALUES (v_recipient, NEW.author_id, 'comment', 'post', NEW.post_id::text, 'New Comment', 'commented on your post.');
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

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
        AND entity_id = NEW.post_id::text
        AND created_at > now() - interval '60 seconds'
    ) THEN
      INSERT INTO public.notifications (recipient_id, actor_id, type, entity_type, entity_id, title, body)
      VALUES (v_recipient, NEW.user_id, 'reaction', 'post', NEW.post_id::text, 'New Reaction', 'liked your post.');
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- RPC 1: Idempotent Personalized Welcome & Discovery Notification (queries real user_presence + profiles)
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
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.notifications
  WHERE recipient_id = p_user_id
    AND entity_type = 'discovery_welcome'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT
    COALESCE(NULLIF(trim(display_name), ''), NULLIF(trim(username), ''), 'Scholar'),
    NULLIF(trim(department), ''),
    NULLIF(trim(faculty), '')
  INTO v_user_name, v_dept, v_faculty
  FROM public.profiles
  WHERE id = p_user_id;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_presence'
  ) THEN
    SELECT COUNT(*) INTO v_online_count
    FROM public.user_presence up
    WHERE up.user_id <> p_user_id
      AND up.last_seen_at > now() - interval '3 minutes';
  END IF;

  IF v_dept IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dept_count
    FROM public.profiles p
    WHERE p.id <> p_user_id
      AND lower(trim(COALESCE(p.department, ''))) = lower(v_dept);
  END IF;

  IF v_faculty IS NOT NULL THEN
    SELECT COUNT(*) INTO v_faculty_count
    FROM public.profiles p
    WHERE p.id <> p_user_id
      AND lower(trim(COALESCE(p.faculty, ''))) = lower(v_faculty);
  END IF;

  SELECT COUNT(*) INTO v_total_peers
  FROM public.profiles p
  WHERE p.id <> p_user_id;

  IF v_online_count > 0 AND v_dept_count > 0 THEN
    v_body := format(
      'Welcome to ABSU Connect, %s! %s %s online right now and %s %s in %s ready to connect. Tap to meet peers in Friend Navigator.',
      split_part(v_user_name, ' ', 1),
      v_online_count,
      CASE WHEN v_online_count = 1 THEN 'student is' ELSE 'students are' END,
      v_dept_count,
      CASE WHEN v_dept_count = 1 THEN 'coursemate' ELSE 'coursemates' END,
      v_dept
    );
  ELSIF v_online_count > 0 THEN
    v_body := format(
      'Welcome to ABSU Connect, %s! %s %s active online right now. Tap to discover coursemates and campus friends.',
      split_part(v_user_name, ' ', 1),
      v_online_count,
      CASE WHEN v_online_count = 1 THEN 'ABSU student is' ELSE 'ABSU students are' END
    );
  ELSIF v_dept_count > 0 THEN
    v_body := format(
      'Welcome to ABSU Connect, %s! %s %s from %s %s already here. Tap to discover and connect.',
      split_part(v_user_name, ' ', 1),
      v_dept_count,
      CASE WHEN v_dept_count = 1 THEN 'student' ELSE 'students' END,
      v_dept,
      CASE WHEN v_dept_count = 1 THEN 'is' ELSE 'are' END
    );
  ELSIF v_faculty_count > 0 THEN
    v_body := format(
      'Welcome to ABSU Connect, %s! %s %s from %s are waiting to connect. Open Friend Navigator to start.',
      split_part(v_user_name, ' ', 1),
      v_faculty_count,
      CASE WHEN v_faculty_count = 1 THEN 'student' ELSE 'students' END,
      v_faculty
    );
  ELSIF v_total_peers > 0 THEN
    v_body := format(
      'Welcome to ABSU Connect, %s! %s fellow ABSU students are on campus here. Tap to explore Friend Navigator.',
      split_part(v_user_name, ' ', 1),
      v_total_peers
    );
  ELSE
    v_body := format(
      'Welcome to ABSU Connect, %s! Your profile is live—open Friend Navigator to discover coursemates as students join.',
      split_part(v_user_name, ' ', 1)
    );
  END IF;

  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    title,
    body,
    read_at
  )
  VALUES (
    p_user_id,
    NULL,
    'system',
    'discovery_welcome',
    p_user_id::text,
    'Welcome to ABSU Connect',
    v_body,
    NULL
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_notif_id;

  RETURN v_notif_id;
END;
$$;

-- RPC 2: Idempotent 24h Discovery Inactivity Reminder
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
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.notifications
  WHERE recipient_id = p_user_id
    AND entity_type = 'discovery_reminder'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT created_at INTO v_created_at
  FROM public.profiles
  WHERE id = p_user_id;

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

  IF v_has_activity THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO v_peer_count
  FROM public.profiles
  WHERE id <> p_user_id;

  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    title,
    body,
    read_at
  )
  VALUES (
    p_user_id,
    NULL,
    'system',
    'discovery_reminder',
    p_user_id::text,
    'Connect With Coursemates',
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
GRANT EXECUTE ON FUNCTION public.is_community_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_manager(uuid, uuid) TO authenticated;
