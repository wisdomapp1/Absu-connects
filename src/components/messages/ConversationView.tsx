import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { useChat } from '../../hooks/useChat.ts';
import type { Message } from '../../types/index.ts';
import {
  ArrowLeft,
  Send,
  Info,
  Camera,
  Smile,
  Gamepad2,
  X,
  Film,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Copy,
  Trash2,
  Reply,
  Lock,
  WifiOff,
  Loader2,
  Phone,
  Video,
  Mic,
  Square,
  Music,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { useCall } from '../../context/CallContext.tsx';
import { VoiceNoteBubble } from './VoiceNoteBubble.tsx';
import { checkMediaPermission, checkDeviceAvailability } from '../../utils/permissionUtils.ts';
import {
  safeReadAndPrepareImage,
  safeReadAndPrepareVideo,
  safeReadGenericAttachment,
  categorizeMediaError,
  type MediaRecoveryState,
} from '../../lib/mediaRecovery.ts';
import { MediaRecoveryBanner } from '../common/MediaRecoveryBanner.tsx';

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  type: 'image' | 'video' | 'audio' | 'pdf';
  name: string;
  sizeLabel: string;
  duration?: number;
}

const COMMON_EMOJIS = ['😊', '😂', '🔥', '❤️', '👍', '🙌', '💯', '👏', '😍', '🎉', '😎', '🙏', '🎓', '📚', '⚡', '✨'];

export const ConversationView: React.FC = () => {
  const {
    selectedConversation,
    goBack,
    navigateTo,
    addToast,
    markConversationRead,
    isUserOnline,
    setImageLightboxUrl,
  } = useApp();
  const { startCall } = useCall();

  const [inputMessage, setInputMessage] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [gamesModalOpen, setGamesModalOpen] = useState(false);
  const [activeMessageAction, setActiveMessageAction] = useState<string | null>(null);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(new Set());
  const [mediaRecovery, setMediaRecovery] = useState<MediaRecoveryState | null>(null);

  // Voice note recording states
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [micPermissionModal, setMicPermissionModal] = useState<'rationale' | 'denied' | 'no-device' | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<number | null>(null);

  // WhatsApp-grade instant chat hook: Optimistic UI, Broadcast Channel, IndexedDB Cache, Offline Queue
  const {
    messages,
    loading: loadingChat,
    loadingMore,
    hasMore,
    isPartnerTyping,
    isOffline,
    uploadProgress,
    cancelUpload,
    sendMessage: sendChatMessage,
    retryMessage,
    deleteMessage,
    sendTypingIndicator,
    loadMoreMessages,
  } = useChat(selectedConversation?.id);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const scrolledForConvIdRef = useRef<string | null>(null);
  const lastMarkedConvIdRef = useRef<string | null>(null);
  const lastMarkedMsgIdRef = useRef<string | null>(null);

  const lastMessageItem = messages[messages.length - 1];
  const lastIncomingMsgId =
    lastMessageItem && !lastMessageItem.isOutgoing ? lastMessageItem.id : null;

  // Automatically mark read in database and state when conversation opens or a new incoming message arrives
  useEffect(() => {
    const convId = selectedConversation?.id;
    if (!convId) return;

    const unreadCount = selectedConversation.unreadCount ?? 0;
    const isNewConversation = lastMarkedConvIdRef.current !== convId;
    const hasUnread = unreadCount > 0;
    const hasNewIncomingMsg = Boolean(
      lastIncomingMsgId && lastIncomingMsgId !== lastMarkedMsgIdRef.current
    );

    if (isNewConversation || hasUnread || hasNewIncomingMsg) {
      lastMarkedConvIdRef.current = convId;
      if (lastIncomingMsgId) {
        lastMarkedMsgIdRef.current = lastIncomingMsgId;
      }
      markConversationRead(convId);
    }
  }, [selectedConversation?.id, selectedConversation?.unreadCount, lastIncomingMsgId, markConversationRead]);

  // Reset scroll lock when conversation changes
  useEffect(() => {
    scrolledForConvIdRef.current = null;
  }, [selectedConversation?.id]);

  // Robust DM scroll management:
  // 1. Instantly display newest messages at bottom when opening conversation
  // 2. Smoothly scroll down on new messages if at bottom or when sending
  useEffect(() => {
    const convId = selectedConversation?.id;
    if (!convId || messages.length === 0) return;

    const container = messagesContainerRef.current;
    if (!container) return;

    // Step A: First render with messages for this conversation -> snap immediately to bottom
    if (scrolledForConvIdRef.current !== convId) {
      scrolledForConvIdRef.current = convId;
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      });
      return;
    }

    // Step B: Live updates (user sent message or received message while near bottom)
    const lastMsg = messages[messages.length - 1];
    const isMyMessage = lastMsg?.isOutgoing;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 180;

    if (isMyMessage || isNearBottom || pendingAttachments.length > 0) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, [selectedConversation?.id, messages, pendingAttachments.length]);

  // Infinite scroll listener: load older 50 messages when scrolled near top
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (container.scrollTop < 60 && hasMore && !loadingMore) {
      const prevScrollHeight = container.scrollHeight;
      loadMoreMessages().then(() => {
        // Maintain scroll position after prepending older messages
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - prevScrollHeight;
          }
        });
      });
    }
  }, [hasMore, loadingMore, loadMoreMessages]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      for (const a of pendingAttachments) {
        if (a.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(a.previewUrl);
        }
      }
    };
  }, [pendingAttachments]);

  // Close emoji picker on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Authoritative deduplication: guarantees each message appears exactly once
  const visibleMessages = useMemo(() => {
    const unhidden = messages.filter((m) => !hiddenMessageIds.has(m.id));
    const seenIds = new Set<string>();
    const confirmedKeys = new Set<string>();
    for (const m of unhidden) {
      if (m.status !== 'sending' && m.status !== 'queued' && !m.id.startsWith('temp_')) {
        confirmedKeys.add(`${m.senderId}_${m.text}`);
      }
    }
    const result: Message[] = [];
    for (const m of unhidden) {
      if (seenIds.has(m.id)) continue;
      // Skip optimistic temporary message if its confirmed counterpart already exists
      if (m.id.startsWith('temp_') && confirmedKeys.has(`${m.senderId}_${m.text}`)) {
        continue;
      }
      seenIds.add(m.id);
      result.push(m);
    }
    return result;
  }, [messages, hiddenMessageIds]);

  if (!selectedConversation) {
    return (
      <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
          No conversation selected
        </p>
        <button
          onClick={goBack}
          className="mt-3 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold"
        >
          Return to Inbox
        </button>
      </div>
    );
  }

  const { participant } = selectedConversation;
  const isOnline = isUserOnline(participant.id);

  // Gallery file select with buffered in-memory read & validation (max 25MB, video <= 40s)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const maxBytes = 25 * 1024 * 1024; // 25 MB max
    const newItems: PendingAttachment[] = [];
    let lastRecovery: MediaRecoveryState | null = null;

    for (const file of files) {
      const isPdf = file.type === 'application/pdf' || Boolean(file.name.match(/\.pdf$/i));
      const isImage = !isPdf && (file.type.startsWith('image/') || Boolean(file.name.match(/\.(jpg|jpeg|png|webp|avif|gif)$/i)));
      const isVideo = !isPdf && (file.type.startsWith('video/') || Boolean(file.name.match(/\.(mp4|mov|webm|m4v|ogg)$/i)));
      const isAudio = !isPdf && (file.type.startsWith('audio/') || Boolean(file.name.match(/\.(mp3|m4a|wav|ogg|aac)$/i)));

      if (!isImage && !isVideo && !isAudio && !isPdf) {
        const rec = categorizeMediaError(
          new Error(`"${file.name}" is not a supported photo, video, audio, or PDF file.`),
          { fileName: file.name }
        );
        lastRecovery = rec;
        addToast(rec.message, 'warning');
        continue;
      }

      if (isImage) {
        if (file.size > maxBytes) {
          const rec = categorizeMediaError(
            new Error(`"${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 25 MB limit.`),
            { fileName: file.name }
          );
          lastRecovery = rec;
          addToast(rec.message, 'warning');
          continue;
        }
        const preparedImg = await safeReadAndPrepareImage(file);
        if (!preparedImg.ok || !preparedImg.file || !preparedImg.previewUrl) {
          lastRecovery = preparedImg.recovery || null;
          if (preparedImg.recovery?.message) addToast(preparedImg.recovery.message, 'warning');
          continue;
        }
        newItems.push({
          id: `dm_att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          file: preparedImg.file,
          previewUrl: preparedImg.previewUrl,
          type: 'image',
          name: preparedImg.file.name,
          sizeLabel: `${(preparedImg.file.size / (1024 * 1024)).toFixed(1)} MB`,
        });
        continue;
      }

      if (isVideo) {
        const preparedVid = await safeReadAndPrepareVideo(file, {
          maxBytes,
          maxDurationSeconds: 40,
        });
        if (!preparedVid.ok || !preparedVid.file || !preparedVid.previewUrl) {
          lastRecovery = preparedVid.recovery || null;
          if (preparedVid.recovery?.message) addToast(preparedVid.recovery.message, 'warning');
          continue;
        }
        newItems.push({
          id: `dm_att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          file: preparedVid.file,
          previewUrl: preparedVid.previewUrl,
          type: 'video',
          name: preparedVid.file.name,
          sizeLabel: `${(preparedVid.file.size / (1024 * 1024)).toFixed(1)} MB`,
          duration: preparedVid.duration,
        });
        continue;
      }

      const preparedGeneric = await safeReadGenericAttachment(file, { maxBytes });
      if (!preparedGeneric.ok || !preparedGeneric.file || !preparedGeneric.previewUrl) {
        lastRecovery = preparedGeneric.recovery || null;
        if (preparedGeneric.recovery?.message) addToast(preparedGeneric.recovery.message, 'warning');
        continue;
      }
      newItems.push({
        id: `dm_att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file: preparedGeneric.file,
        previewUrl: preparedGeneric.previewUrl,
        type: isPdf ? 'pdf' : 'audio',
        name: preparedGeneric.file.name,
        sizeLabel: `${(preparedGeneric.file.size / (1024 * 1024)).toFixed(1)} MB`,
      });
    }

    if (newItems.length > 0) {
      setMediaRecovery(null);
      setPendingAttachments((prev) => [...prev, ...newItems]);
    } else if (lastRecovery) {
      setMediaRecovery(lastRecovery);
    }
  };

  const removePendingAttachment = (id: string) => {
    const item = pendingAttachments.find((a) => a.id === id);
    if (item?.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Start MediaRecorder after microphone permission is verified
  const actuallyBeginRecording = async () => {
    setMicPermissionModal(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(250);
      setIsRecordingVoice(true);
      setRecordingDuration(0);

      recordIntervalRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      const errName = err instanceof DOMException ? err.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setMicPermissionModal('denied');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setMicPermissionModal('no-device');
      } else {
        addToast('Could not start microphone recording. Check your audio permissions.', 'warning');
      }
    }
  };

  // Pre-flight microphone permission & hardware check before starting voice recording
  const startVoiceRecording = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      addToast('Voice note recording is not supported in this browser.', 'warning');
      return;
    }

    const devices = await checkDeviceAvailability();
    if (!devices.hasMicrophone) {
      setMicPermissionModal('no-device');
      return;
    }

    const perm = await checkMediaPermission('audio');
    if (perm.mic === 'denied') {
      setMicPermissionModal('denied');
      return;
    }
    if (perm.mic === 'prompt') {
      setMicPermissionModal('rationale');
      return;
    }

    await actuallyBeginRecording();
  };

  const cancelVoiceRecording = () => {
    if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
    }
    setIsRecordingVoice(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  };

  const stopAndSendVoiceRecording = async () => {
    if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    mediaRecorderRef.current.onstop = async () => {
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      if (audioBlob.size > 0) {
        const audioFile = new File([audioBlob], `voicenote_${Date.now()}.webm`, {
          type: 'audio/webm',
        });
        await sendChatMessage(undefined, [audioFile]);
      }
      setIsRecordingVoice(false);
      setRecordingDuration(0);
      audioChunksRef.current = [];
    };

    mediaRecorderRef.current.stop();
  };

  const handleInsertEmoji = (emoji: string) => {
    setInputMessage((prev) => prev + emoji);
    sendTypingIndicator();
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
    sendTypingIndicator();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    let textToSend = inputMessage.trim();
    if (replyingToMessage) {
      const quoteAuthor = replyingToMessage.isOutgoing ? 'You' : participant.name.split(' ')[0];
      const quoteSnippet = replyingToMessage.text ? replyingToMessage.text.slice(0, 45) : 'Attachment';
      textToSend = `[Replying to ${quoteAuthor}: "${quoteSnippet}"]\n${textToSend}`;
    }

    if (!textToSend && pendingAttachments.length === 0) return;

    setIsSubmitting(true);

    try {
      const filesToSend = pendingAttachments.map((a) => a.file);
      const attachmentsClean = [...pendingAttachments];

      // Optimistic instant dispatch: UI updates immediately with 'sending' or 'queued' status
      setInputMessage('');
      setPendingAttachments([]);
      setReplyingToMessage(null);
      setEmojiPickerOpen(false);

      const success = await sendChatMessage(
        textToSend || undefined,
        filesToSend.length > 0 ? filesToSend : undefined
      );

      if (success) {
        for (const a of attachmentsClean) {
          if (a.previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(a.previewUrl);
          }
        }
      } else if (isOffline) {
        addToast('Message queued. Will send when internet reconnects.', 'info');
      }
    } finally {
      setIsSubmitting(false);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard?.writeText(text);
    addToast('Message text copied', 'info');
    setActiveMessageAction(null);
  };

  const handleDeleteMessageForMe = (msgId: string) => {
    setHiddenMessageIds((prev) => new Set(prev).add(msgId));
    addToast('Message deleted for you', 'info');
    setActiveMessageAction(null);
  };

  const handleDeleteMessageForEveryone = async (msgId: string) => {
    setActiveMessageAction(null);
    const ok = await deleteMessage(msgId);
    if (ok) {
      addToast('Message deleted for everyone', 'info');
    } else {
      addToast('Could not delete message from server.', 'warning');
    }
  };

  // Render WhatsApp status tick marks
  const renderMessageStatus = (msg: Message) => {
    if (!msg.isOutgoing) return null;

    if (msg.status === 'sending' || msg.status === 'queued') {
      return (
        <span
          className="flex items-center gap-0.5 opacity-70 text-[10px]"
          title={msg.status === 'queued' ? 'Queued offline' : 'Sending...'}
        >
          <Clock className="w-3 h-3 animate-pulse" />
        </span>
      );
    }

    if (msg.status === 'failed') {
      return (
        <span className="flex items-center gap-0.5 text-rose-300 text-[10px]" title="Failed to deliver">
          <AlertCircle className="w-3 h-3 text-rose-400" />
        </span>
      );
    }

    if (msg.status === 'seen' || msg.isSeen) {
      return (
        <span
          className="text-sky-300 font-bold flex items-center gap-0.5"
          title="Seen"
        >
          <CheckCheck className="w-3.5 h-3.5" />
        </span>
      );
    }

    if (msg.status === 'delivered') {
      return (
        <span className="opacity-80 flex items-center gap-0.5" title="Delivered">
          <CheckCheck className="w-3.5 h-3.5" />
        </span>
      );
    }

    // Default 'sent' (single tick)
    return (
      <span className="opacity-70 flex items-center gap-0.5" title="Sent">
        <Check className="w-3.5 h-3.5" />
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 max-w-4xl mx-auto w-full bg-[var(--color-bg-card)] sm:border sm:border-[var(--color-border)] sm:rounded-2xl shadow-sm overflow-hidden transition-colors relative">
      {/* Hidden native image/video/audio/PDF picker */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,application/pdf"
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />

      {/* Offline Alert Bar — Instant WhatsApp-style feedback */}
      {isOffline && (
        <div className="shrink-0 bg-amber-500/15 border-b border-amber-500/30 text-amber-700 dark:text-amber-300 px-3.5 py-1.5 text-xs text-center font-medium flex items-center justify-center gap-2 z-30 animate-in fade-in">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>You are offline - messages will be sent when online</span>
        </div>
      )}

      {/* 1. Dedicated Header — Continuously pinned at top, never scrolls away */}
      <div className="shrink-0 sticky top-0 px-3.5 sm:px-4 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-card)] z-30 pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={goBack}
            className="p-1.5 -ml-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-xl min-w-[36px] min-h-[36px] flex items-center justify-center transition-colors"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Tapping header opens Contact Info screen */}
          <button
            onClick={() => navigateTo('contact-info')}
            className="flex items-center gap-2.5 min-w-0 text-left group"
          >
            <Avatar
              src={participant.avatar}
              name={participant.name}
              size="sm"
              showOnline={isOnline}
            />
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                {participant.name}
              </h2>
              <p className="text-[10px] text-[var(--color-text-secondary)] truncate">
                {isPartnerTyping ? (
                  <span className="text-[var(--color-primary)] font-bold animate-pulse">
                    typing...
                  </span>
                ) : (
                  <>
                    {participant.department} · {isOnline ? 'Active now' : 'Offline'}
                  </>
                )}
              </p>
            </div>
          </button>
        </div>

        {/* Action icons: Voice Call, Video Call, Contact Info */}
        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              startCall(
                {
                  id: participant.id,
                  name: participant.name,
                  avatar: participant.avatar,
                  department: participant.department,
                },
                'audio'
              )
            }
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-primary)] transition-colors"
            aria-label="Start Voice Call"
            title="Start Voice Call (Low Data)"
          >
            <Phone className="w-4.5 h-4.5" />
          </button>

          <button
            onClick={() =>
              startCall(
                {
                  id: participant.id,
                  name: participant.name,
                  avatar: participant.avatar,
                  department: participant.department,
                },
                'video'
              )
            }
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-primary)] transition-colors"
            aria-label="Start Video Call"
            title="Start Video Call"
          >
            <Video className="w-4.5 h-4.5" />
          </button>

          <button
            onClick={() => navigateTo('contact-info')}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="View Contact Info"
            title="Contact details and options"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. Messages List (Independently vertical scrollable with pagination) */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-4 flex flex-col gap-3 bg-[var(--color-bg-main)] overscroll-contain"
      >
        {/* Infinite Scroll Trigger / Loading Indicator */}
        {loadingMore && (
          <div className="flex items-center justify-center py-2 text-xs text-[var(--color-text-secondary)] gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-primary)]" />
            <span>Loading earlier messages...</span>
          </div>
        )}

        {hasMore && !loadingMore && visibleMessages.length >= 50 && (
          <button
            type="button"
            onClick={() => loadMoreMessages()}
            className="text-[11px] font-semibold text-[var(--color-primary)] hover:underline self-center py-1 px-3 rounded-full bg-[var(--color-primary-subtle)]"
          >
            Load older messages
          </button>
        )}

        {/* Campus Connection Notice */}
        <div className="p-2.5 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] text-center text-[11px] font-medium mx-auto max-w-sm">
          You are chatting with {participant.name} ({participant.level}, {participant.department}).
        </div>

        {loadingChat && visibleMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[var(--color-text-secondary)]">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)] mb-2" />
            <p className="text-xs">Loading conversations...</p>
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[var(--color-text-secondary)]">
            <Avatar src={participant.avatar} name={participant.name} size="lg" className="mb-2" />
            <p className="font-bold text-sm text-[var(--color-text-primary)]">Say hello to {participant.name}!</p>
            <p className="text-xs max-w-xs mt-1">
              Start a conversation with your ABSU friend. Messages and shared media are private.
            </p>
          </div>
        ) : (
          visibleMessages.map((msg) => {
            const hasAttachments = msg.attachments && msg.attachments.length > 0;
            const isActionMenuOpen = activeMessageAction === msg.id;

            return (
              <div
                key={msg.id}
                className={`flex flex-col relative ${msg.isOutgoing ? 'items-end' : 'items-start'}`}
              >
                <div
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setActiveMessageAction((prev) => (prev === msg.id ? null : msg.id));
                  }}
                  className={`relative max-w-[82%] sm:max-w-md rounded-2xl px-3.5 py-2.5 shadow-xs text-xs sm:text-sm leading-relaxed transition-opacity ${
                    msg.status === 'sending' || msg.status === 'queued' ? 'opacity-85' : 'opacity-100'
                  } ${
                    msg.isOutgoing
                      ? 'bg-[var(--color-primary)] text-white rounded-br-xs'
                      : 'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-bl-xs'
                  }`}
                >
                  {/* Attachments rendering */}
                  {hasAttachments && (
                    <div className="flex flex-col gap-2 mb-1.5">
                      {msg.attachments!.map((att) => (
                        <div key={att.id} className="rounded-xl overflow-hidden">
                          {att.kind === 'image' ? (
                            <button
                              type="button"
                              onClick={() => setImageLightboxUrl(att.secure_url || null)}
                              className="w-full block relative cursor-zoom-in"
                            >
                              <img
                                src={att.secure_url}
                                alt={att.file_name}
                                className="w-full max-h-64 object-cover rounded-xl"
                                loading="lazy"
                              />
                            </button>
                          ) : att.kind === 'video' ? (
                            <div className="relative rounded-xl overflow-hidden bg-black flex items-center justify-center">
                              <video
                                src={att.secure_url}
                                poster={att.thumbnail_url || undefined}
                                controls
                                playsInline
                                preload="metadata"
                                className="w-full max-h-64 object-contain rounded-xl"
                              />
                            </div>
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
                              className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-colors ${
                                msg.isOutgoing
                                  ? 'bg-white/15 border-white/25 text-white hover:bg-white/25'
                                  : 'bg-[var(--color-bg-main)] border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-[var(--color-primary)]'
                              }`}
                            >
                              <FileText className="w-5 h-5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-bold truncate">{att.file_name}</p>
                                <p className="text-[10px] opacity-75">
                                  {(att.bytes / (1024 * 1024)).toFixed(2)} MB · Document
                                </p>
                              </div>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Text content */}
                  {msg.text && (
                    <div className="whitespace-pre-line break-words">
                      {msg.text}
                    </div>
                  )}
                </div>

                {/* Metadata & WhatsApp Status Ticks */}
                <div className="text-[10px] text-[var(--color-text-secondary)] mt-1 px-1 flex items-center gap-1.5">
                  <span>{msg.timestamp}</span>
                  {renderMessageStatus(msg)}
                  {msg.status === 'failed' && msg.isOutgoing && (
                    <button
                      type="button"
                      onClick={() => retryMessage(msg.id)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-500 hover:text-rose-600 underline ml-0.5"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Retry</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveMessageAction((prev) => (prev === msg.id ? null : msg.id))}
                    className="opacity-40 hover:opacity-100 text-[10px] underline ml-1"
                  >
                    options
                  </button>
                </div>

                {/* Message Context Menu */}
                {isActionMenuOpen && (
                  <div
                    className={`absolute z-30 top-full mt-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xl rounded-2xl p-1.5 min-w-[165px] animate-in fade-in zoom-in-95 ${
                      msg.isOutgoing ? 'right-0' : 'left-0'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingToMessage(msg);
                        setActiveMessageAction(null);
                        inputRef.current?.focus();
                      }}
                      className="w-full min-h-[38px] flex items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors"
                    >
                      <Reply className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>Reply</span>
                    </button>
                    {msg.text && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(msg.text)}
                        className="w-full min-h-[38px] flex items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5 text-[var(--color-text-secondary)]" />
                        <span>Copy text</span>
                      </button>
                    )}
                    {msg.isOutgoing && !msg.id.startsWith('temp_') && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMessageForEveryone(msg.id)}
                        className="w-full min-h-[38px] flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        <span>Delete for everyone</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteMessageForMe(msg.id)}
                      className="w-full min-h-[38px] flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      <span>Delete for me</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* WhatsApp Typing Indicator Bubble */}
        {isPartnerTyping && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] self-start text-xs text-[var(--color-text-secondary)] animate-in fade-in">
            <span className="font-semibold text-[var(--color-primary)]">
              {participant.name.split(' ')[0]} is typing
            </span>
            <span className="flex gap-1 items-center ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply Banner */}
      {replyingToMessage && (
        <div className="px-3.5 py-2 bg-[var(--color-primary-subtle)]/40 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-primary)]">
          <div className="flex items-center gap-2 min-w-0">
            <Reply className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              Replying to {replyingToMessage.isOutgoing ? 'yourself' : participant.name.split(' ')[0]}:{' '}
              <span className="opacity-80 italic">"{replyingToMessage.text?.slice(0, 35) || 'Attachment'}"</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingToMessage(null)}
            className="p-1 hover:bg-[var(--color-bg-card)] rounded-lg text-[var(--color-text-secondary)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending Attachments Tray */}
      {pendingAttachments.length > 0 && (
        <div className="p-2.5 border-t border-[var(--color-border)] bg-[var(--color-bg-card)] flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-text-secondary)]">
            <span>Ready to send ({pendingAttachments.length})</span>
            <button
              type="button"
              onClick={() => {
                for (const a of pendingAttachments) {
                  if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl);
                }
                setPendingAttachments([]);
              }}
              className="text-[11px] text-red-500 hover:underline"
            >
              Clear all
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
            {pendingAttachments.map((item) => (
              <div
                key={item.id}
                className="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-1.5 flex items-center gap-2 shrink-0 group max-w-[190px]"
              >
                {item.type === 'image' ? (
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                  />
                ) : item.type === 'video' ? (
                  <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center shrink-0">
                    <Film className="w-4 h-4 text-violet-400" />
                  </div>
                ) : item.type === 'pdf' ? (
                  <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center shrink-0">
                    <Music className="w-4 h-4" />
                  </div>
                )}

                <div className="min-w-0 pr-4">
                  <p className="text-[11px] font-bold text-[var(--color-text-primary)] truncate">
                    {item.name}
                  </p>
                  <p className="text-[9px] text-[var(--color-text-secondary)]">
                    {item.sizeLabel}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => removePendingAttachment(item.id)}
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors"
                  aria-label="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active DM Media Upload Progress Bar */}
      {uploadProgress !== null && (
        <div className="px-3.5 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg-card)] flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--color-text-secondary)]">
              <span>Uploading attachment to Cloudinary...</span>
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
            className="min-h-[36px] px-3 rounded-lg text-[11px] font-bold text-rose-500 hover:bg-rose-500/10 border border-rose-500/30 shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Emoji Picker Popup */}
      {emojiPickerOpen && (
        <div
          ref={emojiPickerRef}
          className="absolute bottom-16 left-12 z-40 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-xl p-3 w-64 animate-in fade-in zoom-in-95"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--color-border)]">
            <span className="text-xs font-bold text-[var(--color-text-primary)]">Quick Emojis</span>
            <button
              type="button"
              onClick={() => setEmojiPickerOpen(false)}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-xl text-center">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleInsertEmoji(emoji)}
                className="p-1.5 rounded-xl hover:bg-[var(--color-bg-main)] transition-colors active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Media Selection / Upload Recovery Banner */}
      {mediaRecovery && (
        <div className="px-3.5 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg-card)] shrink-0">
          <MediaRecoveryBanner
            recovery={mediaRecovery}
            onChooseAgain={() => fileInputRef.current?.click()}
            onDismiss={() => setMediaRecovery(null)}
          />
        </div>
      )}

      {/* 3. Composer (Pinned to Bottom) — [Games] [Sticker/Emoji | Message input | Camera/Gallery Picker] [Send / Mic] */}
      <form
        onSubmit={handleSend}
        className="shrink-0 sticky bottom-0 p-2.5 sm:p-3 border-t border-[var(--color-border)] bg-[var(--color-bg-card)] flex items-center gap-2 z-30 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
      >
        {/* Far Left: Games Button */}
        <button
          type="button"
          onClick={() => setGamesModalOpen(true)}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-primary)] bg-[var(--color-primary-subtle)] hover:bg-[var(--color-primary)] hover:text-white transition-all active:scale-95 shrink-0"
          title="Campus Games"
          aria-label="Play Games"
        >
          <Gamepad2 className="w-5 h-5" />
        </button>

        {isRecordingVoice ? (
          /* Voice Note Recording In-Progress Banner */
          <div className="flex-1 flex items-center justify-between bg-rose-500/10 border border-rose-500/30 rounded-full px-4 py-1.5 animate-pulse">
            <div className="flex items-center gap-2 text-rose-500 text-xs font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span>Recording ({Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')})</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelVoiceRecording}
                className="p-1 rounded-full text-[var(--color-text-secondary)] hover:text-rose-500 transition-colors"
                title="Cancel voice recording"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={stopAndSendVoiceRecording}
                className="px-3 py-1 bg-rose-600 text-white rounded-full text-xs font-bold flex items-center gap-1 hover:bg-rose-700 shadow-xs"
              >
                <Square className="w-3 h-3 fill-white" />
                <span>Send</span>
              </button>
            </div>
          </div>
        ) : (
          /* Normal Message Input Pill: [Emoji | Text Input | Camera/Gallery] */
          <div className="flex-1 flex items-center bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-full px-2.5 py-1 focus-within:ring-1 focus-within:ring-[var(--color-primary)]">
            {/* Inside Left: Sticker / Emoji Button */}
            <button
              type="button"
              onClick={() => setEmojiPickerOpen((prev) => !prev)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors shrink-0"
              title="Emoji / Stickers"
              aria-label="Insert Emoji"
            >
              <Smile className="w-5 h-5" />
            </button>

            {/* Center Message Text Input */}
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={handleInputChange}
              placeholder={`Message ${participant.name.split(' ')[0]}...`}
              className="flex-1 bg-transparent border-0 px-2.5 py-1 text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none"
            />

            {/* Inside Right: Direct Gallery / Media Picker */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors shrink-0"
              title="Choose photo, video or audio from phone gallery"
              aria-label="Open Gallery"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Far Right: Send Button OR Voice Note Button */}
        {inputMessage.trim() || pendingAttachments.length > 0 ? (
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-10 h-10 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center hover:bg-[var(--color-primary-hover)] transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none shrink-0 shadow-xs"
            aria-label="Send message"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        ) : !isRecordingVoice ? (
          <button
            type="button"
            onClick={startVoiceRecording}
            className="w-10 h-10 rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center hover:bg-[var(--color-primary)] hover:text-white transition-all active:scale-95 shrink-0"
            title="Record Voice Note"
            aria-label="Record Voice Note"
          >
            <Mic className="w-5 h-5" />
          </button>
        ) : null}
      </form>

      {/* Campus Games Modal */}
      {gamesModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-5 shadow-2xl animate-in fade-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-[var(--color-primary)]" />
                <h3 className="text-base font-extrabold text-[var(--color-text-primary)]">
                  Campus Multiplayer Games
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGamesModalOpen(false)}
                className="p-1 rounded-xl text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--color-text-secondary)] mt-2">
              Challenge {participant.name.split(' ')[0]} to fun campus games! Multiplayer games with friends coming soon.
            </p>

            <div className="flex flex-col gap-2.5 mt-3 overflow-y-auto pr-1">
              {[
                { name: 'Naija Whot!', tag: 'Card Game', icon: '🃏', color: 'text-amber-500 bg-amber-500/10' },
                { name: 'Campus Ludo Master', tag: 'Board Game', icon: '🎲', color: 'text-emerald-500 bg-emerald-500/10' },
                { name: 'Truth or Dare', tag: 'Hostel Party', icon: '🔥', color: 'text-rose-500 bg-rose-500/10' },
                { name: 'ABSU Trivia & Q&A', tag: 'Knowledge', icon: '🧠', color: 'text-blue-500 bg-blue-500/10' },
                { name: 'Campus Sprint Racing', tag: 'Mini Arcade', icon: '🏎️', color: 'text-purple-500 bg-purple-500/10' },
              ].map((g) => (
                <div
                  key={g.name}
                  className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${g.color}`}>
                      {g.icon}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[var(--color-text-primary)]">{g.name}</p>
                      <p className="text-[10px] text-[var(--color-text-secondary)]">{g.tag}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Coming Soon
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex justify-end">
              <button
                type="button"
                onClick={() => setGamesModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Microphone Permission Guidance Modal */}
      {micPermissionModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setMicPermissionModal(null)}
        >
          <div
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
                <Mic className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[var(--color-text-primary)]">
                  {micPermissionModal === 'rationale'
                    ? 'Allow Microphone for Voice Notes'
                    : micPermissionModal === 'no-device'
                    ? 'No Microphone Detected'
                    : 'Microphone Permission Blocked'}
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                  {micPermissionModal === 'rationale'
                    ? 'ABSU Connect needs access to your microphone so you can record and send voice notes in this conversation.'
                    : micPermissionModal === 'no-device'
                    ? 'We could not find an active microphone on this device. Connect a microphone or headset and try again.'
                    : 'Microphone access is currently blocked. Open your browser site permissions or phone Settings > Apps > ABSU Connect > Permissions and allow Microphone access.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setMicPermissionModal(null)}
                className="min-h-[44px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                {micPermissionModal === 'rationale' ? 'Cancel' : 'Close'}
              </button>
              {micPermissionModal === 'rationale' && (
                <button
                  type="button"
                  onClick={actuallyBeginRecording}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold"
                >
                  Continue
                </button>
              )}
              {micPermissionModal === 'denied' && (
                <button
                  type="button"
                  onClick={actuallyBeginRecording}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
