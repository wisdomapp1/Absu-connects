import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { UserStoryGroup, Story, StoryViewItem } from '../../types/stories.ts';
import {
  recordStoryView,
  toggleStoryReaction,
  replyToStory,
  fetchStoryInsights,
  deleteStory,
} from '../../lib/storyService.ts';
import { Avatar } from '../common/Avatar.tsx';
import { Volume2, VolumeX } from 'lucide-react';

interface StoryViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyGroups: UserStoryGroup[];
  initialGroupIndex: number;
  currentUserId?: string;
  onStoryDeleted?: (storyId: string) => void;
  onStoryViewed?: (storyId: string) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  isOpen,
  onClose,
  storyGroups,
  initialGroupIndex,
  currentUserId,
  onStoryDeleted,
  onStoryViewed,
  onShowToast,
}) => {
  // Keep an immutable session snapshot so live re-sorting in HomeView never shifts currentGroupIdx mid-playback
  const [groupsSnapshot, setGroupsSnapshot] = useState<UserStoryGroup[]>(storyGroups);
  const [currentGroupIdx, setCurrentGroupIdx] = useState(initialGroupIndex);
  const [currentStoryIdx, setCurrentStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isReplyFocused, setIsReplyFocused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [showInsights, setShowInsights] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [viewersList, setViewersList] = useState<StoryViewItem[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [mediaRetryKey, setMediaRetryKey] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [videoDurationMs, setVideoDurationMs] = useState<number>(15000);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const viewedInSessionRef = useRef<Set<string>>(new Set());
  const wasOpenRef = useRef(false);
  const storyGroupsRef = useRef(storyGroups);
  storyGroupsRef.current = storyGroups;
  const onStoryViewedRef = useRef(onStoryViewed);
  onStoryViewedRef.current = onStoryViewed;

  const currentGroup = groupsSnapshot[currentGroupIdx];
  const currentStory: Story | undefined = currentGroup?.stories[currentStoryIdx];
  const isOwner = currentStory?.user_id === currentUserId;

  // Snapshot storyGroups strictly on closed -> open transition
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const cloned = storyGroupsRef.current.map((g) => ({
        ...g,
        stories: g.stories.map((s) => ({ ...s })),
      }));
      setGroupsSnapshot(cloned);
      const boundedGroupIdx = Math.max(0, Math.min(initialGroupIndex, Math.max(0, cloned.length - 1)));
      setCurrentGroupIdx(boundedGroupIdx);
      setCurrentStoryIdx(0);
      setProgress(0);
      setShowInsights(false);
      setShowMenu(false);
      setIsReplyFocused(false);
      setMediaError(false);
      viewedInSessionRef.current.clear();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialGroupIndex]);

  // Reset media error and duration on story navigation
  useEffect(() => {
    setMediaError(false);
    setMediaRetryKey(0);
    setVideoDurationMs(15000);
  }, [currentStory?.id]);

  // Record story view & sync reaction state
  useEffect(() => {
    if (!currentStory || !isOpen) return;

    setIsLiked(Boolean(currentStory.has_reacted));
    setLikeCount(currentStory.reactions_count || 0);

    if (!isOwner && currentUserId && !viewedInSessionRef.current.has(currentStory.id)) {
      viewedInSessionRef.current.add(currentStory.id);
      recordStoryView(currentStory.id, currentUserId);
      currentStory.has_viewed = true;
      onStoryViewedRef.current?.(currentStory.id);
    }
  }, [currentStory?.id, isOwner, currentUserId, isOpen]);

  // Load insights if owner opens the drawer
  useEffect(() => {
    if (showInsights && isOwner && currentStory) {
      setInsightsLoading(true);
      fetchStoryInsights(currentStory.id)
        .then((res) => {
          setViewersList(res.views);
          setLikeCount(res.reactionsCount);
        })
        .finally(() => setInsightsLoading(false));
    }
  }, [showInsights, isOwner, currentStory?.id]);

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

  // Timer loop for auto-progress (pauses when typing a reply, touching, or viewing insights)
  useEffect(() => {
    if (!isOpen || isPaused || isReplyFocused || showInsights || !currentStory || mediaError) {
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
  }, [isOpen, isPaused, isReplyFocused, showInsights, currentStory?.id, currentStory?.media_type, mediaError, videoDurationMs]);

  // Advance story outside state updater to avoid updating HomeView during StoryViewerModal state update
  useEffect(() => {
    if (!isOpen || isPaused || isReplyFocused || showInsights || !currentStory || mediaError) {
      return;
    }
    if (progress >= 100) {
      advanceStory();
    }
  }, [progress, isOpen, isPaused, isReplyFocused, showInsights, currentStory, mediaError, advanceStory]);

  if (!isOpen || !currentStory || !currentGroup) return null;

  const handleToggleLike = async () => {
    if (!currentUserId) {
      onShowToast?.('Please sign in to like this story', 'info');
      return;
    }
    const nextLiked = !isLiked;
    setIsLiked(nextLiked);
    currentStory.has_reacted = nextLiked;
    setLikeCount((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));
    const res = await toggleStoryReaction(currentStory.id, currentUserId, !nextLiked);
    if (!res.success) {
      setIsLiked(!nextLiked);
      currentStory.has_reacted = !nextLiked;
      setLikeCount((prev) => (!nextLiked ? prev + 1 : Math.max(0, prev - 1)));
      onShowToast?.(res.error || 'Could not update reaction', 'error');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 select-none">
      {/* Container simulating mobile story viewport */}
      <div
        className="relative w-full max-w-md h-full max-h-[92vh] sm:rounded-3xl overflow-hidden bg-slate-950 flex flex-col justify-between shadow-2xl"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
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
          <div className="flex items-center space-x-2.5">
            <Avatar
              src={currentGroup.user_avatar}
              name={currentGroup.user_name}
              size="sm"
              className="ring-2 ring-white/60"
            />
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-sm tracking-wide">{currentGroup.user_name}</span>
                <span className="text-xs text-white/70">
                  {new Date(currentStory.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {currentStory.user?.department && (
                <span className="text-[10px] text-white/60 block">{currentStory.user.department}</span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-1">
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
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
            <div className="w-full h-full bg-gradient-to-tr from-indigo-900 via-blue-800 to-sky-700 flex items-center justify-center p-8 text-center">
              <p className="text-white text-xl sm:text-2xl font-bold leading-relaxed tracking-wide drop-shadow-md">
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
              src={currentStory.storage_path || ''}
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
              src={currentStory.storage_path || ''}
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
              <p className="text-white text-sm font-medium drop-shadow-md">{currentStory.caption}</p>
            </div>
          )}
        </div>

        {/* Bottom Bar: Reactions / DM / Insights */}
        <div
          className="relative z-30 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {isOwner ? (
            /* Owner view: See viewers */
            <div className="flex items-center justify-between text-white px-2 py-1">
              <button
                type="button"
                onClick={() => setShowInsights(true)}
                className="min-h-[44px] flex items-center space-x-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all active:scale-95 whitespace-nowrap shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>Activity &amp; Viewers</span>
              </button>

              <div className="flex items-center space-x-1.5 text-rose-400 text-xs font-bold tabular-nums">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <span>{likeCount}</span>
              </div>
            </div>
          ) : (
            /* Viewer view: Reply as DM + Like */
            <div className="flex items-center space-x-2">
              <form onSubmit={handleSendReply} className="flex-1 relative">
                <input
                  type="text"
                  value={replyText}
                  onFocus={() => setIsReplyFocused(true)}
                  onBlur={() => setIsReplyFocused(false)}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Send direct message to ${currentGroup.user_name.split(' ')[0]}...`}
                  className="w-full min-h-[44px] bg-white/20 hover:bg-white/25 focus:bg-white/30 text-white placeholder-white/70 text-xs rounded-xl py-2.5 pl-4 pr-14 border border-white/20 focus:outline-none focus:ring-1 focus:ring-white/50 backdrop-blur-md"
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
                onClick={handleToggleLike}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-transform active:scale-125 ${
                  isLiked ? 'text-rose-500 fill-rose-500' : 'text-white hover:text-rose-400'
                }`}
                title="Like story"
              >
                <svg className="w-6 h-6 stroke-current" fill={isLiked ? 'currentColor' : 'none'} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Viewers & Insights Slide-up Sheet */}
        {showInsights && (
          <div className="absolute inset-x-0 bottom-0 top-1/3 z-40 bg-slate-900 border-t border-slate-800 rounded-t-3xl p-4 flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-white">Story Viewers ({viewersList.length})</span>
                <span className="text-xs text-rose-400 font-medium tabular-nums">({likeCount} likes)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowInsights(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 py-2">
              {insightsLoading ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading viewers...</div>
              ) : viewersList.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No viewers yet. Campus friends who view your story will appear here.
                </div>
              ) : (
                viewersList.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Avatar
                        src={item.viewer?.avatar_url}
                        name={item.viewer?.name || 'Student'}
                        size="sm"
                      />
                      <div>
                        <span className="text-xs font-semibold text-white block">
                          {item.viewer?.name || 'ABSU Student'}
                        </span>
                        {item.viewer?.department && (
                          <span className="text-[10px] text-slate-400">
                            {item.viewer.department} {item.viewer.level ? `· ${item.viewer.level}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 tabular-nums">
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
