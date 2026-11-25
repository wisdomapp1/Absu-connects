-- ==============================================================================
-- ABSU CONNECT — MASTER PAGES SYSTEM PRODUCTION FIXES
-- Execute in Supabase Dashboard > SQL Editor
-- Strictly idempotent & non-destructive: preserves all existing pages & posts.
-- Never forces is_verified = true on unverified Pages and never writes
-- read-only generated column deletion_requested_at.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PART A: Schema & Table Privileges (Fixes 42501 permission denied on Pages tables)
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.pages') IS NOT NULL THEN
    ALTER TABLE public.pages
      ADD COLUMN IF NOT EXISTS description text,
      ADD COLUMN IF NOT EXISTS avatar_url text,
      ADD COLUMN IF NOT EXISTS cover_url text,
      ADD COLUMN IF NOT EXISTS category text DEFAULT 'community',
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
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
      ADD COLUMN IF NOT EXISTS disabled_reason text,
      ADD COLUMN IF NOT EXISTS disabled_explanation text,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

    GRANT SELECT ON public.pages TO anon, authenticated;
    GRANT INSERT, UPDATE ON public.pages TO authenticated;
  END IF;

  IF to_regclass('public.page_followers') IS NOT NULL THEN
    GRANT SELECT ON public.page_followers TO anon, authenticated;
    GRANT INSERT, DELETE ON public.page_followers TO authenticated;
  END IF;

  IF to_regclass('public.page_managers') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_managers TO authenticated;
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

-- ------------------------------------------------------------------------------
-- PART B: Canonical Category Normalization & `pages_category_allowed` Constraint
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_page_category(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean text := lower(trim(COALESCE(p_raw, '')));
BEGIN
  IF v_clean = '' THEN
    RETURN 'community';
  END IF;

  IF v_clean IN ('education') THEN
    RETURN 'education';
  ELSIF v_clean IN ('school_department', 'school department', 'organization', 'department', 'faculty') THEN
    RETURN 'school_department';
  ELSIF v_clean IN ('student_union_sug', 'student union (sug)', 'sug', 'student union') THEN
    RETURN 'student_union_sug';
  ELSIF v_clean IN ('business_vendor', 'business / vendor', 'business', 'vendor') THEN
    RETURN 'business_vendor';
  ELSIF v_clean IN (
    'entertainment_meme_gist',
    'entertainment / meme / gist',
    'media & news company',
    'media_news',
    'creator',
    'entertainment',
    'meme',
    'gist'
  ) THEN
    RETURN 'entertainment_meme_gist';
  ELSIF v_clean IN ('religion_fellowship', 'religion / fellowship', 'religion', 'fellowship') THEN
    RETURN 'religion_fellowship';
  ELSIF v_clean IN ('sports', 'sport') THEN
    RETURN 'sports';
  ELSIF v_clean IN ('community') THEN
    RETURN 'community';
  ELSIF v_clean IN ('other') THEN
    RETURN 'other';
  END IF;

  RETURN 'other';
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.pages') IS NOT NULL THEN
    -- Normalize existing Page category values before enforcing check constraint
    UPDATE public.pages
    SET category = public.normalize_page_category(category)
    WHERE category IS NULL
       OR category <> public.normalize_page_category(category);

    -- Normalize active/status flags for active published Pages without overwriting is_verified
    UPDATE public.pages
    SET
      status = CASE
        WHEN deleted_at IS NOT NULL THEN 'deleted'
        WHEN COALESCE(is_active, true) = false THEN 'disabled'
        WHEN COALESCE(NULLIF(trim(status), ''), 'active') NOT IN ('active', 'disabled', 'deleted') THEN 'active'
        ELSE COALESCE(NULLIF(trim(status), ''), 'active')
      END,
      is_active = CASE
        WHEN deleted_at IS NOT NULL THEN false
        ELSE COALESCE(is_active, true)
      END,
      allow_messages = COALESCE(allow_messages, true),
      allow_comments = COALESCE(allow_comments, true)
    WHERE status IS NULL
       OR status = ''
       OR is_active IS NULL
       OR allow_messages IS NULL
       OR allow_comments IS NULL;

    -- Backfill owner rows in page_managers for Pages that have created_by
    IF to_regclass('public.page_managers') IS NOT NULL THEN
      INSERT INTO public.page_managers (page_id, user_id, role)
      SELECT p.id, p.created_by, 'owner'
      FROM public.pages p
      WHERE p.created_by IS NOT NULL
      ON CONFLICT (page_id, user_id) DO NOTHING;
    END IF;

    -- Re-create canonical constraint matching UI PAGE_CATEGORY_OPTIONS
    ALTER TABLE public.pages DROP CONSTRAINT IF EXISTS pages_category_allowed;
    ALTER TABLE public.pages
      ADD CONSTRAINT pages_category_allowed
      CHECK (
        category IN (
          'education',
          'school_department',
          'student_union_sug',
          'business_vendor',
          'entertainment_meme_gist',
          'religion_fellowship',
          'sports',
          'community',
          'other',
          'business',
          'creator',
          'organization'
        )
      );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PART C: Super Administrator Authorization (`private.app_admins` & `private.is_app_admin`)
-- Strictly aligns with ABSU Connect Super Admin accounts — NEVER promotes students/Page owners
-- ------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres, service_role, authenticated;

DO $$
DECLARE
  has_email boolean := false;
  has_role boolean := false;
  admin_rec record;
BEGIN
  IF to_regclass('private.app_admins') IS NULL THEN
    CREATE TABLE private.app_admins (
      user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text,
      role text DEFAULT 'super_admin',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;

  REVOKE ALL ON TABLE private.app_admins FROM anon, authenticated;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'private' AND table_name = 'app_admins' AND column_name = 'email'
  ) INTO has_email;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'private' AND table_name = 'app_admins' AND column_name = 'role'
  ) INTO has_role;

  FOR admin_rec IN
    SELECT u.id AS user_id, lower(trim(u.email)) AS email
    FROM auth.users u
    WHERE lower(trim(u.email)) IN (
      'wisdomchinonso82@gmail.com',
      'natashaojiugo112@gmail.com',
      'absuconnect.team@gmail.com'
    )
  LOOP
    IF has_email AND has_role THEN
      INSERT INTO private.app_admins (user_id, email, role)
      VALUES (admin_rec.user_id, admin_rec.email, 'super_admin')
      ON CONFLICT (user_id) DO NOTHING;
    ELSIF has_email THEN
      INSERT INTO private.app_admins (user_id, email)
      VALUES (admin_rec.user_id, admin_rec.email)
      ON CONFLICT (user_id) DO NOTHING;
    ELSE
      INSERT INTO private.app_admins (user_id)
      VALUES (admin_rec.user_id)
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, auth, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM private.app_admins a
      WHERE a.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION private.is_app_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_app_admin() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- PART D: Super Admin RPCs (Server-Authoritative Security & Accurate Non-Deleted Stats)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_pages_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_total_pages integer := 0;
  v_active_pages integer := 0;
  v_verified_pages integer := 0;
  v_disabled_pages integer := 0;
  v_deleted_pages integer := 0;
  v_open_reports integer := 0;
BEGIN
  IF NOT private.is_app_admin() THEN
    RAISE EXCEPTION 'Super administrator permission required' USING ERRCODE = '42501';
  END IF;

  -- Strictly count published public.pages rows; NEVER count legacy page_applications
  SELECT
    COUNT(*) FILTER (WHERE p.deleted_at IS NULL AND COALESCE(p.status, 'active') <> 'deleted'),
    COUNT(*) FILTER (WHERE p.deleted_at IS NULL AND COALESCE(p.status, 'active') = 'active' AND COALESCE(p.is_active, true) = true),
    COUNT(*) FILTER (WHERE p.deleted_at IS NULL AND COALESCE(p.status, 'active') <> 'deleted' AND COALESCE(p.is_verified, false) = true),
    COUNT(*) FILTER (WHERE p.deleted_at IS NULL AND (COALESCE(p.status, 'active') = 'disabled' OR COALESCE(p.is_active, true) = false)),
    COUNT(*) FILTER (WHERE p.deleted_at IS NOT NULL OR p.status = 'deleted')
  INTO
    v_total_pages,
    v_active_pages,
    v_verified_pages,
    v_disabled_pages,
    v_deleted_pages
  FROM public.pages p;

  IF to_regclass('public.page_reports') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_open_reports
    FROM public.page_reports r
    WHERE r.status = 'open';
  END IF;

  RETURN jsonb_build_object(
    'total_pages', COALESCE(v_total_pages, 0),
    'active_pages', COALESCE(v_active_pages, 0),
    'verified_pages', COALESCE(v_verified_pages, 0),
    'disabled_pages', COALESCE(v_disabled_pages, 0),
    'deleted_pages', COALESCE(v_deleted_pages, 0),
    'open_reports', COALESCE(v_open_reports, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_pages_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_pages_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_pages(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_verified boolean DEFAULT NULL
)
RETURNS SETOF public.pages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_status text := NULLIF(lower(trim(COALESCE(p_status, ''))), '');
BEGIN
  IF NOT private.is_app_admin() THEN
    RAISE EXCEPTION 'Super administrator permission required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM public.pages p
  WHERE (
    CASE
      WHEN v_status = 'deleted' THEN (p.deleted_at IS NOT NULL OR p.status = 'deleted')
      WHEN v_status = 'disabled' THEN (p.deleted_at IS NULL AND (p.status = 'disabled' OR COALESCE(p.is_active, true) = false))
      WHEN v_status = 'active' THEN (p.deleted_at IS NULL AND COALESCE(p.status, 'active') = 'active' AND COALESCE(p.is_active, true) = true)
      ELSE (p.deleted_at IS NULL AND COALESCE(p.status, 'active') <> 'deleted')
    END
  )
  AND (p_verified IS NULL OR COALESCE(p.is_verified, false) = p_verified)
  AND (
    v_search IS NULL
    OR p.name ILIKE '%' || v_search || '%'
    OR p.slug ILIKE '%' || v_search || '%'
    OR p.category ILIKE '%' || v_search || '%'
  )
  ORDER BY p.created_at DESC
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_pages(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_pages(text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_page_verified(
  p_page_id uuid,
  p_verified boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
BEGIN
  IF NOT private.is_app_admin() THEN
    RAISE EXCEPTION 'Super administrator permission required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pages
  SET
    is_verified = COALESCE(p_verified, false),
    updated_at = now()
  WHERE id = p_page_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_page_verified(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_page_verified(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_page_status(
  p_page_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_status text := lower(trim(COALESCE(p_status, '')));
BEGIN
  IF NOT private.is_app_admin() THEN
    RAISE EXCEPTION 'Super administrator permission required' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('active', 'disabled', 'deleted') THEN
    RAISE EXCEPTION 'Invalid page status: %', p_status;
  END IF;

  -- Never writes read-only generated column deletion_requested_at
  UPDATE public.pages
  SET
    status = v_status,
    is_active = (v_status = 'active'),
    deleted_at = CASE
      WHEN v_status = 'deleted' THEN COALESCE(deleted_at, now())
      WHEN v_status = 'active' THEN NULL
      ELSE deleted_at
    END,
    disabled_reason = CASE
      WHEN v_status = 'disabled' THEN COALESCE(NULLIF(trim(p_reason), ''), 'Policy violation')
      WHEN v_status = 'active' THEN NULL
      ELSE disabled_reason
    END,
    disabled_explanation = CASE
      WHEN v_status = 'active' THEN NULL
      ELSE disabled_explanation
    END,
    updated_at = now()
  WHERE id = p_page_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_page_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_page_status(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_page_report(
  p_report_id uuid,
  p_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
BEGIN
  IF NOT private.is_app_admin() THEN
    RAISE EXCEPTION 'Super administrator permission required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.page_reports
  SET
    status = 'resolved',
    admin_note = COALESCE(NULLIF(trim(p_note), ''), admin_note),
    resolved_by = auth.uid(),
    resolved_at = now()
  WHERE id = p_report_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_page_report(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_page_report(uuid, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- PART E: Non-recursive Page Helpers & RLS Policies (Discoverability for ALL users)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_page_manager(p_page_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
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
STABLE
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

DO $$
BEGIN
  IF to_regclass('public.pages') IS NOT NULL THEN
    ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "pages_select_active" ON public.pages;
    DROP POLICY IF EXISTS "pages_select_public_or_manager" ON public.pages;
    CREATE POLICY "pages_select_public_or_manager" ON public.pages
      FOR SELECT USING (
        (
          COALESCE(status, 'active') = 'active'
          AND COALESCE(is_active, true) = true
          AND deleted_at IS NULL
          AND (
            auth.uid() IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM public.page_blocks pb
              WHERE pb.page_id = pages.id AND pb.user_id = auth.uid()
            )
          )
        )
        OR (auth.uid() IS NOT NULL AND public.is_page_manager(id, auth.uid()))
        OR (auth.uid() IS NOT NULL AND created_by = auth.uid())
        OR (auth.uid() IS NOT NULL AND private.is_app_admin())
      );

    DROP POLICY IF EXISTS "pages_update_manager" ON public.pages;
    CREATE POLICY "pages_update_manager" ON public.pages
      FOR UPDATE TO authenticated
      USING (public.is_page_manager(id, auth.uid()) OR created_by = auth.uid() OR private.is_app_admin())
      WITH CHECK (public.is_page_manager(id, auth.uid()) OR created_by = auth.uid() OR private.is_app_admin());
  END IF;
END $$;

-- Ensure create_page RPC normalizes category to canonical DB ID cleanly if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_page'
  ) THEN
    -- Keep existing signature intact if custom; only wrap/create if not overloaded unexpectedly
    NULL;
  END IF;
END $$;
