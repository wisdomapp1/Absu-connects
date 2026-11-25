-- ==============================================================================
-- ABSU CONNECT — FIX PAGES TABLE PERMISSIONS, GRANTS, RLS & EXISTING PAGE PARITY
-- Execute in Supabase Dashboard > SQL Editor
-- Idempotent & strictly non-destructive: preserves all existing pages & posts.
-- ==============================================================================

-- 1. Schema & table privilege grants (fixes 42501 "permission denied for table pages")
GRANT USAGE ON SCHEMA public TO anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.pages') IS NOT NULL THEN
    -- Ensure all Facebook-style Pages columns exist safely
    ALTER TABLE public.pages
      ADD COLUMN IF NOT EXISTS description text,
      ADD COLUMN IF NOT EXISTS avatar_url text,
      ADD COLUMN IF NOT EXISTS cover_url text,
      ADD COLUMN IF NOT EXISTS category text DEFAULT 'Community',
      ADD COLUMN IF NOT EXISTS location text DEFAULT 'Uturu, Abia State',
      ADD COLUMN IF NOT EXISTS whatsapp text,
      ADD COLUMN IF NOT EXISTS website text,
      ADD COLUMN IF NOT EXISTS contact_email text,
      ADD COLUMN IF NOT EXISTS contact_phone text,
      ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS allow_messages boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS allow_comments boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS followers_count integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS posts_count integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS name_changed_at timestamptz,
      ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
      ADD COLUMN IF NOT EXISTS disabled_reason text,
      ADD COLUMN IF NOT EXISTS disabled_explanation text,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

    -- Normalize any already-existing Pages so they work identically to new Pages
    UPDATE public.pages
    SET
      status = CASE
        WHEN COALESCE(is_active, true) = false THEN 'disabled'
        WHEN COALESCE(NULLIF(trim(status), ''), 'active') NOT IN ('active', 'disabled', 'deleted') THEN 'active'
        ELSE COALESCE(NULLIF(trim(status), ''), 'active')
      END,
      is_active = COALESCE(is_active, true),
      allow_messages = COALESCE(allow_messages, true),
      allow_comments = COALESCE(allow_comments, true),
      category = COALESCE(NULLIF(trim(category), ''), 'Community')
    WHERE status IS NULL
       OR status = ''
       OR is_active IS NULL
       OR allow_messages IS NULL
       OR allow_comments IS NULL
       OR category IS NULL;

    -- Keep existing Mr Anonymous page active, messaging/comments enabled & verified
    UPDATE public.pages
    SET
      status = 'active',
      is_active = true,
      is_verified = true,
      allow_messages = true,
      allow_comments = true
    WHERE id = '0c3240e3-ae39-461d-bd7a-4963859b9bc7'
       OR slug = 'mr-anonymous';

    GRANT SELECT ON public.pages TO anon, authenticated;
    GRANT INSERT, UPDATE ON public.pages TO authenticated;
  END IF;
END $$;

-- 2. Ensure supporting Page tables exist & have proper privileges
DO $$
BEGIN
  IF to_regclass('public.page_followers') IS NOT NULL THEN
    GRANT SELECT ON public.page_followers TO anon, authenticated;
    GRANT INSERT, DELETE ON public.page_followers TO authenticated;
  END IF;

  IF to_regclass('public.page_managers') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_managers TO authenticated;

    -- Backfill owner rows for any already-existing Pages that have created_by without a page_managers row
    IF to_regclass('public.pages') IS NOT NULL THEN
      INSERT INTO public.page_managers (page_id, user_id, role)
      SELECT p.id, p.created_by, 'owner'
      FROM public.pages p
      WHERE p.created_by IS NOT NULL
      ON CONFLICT (page_id, user_id) DO NOTHING;
    END IF;
  END IF;

  IF to_regclass('public.page_blocks') IS NOT NULL THEN
    GRANT SELECT, INSERT, DELETE ON public.page_blocks TO authenticated;
  END IF;

  IF to_regclass('public.page_admin_invitations') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_admin_invitations TO authenticated;
  END IF;

  IF to_regclass('public.page_follow_invites') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_follow_invites TO authenticated;
  END IF;

  IF to_regclass('public.page_reports') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON public.page_reports TO authenticated;
  END IF;

  IF to_regclass('public.page_conversation_reads') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON public.page_conversation_reads TO authenticated;
  END IF;
END $$;

-- 3. Non-recursive SECURITY DEFINER helpers for Page authorization
CREATE OR REPLACE FUNCTION public.is_page_manager(p_page_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.page_managers pm
    WHERE pm.page_id = p_page_id
      AND pm.user_id = p_user_id
      AND lower(pm.role::text) IN ('owner', 'admin', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_page_owner(p_page_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.page_managers pm
    WHERE pm.page_id = p_page_id
      AND pm.user_id = p_user_id
      AND lower(pm.role::text) = 'owner'
  ) OR EXISTS (
    SELECT 1
    FROM public.pages p
    WHERE p.id = p_page_id
      AND p.created_by = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_page_manager(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_page_manager(uuid, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.is_page_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_page_owner(uuid, uuid) TO anon, authenticated;

-- 4. Clean RLS policies on public.pages, page_followers, page_managers
DO $$
BEGIN
  IF to_regclass('public.pages') IS NOT NULL THEN
    ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "pages_select_active" ON public.pages;
    DROP POLICY IF EXISTS "pages_select_public_or_manager" ON public.pages;
    CREATE POLICY "pages_select_public_or_manager" ON public.pages
      FOR SELECT USING (
        (COALESCE(status, 'active') = 'active' AND COALESCE(is_active, true) = true)
        OR (auth.uid() IS NOT NULL AND public.is_page_manager(id, auth.uid()))
        OR (auth.uid() IS NOT NULL AND created_by = auth.uid())
      );

    DROP POLICY IF EXISTS "pages_update_manager" ON public.pages;
    CREATE POLICY "pages_update_manager" ON public.pages
      FOR UPDATE TO authenticated
      USING (public.is_page_manager(id, auth.uid()) OR created_by = auth.uid())
      WITH CHECK (public.is_page_manager(id, auth.uid()) OR created_by = auth.uid());
  END IF;

  IF to_regclass('public.page_followers') IS NOT NULL THEN
    ALTER TABLE public.page_followers ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "page_followers_select_all" ON public.page_followers;
    CREATE POLICY "page_followers_select_all" ON public.page_followers
      FOR SELECT USING (true);

    DROP POLICY IF EXISTS "page_followers_insert_self" ON public.page_followers;
    CREATE POLICY "page_followers_insert_self" ON public.page_followers
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "page_followers_delete_self_or_manager" ON public.page_followers;
    CREATE POLICY "page_followers_delete_self_or_manager" ON public.page_followers
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id OR public.is_page_manager(page_id, auth.uid()));
  END IF;

  IF to_regclass('public.page_managers') IS NOT NULL THEN
    ALTER TABLE public.page_managers ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "page_managers_select_team" ON public.page_managers;
    CREATE POLICY "page_managers_select_team" ON public.page_managers
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR public.is_page_manager(page_id, auth.uid()));

    DROP POLICY IF EXISTS "page_managers_delete_owner_or_self" ON public.page_managers;
    CREATE POLICY "page_managers_delete_owner_or_self" ON public.page_managers
      FOR DELETE TO authenticated
      USING (user_id = auth.uid() OR public.is_page_owner(page_id, auth.uid()));
  END IF;
END $$;

-- 5. Backfill page_id on legacy Mr Anonymous posts so all posts work uniformly in Page Workspace & Reels
DO $$
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    UPDATE public.posts
    SET
      page_id = '0c3240e3-ae39-461d-bd7a-4963859b9bc7',
      author_page_id = COALESCE(author_page_id, '0c3240e3-ae39-461d-bd7a-4963859b9bc7'),
      author_as_page = true
    WHERE author_id = 'b4f38505-fce6-44be-8727-8ebf04eb2ceb'
      AND page_id IS NULL;
  END IF;
END $$;
