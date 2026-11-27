-- ==============================================================================
-- Restore & Sync Super Admin Access for wisdomchinonso82@gmail.com (and team)
-- Ensures private.app_admins, private.is_app_admin(), and public.current_user_is_admin()
-- stay synchronized for all authorized Super Admin accounts without weakening RLS.
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

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

  REVOKE ALL ON TABLE private.app_admins FROM PUBLIC, anon, authenticated;

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
      ON CONFLICT (user_id) DO UPDATE
        SET email = EXCLUDED.email,
            role = COALESCE(private.app_admins.role, 'super_admin');
    ELSIF has_email THEN
      INSERT INTO private.app_admins (user_id, email)
      VALUES (admin_rec.user_id, admin_rec.email)
      ON CONFLICT (user_id) DO UPDATE
        SET email = EXCLUDED.email;
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
         OR (
           a.email IS NOT NULL
           AND lower(trim(a.email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
         )
    );
$$;

REVOKE ALL ON FUNCTION private.is_app_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_app_admin() TO authenticated, service_role;

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
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated, service_role;
