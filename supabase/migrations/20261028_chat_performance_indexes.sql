-- ==============================================================================
-- ABSU CONNECT — CHAT PERFORMANCE & WHATSAPP-STYLE INSTANT DELIVERY INDEXES
-- Run in Supabase SQL Editor:
-- ==============================================================================

-- 1. Index messages by conversation and creation time for instant last 50 pagination
CREATE INDEX IF NOT EXISTS idx_messages_chat_created
  ON public.messages (conversation_id, created_at DESC);

-- 2. Index conversation members by user and last_read_at for quick unread counts
CREATE INDEX IF NOT EXISTS idx_chats_user_last
  ON public.conversation_members (user_id, last_read_at DESC);

-- 3. Index conversations by last_message_at for rapid conversation list sorting
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at
  ON public.conversations (last_message_at DESC NULLS LAST);

-- 4. Enable Supabase Realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
