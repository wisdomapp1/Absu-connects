-- ==============================================================================
-- ABSU CONNECT — NOTIFICATION SYSTEM REBUILD & CONVERSATION DEDUPLICATION MIGRATION
-- Run this migration in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ==============================================================================

-- 1. Ensure notification_type enum supports all required campus events
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'message',
      'reaction',
      'comment',
      'friend_request',
      'friend_accepted',
      'announcement',
      'game_invite',
      'system'
    );
  END IF;
END $$;

-- 2. Verify notifications table structure and indexes
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type notification_type NOT NULL,
  entity_type text,
  entity_id text,
  title text NOT NULL DEFAULT 'ABSU Connect Alert',
  body text NOT NULL,
  read_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Optimize notification query performance and unread badge lookups
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_entity_lookup
  ON public.notifications (recipient_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_notifications_age_archival
  ON public.notifications (created_at);

-- 3. Row Level Security for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'Users can view their own notifications'
  ) THEN
    CREATE POLICY "Users can view their own notifications"
      ON public.notifications
      FOR SELECT
      USING (auth.uid() = recipient_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'Users can update their own notifications'
  ) THEN
    CREATE POLICY "Users can update their own notifications"
      ON public.notifications
      FOR UPDATE
      USING (auth.uid() = recipient_id)
      WITH CHECK (auth.uid() = recipient_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'Authenticated users can create notifications'
  ) THEN
    CREATE POLICY "Authenticated users can create notifications"
      ON public.notifications
      FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- 4. Enable Supabase Realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 5. WhatsApp-Like Conversation Notification Deduplication Trigger Function
-- Ensures that sending multiple messages in the same conversation refreshes the existing
-- unread conversation notification rather than creating duplicate active alerts.
-- Guarantees privacy: never stores private message body text in notifications.
CREATE OR REPLACE FUNCTION public.handle_message_notification_deduplication()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec_member RECORD;
BEGIN
  -- For each other member in the conversation (recipients)
  FOR rec_member IN
    SELECT user_id
    FROM public.conversation_members
    WHERE conversation_id = NEW.conversation_id
      AND user_id <> NEW.sender_id
  LOOP
    -- Check if an active unread notification already exists for this conversation
    UPDATE public.notifications
    SET
      created_at = NEW.created_at,
      actor_id = NEW.sender_id,
      body = 'sent you a message.',
      title = 'ABSU Connect Message'
    WHERE id = (
      SELECT id
      FROM public.notifications
      WHERE recipient_id = rec_member.user_id
        AND type = 'message'
        AND read_at IS NULL
        AND (
          (entity_type = 'conversation' AND entity_id = NEW.conversation_id::text)
          OR actor_id = NEW.sender_id
        )
      ORDER BY created_at DESC
      LIMIT 1
    );

    -- If no unread notification existed, insert one canonical conversation notification
    IF NOT FOUND THEN
      INSERT INTO public.notifications (
        recipient_id,
        actor_id,
        type,
        title,
        body,
        entity_type,
        entity_id,
        created_at,
        read_at
      ) VALUES (
        rec_member.user_id,
        NEW.sender_id,
        'message',
        'ABSU Connect Message',
        'sent you a message.',
        'conversation',
        NEW.conversation_id::text,
        NEW.created_at,
        NULL
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Replace existing message trigger if present with the WhatsApp-style deduplicated trigger
DROP TRIGGER IF EXISTS on_message_inserted_notify ON public.messages;
DROP TRIGGER IF EXISTS trigger_message_notification ON public.messages;

CREATE TRIGGER on_message_inserted_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_message_notification_deduplication();

-- 6. Helper Function: Resolve Conversation Notifications
-- Marks all unread message alerts for a conversation as read when recipient opens it
CREATE OR REPLACE FUNCTION public.mark_conversation_notifications_read(
  p_user_id uuid,
  p_conversation_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.notifications
  SET read_at = now()
  WHERE recipient_id = p_user_id
    AND type = 'message'
    AND read_at IS NULL
    AND (
      (entity_type = 'conversation' AND entity_id = p_conversation_id::text)
      OR entity_id IN (
        SELECT id::text FROM public.messages WHERE conversation_id = p_conversation_id
      )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 7. Persistent Push Subscriptions Table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'push_subscriptions' AND policyname = 'Users can manage their own push subscriptions'
  ) THEN
    CREATE POLICY "Users can manage their own push subscriptions"
      ON public.push_subscriptions
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 8. Sanitize existing notification records to strictly preserve privacy
UPDATE public.notifications
SET body = 'sent you a message.', title = 'ABSU Connect Message'
WHERE type = 'message' AND body <> 'sent you a message.';
