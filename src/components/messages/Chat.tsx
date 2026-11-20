import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../../hooks/useChat.ts';
import { Avatar } from '../common/Avatar.tsx';
import type { Message } from '../../types/index.ts';
import {
  ArrowLeft,
  Send,
  Camera,
  Smile,
  X,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Copy,
  Trash2,
  Reply,
  WifiOff,
  Loader2,
  Film,
} from 'lucide-react';

interface ChatProps {
  chatId?: string;
  otherUser?: {
    id: string;
    name: string;
    avatar?: string;
    department?: string;
    level?: string;
  };
  onBack?: () => void;
  onOpenInfo?: () => void;
}

const COMMON_EMOJIS = ['😊', '😂', '🔥', '❤️', '👍', '🙌', '💯', '👏', '😍', '🎉', '😎', '🙏', '🎓', '📚', '⚡', '✨'];

export const Chat: React.FC<ChatProps> = ({
  chatId,
  otherUser,
  onBack,
  onOpenInfo,
}) => {
  const [inputText, setInputText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [activeMenuMsgId, setActiveMenuMsgId] = useState<string | null>(null);
  const [deletedMsgIds, setDeletedMsgIds] = useState<Set<string>>(new Set());

  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    isPartnerTyping,
    isOffline,
    sendMessage,
    sendTypingIndicator,
    loadMoreMessages,
  } = useChat(chatId);

  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on initial load or new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, previewUrls.length]);

  // Clean object URLs
  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
  }, [previewUrls]);

  // Infinite scroll older messages on scroll near top
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop < 60 && hasMore && !loadingMore) {
      const prevHeight = el.scrollHeight;
      loadMoreMessages().then(() => {
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevHeight;
        });
      });
    }
  }, [hasMore, loadingMore, loadMoreMessages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setPendingFiles((prev) => [...prev, ...files]);
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviewUrls((prev) => [...prev, ...urls]);
    e.target.value = '';
  };

  const removePendingFile = (idx: number) => {
    if (previewUrls[idx]?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrls[idx]);
    }
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    sendTypingIndicator();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    let text = inputText.trim();
    if (replyingTo) {
      const author = replyingTo.isOutgoing ? 'You' : otherUser?.name?.split(' ')[0] || 'Friend';
      text = `[Replying to ${author}: "${replyingTo.text?.slice(0, 35) || 'Media'}"]\n${text}`;
    }

    if (!text && pendingFiles.length === 0) return;

    const filesToSend = [...pendingFiles];
    setInputText('');
    setPendingFiles([]);
    setPreviewUrls([]);
    setReplyingTo(null);
    setEmojiPickerOpen(false);

    await sendMessage(text || undefined, filesToSend.length > 0 ? filesToSend : undefined);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const renderStatus = (msg: Message) => {
    if (!msg.isOutgoing) return null;

    if (msg.status === 'sending' || msg.status === 'queued') {
      return (
        <span title={msg.status === 'queued' ? 'Queued offline' : 'Sending...'} className="opacity-70">
          <Clock className="w-3 h-3 animate-pulse" />
        </span>
      );
    }
    if (msg.status === 'failed') {
      return (
        <span title="Delivery failed" className="text-rose-400">
          <AlertCircle className="w-3 h-3" />
        </span>
      );
    }
    if (msg.status === 'seen' || msg.isSeen) {
      return (
        <span title="Seen" className="text-sky-300 font-bold">
          <CheckCheck className="w-3.5 h-3.5" />
        </span>
      );
    }
    if (msg.status === 'delivered') {
      return (
        <span title="Delivered" className="opacity-80">
          <CheckCheck className="w-3.5 h-3.5" />
        </span>
      );
    }
    return (
      <span title="Sent" className="opacity-70">
        <Check className="w-3.5 h-3.5" />
      </span>
    );
  };

  const visibleMessages = messages.filter((m) => !deletedMsgIds.has(m.id));

  return (
    <div className="flex flex-col h-full min-h-0 w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden relative shadow-sm">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Offline Alert Bar */}
      {isOffline && (
        <div className="shrink-0 bg-amber-500/15 border-b border-amber-500/30 text-amber-700 dark:text-amber-300 px-3 py-1.5 text-xs text-center font-medium flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5" />
          <span>You are offline - messages will be sent when online</span>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-card)] z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 -ml-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-xl"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <div onClick={onOpenInfo} className="flex items-center gap-2.5 cursor-pointer min-w-0">
            <Avatar
              src={otherUser?.avatar}
              name={otherUser?.name || 'Friend'}
              size="sm"
            />
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)] truncate">
                {otherUser?.name || 'Chat'}
              </h2>
              <p className="text-[10px] text-[var(--color-text-secondary)] truncate">
                {isPartnerTyping ? (
                  <span className="text-[var(--color-primary)] font-bold animate-pulse">
                    typing...
                  </span>
                ) : (
                  <>{otherUser?.department || 'Student'}</>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Message List */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-4 flex flex-col gap-2.5 bg-[var(--color-bg-main)] overscroll-contain"
      >
        {loadingMore && (
          <div className="flex items-center justify-center py-2 text-xs text-[var(--color-text-secondary)] gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-primary)]" />
            <span>Loading earlier messages...</span>
          </div>
        )}

        {loading && visibleMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[var(--color-text-secondary)]">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)] mb-2" />
            <p className="text-xs">Loading conversations...</p>
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[var(--color-text-secondary)]">
            <p className="font-bold text-sm text-[var(--color-text-primary)]">No messages yet</p>
            <p className="text-xs max-w-xs mt-1">Send a message to start chatting instantly.</p>
          </div>
        ) : (
          visibleMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col relative ${msg.isOutgoing ? 'items-end' : 'items-start'}`}
            >
              <div
                onContextMenu={(e) => {
                  e.preventDefault();
                  setActiveMenuMsgId((prev) => (prev === msg.id ? null : msg.id));
                }}
                className={`relative max-w-[82%] sm:max-w-md rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                  msg.isOutgoing
                    ? 'bg-[var(--color-primary)] text-white rounded-br-xs'
                    : 'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-bl-xs'
                }`}
              >
                {/* Attachments */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-1.5">
                    {msg.attachments.map((att) => (
                      <div key={att.id} className="rounded-xl overflow-hidden">
                        {att.kind === 'image' ? (
                          <img
                            src={att.secure_url}
                            alt="Attachment"
                            className="w-full max-h-60 object-cover rounded-xl"
                            loading="lazy"
                          />
                        ) : (
                          <video
                            src={att.secure_url}
                            controls
                            playsInline
                            className="w-full max-h-60 object-contain rounded-xl"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {msg.text && <div className="whitespace-pre-line break-words">{msg.text}</div>}
              </div>

              {/* Status and Timestamp */}
              <div className="text-[10px] text-[var(--color-text-secondary)] mt-1 px-1 flex items-center gap-1.5">
                <span>{msg.timestamp}</span>
                {renderStatus(msg)}
              </div>

              {/* Context menu */}
              {activeMenuMsgId === msg.id && (
                <div
                  className={`absolute z-30 top-full mt-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xl rounded-xl p-1.5 min-w-[130px] ${
                    msg.isOutgoing ? 'right-0' : 'left-0'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingTo(msg);
                      setActiveMenuMsgId(null);
                      inputRef.current?.focus();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-xs hover:bg-[var(--color-primary-subtle)] rounded-lg text-left"
                  >
                    <Reply className="w-3.5 h-3.5" />
                    <span>Reply</span>
                  </button>
                  {msg.text && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(msg.text);
                        setActiveMenuMsgId(null);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1 text-xs hover:bg-[var(--color-primary-subtle)] rounded-lg text-left"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDeletedMsgIds((prev) => new Set(prev).add(msg.id));
                      setActiveMenuMsgId(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-xs text-rose-500 hover:bg-rose-500/10 rounded-lg text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing indicator bubble */}
        {isPartnerTyping && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] self-start text-xs text-[var(--color-text-secondary)]">
            <span className="font-semibold text-[var(--color-primary)]">
              {otherUser?.name?.split(' ')[0] || 'Friend'} is typing
            </span>
            <span className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply Banner */}
      {replyingTo && (
        <div className="px-3.5 py-1.5 bg-[var(--color-primary-subtle)]/40 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-primary)]">
          <span className="truncate">
            Replying to {replyingTo.isOutgoing ? 'yourself' : otherUser?.name?.split(' ')[0] || 'Friend'}
          </span>
          <button type="button" onClick={() => setReplyingTo(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending Files Preview */}
      {previewUrls.length > 0 && (
        <div className="p-2 border-t border-[var(--color-border)] bg-[var(--color-bg-card)] flex items-center gap-2 overflow-x-auto">
          {previewUrls.map((url, i) => (
            <div key={i} className="relative rounded-lg overflow-hidden shrink-0 border border-[var(--color-border)]">
              <img src={url} alt="Preview" className="w-12 h-12 object-cover" />
              <button
                type="button"
                onClick={() => removePendingFile(i)}
                className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 text-white rounded-full"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Emoji Picker */}
      {emojiPickerOpen && (
        <div className="absolute bottom-16 left-4 z-40 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-xl p-3 w-64">
          <div className="grid grid-cols-4 gap-2 text-xl text-center">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setInputText((prev) => prev + emoji);
                  sendTypingIndicator();
                  inputRef.current?.focus();
                }}
                className="p-1 hover:bg-[var(--color-bg-main)] rounded-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="shrink-0 p-2.5 border-t border-[var(--color-border)] bg-[var(--color-bg-card)] flex items-center gap-2 z-20"
      >
        <div className="flex-1 flex items-center bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-full px-2.5 py-1">
          <button
            type="button"
            onClick={() => setEmojiPickerOpen((prev) => !prev)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
          >
            <Smile className="w-5 h-5" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder="Type a message..."
            className="flex-1 bg-transparent border-0 px-2.5 py-1 text-xs sm:text-sm text-[var(--color-text-primary)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
          >
            <Camera className="w-5 h-5" />
          </button>
        </div>

        <button
          type="submit"
          disabled={!inputText.trim() && pendingFiles.length === 0}
          className="w-10 h-10 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center disabled:opacity-40"
        >
          <Send className="w-4 h-4 ml-0.5" />
        </button>
      </form>
    </div>
  );
};

export default Chat;
