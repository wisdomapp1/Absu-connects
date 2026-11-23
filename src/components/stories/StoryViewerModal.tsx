import React, { useState, useEffect, useRef, useCallback } from 'react';
import type {
  UserStoryGroup,
  Story,
  StoryViewItem,
  StoryReactionItem,
} from '../../types/stories.ts';
import {
  recordStoryView,
  setStoryReaction,
  replyToStory,
  fetchStoryInsights,
  deleteStory,
} from '../../lib/storyService.ts';
import {
  STORY_QUICK_REACTIONS,
  formatStoryReactionEmoji,
  formatStoryReactionLabel,
  isStoryExpired,
} from '../../lib/storyUtils.ts';
import { Avatar } from '../common/Avatar.tsx';
import { Volume2, VolumeX, Eye, Heart, SmilePlus } from 'lucide-react';

const ALLOWED_STORY_GRADIENTS: Record<string, string> = {
  'from-blue-600 via-indigo-700 to-slate-950': 'from-blue-600 via-indigo-700 to-slate-950',
  'from-rose-600 via-pink-700 to-slate-950': 'from-rose-600 via-pink-700 to-slate-950',
  'from-emerald-600 via-teal-700 to-slate-950': 'from-emerald-600 via-teal-700 to-slate-950',
  'from-purple-600 via-fuchsia-800 to-slate-950': 'from-purple-600 via-fuchsia-800 to-slate-950',
  'from-amber-500 via-orange-600 to-rose-950': 'from-amber-500 via-orange-600 to-rose-950',
  'from-slate-900 via-neutral-900 to-black': 'from-slate-900 via-neutral-900 to-black',
};

const ALLOWED_STORY_FONTS: Record<string, string> = {
  classic: 'font-sans font-bold',
  serif: 'font-serif font-bold',
  mono: 'font-mono font-bold',
};

interface StoryViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyGroups: UserStoryGroup[];
  initialGroupIndex: number;
  initialStoryId?: string | null;
  initialInsightsOpen?: boolean;
  initialInsightsTab?: 'viewers' | 'reactions';
  currentUserId?: string;
  onStoryDeleted?: (storyId: string) => void;
  onStoryViewed?: (storyId: string) => void;
  onStoryReacted?: (storyId: string, reaction: string | null, reactionsCount: number) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

function formatInsightTime(ts?: string | null): string {
  if (!ts) return '';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const isSameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isSameDay) return timeStr;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${timeStr}`;
}

export const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  isOpen,
  onClose,
  storyGroups,
  initialGroupIndex,
  initialStoryId,
  initialInsightsOpen = false,
  initialInsightsTab = 'viewers',
  currentUserId,
  onStoryDeleted,
  onStoryViewed,
  onStoryReacted,
  onShowToast,
}) => {
  // Keep an immutable session snapshot so live re-sorting never shifts currentGroupIdx mid-playback
  const [groupsSnapshot, setGroupsSnapshot] = useState<UserStoryGroup[]>(storyGroups);
  const [currentGroupIdx, setCurrentGroupIdx] = useState(initialGroupIndex);
  const [currentStoryIdx, setCurrentStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isReplyFocused, setIsReplyFocused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [reactionsCount, setReactionsCount] = useState(0);
  const [viewsCount, setViewsCount] = useState(0);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isUpdatingReaction, setIsUpdatingReaction] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [insightsTab, setInsightsTab] = useState<'viewers' | 'reactions'>('viewers');
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [viewersList, setViewersList] = useState<StoryViewItem[]>([]);
  const [reactionsList, setReactionsList] = useState<StoryReactionItem[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [mediaRetryKey, setMediaRetryKey] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [videoDurationMs, setVideoDurationMs] = useState<number>(15000);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const viewedInSessionRef = useRef<Set<string>>(new Set());
  const wasOpenRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const storyGroupsRef = useRef(storyGroups);
  storyGroupsRef.current = storyGroups;
  const onStoryViewedRef = useRef(onStoryViewed);
  onStoryViewedRef.current = onStoryViewed;

  const currentGroup = groupsSnapshot[currentGroupIdx];
  const currentStory: Story | undefined = currentGroup?.stories[currentStoryIdx];
  const isOwner = Boolean(currentUserId && currentStory?.user_id === currentUserId);
  const expiredStory = Boolean(
    currentStory && (currentStory.is_expired || isStoryExpired(currentStory.expires_at))
  );

  // Snapshot storyGroups strictly on closed -> open transition (or when target initialStoryId changes while open)
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const cloned = storyGroupsRef.current.map((g) => ({
        ...g,
        stories: g.stories.map((s) => ({ ...s })),
      }));
      setGroupsSnapshot(cloned);

      let boundedGroupIdx = Math.max(0, Math.min(initialGroupIndex, Math.max(0, cloned.length - 1)));
      let boundedStoryIdx = 0;

      if (initialStoryId) {
        const foundGIdx = cloned.findIndex((g) => g.stories.some((s) => s.id === initialStoryId));
        if (foundGIdx >= 0) {
          boundedGroupIdx = foundGIdx;
          const foundSIdx = cloned[foundGIdx].stories.findIndex((s) => s.id === initialStoryId);
          if (foundSIdx >= 0) boundedStoryIdx = foundSIdx;
        }
      }

      const targetStory = cloned[boundedGroupIdx]?.stories[boundedStoryIdx];
      const canOpenInsights = Boolean(
        initialInsightsOpen && targetStory && currentUserId && targetStory.user_id === currentUserId
      );

      setCurrentGroupIdx(boundedGroupIdx);
      setCurrentStoryIdx(boundedStoryIdx);
      setProgress(0);
      setShowInsights(canOpenInsights);
      setInsightsTab(initialInsightsTab === 'reactions' ? 'reactions' : 'viewers');
      setShowReactionPicker(false);
      setShowMenu(false);
      setIsReplyFocused(false);
      setMediaError(false);
      viewedInSessionRef.current.clear();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialGroupIndex, initialStoryId, initialInsightsOpen, initialInsightsTab, currentUserId]);

  // Reset media error and duration on story navigation
  useEffect(() => {
    setMediaError(false);
    setMediaRetryKey(0);
    setVideoDurationMs(15000);
    setShowReactionPicker(false);
  }, [currentStory?.id]);

  // Record story view (non-owner only) & sync reaction/view state
  useEffect(() => {
    if (!currentStory || !isOpen) return;

    const initialReaction = currentStory.user_reaction
      ? currentStory.user_reaction
      : currentStory.has_reacted
      ? '❤️'
      : null;

    setMyReaction(initialReaction);
    setReactionsCount(currentStory.reactions_count || 0);
    setViewsCount(currentStory.views_count || 0);
    setViewersList(currentStory.views || []);
    setReactionsList(currentStory.reactions || []);

    if (!isOwner && currentUserId && !viewedInSessionRef.current.has(currentStory.id)) {
      viewedInSessionRef.current.add(currentStory.id);
      recordStoryView(currentStory.id, currentUserId, currentStory.user_id);
      currentStory.has_viewed = true;
      onStoryViewedRef.current?.(currentStory.id);
    }
  }, [currentStory?.id, isOwner, currentUserId, isOpen]);

  // Load viewers & reactions when owner opens Activity drawer (or when owner views own story so badge counts stay accurate)
  const loadInsights = useCallback(async (storyId: string, ownerId: string) => {
    setInsightsLoading(true);
    try {
      const res = await fetchStoryInsights(storyId, ownerId);
      setViewersList(res.views);
      setViewsCount(res.viewsCount);
      setReactionsList(res.reactions);
      setReactionsCount(res.reactionsCount);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !isOwner || !currentStory) return;
    if (showInsights) {
      loadInsights(currentStory.id, currentStory.user_id);
    }
  }, [isOpen, showInsights, isOwner, currentStory?.id, currentStory?.user_id, loadInsights]);

  // Pre-fetch owner counts quietly so "Viewers · Reactions" pill shows accurate counts right away
  useEffect(() => {
    if (!isOpen || !isOwner || !currentStory || showInsights) return;
    fetchStoryInsights(currentStory.id, currentStory.user_id)
      .then((res) => {
        setViewersList(res.views);
        setViewsCount(res.viewsCount);
        setReactionsList(res.reactions);
        setReactionsCount(res.reactionsCount);
      })
      .catch(() => {});
  }, [isOpen, isOwner, currentStory?.id, currentStory?.user_id, showInsights]);

  const advanceStory = useCallback(() => {
    if (!currentGroup) return;

    if (currentStoryIdx < currentGroup.stories.length - 1) {
      setCurrentStoryIdx((prev) => prev + 1);
      setProgress(0);
    } else if (currentGroupIdx < groupsSnapshot.length - 1) {
      setCurrentGroupIdx((prev) => prev + 1);
      setCurrentStoryIdx(0);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentGroup, currentStoryIdx, currentGroupIdx, groupsSnapshot.length, onClose]);

  const prevStory = useCallback(() => {
    if (currentStoryIdx > 0) {
      setCurrentStoryIdx((prev) => prev - 1);
      setProgress(0);
    } else if (currentGroupIdx > 0) {
      const prevGroup = groupsSnapshot[currentGroupIdx - 1];
      setCurrentGroupIdx((prev) => prev - 1);
      setCurrentStoryIdx(Math.max(0, prevGroup.stories.length - 1));
      setProgress(0);
    }
  }, [currentStoryIdx, currentGroupIdx, groupsSnapshot]);

  // Timer loop for auto-progress (pauses when typing, touching, choosing reaction, or viewing insights)
  useEffect(() => {
    if (
      !isOpen ||
      isPaused ||
      isReplyFocused ||
      showInsights ||
      showReactionPicker ||
      !currentStory ||
      mediaError
    ) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const duration = currentStory.media_type === 'video' ? videoDurationMs : 5000;
    const intervalMs = 50;
    const step = (intervalMs / duration) * 100;

    timerRef.current = window.setInterval(() => {
      setProgress((prev) => Math.min(100, prev + step));
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [
    isOpen,
    isPaused,
    isReplyFocused,
    showInsights,
    showReactionPicker,
    currentStory?.id,
    currentStory?.media_type,
    mediaError,
    videoDurationMs,
  ]);

  // Advance story outside state updater
  useEffect(() => {
    if (
      !isOpen ||
      isPaused ||
      isReplyFocused ||
      showInsights ||
      showReactionPicker ||
      !currentStory ||
      mediaError
    ) {
      return;
    }
    if (progress >= 100) {
      advanceStory();
    }
  }, [
    progress,
    isOpen,
    isPaused,
    isReplyFocused,
    showInsights,
    showReactionPicker,
    currentStory,
    mediaError,
    advanceStory,
  ]);

  if (!isOpen || !currentStory || !currentGroup) return null;

  const handleSelectReaction = async (chosenEmoji: string | null) => {
    if (!currentUserId) {
      onShowToast?.('Please sign in to react to this story', 'info');
      return;
    }
    if (isUpdatingReaction) return;

    const prevReaction = myReaction;
    const prevCount = reactionsCount;
    const isSameReaction =
      prevReaction !== null &&
      chosenEmoji !== null &&
      formatStoryReactionEmoji(prevReaction) === formatStoryReactionEmoji(chosenEmoji);

    const nextReaction = isSameReaction ? null : chosenEmoji;
    const nextCount =
      prevReaction && !nextReaction
        ? Math.max(0, prevCount - 1)
        : !prevReaction && nextReaction
        ? prevCount + 1
        : prevCount;

    setMyReaction(nextReaction);
    setReactionsCount(nextCount);
    setShowReactionPicker(false);
    currentStory.has_reacted = Boolean(nextReaction);
    currentStory.user_reaction = nextReaction;
    currentStory.reactions_count = nextCount;

    setIsUpdatingReaction(true);
    const res = await setStoryReaction(currentStory.id, currentUserId, nextReaction);
    setIsUpdatingReaction(false);

    if (!res.success) {
      setMyReaction(prevReaction);
      setReactionsCount(prevCount);
      currentStory.has_reacted = Boolean(prevReaction);
      currentStory.user_reaction = prevReaction;
      currentStory.reactions_count = prevCount;
      onShowToast?.(res.error || 'Could not update reaction', 'error');
      return;
    }

    onStoryReacted?.(currentStory.id, res.reaction, nextCount);
  };

  const handleQuickHeartToggle = () => {
    if (myReaction) {
      handleSelectReaction(null);
    } else {
      handleSelectReaction('❤️');
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || isSendingReply) return;

    setIsSendingReply(true);
    const res = await replyToStory(currentStory.id, replyText.trim(), {
      id: currentGroup.user_id,
      name: currentGroup.user_name,
      avatar: currentGroup.user_avatar,
    });
    setIsSendingReply(false);

    if (res.success) {
      setReplyText('');
      setIsReplyFocused(false);
      onShowToast?.(`Sent reply to ${currentGroup.user_name.split(' ')[0]} via Direct Message`, 'success');
    } else {
      onShowToast?.(res.error || 'Failed to send reply', 'error');
    }
  };

  const handleDeleteCurrentStory = async () => {
    if (!isOwner || isDeleting) return;
    setIsDeleting(true);
    const res = await deleteStory(currentStory.id, currentStory.storage_path);
    setIsDeleting(false);

    if (res.success) {
      onShowToast?.('Story deleted', 'info');
      onStoryDeleted?.(currentStory.id);
      advanceStory();
    } else {
      onShowToast?.(res.error || 'Could not delete story', 'error');
    }
  };

  const openInsightsSheet = (tab: 'viewers' | 'reactions') => {
    setInsightsTab(tab);
    setShowInsights(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 select-none">
      {/* Container simulating mobile story viewport with swipe-down-to-close */}
      <div
        className="relative w-full max-w-md h-full max-h-[92vh] sm:rounded-3xl overflow-hidden bg-slate-950 flex flex-col justify-between shadow-2xl transition-transform duration-150"
        style={
          dragOffsetY > 0
            ? {
                transform: `translateY(${dragOffsetY}px)`,
                opacity: Math.max(0.4, 1 - dragOffsetY / 320),
              }
            : undefined
        }
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={(e) => {
          setIsPaused(true);
          const touch = e.touches[0];
          if (touch && !showInsights) {
            touchStartRef.current = { x: touch.clientX, y: touch.clientY };
          }
        }}
        onTouchMove={(e) => {
          if (!touchStartRef.current || showInsights) return;
          const touch = e.touches[0];
          if (!touch) return;
          const dy = touch.clientY - touchStartRef.current.y;
          const dx = Math.abs(touch.clientX - touchStartRef.current.x);
          if (dy > 14 && dy > dx) {
            setDragOffsetY(dy);
          }
        }}
        onTouchEnd={() => {
          setIsPaused(false);
          if (dragOffsetY >= 90) {
            setDragOffsetY(0);
            touchStartRef.current = null;
            onClose();
            return;
          }
          setDragOffsetY(0);
          touchStartRef.current = null;
        }}
      >
        {/* Progress Bars */}
        <div className="absolute top-0 inset-x-0 z-30 p-3 pt-4 flex space-x-1.5 bg-gradient-to-b from-black/80 to-transparent">
          {currentGroup.stories.map((story, idx) => (
            <div key={story.id} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-75"
                style={{
                  width:
                    idx < currentStoryIdx
                      ? '100%'
                      : idx === currentStoryIdx
                      ? `${progress}%`
                      : '0%',
                }}
              />
            </div>
          ))}
        </div>

        {/* Top Header: Author info & Actions */}
        <div className="absolute top-6 inset-x-0 z-30 px-4 py-2 flex items-center justify-between text-white">
          <div className="flex items-center space-x-2.5 min-w-0">
            <Avatar
              src={currentGroup.user_avatar}
              name={currentGroup.user_name}
              size="sm"
              className="ring-2 ring-white/60 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-sm tracking-wide truncate">
                  {currentGroup.user_name}
                </span>
                <span className="text-xs text-white/70 shrink-0">
                  {new Date(currentStory.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {expiredStory && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/15 text-white/85 shrink-0">
                    Expired
                  </span>
                )}
              </div>
              {currentStory.user?.department && (
                <span className="text-[10px] text-white/60 block truncate">
                  {currentStory.user.department}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            {currentStory.media_type === 'video' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMuted((prev) => !prev);
                }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/20 text-white/90 transition-colors"
                title={isMuted ? 'Unmute video' : 'Mute video'}
                aria-label={isMuted ? 'Unmute video' : 'Mute video'}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            )}
            {isOwner && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(!showMenu);
                  }}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/20 text-white/90"
                  title="Story options"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 5v.01M12 12v.01M12 19v.01"
                    />
                  </svg>
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-11 bg-slate-900 border border-slate-700 rounded-xl py-1 shadow-xl z-40 min-w-[140px]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        handleDeleteCurrentStory();
                      }}
                      className="w-full min-h-[44px] px-3 py-2 text-left text-xs text-rose-400 hover:bg-rose-500/20 flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                      <span>{isDeleting ? 'Deleting...' : 'Delete Story'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/20 text-white/90 transition-colors"
              title="Close"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Story Media / Text Area */}
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {/* Tap navigation zones */}
          <div
            className="absolute left-0 inset-y-0 w-1/3 z-20 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              prevStory();
            }}
          />
          <div
            className="absolute right-0 inset-y-0 w-2/3 z-20 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              advanceStory();
            }}
          />

          {/* Text Story */}
          {currentStory.media_type === 'text' && (
            <div
              className={`w-full h-full bg-gradient-to-tr ${
                (currentStory.background_color &&
                  ALLOWED_STORY_GRADIENTS[currentStory.background_color]) ||
                'from-indigo-900 via-blue-800 to-sky-700'
              } flex items-center justify-center p-8 text-center`}
            >
              <p
                className={`text-white text-xl sm:text-2xl leading-relaxed tracking-wide drop-shadow-md ${
                  (currentStory.font_style && ALLOWED_STORY_FONTS[currentStory.font_style]) ||
                  'font-bold'
                }`}
              >
                {currentStory.text_content}
              </p>
            </div>
          )}

          {/* Broken Media Fallback */}
          {currentStory.media_type !== 'text' && mediaError && (
            <div className="relative z-30 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm font-semibold text-white">Story media could not be loaded</p>
              <p className="text-xs text-slate-400 max-w-xs">
                Check your connection or retry loading this story.
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMediaError(false);
                  setMediaRetryKey((k) => k + 1);
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold"
              >
                Retry Media
              </button>
            </div>
          )}

          {/* Image Story */}
          {currentStory.media_type === 'image' && !mediaError && (
            <img
              key={`${currentStory.id}-${mediaRetryKey}`}
              src={currentStory.media_url || currentStory.storage_path || ''}
              alt="Story"
              referrerPolicy="no-referrer"
              onError={() => setMediaError(true)}
              className="w-full h-full object-contain bg-black"
            />
          )}

          {/* Video Story */}
          {currentStory.media_type === 'video' && !mediaError && (
            <video
              key={`${currentStory.id}-${mediaRetryKey}`}
              ref={videoRef}
              src={currentStory.media_url || currentStory.storage_path || ''}
              poster={currentStory.thumbnail_url || undefined}
              onLoadedMetadata={(e) => {
                const dur = e.currentTarget.duration;
                if (Number.isFinite(dur) && dur > 0) {
                  setVideoDurationMs(Math.min(60000, Math.max(3000, Math.round(dur * 1000))));
                }
              }}
              onError={() => setMediaError(true)}
              className="w-full h-full object-contain bg-black"
              autoPlay
              playsInline
              loop
              muted={isMuted}
            />
          )}

          {/* Caption banner if exists */}
          {currentStory.caption && (
            <div className="absolute bottom-20 inset-x-0 z-20 px-6 py-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent text-center">
              <p className="text-white text-sm font-medium drop-shadow-md">
                {currentStory.caption}
              </p>
            </div>
          )}
        </div>

        {/* Bottom Bar: Reactions / DM / Insights */}
        <div
          className="relative z-30 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {/* Floating Emoji Reaction Tray for Non-Owner Viewers */}
          {!isOwner && showReactionPicker && (
            <div className="mb-2.5 flex items-center justify-center gap-1.5 bg-slate-900/95 border border-white/15 backdrop-blur-md rounded-2xl p-1.5 shadow-xl">
              {STORY_QUICK_REACTIONS.map((item) => {
                const isSelected =
                  myReaction !== null &&
                  formatStoryReactionEmoji(myReaction) === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelectReaction(item.key)}
                    disabled={isUpdatingReaction}
                    title={isSelected ? `Remove ${item.label}` : item.label}
                    className={`min-h-[40px] min-w-[40px] px-2 rounded-xl text-xl flex items-center justify-center transition-transform active:scale-125 ${
                      isSelected
                        ? 'bg-white/25 ring-2 ring-rose-400 scale-110'
                        : 'hover:bg-white/15'
                    }`}
                  >
                    <span>{item.key}</span>
                  </button>
                );
              })}
            </div>
          )}

          {isOwner ? (
            /* Owner view: See viewers & reactions */
            <div className="flex items-center justify-between text-white px-2 py-1 gap-2">
              <button
                type="button"
                onClick={() => openInsightsSheet('viewers')}
                className="min-h-[44px] flex items-center space-x-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all active:scale-95 whitespace-nowrap shrink-0"
              >
                <Eye className="w-4 h-4" />
                <span>Viewers ({viewsCount})</span>
              </button>

              <button
                type="button"
                onClick={() => openInsightsSheet('reactions')}
                className="min-h-[44px] flex items-center space-x-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm px-3.5 py-2 rounded-xl text-rose-300 text-xs font-bold tabular-nums transition-all active:scale-95 whitespace-nowrap shrink-0"
              >
                <Heart className="w-4 h-4 fill-current text-rose-400" />
                <span>{reactionsCount} {reactionsCount === 1 ? 'reaction' : 'reactions'}</span>
              </button>
            </div>
          ) : (
            /* Viewer view: Reply as DM + Reaction Picker + Quick Like */
            <div className="flex items-center space-x-1.5">
              <form onSubmit={handleSendReply} className="flex-1 relative">
                <input
                  type="text"
                  value={replyText}
                  onFocus={() => setIsReplyFocused(true)}
                  onBlur={() => setIsReplyFocused(false)}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Send direct message to ${currentGroup.user_name.split(' ')[0]}...`}
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck={true}
                  enterKeyHint="send"
                  className="w-full min-h-[44px] bg-white/20 hover:bg-white/25 focus:bg-white/30 text-white placeholder-white/70 text-xs rounded-xl py-2.5 pl-4 pr-14 border border-white/20 focus:outline-none focus:ring-1 focus:ring-white/50 backdrop-blur-md select-text"
                />
                {replyText.trim() && (
                  <button
                    type="submit"
                    disabled={isSendingReply}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] px-2.5 text-blue-300 hover:text-blue-200 font-semibold text-xs transition-colors"
                  >
                    {isSendingReply ? '...' : 'Send'}
                  </button>
                )}
              </form>

              <button
                type="button"
                onClick={() => setShowReactionPicker((prev) => !prev)}
                disabled={isUpdatingReaction}
                className={`min-h-[44px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors ${
                  showReactionPicker
                    ? 'bg-white/25 text-amber-300'
                    : 'text-white/90 hover:bg-white/15'
                }`}
                title="Choose reaction"
                aria-label="Choose story reaction"
              >
                <SmilePlus className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={handleQuickHeartToggle}
                disabled={isUpdatingReaction}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-transform active:scale-125 ${
                  myReaction ? 'text-rose-500' : 'text-white hover:text-rose-400'
                }`}
                title={myReaction ? 'Remove reaction' : 'Like story'}
                aria-label={myReaction ? 'Remove story reaction' : 'Like story'}
              >
                {myReaction ? (
                  <span className="text-xl leading-none" role="img" aria-label="Your reaction">
                    {formatStoryReactionEmoji(myReaction)}
                  </span>
                ) : (
                  <svg
                    className="w-6 h-6 stroke-current"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Viewers & Reactions Slide-up Sheet */}
        {showInsights && isOwner && (
          <div
            className="absolute inset-x-0 bottom-0 top-1/3 z-40 bg-slate-900 border-t border-slate-800 rounded-t-3xl p-4 flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setInsightsTab('viewers')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    insightsTab === 'viewers'
                      ? 'bg-white text-slate-900'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Viewers ({viewersList.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInsightsTab('reactions')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    insightsTab === 'reactions'
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Heart className="w-3.5 h-3.5 fill-current" />
                  <span>Reactions ({reactionsList.length})</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowInsights(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white shrink-0"
                aria-label="Close activity sheet"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 py-2">
              {insightsLoading ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  Loading story activity...
                </div>
              ) : insightsTab === 'viewers' ? (
                viewersList.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No viewers yet. Campus friends who view your story will appear here.
                  </div>
                ) : (
                  viewersList.map((item) => (
                    <div
                      key={item.id || `${item.story_id}_${item.viewer_id}`}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <Avatar
                          src={item.viewer?.avatar_url}
                          name={item.viewer?.name || 'ABSU Student'}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-white block truncate">
                            {item.viewer?.name || 'ABSU Student'}
                          </span>
                          {item.viewer?.department && (
                            <span className="text-[10px] text-slate-400 block truncate">
                              {item.viewer.department}
                              {item.viewer.level ? ` · ${item.viewer.level}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                        {formatInsightTime(item.viewed_at || item.created_at)}
                      </span>
                    </div>
                  ))
                )
              ) : reactionsList.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No reactions yet. Reactions to your story will appear here.
                </div>
              ) : (
                reactionsList.map((item) => (
                  <div
                    key={item.id || `${item.story_id}_${item.user_id}`}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="relative shrink-0">
                        <Avatar
                          src={item.user?.avatar_url}
                          name={item.user?.name || 'ABSU Student'}
                          size="sm"
                        />
                        <span
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs shadow-xs"
                          title={formatStoryReactionLabel(item.reaction)}
                        >
                          {formatStoryReactionEmoji(item.reaction)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-white block truncate">
                          {item.user?.name || 'ABSU Student'}
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate">
                          Reacted {formatStoryReactionEmoji(item.reaction)} {formatStoryReactionLabel(item.reaction)}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                      {formatInsightTime(item.created_at)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
