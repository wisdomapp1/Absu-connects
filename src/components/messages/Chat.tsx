import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../../hooks/useChat.ts';
import { Avatar } from '../common/Avatar.tsx';
import type { Message } from '../../types/index.ts';
import { VoiceNoteBubble } from './VoiceNoteBubble.tsx';
import {
  safeReadAndPrepareImage,
  safeReadAndPrepareVideo,
  safeReadGenericAttachment,
  categorizeMediaError,
  type MediaRecoveryState,
} from '../../lib/mediaRecovery.ts';
import { MediaRecoveryBanner } from '../common/MediaRecoveryBanner.tsx';
import { pickNativeGalleryPhotos } from '../../lib/nativeGalleryService.ts';
import { StoryReplyAttachmentCard } from './StoryReplyAttachmentCard.tsx';
import { isStoryAttachment } from '../../lib/storyUtils.ts';
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
  Play,
  FileText,
  Music,
  RotateCcw,
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
  const [mediaRecovery, setMediaRecovery] = useState<MediaRecoveryState | null>(null);

  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    isPartnerTyping,
    isOffline,
    uploadProgress,
    cancelUpload,
    sendMessage,
    retryMessage,
    deleteMessage,
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

  const processSelectedFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const maxBytes = 25 * 1024 * 1024;
    const validFiles: File[] = [];
    const validUrls: string[] = [];
    let lastRecovery: MediaRecoveryState | null = null;

    for (const file of files) {
      const isPdf = file.type === 'application/pdf' || Boolean(file.name.match(/\.pdf$/i));
      const isImage = !isPdf && (file.type.startsWith('image/') || Boolean(file.name.match(/\.(jpg|jpeg|png|webp|avif|gif)$/i)));
      const isVideo = !isPdf && (file.type.startsWith('video/') || Boolean(file.name.match(/\.(mp4|mov|webm|m4v|ogg)$/i)));
      const isAudio = !isPdf && (file.type.startsWith('audio/') || Boolean(file.name.match(/\.(mp3|m4a|wav|ogg|aac)$/i)));

      if (!isImage && !isVideo && !isAudio && !isPdf) {
        lastRecovery = categorizeMediaError(
          new Error(`"${file.name}" is not a supported photo, video, audio, or PDF file.`),
          { fileName: file.name }
        );
        continue;
      }

      if (isImage) {
        if (file.size > maxBytes) {
          lastRecovery = categorizeMediaError(
            new Error(`"${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 25 MB limit.`),
            { fileName: file.name }
          );
          continue;
        }
        const preparedImg = await safeReadAndPrepareImage(file);
        if (!preparedImg.ok || !preparedImg.file || !preparedImg.previewUrl) {
          lastRecovery = preparedImg.recovery || null;
          continue;
        }
        validFiles.push(preparedImg.file);
        validUrls.push(preparedImg.previewUrl);
        continue;
      }

      if (isVideo) {
        const preparedVid = await safeReadAndPrepareVideo(file, {
          maxBytes,
          maxDurationSeconds: 40,
        });
        if (!preparedVid.ok || !preparedVid.file || !preparedVid.previewUrl) {
          lastRecovery = preparedVid.recovery || null;
          continue;
        }
        validFiles.push(preparedVid.file);
        validUrls.push(preparedVid.previewUrl);
        continue;
      }

      const preparedGen = await safeReadGenericAttachment(file, { maxBytes });
      if (!preparedGen.ok || !preparedGen.file || !preparedGen.previewUrl) {
        lastRecovery = preparedGen.recovery || null;
        continue;
      }
      validFiles.push(preparedGen.file);
      validUrls.push(preparedGen.previewUrl);
    }

    if (validFiles.length > 0) {
      setMediaRecovery(null);
      setPendingFiles((prev) => [...prev, ...validFiles]);
      setPreviewUrls((prev) => [...prev, ...validUrls]);
    } else if (lastRecovery) {
      setMediaRecovery(lastRecovery);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    await processSelectedFiles(files);
  };

  const handleOpenPhotoGallery = async () => {
    try {
      const nativeResult = await pickNativeGalleryPhotos(10);
      if (nativeResult.supported) {
        if (!nativeResult.cancelled && nativeResult.files.length > 0) {
          await processSelectedFiles(nativeResult.files);
        }
        return;
      }
    } catch {
      // Fallback to HTML photo input if native plugin throws
    }
    fileInputRef.current?.click();
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
      {/* Hidden photo/video gallery fallback input */}
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
                        {isStoryAttachment(att) ? (
                          <StoryReplyAttachmentCard
                            attachment={att}
                            isOutgoing={msg.isOutgoing}
                          />
                        ) : att.kind === 'image' ? (
                          <img
                            src={att.secure_url}
                            alt={att.file_name || 'Attachment'}
                            className="w-full max-h-60 object-cover rounded-xl"
                            loading="lazy"
                          />
                        ) : att.kind === 'video' ? (
                          <video
                            src={att.secure_url}
                            poster={att.thumbnail_url || undefined}
                            controls
                            playsInline
                            preload="metadata"
                            className="w-full max-h-60 object-contain rounded-xl bg-black"
                          />
                        ) : att.kind === 'audio' || Boolean(att.file_name?.match(/\.(mp3|m4a|wav|ogg|aac)$/i)) || Boolean(att.file_name?.match(/^voice_?note_/i)) ? (
                          <VoiceNoteBubble
                            src={att.secure_url}
                            fileName={att.file_name}
                            isOutgoing={msg.isOutgoing}
                            status={msg.status}
                            isSeen={msg.isSeen}
                            onRetry={() => retryMessage(msg.id)}
                          />
                        ) : (
                          <a
                            href={att.secure_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 p-2 rounded-xl border text-xs ${
                              msg.isOutgoing
                                ? 'bg-white/15 border-white/25 text-white'
                                : 'bg-[var(--color-bg-main)] border-[var(--color-border)] text-[var(--color-text-primary)]'
                            }`}
                          >
                            <FileText className="w-4 h-4 shrink-0" />
                            <span className="truncate font-semibold">{att.file_name}</span>
                          </a>
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
                {msg.status === 'failed' && msg.isOutgoing && (
                  <button
                    type="button"
                    onClick={() => retryMessage(msg.id)}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-500 hover:underline"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Retry</span>
                  </button>
                )}
              </div>

              {/* Context menu */}
              {activeMenuMsgId === msg.id && (
                <div
                  className={`absolute z-30 top-full mt-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xl rounded-xl p-1.5 min-w-[155px] ${
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
                    className="w-full min-h-[36px] flex items-center gap-2 px-2.5 py-1 text-xs hover:bg-[var(--color-primary-subtle)] rounded-lg text-left"
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
                      className="w-full min-h-[36px] flex items-center gap-2 px-2.5 py-1 text-xs hover:bg-[var(--color-primary-subtle)] rounded-lg text-left"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </button>
                  )}
                  {msg.isOutgoing && !msg.id.startsWith('temp_') && (
                    <button
                      type="button"
                      onClick={async () => {
                        setActiveMenuMsgId(null);
                        await deleteMessage(msg.id);
                      }}
                      className="w-full min-h-[36px] flex items-center gap-2 px-2.5 py-1 text-xs text-rose-500 hover:bg-rose-500/10 rounded-lg text-left"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete for everyone</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDeletedMsgIds((prev) => new Set(prev).add(msg.id));
                      setActiveMenuMsgId(null);
                    }}
                    className="w-full min-h-[36px] flex items-center gap-2 px-2.5 py-1 text-xs text-rose-500 hover:bg-rose-500/10 rounded-lg text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete for me</span>
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
          {previewUrls.map((url, i) => {
            const file = pendingFiles[i];
            const isVideo = file?.type.startsWith('video/');
            const isAudio = file?.type.startsWith('audio/');
            const isPdf = file?.type === 'application/pdf' || Boolean(file?.name.match(/\.pdf$/i));
            return (
              <div key={i} className="relative rounded-lg overflow-hidden shrink-0 border border-[var(--color-border)]">
                {isVideo ? (
                  <div className="relative w-14 h-14 bg-black overflow-hidden">
                    <video
                      src={url}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
                      <span className="w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center">
                        <Play className="w-2.5 h-2.5 ml-0.5 fill-white" />
                      </span>
                    </span>
                  </div>
                ) : isAudio ? (
                  <div className="w-12 h-12 bg-violet-600/20 flex items-center justify-center text-violet-400">
                    <Music className="w-5 h-5" />
                  </div>
                ) : isPdf ? (
                  <div className="w-12 h-12 bg-amber-500/15 flex items-center justify-center text-amber-500">
                    <FileText className="w-5 h-5" />
                  </div>
                ) : (
                  <img src={url} alt="Preview" className="w-14 h-14 object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 text-white rounded-full"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Progress Indicator */}
      {uploadProgress !== null && (
        <div className="px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg-card)] flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--color-text-secondary)]">
              <span>Uploading media...</span>
              <span className="font-mono text-[var(--color-primary)]">{Math.round(uploadProgress)}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[var(--color-bg-main)] overflow-hidden">
              <div
                className="h-full bg-[var(--color-primary)] transition-all duration-200 rounded-full"
                style={{ width: `${Math.min(100, Math.max(4, uploadProgress))}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={cancelUpload}
            className="min-h-[36px] px-2.5 rounded-lg text-[11px] font-bold text-rose-500 border border-rose-500/30"
          >
            Cancel
          </button>
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

      {/* Media Selection Recovery Banner */}
      {mediaRecovery && (
        <div className="px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg-card)] shrink-0">
          <MediaRecoveryBanner
            recovery={mediaRecovery}
            onChooseAgain={handleOpenPhotoGallery}
            onDismiss={() => setMediaRecovery(null)}
          />
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
            autoCorrect="on"
            autoCapitalize="sentences"
            spellCheck={true}
            enterKeyHint="send"
            className="flex-1 bg-transparent border-0 px-2.5 py-1 text-xs sm:text-sm text-[var(--color-text-primary)] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleOpenPhotoGallery}
            title="Choose photos or videos from gallery"
            aria-label="Open photo and video gallery"
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
