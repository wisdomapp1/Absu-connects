import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Send,
  Camera,
  Loader2,
  MessageCircle,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import { Page, PageInboxConversation } from '../../types/pages.ts';
import { Message } from '../../types/index.ts';
import {
  fetchPageInboxConversations,
  markPageConversationRead,
} from '../../lib/pageService.ts';
import {
  fetchConversationMessages,
  sendRealMessage,
} from '../../lib/messageService.ts';
import { supabase } from '../../lib/supabase.ts';
import { useApp } from '../../context/AppContext.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { Avatar } from '../common/Avatar.tsx';

interface PageInboxViewProps {
  page: Page;
  initialConvId?: string | null;
}

/**
 * Isolated Page Inbox Workspace for Page Owners & Admins.
 * Displays student inquiries separately from personal chats, marks `page_conversation_reads`,
 * and sends replies as `sender_as_page = true` with Cloudinary-only media attachments.
 */
export const PageInboxView: React.FC<PageInboxViewProps> = ({ page, initialConvId }) => {
  const { currentUser, addToast, setImageLightboxUrl, refreshManagedPages, setSelectedPageInboxConvId } = useApp();

  const [threads, setThreads] = useState<PageInboxConversation[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(initialConvId || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [draft, setDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const list = await fetchPageInboxConversations(page.id);
      setThreads(list);
    } finally {
      setLoadingThreads(false);
    }
  }, [page.id]);

  const loadMessages = useCallback(
    async (convId: string) => {
      setLoadingMessages(true);
      try {
        const msgs = await fetchConversationMessages(convId, 50, undefined, undefined, page.id);
        setMessages(msgs);
        await markPageConversationRead(convId, page.id);
        setThreads((prev) =>
          prev.map((t) => (t.id === convId ? { ...t, unreadCount: 0 } : t))
        );
        void refreshManagedPages();
      } finally {
        setLoadingMessages(false);
      }
    },
    [page.id, refreshManagedPages]
  );

  useEffect(() => {
    setSelectedConvId(initialConvId || null);
  }, [initialConvId, page.id]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedConvId) return;
    loadMessages(selectedConvId);
  }, [selectedConvId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    const channel = supabase
      .channel(`page_inbox:${page.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const rec = payload.new as { conversation_id?: string };
          if (selectedConvId && rec.conversation_id === selectedConvId) {
            loadMessages(selectedConvId);
          }
          loadThreads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [page.id, selectedConvId, loadMessages, loadThreads]);

  const activeThread = threads.find((t) => t.id === selectedConvId) || null;

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files || []);
    e.target.value = '';
    if (chosen.length === 0) return;
    setPendingFiles((prev) => [...prev, ...chosen].slice(0, 4));
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread || sending) return;
    const cleanText = draft.trim();
    if (!cleanText && pendingFiles.length === 0) return;

    setSending(true);
    try {
      const res = await sendRealMessage({
        conversationId: activeThread.id,
        senderId: currentUser.id,
        text: cleanText,
        files: pendingFiles,
        senderName: page.name,
        senderAsPage: true,
        senderPageId: page.id,
      });

      if (res.success && res.message) {
        setMessages((prev) => [...prev, res.message!]);
        setDraft('');
        setPendingFiles([]);
        await markPageConversationRead(activeThread.id, page.id);
        loadThreads();
      } else {
        addToast(res.error || 'Could not send Page reply.', 'warning');
      }
    } finally {
      setSending(false);
    }
  };

  if (loadingThreads && threads.length === 0) {
    return (
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-10 flex flex-col items-center gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
        <p className="text-xs text-[var(--color-text-secondary)]">Loading Page Inbox...</p>
      </div>
    );
  }

  if (!activeThread) {
    return (
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-[var(--color-text-primary)]">
              Page Messages ({threads.length})
            </h3>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Replies appear as {page.name}
            </p>
          </div>
          {!page.allowMessages && (
            <span className="text-[11px] font-semibold text-amber-500">DMs Paused</span>
          )}
        </div>

        {threads.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <MessageCircle className="w-8 h-8 text-[var(--color-text-secondary)] mx-auto opacity-60" />
            <p className="text-sm font-bold text-[var(--color-text-primary)]">No messages yet</p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              When students message {page.name}, conversations appear here separately from your personal chats.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => setSelectedConvId(thread.id)}
                className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--color-bg-main)] transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    src={thread.customer.avatar}
                    name={thread.customer.name}
                    size="md"
                    className="shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                        {thread.customer.name}
                      </p>
                      <span className="text-[11px] text-[var(--color-text-secondary)] shrink-0">
                        · {thread.lastMessageTime}
                      </span>
                    </div>
                    <p
                      className={`text-xs truncate mt-0.5 ${
                        thread.unreadCount > 0
                          ? 'font-bold text-[var(--color-text-primary)]'
                          : 'text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {thread.lastMessage}
                    </p>
                  </div>
                </div>
                {thread.unreadCount > 0 && (
                  <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[var(--color-primary)] text-white text-[11px] font-bold flex items-center justify-center tabular-nums shrink-0">
                    {thread.unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden flex flex-col h-[520px] max-h-[70vh]">
      {/* Chat Header */}
      <div className="px-3.5 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              setSelectedConvId(null);
              setSelectedPageInboxConvId(null);
            }}
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center hover:bg-[var(--color-bg-main)] text-[var(--color-text-primary)]"
            aria-label="Back to Page Inbox"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>
          <Avatar
            src={activeThread.customer.avatar}
            name={activeThread.customer.name}
            size="sm"
            className="shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-extrabold text-[var(--color-text-primary)] truncate">
              {activeThread.customer.name}
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)] truncate flex items-center gap-1">
              <span>Replying as {page.name}</span>
              {page.isVerified && <VerifiedBadge size={12} />}
            </p>
          </div>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 bg-[var(--color-bg-main)]/40">
        {loadingMessages ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-[var(--color-text-secondary)]">
            No messages in this thread yet.
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.isOutgoing ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-xs sm:text-sm ${
                  m.isOutgoing
                    ? 'bg-[var(--color-primary)] text-white rounded-br-sm'
                    : 'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-bl-sm'
                }`}
              >
                {m.attachments && m.attachments.length > 0 && (
                  <div className="space-y-1.5 mb-1.5">
                    {m.attachments.map((att, idx) =>
                      att.kind === 'video' ? (
                        <video
                          key={idx}
                          src={att.secure_url}
                          controls
                          className="rounded-xl max-h-52 w-full bg-black"
                        />
                      ) : att.kind === 'audio' ? (
                        <audio key={idx} src={att.secure_url} controls className="w-48" />
                      ) : (
                        <img
                          key={idx}
                          src={att.secure_url}
                          alt="Attachment"
                          onClick={() => att.secure_url && setImageLightboxUrl(att.secure_url)}
                          className="rounded-xl max-h-52 object-cover cursor-pointer"
                        />
                      )
                    )}
                  </div>
                )}
                {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
              </div>
              <span className="text-[10px] text-[var(--color-text-secondary)] mt-0.5 px-1">
                {m.timestamp}
              </span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending attachments */}
      {pendingFiles.length > 0 && (
        <div className="px-3 py-2 border-t border-[var(--color-border)] flex items-center gap-2 overflow-x-auto bg-[var(--color-bg-card)]">
          {pendingFiles.map((file, idx) => (
            <div
              key={idx}
              className="px-2.5 py-1 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center gap-1.5 text-[11px] shrink-0"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span className="max-w-[110px] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                className="text-rose-500"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSendReply}
        className="p-2.5 border-t border-[var(--color-border)] bg-[var(--color-bg-card)] flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="min-w-[42px] min-h-[42px] rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] shrink-0"
          aria-label="Attach Cloudinary photo or video"
        >
          <Camera className="w-4.5 h-4.5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handlePickFiles}
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Reply as ${page.name}...`}
          className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
        <button
          type="submit"
          disabled={sending || (!draft.trim() && pendingFiles.length === 0)}
          className="min-w-[44px] min-h-[42px] px-3.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white flex items-center justify-center disabled:opacity-50 shrink-0"
          aria-label="Send reply"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
};
