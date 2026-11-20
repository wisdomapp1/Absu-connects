import localforage from 'localforage';
import type { Conversation, Message } from '../types/index.ts';

// Configure dedicated IndexedDB store for WhatsApp-style instant offline chat
const chatStore = localforage.createInstance({
  name: 'absu_connect_db',
  storeName: 'absu_chats_cache',
  description: 'IndexedDB cache for instant conversations and offline queue',
});

export interface QueuedMessage {
  tempId: string;
  conversationId: string;
  senderId: string;
  text?: string;
  createdAtRaw: string;
  timestamp: string;
  status: 'queued';
}

const CHATS_LIST_KEY = 'absu_cached_conversation_list';
const QUEUED_MSGS_KEY = 'absu_offline_message_queue';

/**
 * Retrieve cached conversation summaries instantly from IndexedDB
 */
export async function getCachedConversations(): Promise<Conversation[]> {
  try {
    const list = await chatStore.getItem<Conversation[]>(CHATS_LIST_KEY);
    return list || [];
  } catch (err) {
    console.warn('[CacheService] Failed to load cached conversations:', err);
    return [];
  }
}

/**
 * Persist conversation summaries to IndexedDB
 */
export async function setCachedConversations(conversations: Conversation[]): Promise<void> {
  try {
    // Strip heavy full message lists when saving summary list to keep IndexedDB lean
    const summaries = conversations.map((c) => ({
      ...c,
      messages: c.messages && c.messages.length > 0 ? c.messages.slice(-50) : [],
    }));
    await chatStore.setItem(CHATS_LIST_KEY, summaries);
  } catch (err) {
    console.warn('[CacheService] Failed to cache conversations:', err);
  }
}

/**
 * Retrieve cached last 50 messages for a specific conversation from IndexedDB
 */
export async function getCachedMessages(conversationId: string): Promise<Message[]> {
  if (!conversationId) return [];
  try {
    const messages = await chatStore.getItem<Message[]>(`chat_msgs_${conversationId}`);
    return messages || [];
  } catch (err) {
    console.warn('[CacheService] Failed to load cached messages for chat:', conversationId, err);
    return [];
  }
}

/**
 * Save messages for a specific conversation to IndexedDB (keeps latest 100, deduplicating by ID)
 */
export async function setCachedMessages(conversationId: string, messages: Message[]): Promise<void> {
  if (!conversationId) return;
  try {
    // Deduplicate by message ID preserving the latest occurrence
    const dedupedMap = new Map<string, Message>();
    for (const m of messages) {
      if (m?.id) {
        dedupedMap.set(m.id, m);
      }
    }
    const toSave = Array.from(dedupedMap.values()).slice(-100);
    await chatStore.setItem(`chat_msgs_${conversationId}`, toSave);
  } catch (err) {
    console.warn('[CacheService] Failed to cache messages for chat:', conversationId, err);
  }
}

/**
 * Replace a temporary optimistic message in cache with the confirmed database record
 */
export async function replaceCachedMessage(
  conversationId: string,
  oldId: string,
  newMsg: Message
): Promise<void> {
  if (!conversationId || !newMsg) return;
  try {
    const current = (await getCachedMessages(conversationId)) || [];
    // Remove both oldId and newMsg.id to prevent any duplicate copies
    const filtered = current.filter((m) => m.id !== oldId && m.id !== newMsg.id);
    filtered.push(newMsg);
    filtered.sort(
      (a, b) => new Date(a.createdAtRaw || 0).getTime() - new Date(b.createdAtRaw || 0).getTime()
    );
    await setCachedMessages(conversationId, filtered);
  } catch (err) {
    console.warn('[CacheService] Failed to replace cached message:', err);
  }
}

/**
 * Append or update a single message in the conversation cache
 */
export async function updateCachedMessage(conversationId: string, message: Message): Promise<void> {
  if (!conversationId || !message) return;
  try {
    const current = (await getCachedMessages(conversationId)) || [];
    const index = current.findIndex((m) => m.id === message.id);
    let updated: Message[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = { ...updated[index], ...message };
    } else {
      updated = [...current, message];
    }
    await setCachedMessages(conversationId, updated);
  } catch (err) {
    console.warn('[CacheService] Failed to update cached message:', err);
  }
}

/**
 * Offline Message Queue: Queue typed messages when user is offline / poor internet
 */
export async function getQueuedMessages(): Promise<QueuedMessage[]> {
  try {
    const queue = await chatStore.getItem<QueuedMessage[]>(QUEUED_MSGS_KEY);
    return queue || [];
  } catch (err) {
    console.warn('[CacheService] Failed to get queued messages:', err);
    return [];
  }
}

export async function enqueueOfflineMessage(msg: QueuedMessage): Promise<void> {
  try {
    const queue = (await getQueuedMessages()) || [];
    const filtered = queue.filter((q) => q.tempId !== msg.tempId);
    filtered.push(msg);
    await chatStore.setItem(QUEUED_MSGS_KEY, filtered);
  } catch (err) {
    console.warn('[CacheService] Failed to enqueue message:', err);
  }
}

export async function removeQueuedMessage(tempId: string): Promise<void> {
  try {
    const queue = (await getQueuedMessages()) || [];
    const filtered = queue.filter((q) => q.tempId !== tempId);
    await chatStore.setItem(QUEUED_MSGS_KEY, filtered);
  } catch (err) {
    console.warn('[CacheService] Failed to remove queued message:', err);
  }
}
