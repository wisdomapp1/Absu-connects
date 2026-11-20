-- Add explicit post_id, comment_id, and parent_comment_id columns to public.notifications
-- and update triggers for comments, post reactions, and comment reactions so all new
-- notification records carry exact deep-link navigation identifiers.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS post_id uuid,
  ADD COLUMN IF NOT EXISTS comment_id uuid,
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid;

CREATE INDEX IF NOT EXISTS idx_notifications_post_id
  ON public.notifications (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_comment_id
  ON public.notifications (comment_id)
  WHERE comment_id IS NOT NULL;

-- Backfill existing notifications where possible from entity_type / entity_id
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

-- Updated trigger for post comments & replies (carries post_id, comment_id, parent_comment_id)
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

  SELECT author_id INTO v_recipient FROM public.posts WHERE id = NEW.post_id;
  IF v_recipient IS NOT NULL AND v_recipient <> NEW.author_id AND (v_parent_author IS NULL OR v_recipient <> v_parent_author) THEN
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

-- Updated trigger for post likes (carries post_id)
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
    INSERT INTO public.notifications (
      recipient_id, actor_id, type, entity_type, entity_id, post_id, title, body
    )
    VALUES (
      v_recipient, NEW.user_id, 'reaction', 'post', NEW.post_id::text, NEW.post_id, 'New Reaction', 'liked your post.'
    )
    ON CONFLICT DO NOTHING;
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

-- New trigger for comment likes (carries post_id, comment_id, parent_comment_id)
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
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_comment_reaction_insert ON public.comment_reactions;
CREATE TRIGGER trg_notify_on_comment_reaction_insert
  AFTER INSERT ON public.comment_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_comment_reaction_insert();
