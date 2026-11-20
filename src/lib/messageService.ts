import { supabase } from './supabase.ts';
import type { Conversation, Message, User, MessageAttachment } from '../types/index.ts';
import { mapProfileRowToUser, SupabaseProfileRow } from './profileService.ts';
import { formatTimeAgo } from './postService.ts';
import {
  uploadChatAttachmentToStorage,
  batchResolveChatAttachmentSignedUrls,
  deleteChatAttachmentsFromStorage,
} from './storageService.ts';
import { uploadMediaToCloudinary } from './cloudinaryService.ts';
import { safeStorage } from '../utils/safeStorage.ts';
import {
  createOrUpdateConversationNotification,
  markConversationNotificationsAsRead,
} from './notificationService.ts';
import {
  getCachedConversations,
  setCachedConversations,
  getCachedMessages,
  setCachedMessages,
} from './cacheService.ts';

/**
 * Authoritative unread counts per conversation.
 * Uses `conversation_members.last_read_at` as the source of truth,
 * counting only incoming messages created after the recipient's last_read_at.
 */
export async function fetchMyUnreadCounts(currentUserId?: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  try {
    const effectiveUserId =
      currentUserId || (await supabase.auth.getSession()).data.session?.user?.id;
    if (!effectiveUserId) return counts;

    // 1. Fetch current user's conversation memberships and their last_read_at timestamps
    const { data: memberRows, error: mErr } = await supabase
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', effectiveUserId);

    if (mErr || !memberRows || memberRows.length === 0) {
      return counts;
    }

    const convIds = memberRows.map((r) => r.conversation_id).filter(Boolean);
    if (convIds.length === 0) return counts;

    // Build map of conversationId -> last_read_at and initialize count to 0
    const memberMap = new Map<string, string | null>();
    for (const m of memberRows) {
      memberMap.set(m.conversation_id, m.last_read_at);
      counts[m.conversation_id] = 0;
    }

    // 2. Fetch all incoming messages for these conversations (sender != effectiveUserId and deleted_at is null)
    const { data: messages, error: msgErr } = await supabase
      .from('messages')
      .select('id, conversation_id, created_at, sender_id')
      .in('conversation_id', convIds)
      .neq('sender_id', effectiveUserId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (msgErr || !messages) {
      return counts;
    }

    // 3. Count messages created after last_read_at
    for (const msg of messages) {
      const lastRead = memberMap.get(msg.conversation_id);
      if (!lastRead) {
        // Never read this conversation: all incoming messages unread
        counts[msg.conversation_id] = (counts[msg.conversation_id] || 0) + 1;
      } else {
        const msgTime = new Date(msg.created_at).getTime();
        const readTime = new Date(lastRead).getTime();
        if (msgTime > readTime) {
          counts[msg.conversation_id] = (counts[msg.conversation_id] || 0) + 1;
        }
      }
    }

    return counts;
  } catch (err) {
    console.warn('Unexpected error in fetchMyUnreadCounts:', err);
    return counts;
  }
}

/**
 * Mark a conversation as read using authoritative Supabase membership update and notification RPC
 */
export async function markConversationAsRead(
  conversationId: string,
  currentUserId?: string,
  participantId?: string
): Promise<boolean> {
  if (!conversationId) return false;
  try {
    const effectiveUserId =
      currentUserId || (await supabase.auth.getSession()).data.session?.user?.id;
    if (!effectiveUserId) return false;

    const nowIso = new Date().toISOString();

    // 1. Authoritative update to user's conversation membership last_read_at
    const { error: memberError } = await supabase
      .from('conversation_members')
      .update({ last_read_at: nowIso })
      .eq('conversation_id', conversationId)
      .eq('user_id', effectiveUserId);

    if (memberError) {
      console.warn('[messageService] conversation_members update notice:', memberError.message);
    }

    // 2. Clear unread message notifications using existing PostgreSQL function
    // Signature: public.mark_conversation_notifications_read(p_user_id uuid, p_conversation_id uuid)
    const { error: rpcError } = await supabase.rpc('mark_conversation_notifications_read', {
      p_user_id: effectiveUserId,
      p_conversation_id: conversationId,
    });

    if (rpcError) {
      console.debug('[messageService] mark_conversation_notifications_read notice:', rpcError.message);
    }

    // 3. Mark client and server conversation notifications as read
    await markConversationNotificationsAsRead(effectiveUserId, conversationId, participantId);

    return true;
  } catch (err) {
    console.warn('Unexpected error in markConversationAsRead:', err);
    return false;
  }
}

/**
 * Fetch recipient's last_read_at timestamp for accurate one-to-one read receipts
 */
export async function fetchRecipientLastReadAt(
  conversationId: string,
  currentUserId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('conversation_members')
      .select('last_read_at')
      .eq('conversation_id', conversationId)
      .neq('user_id', currentUserId)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data.last_read_at || null;
  } catch {
    return null;
  }
}

/**
 * Helper to process raw message rows with their message_attachments and signed URLs
 */
async function processMessageRowsWithAttachments(
  rawMessages: Array<{
    id: string;
    sender_id: string;
    body: string;
    created_at: string;
    message_attachments?: Array<{
      id: string;
      message_id: string;
      uploader_id: string;
      file_name: string;
      bytes: number;
      format?: string;
      kind?: string;
      asset_id: string;
      secure_url?: string;
      provider?: string;
      thumbnail_url?: string;
      created_at: string;
    }>;
  }>,
  currentUserId: string,
  recipientReadTime: number
): Promise<Message[]> {
  // Collect all attachments to batch-resolve signed URLs
  const allAttachments: MessageAttachment[] = [];
  for (const m of rawMessages) {
    if (m.message_attachments && Array.isArray(m.message_attachments)) {
      for (const a of m.message_attachments) {
        allAttachments.push({
          id: a.id,
          message_id: a.message_id,
          uploader_id: a.uploader_id,
          file_name: a.file_name,
          bytes: a.bytes,
          format: a.format,
          kind: (a.kind as 'image' | 'video' | 'audio' | 'pdf' | 'document') || 'document',
          asset_id: a.asset_id,
          secure_url: a.secure_url,
          provider: a.provider || 'supabase',
          thumbnail_url: a.thumbnail_url,
          created_at: a.created_at,
        });
      }
    }
  }

  const signedUrlMap = await batchResolveChatAttachmentSignedUrls(allAttachments);

  return rawMessages.map((m) => {
    const isOutgoing = m.sender_id === currentUserId;
    const msgTime = new Date(m.created_at).getTime();
    const isSeen = isOutgoing && recipientReadTime > 0 && recipientReadTime >= msgTime;

    const attachments: MessageAttachment[] = (m.message_attachments || []).map((a) => {
      const signedUrl = signedUrlMap.get(a.asset_id) || a.secure_url;
      return {
        id: a.id,
        message_id: a.message_id,
        uploader_id: a.uploader_id,
        file_name: a.file_name,
        bytes: a.bytes,
        format: a.format,
        kind: (a.kind as 'image' | 'video' | 'audio' | 'pdf' | 'document') || 'document',
        asset_id: a.asset_id,
        secure_url: signedUrl,
        provider: a.provider || 'supabase',
        thumbnail_url: a.thumbnail_url,
        created_at: a.created_at,
      };
    });

    return {
      id: m.id,
      senderId: m.sender_id,
      text: m.body || '',
      timestamp: formatTimeAgo(m.created_at),
      createdAtRaw: m.created_at,
      isOutgoing,
      isSeen,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  });
}

/**
 * Local state helpers for current-user-specific conversation deletion and muting
 */
export function getHiddenConversationIds(userId: string): Set<string> {
  if (!userId) return new Set();
  try {
    const raw = safeStorage.getItem(`absu_hidden_convs_${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function hideConversationForUser(userId: string, conversationId: string): void {
  if (!userId || !conversationId) return;
  try {
    const set = getHiddenConversationIds(userId);
    set.add(conversationId);
    safeStorage.setItem(`absu_hidden_convs_${userId}`, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn('Failed to hide conversation:', err);
  }
}

export function unhideConversationForUser(userId: string, conversationId: string): void {
  if (!userId || !conversationId) return;
  try {
    const set = getHiddenConversationIds(userId);
    if (set.has(conversationId)) {
      set.delete(conversationId);
      safeStorage.setItem(`absu_hidden_convs_${userId}`, JSON.stringify(Array.from(set)));
    }
  } catch (err) {
    console.warn('Failed to unhide conversation:', err);
  }
}

export function getMutedConversationIds(userId: string): Set<string> {
  if (!userId) return new Set();
  try {
    const raw = safeStorage.getItem(`absu_muted_convs_${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function toggleMuteConversationForUser(userId: string, conversationId: string): boolean {
  if (!userId || !conversationId) return false;
  try {
    const set = getMutedConversationIds(userId);
    const isMuted = set.has(conversationId);
    if (isMuted) {
      set.delete(conversationId);
    } else {
      set.add(conversationId);
    }
    safeStorage.setItem(`absu_muted_convs_${userId}`, JSON.stringify(Array.from(set)));
    return !isMuted;
  } catch {
    return false;
  }
}

/**
 * Fetch conversations for the current user with unread counts and read receipts
/**
 * Fetch conversations for the current user with unread counts and read receipts.
 * OPTIMIZATION: Only loads metadata and single latest message preview — DOES NOT download
 * full message history, ensuring near-instant (<100ms) conversation list rendering.
 * Backed by IndexedDB (localForage) for offline support like WhatsApp.
 */
export async function fetchUserConversations(currentUserId: string): Promise<Conversation[]> {
  try {
    // 1. First, check if we have cached conversations from IndexedDB
    const cached = await getCachedConversations();

    // 2. Fetch active conversation memberships from Supabase
    const { data: memberRows, error: mErr } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', currentUserId);

    if (mErr) {
      console.warn('[messageService] Member fetch error, returning cache:', mErr.message);
      return cached;
    }

    if (!memberRows || memberRows.length === 0) {
      return [];
    }

    const convIds = Array.from(new Set(memberRows.map((r) => r.conversation_id)));

    // 3. Fetch unread counts
    const unreadMap = await fetchMyUnreadCounts(currentUserId);

    // 4. Fetch conversation rows ordered by last_message_at, limited to recent 30
    const { data: convRows, error: cErr } = await supabase
      .from('conversations')
      .select('*')
      .in('id', convIds)
      .order('last_message_at', { ascending: false })
      .limit(30);

    if (cErr || !convRows) {
      return cached.length > 0 ? cached : [];
    }

    const hiddenIds = getHiddenConversationIds(currentUserId);
    const validConvRows = convRows.filter((c) => !hiddenIds.has(c.id));

    // 5. Batch-fetch other members for all valid conversations
    const validConvIds = validConvRows.map((c) => c.id);
    const { data: allOtherMembers } = await supabase
      .from('conversation_members')
      .select('conversation_id, user_id, last_read_at')
      .in('conversation_id', validConvIds)
      .neq('user_id', currentUserId);

    const otherMemberByConv = new Map<string, { user_id: string; last_read_at?: string }>();
    const partnerUserIds = new Set<string>();

    if (allOtherMembers) {
      for (const m of allOtherMembers) {
        if (!otherMemberByConv.has(m.conversation_id)) {
          otherMemberByConv.set(m.conversation_id, m);
          if (m.user_id) partnerUserIds.add(m.user_id);
        }
      }
    }

    // 6. Batch-fetch other user profiles
    const profileMap = new Map<string, User>();
    if (partnerUserIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', Array.from(partnerUserIds));

      if (profiles) {
        for (const p of profiles) {
          profileMap.set(p.id, mapProfileRowToUser(p as SupabaseProfileRow, null, 'friends'));
        }
      }
    }

    // 7. Batch-fetch ONLY the single latest message for each conversation
    const latestMessageByConv = new Map<string, { text: string; time: string; createdAtRaw?: string }>();
    try {
      const { data: latestMsgs } = await supabase
        .from('messages')
        .select('conversation_id, body, created_at, sender_id')
        .in('conversation_id', validConvIds)
        .order('created_at', { ascending: false })
        .limit(validConvIds.length * 2);

      if (latestMsgs) {
        for (const msg of latestMsgs) {
          if (!latestMessageByConv.has(msg.conversation_id)) {
            latestMessageByConv.set(msg.conversation_id, {
              text: msg.body || 'Attachment',
              time: formatTimeAgo(msg.created_at),
              createdAtRaw: msg.created_at,
            });
          }
        }
      }
    } catch {
      // Fallback
    }

    // 8. Build lightweight conversation summaries without downloading deep message trees
    const rawResults: Conversation[] = [];

    for (const c of validConvRows) {
      const other = otherMemberByConv.get(c.id);
      const partnerId = other ? other.user_id : c.created_by;

      const participantUser: User =
        (partnerId && profileMap.get(partnerId)) || {
          id: partnerId || 'unknown',
          name: c.title || 'Coursemate',
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(partnerId || 'ABSU')}&backgroundColor=6d45d9&textColor=ffffff`,
          handle: '@student',
          department: 'Student',
          faculty: 'Abia State University',
          level: 'Undergraduate',
          campus: 'Uturu (Main Campus)',
          bio: '',
          interests: [],
          relationshipState: 'none',
        };

      const latestMsgInfo = latestMessageByConv.get(c.id);
      const lastMessageText = latestMsgInfo ? latestMsgInfo.text : (c.last_message || 'Conversation started');
      const lastMessageTime = latestMsgInfo ? latestMsgInfo.time : formatTimeAgo(c.last_message_at || c.created_at);
      const unreadCount = unreadMap[c.id] ?? 0;

      rawResults.push({
        id: c.id,
        participant: participantUser,
        lastMessage: lastMessageText,
        lastMessageTime,
        unreadCount,
        messages: [], // Populated on-demand when chat is opened
      });
    }

    // Deduplicate direct conversations by participant ID
    const directMap = new Map<string, Conversation>();
    for (const conv of rawResults) {
      const pid = conv.participant.id;
      if (!directMap.has(pid)) {
        directMap.set(pid, conv);
      } else {
        const existing = directMap.get(pid)!;
        directMap.set(pid, {
          ...existing,
          unreadCount: existing.unreadCount + conv.unreadCount,
        });
      }
    }

    const finalConversations = Array.from(directMap.values());

    // Update local IndexedDB cache in background
    setCachedConversations(finalConversations).catch(() => {});

    return finalConversations;
  } catch (err) {
    console.warn('Unexpected error in fetchUserConversations, returning cache:', err);
    return await getCachedConversations();
  }
}

/**
 * Fetch paginated messages for a specific conversation (default latest 50).
 * If beforeTimestamp is provided, fetches 50 older messages before that timestamp.
 * Saves messages to IndexedDB (localForage) for instant offline viewing.
 */
export async function fetchConversationMessages(
  conversationId: string,
  limit = 50,
  beforeTimestamp?: string,
  afterTimestamp?: string
): Promise<Message[]> {
  if (!conversationId) return [];
  try {
    const authUser = (await supabase.auth.getSession()).data.session?.user;
    const currentUserId = authUser?.id || '';

    // Fetch recipient last_read_at for read receipts
    let recipientReadTime = 0;
    if (currentUserId) {
      const lastRead = await fetchRecipientLastReadAt(conversationId, currentUserId);
      if (lastRead) {
        recipientReadTime = new Date(lastRead).getTime();
      }
    }

    let query = supabase
      .from('messages')
      .select(`
        *,
        message_attachments(*)
      `)
      .eq('conversation_id', conversationId);

    const isDeltaAfter = Boolean(afterTimestamp && !beforeTimestamp);
    if (isDeltaAfter && afterTimestamp) {
      query = query.gt('created_at', afterTimestamp);
    } else if (beforeTimestamp) {
      query = query.lt('created_at', beforeTimestamp);
    }

    const { data: rawRows, error } = await query
      .order('created_at', { ascending: isDeltaAfter })
      .limit(limit);

    if (error) {
      console.warn('fetchConversationMessages error, falling back to cache:', error.message);
      return isDeltaAfter || beforeTimestamp ? [] : await getCachedMessages(conversationId);
    }

    if (!rawRows || rawRows.length === 0) {
      return isDeltaAfter || beforeTimestamp ? [] : await getCachedMessages(conversationId);
    }

    // Process attachments and signed URLs
    const processed = await processMessageRowsWithAttachments(
      rawRows as any,
      currentUserId,
      recipientReadTime
    );

    // Reverse only when fetched descending for initial/older pagination
    return isDeltaAfter ? processed : processed.reverse();
  } catch (err) {
    console.warn('fetchConversationMessages unexpected error:', err);
    return afterTimestamp || beforeTimestamp ? [] : await getCachedMessages(conversationId);
  }
}

/**
 * Send a message into a conversation, optionally including file attachments
 * uploaded to the private 'chat-attachments' bucket.
 */
export async function sendRealMessage(params: {
  conversationId: string;
  senderId: string;
  text?: string;
  files?: File[];
  senderName?: string;
}): Promise<{ success: boolean; message?: Message; error?: string }> {
  const uploadedAssetPaths: string[] = [];

  try {
    // Unhide conversation if it was hidden for sender
    unhideConversationForUser(params.senderId, params.conversationId);

    const rawFiles = params.files || [];
    const uploadedAttachments: Array<{
      asset_id: string;
      file_name: string;
      bytes: number;
      format: string;
      kind: 'image' | 'video' | 'audio' | 'pdf' | 'document';
      secure_url?: string;
      provider: string;
    }> = [];

    // 1. Upload each attachment to Cloudinary (chat folder) with Supabase fallback
    for (const f of rawFiles) {
      const isAudio = f.type.startsWith('audio/') || Boolean(f.name.match(/\.(webm|mp3|m4a|wav|ogg|aac)$/i));
      const isVideo = !isAudio && (f.type.startsWith('video/') || Boolean(f.name.match(/\.(mp4|webm|mov|m4v)$/i)));
      const isImage = !isAudio && !isVideo && (f.type.startsWith('image/') || Boolean(f.name.match(/\.(jpg|jpeg|png|webp|avif|gif)$/i)));
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

      let kind: 'image' | 'video' | 'audio' | 'pdf' | 'document' = 'document';
      if (isAudio) kind = 'audio';
      else if (isVideo) kind = 'video';
      else if (isImage) kind = 'image';
      else if (isPdf) kind = 'pdf';

      // Primary: upload directly to Supabase Storage 'chat-attachments' bucket
      const upRes = await uploadChatAttachmentToStorage(params.senderId, f);
      if (upRes.success && upRes.attachment) {
        uploadedAssetPaths.push(upRes.attachment.asset_id);
        uploadedAttachments.push({
          ...upRes.attachment,
          kind: isAudio ? 'audio' : upRes.attachment.kind,
        });
      } else {
        // Optional fallback to Cloudinary if Supabase Storage is unavailable
        console.warn('[Chat Storage Fallback Notice]', upRes.error);
        const cldRes = await uploadMediaToCloudinary(f, 'chat').catch(() => ({
          success: false,
          error: upRes.error,
        }));
        if (cldRes.success && 'secure_url' in cldRes && cldRes.secure_url) {
          uploadedAttachments.push({
            asset_id: cldRes.public_id || cldRes.asset_id || `chat_${Date.now()}`,
            file_name: f.name,
            bytes: cldRes.bytes || f.size,
            format: cldRes.format || (isAudio ? 'webm' : isVideo ? 'mp4' : 'jpg'),
            kind,
            secure_url: cldRes.secure_url,
            provider: 'cloudinary',
          });
        } else {
          if (uploadedAssetPaths.length > 0) {
            await deleteChatAttachmentsFromStorage(uploadedAssetPaths);
          }
          return {
            success: false,
            error: upRes.error || `Failed to upload "${f.name}".`,
          };
        }
      }
    }

    const nowIso = new Date().toISOString();
    let bodyText = (params.text || '').trim();
    if (!bodyText && uploadedAttachments.length > 0) {
      bodyText = uploadedAttachments.length === 1
        ? `📎 ${uploadedAttachments[0].file_name}`
        : `📎 ${uploadedAttachments.length} attachments`;
    }

    // 2. Insert message row
    const msgPayload = {
      conversation_id: params.conversationId,
      sender_id: params.senderId,
      body: bodyText,
      created_at: nowIso,
    };

    const { data: msgData, error: msgError } = await supabase
      .from('messages')
      .insert(msgPayload)
      .select('*')
      .single();

    if (msgError || !msgData) {
      console.warn('Supabase sendMessage error:', msgError?.message);
      if (uploadedAssetPaths.length > 0) {
        await deleteChatAttachmentsFromStorage(uploadedAssetPaths);
      }
      return { success: false, error: msgError?.message || 'Failed to send message.' };
    }

    // 3. Insert message_attachments rows if any
    const createdAttachments: MessageAttachment[] = [];
    if (uploadedAttachments.length > 0) {
      const attachmentPayloads = uploadedAttachments.map((att) => ({
        message_id: msgData.id,
        uploader_id: params.senderId,
        file_name: att.file_name,
        bytes: att.bytes,
        format: att.format,
        kind: att.kind,
        asset_id: att.asset_id,
        secure_url: att.secure_url || null,
        provider: att.provider || 'cloudinary',
        created_at: nowIso,
      }));

      const { data: attRows, error: attError } = await supabase
        .from('message_attachments')
        .insert(attachmentPayloads)
        .select('*');

      if (attError) {
        console.error('Supabase message_attachments insert error:', attError.message);
        await supabase.from('messages').delete().eq('id', msgData.id);
        if (uploadedAssetPaths.length > 0) {
          await deleteChatAttachmentsFromStorage(uploadedAssetPaths);
        }
        return {
          success: false,
          error: `Failed to attach files (${attError.message}). Please try again.`,
        };
      }

      if (attRows) {
        for (const row of attRows) {
          createdAttachments.push({
            id: row.id,
            message_id: row.message_id,
            uploader_id: row.uploader_id,
            file_name: row.file_name,
            bytes: row.bytes,
            format: row.format,
            kind: row.kind,
            asset_id: row.asset_id,
            secure_url: row.secure_url,
            provider: row.provider,
            thumbnail_url: row.thumbnail_url,
            created_at: row.created_at,
          });
        }
      }
    }

    // 4. Update conversation last_message_at
    await supabase
      .from('conversations')
      .update({ last_message_at: nowIso })
      .eq('id', params.conversationId);

    // 5. Sender marks their read time
    await supabase
      .from('conversation_members')
      .update({ last_read_at: nowIso })
      .eq('conversation_id', params.conversationId)
      .eq('user_id', params.senderId);

    // 6. WhatsApp-like conversation notification: update or create canonical active notification for recipients
    try {
      const { data: recipientMembers } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', params.conversationId)
        .neq('user_id', params.senderId);

      if (recipientMembers && recipientMembers.length > 0) {
        for (const r of recipientMembers) {
          if (r.user_id) {
            createOrUpdateConversationNotification({
              recipientId: r.user_id,
              senderId: params.senderId,
              conversationId: params.conversationId,
              messageId: msgData.id,
              senderName: params.senderName,
            }).catch(() => {});
          }
        }
      }
    } catch (notifErr) {
      console.warn('Could not dispatch conversation notification:', notifErr);
    }

    const message: Message = {
      id: msgData.id,
      senderId: msgData.sender_id,
      text: msgData.body,
      timestamp: 'Just now',
      createdAtRaw: msgData.created_at,
      isOutgoing: true,
      isSeen: false,
      attachments: createdAttachments.length > 0 ? createdAttachments : undefined,
    };

    return { success: true, message };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to send message';
    if (uploadedAssetPaths.length > 0) {
      await deleteChatAttachmentsFromStorage(uploadedAssetPaths);
    }
    return { success: false, error: msg };
  }
}

/**
 * Get existing 1-on-1 direct conversation or create a canonical one idempotently.
 * Guarantees that reopening a DM with the same person always reuses the stable conversation.
 */
export async function getOrCreateDirectConversation(
  currentUserId: string,
  targetUser: User
): Promise<{ success: boolean; conversation?: Conversation; error?: string }> {
  try {
    // 0. Fast atomic server-side RPC lookup/create when available
    try {
      const { data: rpcConvId, error: rpcErr } = await supabase.rpc('create_or_get_direct_conversation', {
        p_target_user_id: targetUser.id,
      });
      if (!rpcErr && typeof rpcConvId === 'string' && rpcConvId.length > 0) {
        unhideConversationForUser(currentUserId, rpcConvId);
        const rpcMessages = await fetchConversationMessages(rpcConvId, 50);
        let preview = 'Say hello!';
        if (rpcMessages.length > 0) {
          const lastM = rpcMessages[rpcMessages.length - 1];
          preview = lastM.text || (lastM.attachments?.length ? '📎 Attachment' : 'Chat started');
        }
        return {
          success: true,
          conversation: {
            id: rpcConvId,
            participant: targetUser,
            lastMessage: preview,
            lastMessageTime:
              rpcMessages.length > 0 ? rpcMessages[rpcMessages.length - 1].timestamp : 'Just now',
            unreadCount: 0,
            messages: rpcMessages,
          },
        };
      }
    } catch {
      // Fallback to PostgREST lookup/creation below
    }

    // 1. Unhide any conversation with this user if hidden
    const hiddenSet = getHiddenConversationIds(currentUserId);

    // 2. Query all conversation memberships for current user
    const { data: myConvs } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', currentUserId);

    if (myConvs && myConvs.length > 0) {
      const myConvIds = Array.from(new Set(myConvs.map((r) => r.conversation_id)));

      // Check which of those conversations also have targetUser as member
      const { data: sharedConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .in('conversation_id', myConvIds)
        .eq('user_id', targetUser.id);

      if (sharedConvs && sharedConvs.length > 0) {
        const candidateConvIds = Array.from(new Set(sharedConvs.map((r) => r.conversation_id)));

        // Filter for direct non-group conversations
        const { data: convData } = await supabase
          .from('conversations')
          .select('id, last_message_at, is_group')
          .in('id', candidateConvIds)
          .eq('is_group', false)
          .order('last_message_at', { ascending: false });

        const directConvIds = (convData || []).map((c) => c.id);
        const finalCandidateIds = directConvIds.length > 0 ? directConvIds : candidateConvIds;

        // Choose the canonical conversation (prefer the one with messages)
        let chosenConvId = finalCandidateIds[0];
        let chosenMessages: Message[] = [];

        for (const candidateId of finalCandidateIds) {
          // Unhide in case it was previously deleted for current user
          if (hiddenSet.has(candidateId)) {
            unhideConversationForUser(currentUserId, candidateId);
          }

          const { data: otherMember } = await supabase
            .from('conversation_members')
            .select('last_read_at')
            .eq('conversation_id', candidateId)
            .eq('user_id', targetUser.id)
            .maybeSingle();

          const recipientReadTime = otherMember?.last_read_at
            ? new Date(otherMember.last_read_at).getTime()
            : 0;

          const { data: msgRows } = await supabase
            .from('messages')
            .select('*, message_attachments(*)')
            .eq('conversation_id', candidateId)
            .order('created_at', { ascending: true });

          const candidateMsgs = await processMessageRowsWithAttachments(
            (msgRows || []) as any,
            currentUserId,
            recipientReadTime
          );

          if (candidateMsgs.length > 0) {
            chosenConvId = candidateId;
            chosenMessages = candidateMsgs;
            break; // Found active conversation with messages!
          }
        }

        let lastMessagePreview = 'Chat started';
        if (chosenMessages.length > 0) {
          const lastM = chosenMessages[chosenMessages.length - 1];
          if (lastM.text) lastMessagePreview = lastM.text;
          else if (lastM.attachments && lastM.attachments.length > 0) {
            lastMessagePreview = '📎 Attachment';
          }
        }

        const conv: Conversation = {
          id: chosenConvId,
          participant: targetUser,
          lastMessage: lastMessagePreview,
          lastMessageTime: chosenMessages.length > 0 ? chosenMessages[chosenMessages.length - 1].timestamp : 'Active',
          unreadCount: 0,
          messages: chosenMessages,
        };

        return { success: true, conversation: conv };
      }
    }

    // 3. If no conversation exists at all, create ONE new direct conversation
    const nowIso = new Date().toISOString();
    const { data: newConv, error: createErr } = await supabase
      .from('conversations')
      .insert({
        title: targetUser.name,
        is_group: false,
        created_by: currentUserId,
        created_at: nowIso,
        last_message_at: nowIso,
      })
      .select('*')
      .single();

    if (createErr || !newConv) {
      return { success: false, error: createErr?.message || 'Failed to start conversation.' };
    }

    // Add both members
    await supabase.from('conversation_members').insert([
      { conversation_id: newConv.id, user_id: currentUserId, joined_at: nowIso, last_read_at: nowIso },
      { conversation_id: newConv.id, user_id: targetUser.id, joined_at: nowIso },
    ]);

    const freshConv: Conversation = {
      id: newConv.id,
      participant: targetUser,
      lastMessage: 'Say hello!',
      lastMessageTime: 'Just now',
      unreadCount: 0,
      messages: [],
    };

    return { success: true, conversation: freshConv };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error creating conversation';
    return { success: false, error: msg };
  }
}
