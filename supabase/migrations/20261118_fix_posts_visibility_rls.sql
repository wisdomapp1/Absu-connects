-- ==============================================================================
-- ABSU CONNECT — FIX POSTS & PAGES VISIBILITY RLS FOR NEW AND EXISTING USERS
-- Ensures authenticated students (including newly registered accounts with 0 friends)
-- can read existing 'public' and 'campus' posts, page posts, media, reactions,
-- and comments while respecting 'friends' privacy, private communities, and blocks.
-- Idempotent & non-destructive.
-- ==============================================================================

-- 1. Grant SELECT on public.pages to anon & authenticated so embedded page joins succeed
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

-- 2. Replace restrictive SELECT policy on public.posts cleanly
DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'posts'
        AND cmd = 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.posts;', pol.policyname);
    END LOOP;

    CREATE POLICY "posts_select_visible" ON public.posts
      FOR SELECT USING (
        -- Exclude posts involving a block relationship (when user_blocks table exists)
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
          -- Own posts are always visible to the author
          (auth.uid() IS NOT NULL AND posts.author_id = auth.uid())
          -- Public posts are visible (for public communities or standalone feed)
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
          -- Campus posts are visible to all authenticated ABSU Connect students
          OR (
            auth.uid() IS NOT NULL
            AND posts.visibility::text = 'campus'
          )
          -- Friends-only posts are visible only to accepted friends
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

-- 3. Ensure post_media, post_reactions, and comments follow post visibility
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
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_media.post_id)
      );
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
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_reactions.post_id)
      );
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
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id)
      );
  END IF;
END $$;
