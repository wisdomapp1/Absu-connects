-- ==============================================================================
-- ABSU CONNECT — COMPLETE PAGE MANAGEMENT, 4-ROLE RBAC, PRIVACY, MESSAGING,
-- CONTENT MODERATION, RESTRICTIONS, VERIFICATION QUEUE & AUDIT TRAIL
-- Safe, idempotent migration (run in Supabase SQL Editor).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Extend public.pages with Privacy, Messaging & Content Moderation columns
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.pages') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='is_discoverable') THEN
      ALTER TABLE public.pages ADD COLUMN is_discoverable boolean NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='follower_interaction_mode') THEN
      ALTER TABLE public.pages ADD COLUMN follower_interaction_mode text NOT NULL DEFAULT 'open';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='default_post_visibility') THEN
      ALTER TABLE public.pages ADD COLUMN default_post_visibility text NOT NULL DEFAULT 'public';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='publishing_permission') THEN
      ALTER TABLE public.pages ADD COLUMN publishing_permission text NOT NULL DEFAULT 'admins_editors';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='comment_permission') THEN
      ALTER TABLE public.pages ADD COLUMN comment_permission text NOT NULL DEFAULT 'everyone';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='messaging_permission') THEN
      ALTER TABLE public.pages ADD COLUMN messaging_permission text NOT NULL DEFAULT 'everyone';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='message_requests_enabled') THEN
      ALTER TABLE public.pages ADD COLUMN message_requests_enabled boolean NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='welcome_message') THEN
      ALTER TABLE public.pages ADD COLUMN welcome_message text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='away_mode_enabled') THEN
      ALTER TABLE public.pages ADD COLUMN away_mode_enabled boolean NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='away_message') THEN
      ALTER TABLE public.pages ADD COLUMN away_message text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='inbox_access_roles') THEN
      ALTER TABLE public.pages ADD COLUMN inbox_access_roles text[] NOT NULL DEFAULT ARRAY['owner','admin','editor','moderator']::text[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='hidden_words') THEN
      ALTER TABLE public.pages ADD COLUMN hidden_words text[] NOT NULL DEFAULT ARRAY[]::text[];
    END IF;
  END IF;
END $$;

-- Protect is_verified and created_by against direct non-admin self-modification
CREATE OR REPLACE FUNCTION public.protect_page_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.is_app_admin() THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
       AND COALESCE(current_setting('app.allow_verification_update', true), '') <> '1' THEN
      NEW.is_verified := OLD.is_verified;
    END IF;

    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       AND COALESCE(current_setting('app.allow_ownership_transfer', true), '') <> '1' THEN
      NEW.created_by := OLD.created_by;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.pages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_protect_page_privileged_columns ON public.pages;
    CREATE TRIGGER trg_protect_page_privileged_columns
      BEFORE UPDATE ON public.pages
      FOR EACH ROW
      EXECUTE FUNCTION public.protect_page_privileged_columns();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Extend page_managers & page_admin_invitations for 4-role RBAC
--    Roles: owner | admin | editor | moderator (plus legacy 'manager')
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_udt_name text;
  v_con record;
BEGIN
  IF to_regclass('public.page_managers') IS NOT NULL THEN
    SELECT c.udt_name INTO v_udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'page_managers' AND c.column_name = 'role';

    IF v_udt_name IS NOT NULL AND v_udt_name <> 'text' AND v_udt_name <> 'varchar' THEN
      -- If role is a custom enum type, ensure editor and moderator values exist
      IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = v_udt_name AND t.typtype = 'e') THEN
        EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''editor''', v_udt_name);
        EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''moderator''', v_udt_name);
        EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''admin''', v_udt_name);
        EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''owner''', v_udt_name);
      END IF;
    ELSE
      -- Drop any outdated role CHECK constraint on page_managers and apply updated one
      FOR v_con IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.page_managers'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%role%'
      LOOP
        EXECUTE format('ALTER TABLE public.page_managers DROP CONSTRAINT IF EXISTS %I', v_con.conname);
      END LOOP;

      ALTER TABLE public.page_managers
        ADD CONSTRAINT page_managers_role_allowed
        CHECK (lower(role::text) IN ('owner', 'admin', 'editor', 'moderator', 'manager'));
    END IF;
  END IF;

  IF to_regclass('public.page_admin_invitations') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'page_admin_invitations' AND column_name = 'role'
    ) THEN
      ALTER TABLE public.page_admin_invitations
        ADD COLUMN role text NOT NULL DEFAULT 'admin';
    END IF;
  END IF;
END $$;

-- Helper functions for granular role checks
CREATE OR REPLACE FUNCTION public.get_page_manager_role(p_page_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN lower(pm.role::text) = 'manager' THEN 'admin'
        ELSE lower(pm.role::text)
      END
      FROM public.page_managers pm
      WHERE pm.page_id = p_page_id
        AND pm.user_id = p_user_id
      LIMIT 1
    ),
    (
      SELECT 'owner'::text
      FROM public.pages p
      WHERE p.id = p_page_id
        AND p.created_by = p_user_id
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_page_manager(p_page_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.page_managers pm
    WHERE pm.page_id = p_page_id
      AND pm.user_id = p_user_id
      AND lower(pm.role::text) IN ('owner', 'admin', 'editor', 'moderator', 'manager')
  ) OR EXISTS (
    SELECT 1
    FROM public.pages p
    WHERE p.id = p_page_id
      AND p.created_by = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_page_role(
  p_page_id uuid,
  p_user_id uuid,
  p_allowed_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.get_page_manager_role(p_page_id, p_user_id) = ANY(p_allowed_roles);
$$;

REVOKE ALL ON FUNCTION public.get_page_manager_role(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_page_manager_role(uuid, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.is_page_manager(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_page_manager(uuid, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.has_page_role(uuid, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_page_role(uuid, uuid, text[]) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. Role-aware Team Invitation, Role Update & Ownership Transfer RPCs
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.invite_page_admin(uuid, text);
DROP FUNCTION IF EXISTS public.invite_page_admin(uuid, text, text);

CREATE OR REPLACE FUNCTION public.invite_page_admin(
  p_page_id uuid,
  p_username text,
  p_role text DEFAULT 'admin'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target_user_id uuid;
  v_clean_username text := lower(trim(regexp_replace(COALESCE(p_username, ''), '^@+', '')));
  v_role text := lower(trim(COALESCE(p_role, 'admin')));
  v_page_name text;
  v_inv_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_page_role(p_page_id, v_uid, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'Only Page Owners or Admins can invite team members' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('admin', 'editor', 'moderator') THEN
    RAISE EXCEPTION 'Invited role must be admin, editor, or moderator' USING ERRCODE = '22023';
  END IF;

  IF v_clean_username = '' THEN
    RAISE EXCEPTION 'Username is required' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_target_user_id
  FROM public.profiles
  WHERE lower(username) = v_clean_username
  LIMIT 1;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with username @%', v_clean_username USING ERRCODE = 'P0002';
  END IF;

  IF v_target_user_id = v_uid THEN
    RAISE EXCEPTION 'You already manage this Page' USING ERRCODE = '22023';
  END IF;

  IF public.is_page_manager(p_page_id, v_target_user_id) THEN
    RAISE EXCEPTION '@% already manages this Page', v_clean_username USING ERRCODE = '23505';
  END IF;

  SELECT name INTO v_page_name FROM public.pages WHERE id = p_page_id;

  -- Reuse or cancel stale pending duplicate
  SELECT id INTO v_inv_id
  FROM public.page_admin_invitations
  WHERE page_id = p_page_id
    AND invited_user_id = v_target_user_id
    AND status = 'pending'
  LIMIT 1;

  IF v_inv_id IS NOT NULL THEN
    UPDATE public.page_admin_invitations
    SET role = v_role, invited_by = v_uid, created_at = now()
    WHERE id = v_inv_id;
  ELSE
    INSERT INTO public.page_admin_invitations (page_id, invited_user_id, invited_by, status, role)
    VALUES (p_page_id, v_target_user_id, v_uid, 'pending', v_role)
    RETURNING id INTO v_inv_id;
  END IF;

  INSERT INTO public.page_audit_logs (page_id, actor_id, action, details, metadata)
  VALUES (
    p_page_id,
    v_uid,
    'admin_invited',
    format('Invited @%s as %s', v_clean_username, initcap(v_role)),
    jsonb_build_object('invited_user_id', v_target_user_id, 'role', v_role)
  );

  IF to_regclass('public.notifications') IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, entity_type, entity_id, title, body)
    VALUES (
      v_target_user_id,
      v_uid,
      'page_admin_invite',
      'page',
      p_page_id,
      format('%s team invitation', COALESCE(v_page_name, 'Page')),
      format('You were invited to join %s as %s.', COALESCE(v_page_name, 'this Page'), initcap(v_role))
    );
  END IF;

  RETURN v_inv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_page_admin(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_page_admin(uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.respond_page_admin_invite(uuid, boolean);
CREATE OR REPLACE FUNCTION public.respond_page_admin_invite(
  p_invitation_id uuid,
  p_accept boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv record;
  v_role text;
  v_page_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM public.page_admin_invitations
  WHERE id = p_invitation_id
    AND invited_user_id = v_uid
    AND status = 'pending';

  IF v_inv.id IS NULL THEN
    RETURN false;
  END IF;

  v_role := lower(COALESCE(NULLIF(v_inv.role, ''), 'admin'));
  IF v_role NOT IN ('admin', 'editor', 'moderator') THEN
    v_role := 'admin';
  END IF;

  UPDATE public.page_admin_invitations
  SET
    status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
    responded_at = now()
  WHERE id = p_invitation_id;

  IF p_accept THEN
    INSERT INTO public.page_managers (page_id, user_id, role)
    VALUES (v_inv.page_id, v_uid, v_role)
    ON CONFLICT (page_id, user_id)
    DO UPDATE SET role = EXCLUDED.role;
  END IF;

  SELECT name INTO v_page_name FROM public.pages WHERE id = v_inv.page_id;

  INSERT INTO public.page_audit_logs (page_id, actor_id, action, details, metadata)
  VALUES (
    v_inv.page_id,
    v_uid,
    CASE WHEN p_accept THEN 'admin_invite_accepted' ELSE 'admin_invite_declined' END,
    CASE WHEN p_accept THEN format('Accepted %s role invitation', initcap(v_role)) ELSE 'Declined Page role invitation' END,
    jsonb_build_object('role', v_role)
  );

  IF p_accept AND v_inv.invited_by IS NOT NULL AND to_regclass('public.notifications') IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, recipient_page_id, actor_id, type, entity_type, entity_id, title, body)
    VALUES (
      v_inv.invited_by,
      v_inv.page_id,
      v_uid,
      'page_admin_accepted',
      'page',
      v_inv.page_id,
      format('%s team update', COALESCE(v_page_name, 'Page')),
      format('A teammate accepted their %s role on %s.', initcap(v_role), COALESCE(v_page_name, 'your Page'))
    );
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_page_admin_invite(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_page_admin_invite(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_page_manager_role(
  p_page_id uuid,
  p_user_id uuid,
  p_role text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := lower(trim(COALESCE(p_role, '')));
  v_current_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_page_owner(p_page_id, v_uid) THEN
    RAISE EXCEPTION 'Only the Page Owner can change team member roles' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('admin', 'editor', 'moderator') THEN
    RAISE EXCEPTION 'Target role must be admin, editor, or moderator. Use Transfer Ownership to assign a new owner.' USING ERRCODE = '22023';
  END IF;

  v_current_role := public.get_page_manager_role(p_page_id, p_user_id);
  IF v_current_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_current_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot demote the Page Owner directly. Transfer ownership first.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.page_managers
  SET role = v_role
  WHERE page_id = p_page_id
    AND user_id = p_user_id;

  INSERT INTO public.page_audit_logs (page_id, actor_id, action, details, metadata)
  VALUES (
    p_page_id,
    v_uid,
    'manager_role_updated',
    format('Updated teammate role from %s to %s', initcap(v_current_role), initcap(v_role)),
    jsonb_build_object('target_user_id', p_user_id, 'previous_role', v_current_role, 'new_role', v_role)
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_page_manager_role(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_page_manager_role(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_page_ownership(
  p_page_id uuid,
  p_new_owner_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_page_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_page_owner(p_page_id, v_uid) THEN
    RAISE EXCEPTION 'Only the current Page Owner can transfer ownership' USING ERRCODE = '42501';
  END IF;

  IF p_new_owner_id IS NULL OR p_new_owner_id = v_uid THEN
    RAISE EXCEPTION 'Select a different team member to become Owner' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_page_manager(p_page_id, p_new_owner_id) THEN
    RAISE EXCEPTION 'Ownership can only be transferred to an active team member of this Page' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.allow_ownership_transfer', '1', true);

  UPDATE public.pages
  SET created_by = p_new_owner_id, updated_at = now()
  WHERE id = p_page_id;

  INSERT INTO public.page_managers (page_id, user_id, role)
  VALUES (p_page_id, p_new_owner_id, 'owner')
  ON CONFLICT (page_id, user_id)
  DO UPDATE SET role = 'owner';

  INSERT INTO public.page_managers (page_id, user_id, role)
  VALUES (p_page_id, v_uid, 'admin')
  ON CONFLICT (page_id, user_id)
  DO UPDATE SET role = 'admin';

  SELECT name INTO v_page_name FROM public.pages WHERE id = p_page_id;

  INSERT INTO public.page_audit_logs (page_id, actor_id, action, details, metadata)
  VALUES (
    p_page_id,
    v_uid,
    'ownership_transferred',
    'Transferred Page ownership',
    jsonb_build_object('previous_owner_id', v_uid, 'new_owner_id', p_new_owner_id)
  );

  IF to_regclass('public.notifications') IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, recipient_page_id, actor_id, type, entity_type, entity_id, title, body)
    VALUES (
      p_new_owner_id,
      p_page_id,
      v_uid,
      'page_ownership_transferred',
      'page',
      p_page_id,
      format('%s ownership transferred', COALESCE(v_page_name, 'Page')),
      format('You are now the Owner of %s.', COALESCE(v_page_name, 'this Page'))
    );
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_page_ownership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_page_ownership(uuid, uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. Extend page_notification_preferences with Replies, Invites, Verification & Security
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.page_notification_preferences') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='page_notification_preferences' AND column_name='notify_replies') THEN
      ALTER TABLE public.page_notification_preferences ADD COLUMN notify_replies boolean NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='page_notification_preferences' AND column_name='notify_admin_invites') THEN
      ALTER TABLE public.page_notification_preferences ADD COLUMN notify_admin_invites boolean NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='page_notification_preferences' AND column_name='notify_verification') THEN
      ALTER TABLE public.page_notification_preferences ADD COLUMN notify_verification boolean NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='page_notification_preferences' AND column_name='notify_security_events') THEN
      ALTER TABLE public.page_notification_preferences ADD COLUMN notify_security_events boolean NOT NULL DEFAULT true;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. Restricted Users (page_restricted_users) & Post Visibility Moderation
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_restricted_users (
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  restricted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, user_id)
);

ALTER TABLE public.page_restricted_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_restricted_select_manager_or_self" ON public.page_restricted_users;
CREATE POLICY "page_restricted_select_manager_or_self" ON public.page_restricted_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_page_manager(page_id, auth.uid()));

DROP POLICY IF EXISTS "page_restricted_write_manager" ON public.page_restricted_users;
CREATE POLICY "page_restricted_write_manager" ON public.page_restricted_users
  FOR ALL TO authenticated
  USING (public.has_page_role(page_id, auth.uid(), ARRAY['owner', 'admin', 'moderator']))
  WITH CHECK (public.has_page_role(page_id, auth.uid(), ARRAY['owner', 'admin', 'moderator']));

GRANT SELECT, INSERT, DELETE ON public.page_restricted_users TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_hide_page_post(
  p_post_id uuid,
  p_hidden boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_page_id uuid;
  v_visibility text := CASE WHEN p_hidden THEN 'hidden' ELSE 'public' END;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(author_page_id, page_id) INTO v_page_id
  FROM public.posts
  WHERE id = p_post_id;

  IF v_page_id IS NULL THEN
    RAISE EXCEPTION 'Page post not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_page_role(v_page_id, v_uid, ARRAY['owner', 'admin', 'editor', 'moderator']) THEN
    RAISE EXCEPTION 'Permission denied to moderate this Page post' USING ERRCODE = '42501';
  END IF;

  UPDATE public.posts
  SET visibility = v_visibility, updated_at = now()
  WHERE id = p_post_id;

  INSERT INTO public.page_audit_logs (page_id, actor_id, action, details, metadata)
  VALUES (
    v_page_id,
    v_uid,
    CASE WHEN p_hidden THEN 'post_hidden' ELSE 'post_unhidden' END,
    CASE WHEN p_hidden THEN 'Hid a Page post from public feed' ELSE 'Restored hidden Page post to public feed' END,
    jsonb_build_object('post_id', p_post_id)
  );

  RETURN v_visibility;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_hide_page_post(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_hide_page_post(uuid, boolean) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. Page Verification Requests Queue (Super Admin approval ONLY)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  official_name text NOT NULL,
  reason text NOT NULL,
  evidence_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_verification_requests_page_created
  ON public.page_verification_requests (page_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_page_verification_requests_status_created
  ON public.page_verification_requests (status, created_at DESC);

ALTER TABLE public.page_verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_verif_select_manager_or_admin" ON public.page_verification_requests;
CREATE POLICY "page_verif_select_manager_or_admin" ON public.page_verification_requests
  FOR SELECT TO authenticated
  USING (public.is_page_manager(page_id, auth.uid()) OR private.is_app_admin());

DROP POLICY IF EXISTS "page_verif_insert_owner_admin" ON public.page_verification_requests;
CREATE POLICY "page_verif_insert_owner_admin" ON public.page_verification_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND public.has_page_role(page_id, auth.uid(), ARRAY['owner', 'admin'])
  );

DROP POLICY IF EXISTS "page_verif_update_super_admin_only" ON public.page_verification_requests;
CREATE POLICY "page_verif_update_super_admin_only" ON public.page_verification_requests
  FOR UPDATE TO authenticated
  USING (private.is_app_admin())
  WITH CHECK (private.is_app_admin());

GRANT SELECT, INSERT ON public.page_verification_requests TO authenticated;
GRANT UPDATE ON public.page_verification_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_page_verification_request(
  p_page_id uuid,
  p_category text,
  p_official_name text,
  p_reason text,
  p_evidence_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_is_verified boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_page_role(p_page_id, v_uid, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'Only Page Owners or Admins can request verification' USING ERRCODE = '42501';
  END IF;

  SELECT is_verified INTO v_is_verified FROM public.pages WHERE id = p_page_id;
  IF COALESCE(v_is_verified, false) = true THEN
    RAISE EXCEPTION 'This Page is already verified' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.page_verification_requests
    WHERE page_id = p_page_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A verification request is already pending review for this Page' USING ERRCODE = '23505';
  END IF;

  IF length(trim(COALESCE(p_official_name, ''))) < 3 OR length(trim(COALESCE(p_reason, ''))) < 15 THEN
    RAISE EXCEPTION 'Provide an official name (min 3 chars) and verification reason (min 15 chars)' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.page_verification_requests (
    page_id, requested_by, category, official_name, reason, evidence_url, status
  )
  VALUES (
    p_page_id,
    v_uid,
    trim(COALESCE(p_category, 'other')),
    trim(p_official_name),
    trim(p_reason),
    NULLIF(trim(COALESCE(p_evidence_url, '')), ''),
    'pending'
  )
  RETURNING id INTO v_id;

  INSERT INTO public.page_audit_logs (page_id, actor_id, action, details, metadata)
  VALUES (
    p_page_id,
    v_uid,
    'verification_requested',
    format('Submitted Page verification request as %s', trim(p_official_name)),
    jsonb_build_object('request_id', v_id)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_page_verification_request(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_page_verification_request(uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_verification_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_decision text := lower(trim(COALESCE(p_decision, '')));
  v_req record;
  v_page_name text;
BEGIN
  IF v_uid IS NULL OR NOT private.is_app_admin() THEN
    RAISE EXCEPTION 'Super Admin privilege required' USING ERRCODE = '42501';
  END IF;

  IF v_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM public.page_verification_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.page_verification_requests
  SET
    status = v_decision,
    review_note = NULLIF(trim(COALESCE(p_review_note, '')), ''),
    reviewed_by = v_uid,
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_request_id;

  IF v_decision = 'approved' THEN
    PERFORM set_config('app.allow_verification_update', '1', true);
    UPDATE public.pages
    SET is_verified = true, updated_at = now()
    WHERE id = v_req.page_id;
  END IF;

  SELECT name INTO v_page_name FROM public.pages WHERE id = v_req.page_id;

  INSERT INTO public.page_audit_logs (page_id, actor_id, action, details, metadata)
  VALUES (
    v_req.page_id,
    v_uid,
    CASE WHEN v_decision = 'approved' THEN 'verification_approved' ELSE 'verification_rejected' END,
    CASE WHEN v_decision = 'approved'
      THEN 'Super Admin approved Page verification badge'
      ELSE COALESCE(NULLIF(trim(p_review_note), ''), 'Super Admin rejected Page verification request')
    END,
    jsonb_build_object('request_id', p_request_id, 'decision', v_decision)
  );

  IF to_regclass('public.notifications') IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, recipient_page_id, actor_id, type, entity_type, entity_id, title, body)
    VALUES (
      v_req.requested_by,
      v_req.page_id,
      v_uid,
      CASE WHEN v_decision = 'approved' THEN 'page_verification_approved' ELSE 'page_verification_rejected' END,
      'page',
      v_req.page_id,
      CASE WHEN v_decision = 'approved'
        THEN format('%s is now Verified', COALESCE(v_page_name, 'Your Page'))
        ELSE format('Verification update for %s', COALESCE(v_page_name, 'your Page'))
      END,
      CASE WHEN v_decision = 'approved'
        THEN format('Your verification request for %s was approved.', COALESCE(v_page_name, 'your Page'))
        ELSE COALESCE(NULLIF(trim(p_review_note), ''), 'Your verification request was not approved at this time.')
      END
    );
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_verification_request(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_verification_request(uuid, text, text) TO authenticated;
