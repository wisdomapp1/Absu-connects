-- ==============================================================================
-- ABSU CONNECT — DUAL IDENTITY, PAGE SETTINGS, NOTIFICATION ISOLATION & ADMIN AUDIT
-- Safe, idempotent migration (run in Supabase SQL Editor).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Notifications recipient_page_id isolation column & indexes
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notifications'
        AND column_name = 'recipient_page_id'
    ) THEN
      ALTER TABLE public.notifications
        ADD COLUMN recipient_page_id uuid REFERENCES public.pages(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_page_created
  ON public.notifications (recipient_id, recipient_page_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_page_scope_created
  ON public.notifications (recipient_page_id, created_at DESC)
  WHERE recipient_page_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. Page Notification Preferences (per Page + per Manager user)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_notification_preferences (
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notify_followers boolean NOT NULL DEFAULT true,
  notify_messages boolean NOT NULL DEFAULT true,
  notify_reactions boolean NOT NULL DEFAULT true,
  notify_comments boolean NOT NULL DEFAULT true,
  notify_admin_changes boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, user_id)
);

ALTER TABLE public.page_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_notif_prefs_select_manager" ON public.page_notification_preferences;
CREATE POLICY "page_notif_prefs_select_manager" ON public.page_notification_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_page_manager(page_id, auth.uid()));

DROP POLICY IF EXISTS "page_notif_prefs_insert_manager" ON public.page_notification_preferences;
CREATE POLICY "page_notif_prefs_insert_manager" ON public.page_notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_page_manager(page_id, auth.uid()));

DROP POLICY IF EXISTS "page_notif_prefs_update_manager" ON public.page_notification_preferences;
CREATE POLICY "page_notif_prefs_update_manager" ON public.page_notification_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_page_manager(page_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_page_manager(page_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.page_notification_preferences TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. Page Activity & Admin Audit Logs
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_audit_logs_page_created
  ON public.page_audit_logs (page_id, created_at DESC);

ALTER TABLE public.page_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_audit_logs_select_manager_or_admin" ON public.page_audit_logs;
CREATE POLICY "page_audit_logs_select_manager_or_admin" ON public.page_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_page_manager(page_id, auth.uid()) OR private.is_app_admin());

GRANT SELECT ON public.page_audit_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.log_page_audit_event(
  p_page_id uuid,
  p_action text,
  p_details text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_page_manager(p_page_id, v_uid) OR private.is_app_admin()) THEN
    RAISE EXCEPTION 'Page manager permission required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.page_audit_logs (page_id, actor_id, action, details, metadata)
  VALUES (
    p_page_id,
    v_uid,
    COALESCE(NULLIF(trim(p_action), ''), 'page_updated'),
    NULLIF(trim(COALESCE(p_details, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_page_audit_event(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_page_audit_event(uuid, text, text, jsonb) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. Owner-Safe Page Settings & Admin Management RPCs
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_page_status_owner(
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
  v_uid uuid := auth.uid();
  v_status text := lower(trim(COALESCE(p_status, '')));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_page_owner(p_page_id, v_uid) THEN
    RAISE EXCEPTION 'Only the Page Owner can change Page visibility status' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('active', 'disabled') THEN
    RAISE EXCEPTION 'Status must be active or disabled' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pages
  SET
    status = v_status,
    is_active = (v_status = 'active'),
    disabled_reason = CASE
      WHEN v_status = 'disabled' THEN COALESCE(NULLIF(trim(p_reason), ''), 'Temporarily disabled by Page Owner')
      ELSE NULL
    END,
    disabled_explanation = CASE
      WHEN v_status = 'active' THEN NULL
      ELSE disabled_explanation
    END,
    updated_at = now()
  WHERE id = p_page_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.page_audit_logs (page_id, actor_id, action, details)
  VALUES (
    p_page_id,
    v_uid,
    CASE WHEN v_status = 'disabled' THEN 'page_disabled' ELSE 'page_reactivated' END,
    CASE WHEN v_status = 'disabled'
      THEN COALESCE(NULLIF(trim(p_reason), ''), 'Page temporarily disabled by Owner')
      ELSE 'Page reactivated by Owner'
    END
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_page_status_owner(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_page_status_owner(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_page_admin_invite(
  p_invitation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_page_id uuid;
  v_invited_by uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT page_id, invited_by
  INTO v_page_id, v_invited_by
  FROM public.page_admin_invitations
  WHERE id = p_invitation_id
    AND status = 'pending';

  IF v_page_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT (v_invited_by = v_uid OR public.is_page_owner(v_page_id, v_uid)) THEN
    RAISE EXCEPTION 'Permission denied to cancel this invitation' USING ERRCODE = '42501';
  END IF;

  UPDATE public.page_admin_invitations
  SET
    status = 'cancelled',
    responded_at = now()
  WHERE id = p_invitation_id;

  INSERT INTO public.page_audit_logs (page_id, actor_id, action, details)
  VALUES (v_page_id, v_uid, 'admin_invite_cancelled', 'Cancelled pending Page Admin invitation');

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_page_admin_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_page_admin_invite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_page_slug_availability(
  p_slug text,
  p_exclude_page_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text := lower(trim(COALESCE(p_slug, '')));
BEGIN
  IF v_slug !~ '^[a-z0-9][a-z0-9_-]{2,40}$' THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.pages p
    WHERE lower(p.slug) = v_slug
      AND (p_exclude_page_id IS NULL OR p.id <> p_exclude_page_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_page_slug_availability(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_page_slug_availability(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_page_slug(
  p_page_id uuid,
  p_slug text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slug text := lower(trim(COALESCE(p_slug, '')));
  v_old_slug text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_page_owner(p_page_id, v_uid) THEN
    RAISE EXCEPTION 'Only the Page Owner can update the Page handle' USING ERRCODE = '42501';
  END IF;

  IF v_slug !~ '^[a-z0-9][a-z0-9_-]{2,40}$' THEN
    RAISE EXCEPTION 'Handle must be 3-41 characters using lowercase letters, numbers, hyphens, or underscores' USING ERRCODE = '22023';
  END IF;

  IF NOT public.check_page_slug_availability(v_slug, p_page_id) THEN
    RAISE EXCEPTION 'This Page handle is already taken' USING ERRCODE = '23505';
  END IF;

  SELECT slug INTO v_old_slug FROM public.pages WHERE id = p_page_id;

  UPDATE public.pages
  SET
    slug = v_slug,
    updated_at = now()
  WHERE id = p_page_id;

  INSERT INTO public.page_audit_logs (page_id, actor_id, action, details)
  VALUES (
    p_page_id,
    v_uid,
    'slug_updated',
    format('Updated handle from @%s to @%s', COALESCE(v_old_slug, ''), v_slug)
  );

  RETURN v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.update_page_slug(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_page_slug(uuid, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. Super Admin Check Wrapper & Strictly Authorized Bootstrap
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
  SELECT private.is_app_admin();
$$;

REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

INSERT INTO private.app_admins (user_id, email)
SELECT id, lower(email)
FROM auth.users
WHERE lower(email) IN (
  'wisdomchinonso82@gmail.com',
  'natashaojiugo112@gmail.com',
  'absuconnect.team@gmail.com'
)
ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
