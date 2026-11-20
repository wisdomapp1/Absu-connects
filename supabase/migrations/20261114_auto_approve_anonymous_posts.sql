-- ==============================================================================
-- ABSU CONNECT — AUTO-APPROVE & IMMEDIATELY PUBLISH ANONYMOUS POSTS
-- Non-destructive, idempotent migration.
-- Execute in Supabase Dashboard > SQL Editor.
--
-- What this changes:
--   1. Backfills all existing `pending` rows in `public.anonymous_submissions`
--      into `public.posts` under the Mr Anonymous identity and marks them
--      `approved` (existing approved/rejected rows and all other data untouched).
--   2. Adds a SECURITY DEFINER BEFORE INSERT trigger on `public.anonymous_submissions`
--      so every new anonymous post is automatically approved and published to
--      `public.posts` immediately upon submission without modifying the existing
--      `submit_anonymous_post` RPC or its protected identity-separation table.
-- ==============================================================================

-- 1. Auto-approve & publish any existing pending anonymous submissions
DO $$
DECLARE
  v_sub RECORD;
  v_post_id uuid;
  v_mr_anon_author_id constant uuid := 'b4f38505-fce6-44be-8727-8ebf04eb2ceb';
  v_mr_anon_page_id   constant uuid := '0c3240e3-ae39-461d-bd7a-4963859b9bc7';
BEGIN
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
END $$;

-- 2. Trigger function to auto-approve & publish new anonymous submissions immediately
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
  -- Leave explicitly rejected or already-published submissions untouched
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

DROP TRIGGER IF EXISTS trg_auto_approve_anonymous_submission ON public.anonymous_submissions;

CREATE TRIGGER trg_auto_approve_anonymous_submission
  BEFORE INSERT ON public.anonymous_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_approve_new_anonymous_submission();
