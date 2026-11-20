import { useState, useEffect, useCallback } from 'react';
import type { Conversation, Message } from '../types/index.ts';
import {
  getCachedConversations,
  setCachedConversations,
  getCachedMessages,
  setCachedMessages,
  getQueuedMessages,
  enqueueOfflineMessage,
  removeQueuedMessage,
  QueuedMessage,
} from '../lib/cacheService.ts';

/**
 * useLocalCache Hook
 * Provides instant IndexedDB cached chats & messages, tracks online/offline status,
 * and handles offline queued messages like WhatsApp.
 */
export function useLocalCache() {
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? !navigator.onLine : false;
  });
  const [cachedChats, setCachedChats] = useState<Conversation[]>([]);
  const [loadingCache, setLoadingCache] = useState<boolean>(true);
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);

  // Network listener
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initial load from IndexedDB
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [chats, queued] = await Promise.all([
          getCachedConversations(),
          getQueuedMessages(),
        ]);
        if (isMounted) {
          setCachedChats(chats);
          setQueuedMessages(queued);
          setLoadingCache(false);
        }
      } catch (err) {
        console.warn('[useLocalCache] Error reading IndexedDB cache:', err);
        if (isMounted) setLoadingCache(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const saveChats = useCallback(async (chats: Conversation[]) => {
    setCachedChats(chats);
    await setCachedConversations(chats);
  }, []);

  const loadMessages = useCallback(async (chatId: string): Promise<Message[]> => {
    return await getCachedMessages(chatId);
  }, []);

  const saveMessages = useCallback(async (chatId: string, messages: Message[]) => {
    await setCachedMessages(chatId, messages);
  }, []);

  const enqueue = useCallback(async (msg: QueuedMessage) => {
    await enqueueOfflineMessage(msg);
    const updated = await getQueuedMessages();
    setQueuedMessages(updated);
  }, []);

  const dequeue = useCallback(async (tempId: string) => {
    await removeQueuedMessage(tempId);
    const updated = await getQueuedMessages();
    setQueuedMessages(updated);
  }, []);

  return {
    isOffline,
    cachedChats,
    loadingCache,
    queuedMessages,
    saveChats,
    loadMessages,
    saveMessages,
    enqueue,
    dequeue,
  };
}

export default useLocalCache;
