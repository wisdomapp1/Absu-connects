import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase.ts';
import { useAuth } from '../context/AuthContext.tsx';
import type { Message, MessageAttachment } from '../types/index.ts';
import {
  fetchConversationMessages,
  sendRealMessage,
  markConversationAsRead,
  deleteRealMessage,
} from '../lib/messageService.ts';
import {
  getCachedMessages,
  setCachedMessages,
  updateCachedMessage,
  replaceCachedMessage,
  getQueuedMessages,
  enqueueOfflineMessage,
  removeQueuedMessage,
} from '../lib/cacheService.ts';
import imageCompression from 'browser-image-compression';
import { playNotificationChime } from '../lib/pushService.ts';

/**
 * Compresses image file to max 1024px and 200kb using browser-image-compression
 */
export async function compressChatImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const options = {
      maxSizeMB: 0.2, // max 200kb
      maxWidthOrHeight: 1024, // max 1024px
      useWebWorker: true,
      fileType: file.type === 'image/gif' ? 'image/gif' : 'image/webp',
    };
    return await imageCompression(file, options);
  } catch (err) {
    console.warn('[useChat] Image compression fallback to original:', err);
    return file;
  }
}

export function useChat(chatId: string | null | undefined) {
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isPartnerTyping, setIsPartnerTyping] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  const channelRef = useRef<any>(null);
  const typingTimerRef = useRef<any>(null);
  const lastTypingSentRef = useRef<number>(0);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const messagesMapRef = useRef<Map<string, Message>>(new Map());
  const failedPayloadsRef = useRef<Map<string, { text?: string; files?: File[] }>>(new Map());
  const syncLatestRef = useRef<() => Promise<void>>(async () => {});

  // Keep map in sync
  useEffect(() => {
    messagesMapRef.current = new Map(messages.map((m) => [m.id, m]));
  }, [messages]);

  // Online / Offline monitor
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // 1. Initial Load: Instant IndexedDB Cache First, then Background Supabase Fetch
  useEffect(() => {
    if (!chatId || !currentUserId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    (async () => {
      // Step A: Immediately render cached messages from IndexedDB for zero-lag display
      try {
        const cached = await getCachedMessages(chatId);
        if (isMounted && cached && cached.length > 0) {
          setMessages(cached);
          setLoading(false);
        }
      } catch (err) {
        console.warn('[useChat] Error reading cache:', err);
      }

      // Step B: Fetch latest 50 messages from Supabase in background
      try {
        const fresh = await fetchConversationMessages(chatId, 50);
        if (isMounted) {
          setMessages((prev) => {
            const freshIds = new Set(fresh.map((m) => m.id));
            // Only preserve pending messages if they have not been confirmed in fresh
            const pending = prev.filter((m) => {
              if (m.status !== 'sending' && m.status !== 'queued' && m.status !== 'failed') return false;
              if (freshIds.has(m.id)) return false;
              // Check if fresh already contains this message (same sender, same text, sent within 45s)
              const alreadyInFresh = fresh.some(
                (fm) =>
                  fm.senderId === m.senderId &&
                  fm.text === m.text &&
                  Math.abs(new Date(fm.createdAtRaw || 0).getTime() - new Date(m.createdAtRaw || 0).getTime()) < 45000
              );
              return !alreadyInFresh;
            });
            const combined = [...fresh, ...pending].sort(
              (a, b) => new Date(a.createdAtRaw || 0).getTime() - new Date(b.createdAtRaw || 0).getTime()
            );
            const dedupedMap = new Map<string, Message>();
            for (const m of combined) {
              dedupedMap.set(m.id, m);
            }
            return Array.from(dedupedMap.values());
          });
          setHasMore(fresh.length >= 50);
          setLoading(false);
          setCachedMessages(chatId, fresh);
        }
      } catch (err) {
        console.warn('[useChat] Error fetching messages:', err);
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [chatId, currentUserId]);

  // 2. Foreground Delta Sync & Reconnect Catch-up (no aggressive 5s polling loop)
  useEffect(() => {
    if (!chatId || !currentUserId) return;

    let syncInProgress = false;
    const syncLatest = async () => {
      if (syncInProgress) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      syncInProgress = true;
      try {
        let latestConfirmedCreatedAt: string | undefined;
        let latestTime = 0;
        for (const m of messagesMapRef.current.values()) {
          if (
            !m.id.startsWith('temp_') &&
            m.status !== 'sending' &&
            m.status !== 'queued' &&
            m.status !== 'failed' &&
            m.createdAtRaw
          ) {
            const t = new Date(m.createdAtRaw).getTime();
            if (t > latestTime) {
              latestTime = t;
              latestConfirmedCreatedAt = m.createdAtRaw;
            }
          }
        }

        const fresh = latestConfirmedCreatedAt
          ? await fetchConversationMessages(chatId, 50, undefined, latestConfirmedCreatedAt)
          : await fetchConversationMessages(chatId, 50);

        if (fresh && fresh.length > 0) {
          setMessages((prev) => {
            const prevIds = new Set(prev.map((m) => m.id));
            const hasNew = fresh.some((m) => !prevIds.has(m.id));
            if (!hasNew) return prev;

            const merged = new Map<string, Message>();
            for (const m of prev) merged.set(m.id, m);
            for (const fm of fresh) {
              // Remove matching pending optimistic entry if now confirmed
              for (const [key, val] of merged.entries()) {
                if (
                  key.startsWith('temp_') &&
                  val.senderId === fm.senderId &&
                  val.text === fm.text &&
                  Math.abs(new Date(val.createdAtRaw || 0).getTime() - new Date(fm.createdAtRaw || 0).getTime()) < 45000
                ) {
                  merged.delete(key);
                }
              }
              merged.set(fm.id, fm);
            }

            const result = Array.from(merged.values()).sort(
              (a, b) => new Date(a.createdAtRaw || 0).getTime() - new Date(b.createdAtRaw || 0).getTime()
            );
            setCachedMessages(chatId, result).catch(() => {});
            return result;
          });
        }
      } catch (err) {
        console.debug('[useChat] Background delta sync notice:', err);
      } finally {
        syncInProgress = false;
      }
    };

    syncLatestRef.current = syncLatest;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncLatest();
      }
    };

    const onWindowFocus = () => {
      syncLatest();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('online', syncLatest);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('online', syncLatest);
    };
  }, [chatId, currentUserId]);

  // 3. Realtime Supabase Broadcast Channel: Instant Delivery & Typing Indicator
  useEffect(() => {
    if (!chatId || !currentUserId) return;

    let retryTimer: any = null;
    const channelName = `chat:${chatId}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false, ack: false },
      },
    });

    channel
      // A. Instant broadcast of incoming message
      .on('broadcast', { event: 'new_message' }, (payload: any) => {
        const incoming = payload.payload as Message;
        if (!incoming || incoming.senderId === currentUserId) return;

        playNotificationChime();

        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          const updated: Message[] = [...prev, { ...incoming, status: 'delivered' as const, isSeen: false }];
          setCachedMessages(chatId, updated).catch(() => {});
          return updated;
        });

        // Acknowledge delivery back to sender
        channel.send({
          type: 'broadcast',
          event: 'message_delivered',
          payload: { messageId: incoming.id, conversationId: chatId },
        }).catch(() => {});

        // Automatically mark as read if conversation is open
        markConversationAsRead(chatId, currentUserId).catch(() => {});
      })
      // B. Instant delivery receipt acknowledgment (double tick)
      .on('broadcast', { event: 'message_delivered' }, (payload: any) => {
        const { messageId } = payload.payload || {};
        if (!messageId) return;

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === messageId && m.isOutgoing) {
              const updated: Message = { ...m, status: m.isSeen ? 'seen' : 'delivered' };
              updateCachedMessage(chatId, updated).catch(() => {});
              return updated;
            }
            return m;
          })
        );
      })
      // C. Read receipt acknowledgment (blue tick / seen)
      .on('broadcast', { event: 'message_seen' }, (payload: any) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.isOutgoing) {
              const updated: Message = { ...m, isSeen: true, status: 'seen' };
              updateCachedMessage(chatId, updated).catch(() => {});
              return updated;
            }
            return m;
          })
        );
      })
      // D. Partner typing indicator
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        if (payload.payload?.senderId === currentUserId) return;
        setIsPartnerTyping(true);

        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          setIsPartnerTyping(false);
        }, 2500);
      })
      // E. Peer deleted message for everyone
      .on('broadcast', { event: 'message_deleted' }, (payload: any) => {
        const deletedId = payload.payload?.messageId;
        if (!deletedId) return;
        setMessages((prev) => {
          const next = prev.filter((m) => m.id !== deletedId);
          setCachedMessages(chatId, next).catch(() => {});
          return next;
        });
      })
      // Backup: postgres_changes for reliable message delivery & sender reconciliation
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${chatId}`,
        },
        async (payload: any) => {
          const row = payload.new;
          if (!row) return;

          // If this is our own message inserted into DB, reconcile any pending optimistic temp message
          if (row.sender_id === currentUserId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) {
                return prev.filter(
                  (m) =>
                    !m.id.startsWith('temp_') ||
                    m.text !== (row.body || '') ||
                    Math.abs(new Date(m.createdAtRaw || 0).getTime() - new Date(row.created_at).getTime()) > 30000
                );
              }
              const tempIdx = prev.findIndex(
                (m) =>
                  m.id.startsWith('temp_') &&
                  m.text === (row.body || '') &&
                  (m.status === 'sending' || m.status === 'queued')
              );
              if (tempIdx >= 0) {
                const updatedList = [...prev];
                const oldTempId = updatedList[tempIdx].id;
                updatedList[tempIdx] = {
                  ...updatedList[tempIdx],
                  id: row.id,
                  createdAtRaw: row.created_at,
                  status: 'sent',
                };
                replaceCachedMessage(chatId, oldTempId, updatedList[tempIdx]).catch(() => {});
                return updatedList;
              }
              return prev;
            });
            return;
          }

          // Incoming message from partner
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const newMsg: Message = {
              id: row.id,
              senderId: row.sender_id,
              text: row.body || '',
              timestamp: 'Just now',
              createdAtRaw: row.created_at,
              isOutgoing: false,
              isSeen: false,
              status: 'delivered',
            };
            const updated = [...prev, newMsg];
            updateCachedMessage(chatId, newMsg).catch(() => {});
            return updated;
          });

          // Also trigger a background fetch if message might have attachments
          fetchConversationMessages(chatId, 5).then((freshRecent) => {
            const matchingFresh = freshRecent.find((m) => m.id === row.id);
            if (matchingFresh && matchingFresh.attachments && matchingFresh.attachments.length > 0) {
              setMessages((prev) =>
                prev.map((m) => (m.id === row.id ? matchingFresh : m))
              );
            }
          }).catch(() => {});
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          channelRef.current = channel;
          // Catch up any delta messages missed while socket was reconnecting
          syncLatestRef.current().catch(() => {});
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.debug(`[useChat] Realtime channel ${status}, reconnecting in 2s...`);
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            channel.subscribe();
          }, 2000);
        }
      });

    channelRef.current = channel;

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [chatId, currentUserId]);

  // 3. Load More Older Messages (Infinite Scroll / Pagination - 50 at a time)
  const loadMoreMessages = useCallback(async () => {
    if (!chatId || loadingMore || !hasMore || messages.length === 0) return;

    setLoadingMore(true);
    try {
      const oldestMsg = messages[0];
      const older = await fetchConversationMessages(chatId, 50, oldestMsg.createdAtRaw);

      if (older.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const uniqueOlder = older.filter((m) => !seen.has(m.id));
          return [...uniqueOlder, ...prev];
        });
      }
      setHasMore(older.length >= 50);
    } catch (err) {
      console.warn('[useChat] Failed to load older messages:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [chatId, loadingMore, hasMore, messages]);

  // 4. Send Typing Indicator (debounced broadcast)
  const sendTypingIndicator = useCallback(() => {
    if (!chatId || !currentUserId || !channelRef.current) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return; // rate limit typing event
    lastTypingSentRef.current = now;

    channelRef.current
      .send({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: currentUserId },
      })
      .catch(() => {});
  }, [chatId, currentUserId]);

  // 5. Send Message with Instant Optimistic UI + Broadcast + Background DB Insert
  const sendChatMessage = useCallback(
    async (text?: string, rawFiles?: File[]): Promise<boolean> => {
      if (!chatId || !currentUserId) return false;
      const cleanText = (text || '').trim();
      const files = rawFiles || [];
      if (!cleanText && files.length === 0) return false;

      const nowIso = new Date().toISOString();
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const offline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

      // Optimistic attachments preview (detect audio before video so voice notes render VoiceNoteBubble immediately)
      const tempAttachments: MessageAttachment[] = files.map((f, i) => {
        const isPdf = f.type === 'application/pdf' || Boolean(f.name.match(/\.pdf$/i));
        const isAudio = !isPdf && (f.type.startsWith('audio/') || Boolean(f.name.match(/\.(mp3|m4a|wav|ogg|aac)$/i)) || (f.name.startsWith('voicenote_') || f.name.startsWith('voice_note_')));
        const isVideo = !isPdf && !isAudio && (f.type.startsWith('video/') || Boolean(f.name.match(/\.(mp4|mov|webm|m4v)$/i)));
        return {
          id: `att_temp_${i}_${Date.now()}`,
          message_id: tempId,
          uploader_id: currentUserId,
          file_name: f.name,
          bytes: f.size,
          kind: isPdf ? 'pdf' : isAudio ? 'audio' : isVideo ? 'video' : 'image',
          asset_id: `temp_${i}`,
          secure_url: URL.createObjectURL(f),
          provider: 'local',
          created_at: nowIso,
        };
      });

      failedPayloadsRef.current.set(tempId, {
        text: cleanText || undefined,
        files: files.length > 0 ? files : undefined,
      });

      // A. INSTANT OPTIMISTIC UI: Immediately add message with status "sending" (or "queued" if offline)
      const optimisticMsg: Message = {
        id: tempId,
        senderId: currentUserId,
        text: cleanText,
        timestamp: 'Just now',
        createdAtRaw: nowIso,
        isOutgoing: true,
        isSeen: false,
        status: offline ? 'queued' : 'sending',
        attachments: tempAttachments.length > 0 ? tempAttachments : undefined,
      };

      setMessages((prev) => {
        const next = [...prev, optimisticMsg];
        setCachedMessages(chatId, next);
        return next;
      });

      // B. If offline: Queue message in IndexedDB for auto-dispatch when network reconnects
      if (offline) {
        await enqueueOfflineMessage({
          tempId,
          conversationId: chatId,
          senderId: currentUserId,
          text: cleanText,
          createdAtRaw: nowIso,
          timestamp: 'Just now',
          status: 'queued',
        });
        return true;
      }

      // C. PERSISTENCE & BROADCAST
      const abortController = files.length > 0 ? new AbortController() : null;
      if (abortController) {
        uploadAbortRef.current = abortController;
        setUploadProgress(0);
      }

      try {
        const compressedFiles: File[] = [];
        for (const f of files) {
          if (f.type.startsWith('image/')) {
            const cFile = await compressChatImage(f);
            compressedFiles.push(cFile);
          } else {
            compressedFiles.push(f);
          }
        }

        const res = await sendRealMessage({
          conversationId: chatId,
          senderId: currentUserId,
          text: cleanText,
          files: compressedFiles.length > 0 ? compressedFiles : undefined,
          onUploadProgress: files.length > 0 ? (pct) => setUploadProgress(pct) : undefined,
          signal: abortController?.signal,
        });

        if (res.aborted) {
          setMessages((prev) => {
            const next = prev.filter((m) => m.id !== tempId);
            setCachedMessages(chatId, next).catch(() => {});
            return next;
          });
          failedPayloadsRef.current.delete(tempId);
          return false;
        }

        if (res.success && res.message) {
          const confirmed = res.message;
          const updatedConfirmed: Message = {
            id: confirmed.id,
            senderId: currentUserId,
            text: confirmed.text,
            timestamp: confirmed.timestamp || 'Just now',
            createdAtRaw: confirmed.createdAtRaw,
            isOutgoing: true,
            isSeen: false,
            status: 'sent',
            attachments: confirmed.attachments || tempAttachments,
          };

          // Broadcast authoritative database message to live peer
          if (channelRef.current) {
            channelRef.current
              .send({
                type: 'broadcast',
                event: 'new_message',
                payload: {
                  ...updatedConfirmed,
                  isOutgoing: false,
                  status: 'delivered',
                },
              })
              .catch(() => {});
          }

          // Reconcile optimistic message with confirmed database record
          setMessages((prev) => {
            const alreadyHasConfirmed = prev.some((m) => m.id === confirmed.id);
            if (alreadyHasConfirmed) {
              return prev.filter((m) => m.id !== tempId);
            }
            return prev.map((m) => (m.id === tempId ? updatedConfirmed : m));
          });

          await replaceCachedMessage(chatId, tempId, updatedConfirmed);
          failedPayloadsRef.current.delete(tempId);
          return true;
        } else {
          // Mark failed (keeps retry button accessible)
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
          );
          return false;
        }
      } catch (err) {
        console.warn('[useChat] Background send error:', err);
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
        );
        return false;
      } finally {
        if (abortController && uploadAbortRef.current === abortController) {
          uploadAbortRef.current = null;
          setUploadProgress(null);
        }
      }
    },
    [chatId, currentUserId]
  );

  const cancelUpload = useCallback(() => {
    uploadAbortRef.current?.abort();
  }, []);

  const deleteMessage = useCallback(
    async (msgId: string): Promise<boolean> => {
      if (!chatId || !currentUserId || !msgId || msgId.startsWith('temp_')) return false;
      const res = await deleteRealMessage(msgId, currentUserId);
      if (!res.success) return false;

      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== msgId);
        setCachedMessages(chatId, next).catch(() => {});
        return next;
      });

      if (channelRef.current) {
        channelRef.current
          .send({
            type: 'broadcast',
            event: 'message_deleted',
            payload: { messageId: msgId },
          })
          .catch(() => {});
      }
      return true;
    },
    [chatId, currentUserId]
  );

  // Retry sending a failed optimistic message (text or voice/media attachment)
  const retryMessage = useCallback(
    async (msgId: string): Promise<boolean> => {
      const payload = failedPayloadsRef.current.get(msgId);
      const existingMsg = messagesMapRef.current.get(msgId);
      const textToRetry = payload?.text ?? existingMsg?.text;
      const filesToRetry = payload?.files;

      if (!textToRetry && (!filesToRetry || filesToRetry.length === 0)) {
        return false;
      }

      failedPayloadsRef.current.delete(msgId);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      return sendChatMessage(textToRetry, filesToRetry);
    },
    [sendChatMessage]
  );

  // 6. Auto-flush queued messages when network reconnects
  useEffect(() => {
    if (isOffline || !chatId || !currentUserId) return;

    let isFlushing = false;
    const flushQueue = async () => {
      if (isFlushing) return;
      isFlushing = true;
      try {
        const queued = await getQueuedMessages();
        const forThisChat = queued.filter((q) => q.conversationId === chatId);

        for (const item of forThisChat) {
          await sendChatMessage(item.text);
          await removeQueuedMessage(item.tempId);
        }
      } catch (err) {
        console.warn('[useChat] Error flushing offline queue:', err);
      } finally {
        isFlushing = false;
      }
    };

    flushQueue();
  }, [isOffline, chatId, currentUserId, sendChatMessage]);

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    isPartnerTyping,
    isOffline,
    uploadProgress,
    cancelUpload,
    loadMoreMessages,
    sendMessage: sendChatMessage,
    retryMessage,
    deleteMessage,
    sendTypingIndicator,
  };
}

export default useChat;
