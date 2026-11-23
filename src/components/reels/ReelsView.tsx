import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { Post } from '../../types/index.ts';
import {
  fetchReelsFeedPage,
  fetchSingleReelById,
  getPrimaryVideoMediaItem,
  isVideoPost,
  mergeAndDedupeReels,
  normalizePostForReels,
} from '../../lib/reelsService.ts';
import {
  buildCloudinaryVideoDeliveryUrl,
  buildCloudinaryVideoPosterUrl,
} from '../../lib/cloudinaryService.ts';
import { resolveSinglePostMediaSignedUrl } from '../../lib/storageService.ts';
import { Avatar } from '../common/Avatar.tsx';
import { ReelsCommentsModal } from './ReelsCommentsModal.tsx';
import { ReelsSearchModal } from './ReelsSearchModal.tsx';
import { ReelsUploadModal } from './ReelsUploadModal.tsx';
import { ReelsIcon } from '../common/ReelsIcon.tsx';
import {
  ArrowLeft,
  Bookmark,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Heart,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  RefreshCw,
  Search,
  UserPlus,
  Volume2,
  VolumeX,
} from 'lucide-react';

function formatCompactCount(n: number): string {
  if (!n || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

interface ReelSlideProps {
  post: Post;
  isActive: boolean;
  shouldPreload: boolean;
  globalMuted: boolean;
  onToggleGlobalMute: () => void;
  onLike: (postId: string) => void;
  onSave: (post: Post) => void;
  onOpenComments: (post: Post) => void;
  onOpenHashtag: (tag: string) => void;
}

const ReelSlide: React.FC<ReelSlideProps> = ({
  post,
  isActive,
  shouldPreload,
  globalMuted,
  onToggleGlobalMute,
  onLike,
  onSave,
  onOpenComments,
  onOpenHashtag,
}) => {
  const {
    currentUser,
    users,
    navigateTo,
    sendFriendRequest,
    cancelFriendRequest,
  } = useApp();

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoItem = getPrimaryVideoMediaItem(post);
  const rawSrc = videoItem?.secure_url || post.mediaUrl || '';

  const [resolvedSrc, setResolvedSrc] = useState<string>(() =>
    buildCloudinaryVideoDeliveryUrl(rawSrc, {
      trimStart: videoItem?.trim_start,
      trimEnd: videoItem?.trim_end,
      isMuted: videoItem?.is_muted,
      aspectRatio: videoItem?.aspect_ratio,
    })
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [tapFeedback, setTapFeedback] = useState<'play' | 'pause' | null>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [progressRatio, setProgressRatio] = useState(0);

  useEffect(() => {
    setHasError(false);
    setResolvedSrc(
      buildCloudinaryVideoDeliveryUrl(rawSrc, {
        trimStart: videoItem?.trim_start,
        trimEnd: videoItem?.trim_end,
        isMuted: videoItem?.is_muted,
        aspectRatio: videoItem?.aspect_ratio,
      })
    );
  }, [rawSrc, videoItem?.trim_start, videoItem?.trim_end, videoItem?.is_muted, videoItem?.aspect_ratio]);

  const posterUrl =
    videoItem?.thumbnail_url ||
    buildCloudinaryVideoPosterUrl(rawSrc, { timeOffset: videoItem?.trim_start ?? 0 }) ||
    undefined;

  const isClientTrimmed =
    !rawSrc.includes('/video/upload/') &&
    typeof videoItem?.trim_start === 'number' &&
    typeof videoItem?.trim_end === 'number' &&
    videoItem.trim_end > videoItem.trim_start;

  const effectiveMuted = globalMuted || Boolean(videoItem?.is_muted);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (isActive && !hasError) {
      if (isClientTrimmed && typeof videoItem?.trim_start === 'number') {
        if (vid.currentTime < videoItem.trim_start || (videoItem.trim_end && vid.currentTime > videoItem.trim_end)) {
          vid.currentTime = videoItem.trim_start;
        }
      }
      vid.muted = effectiveMuted;
      const playPromise = vid.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Browsers may block unmuted autoplay before first user tap; fall back cleanly to muted playback
          vid.muted = true;
          vid.play().catch(() => {});
        });
      }
    } else {
      vid.pause();
      setIsPlaying(false);
    }
  }, [isActive, hasError, effectiveMuted, isClientTrimmed, videoItem?.trim_start, videoItem?.trim_end]);

  const handleTogglePlayPause = () => {
    const vid = videoRef.current;
    if (!vid || hasError) return;
    if (vid.paused) {
      vid.muted = effectiveMuted;
      vid.play().catch(() => {
        vid.muted = true;
        vid.play().catch(() => {});
      });
      setTapFeedback('play');
    } else {
      vid.pause();
      setTapFeedback('pause');
    }
    setTimeout(() => setTapFeedback(null), 550);
  };

  const handleRetryVideo = async () => {
    setHasError(false);
    setIsBuffering(true);
    if (videoItem?.asset_id && !rawSrc.includes('res.cloudinary.com')) {
      const fresh = await resolveSinglePostMediaSignedUrl(videoItem.asset_id, rawSrc).catch(() => null);
      if (fresh) {
        setResolvedSrc(fresh);
        setIsBuffering(false);
        return;
      }
    }
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
    setIsBuffering(false);
  };

  // Author relationship resolution from live context
  const liveAuthor = users.find((u) => u.id === post.author.id);
  const relState =
    post.author.id === currentUser.id
      ? 'self'
      : liveAuthor?.relationshipState || post.author.relationshipState || 'none';
  const isOwnOrPage = relState === 'self' || Boolean(post.pageId || post.isPagePost);

  const handleFollowAction = () => {
    if (relState === 'request_sent') {
      cancelFriendRequest(post.author.id);
    } else if (relState === 'none') {
      sendFriendRequest(post.author.id);
    }
  };

  const renderCaptionWithHashtags = (text: string) => {
    const tokens = text.split(/(#[a-zA-Z0-9_]+)/g);
    return tokens.map((part, idx) => {
      if (/^#[a-zA-Z0-9_]+$/.test(part)) {
        return (
          <button
            key={`${part}_${idx}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenHashtag(part);
            }}
            className="text-sky-300 hover:text-sky-200 font-bold hover:underline"
          >
            {part}
          </button>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="relative w-full h-full snap-start snap-always shrink-0 bg-black flex items-center justify-center overflow-hidden select-none">
      {/* Video Player Surface */}
      {hasError ? (
        <div className="flex flex-col items-center justify-center gap-3 text-center px-6">
          <ReelsIcon className="w-10 h-10 text-white/40" />
          <p className="text-sm font-bold text-white">Video could not be loaded</p>
          <p className="text-xs text-white/60 max-w-xs">
            Check your network connection or reload this reel.
          </p>
          <button
            type="button"
            onClick={handleRetryVideo}
            className="min-h-[44px] px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Video</span>
          </button>
        </div>
      ) : (
        <video
          ref={videoRef}
          src={resolvedSrc}
          poster={posterUrl}
          loop
          playsInline
          muted={effectiveMuted}
          preload={isActive || shouldPreload ? 'auto' : 'metadata'}
          onClick={handleTogglePlayPause}
          onPlay={() => {
            setIsPlaying(true);
            setIsBuffering(false);
          }}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsBuffering(true)}
          onCanPlay={() => setIsBuffering(false)}
          onPlaying={() => setIsBuffering(false)}
          onTimeUpdate={(e) => {
            const vid = e.currentTarget;
            if (isClientTrimmed && typeof videoItem?.trim_end === 'number' && vid.currentTime >= videoItem.trim_end) {
              vid.currentTime = videoItem.trim_start || 0;
            }
            if (vid.duration && Number.isFinite(vid.duration)) {
              setProgressRatio(Math.min(1, Math.max(0, vid.currentTime / vid.duration)));
            }
          }}
          onError={() => {
            setIsBuffering(false);
            setHasError(true);
          }}
          className="w-full h-full object-contain cursor-pointer"
        />
      )}

      {/* Center Play/Pause Feedback or Buffering */}
      {!hasError && (isBuffering || !isPlaying || tapFeedback) && (
        <button
          type="button"
          onClick={handleTogglePlayPause}
          aria-label={isPlaying ? 'Pause reel' : 'Play reel'}
          className={`absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/55 backdrop-blur-xs text-white flex items-center justify-center transition-opacity ${
            !isPlaying && !isBuffering ? 'cursor-pointer ring-2 ring-white/25' : 'pointer-events-none'
          }`}
        >
          {isBuffering ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : tapFeedback === 'pause' || !isPlaying ? (
            <Play className="w-8 h-8 fill-white ml-1" />
          ) : (
            <Pause className="w-8 h-8 fill-white" />
          )}
        </button>
      )}

      {/* Bottom Scrim & Creator Overlay */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />

      <div className="absolute bottom-3 left-3.5 right-16 z-20 flex flex-col gap-2 text-white">
        {/* Creator Identity + Follow */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() =>
              navigateTo(post.author.id === currentUser.id ? 'profile' : 'user-profile', {
                userId: post.author.id,
              })
            }
            className="flex items-center gap-2 min-w-0 group"
          >
            <Avatar src={post.author.avatar} name={post.author.name} size="sm" />
            <div className="text-left min-w-0">
              <p className="text-sm font-extrabold text-white drop-shadow-sm truncate max-w-[180px] group-hover:underline">
                {post.author.name}
              </p>
              <p className="text-[11px] text-white/75 truncate">
                {post.author.handle || '@student'} · {post.createdAt}
              </p>
            </div>
          </button>

          {!isOwnOrPage && relState !== 'friends' && (
            <button
              type="button"
              onClick={handleFollowAction}
              className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 transition-all active:scale-95 ${
                relState === 'request_sent'
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white shadow-sm'
              }`}
            >
              {relState === 'request_sent' ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Requested</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add Friend</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Caption & Hashtags */}
        {post.content && (
          <div className="text-xs sm:text-sm text-white/95 leading-snug drop-shadow-xs">
            <p className={captionExpanded ? '' : 'line-clamp-2'}>
              {renderCaptionWithHashtags(post.content)}
            </p>
            {post.content.length > 90 && (
              <button
                type="button"
                onClick={() => setCaptionExpanded((v) => !v)}
                className="text-[11px] font-bold text-white/75 hover:text-white mt-0.5"
              >
                {captionExpanded ? 'Show less' : 'See more'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right Vertical Social Action Stack */}
      <div className="absolute bottom-4 right-2.5 z-20 flex flex-col items-center gap-3.5">
        <button
          type="button"
          onClick={() => onLike(post.id)}
          className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1 text-white active:scale-90 transition-transform"
          aria-label={post.isLiked ? 'Unlike reel' : 'Like reel'}
        >
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xs transition-colors ${
              post.isLiked ? 'bg-rose-500/25 text-rose-500' : 'bg-black/45 text-white hover:bg-black/65'
            }`}
          >
            <Heart className={`w-6 h-6 ${post.isLiked ? 'fill-current' : ''}`} />
          </div>
          <span className="text-[11px] font-bold drop-shadow-sm">
            {formatCompactCount(post.likesCount)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onOpenComments(post)}
          className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1 text-white active:scale-90 transition-transform"
          aria-label="Open reel comments"
        >
          <div className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-xs flex items-center justify-center">
            <MessageCircle className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-bold drop-shadow-sm">
            {formatCompactCount(post.commentsCount ?? post.comments.length)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSave(post)}
          className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1 text-white active:scale-90 transition-transform"
          aria-label={post.isSaved ? 'Remove reel bookmark' : 'Save reel'}
        >
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xs transition-colors ${
              post.isSaved
                ? 'bg-[var(--color-primary)]/80 text-white'
                : 'bg-black/45 text-white hover:bg-black/65'
            }`}
          >
            <Bookmark className={`w-5 h-5 ${post.isSaved ? 'fill-current' : ''}`} />
          </div>
          <span className="text-[11px] font-bold drop-shadow-sm">
            {post.isSaved ? 'Saved' : 'Save'}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleGlobalMute}
          className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center text-white active:scale-90 transition-transform"
          aria-label={effectiveMuted ? 'Unmute reels audio' : 'Mute reels audio'}
        >
          <div className="w-10 h-10 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-xs flex items-center justify-center">
            {effectiveMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </div>
        </button>
      </div>

      {/* Bottom Hairline Progress */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 z-20 pointer-events-none">
        <div
          className="h-full bg-white transition-[width] duration-150"
          style={{ width: `${Math.round(progressRatio * 100)}%` }}
        />
      </div>
    </div>
  );
};

export const ReelsView: React.FC = () => {
  const {
    currentUser,
    posts,
    selectedPostId,
    selectedPostNavContext,
    toggleLike,
    toggleSave,
    navigateTo,
    goBack,
  } = useApp();

  const containerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const postsRef = useRef<Post[]>(posts);
  postsRef.current = posts;

  const [reels, setReels] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const nextCursorRef = useRef<string | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  // Session-scoped header rule: show top "Reels" + Search + Camera header ONLY on first video until user swipes away
  const [hasSwipedAway, setHasSwipedAway] = useState(false);
  const [globalMuted, setGlobalMuted] = useState(false);

  const [commentsPost, setCommentsPost] = useState<Post | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchSeedQuery, setSearchSeedQuery] = useState('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [missingTargetPost, setMissingTargetPost] = useState(false);

  const getContextFeedVideos = useCallback(() => {
    return postsRef.current.filter((p) => isVideoPost(p)).map(normalizePostForReels);
  }, []);

  const loadInitialReels = useCallback(
    async (focusPostId?: string | null) => {
      setLoading(true);
      setMissingTargetPost(false);
      try {
        const page = await fetchReelsFeedPage({
          currentUserId: currentUser.id || undefined,
          limit: 12,
        });
        const feedVideos = getContextFeedVideos();
        let list = mergeAndDedupeReels(page.reels, feedVideos);

        if (focusPostId) {
          const existingIdx = list.findIndex((p) => p.id === focusPostId);
          if (existingIdx > 0) {
            const target = list[existingIdx];
            list = [target, ...list.filter((p) => p.id !== focusPostId)];
          } else if (existingIdx === -1) {
            const fromContext = feedVideos.find((p) => p.id === focusPostId);
            if (fromContext) {
              list = [fromContext, ...list];
            } else {
              const single = await fetchSingleReelById(focusPostId, currentUser.id || undefined);
              if (single) {
                list = [single, ...list];
              } else {
                setMissingTargetPost(true);
                setReels([]);
                setHasMore(false);
                nextCursorRef.current = null;
                setActiveIndex(0);
                return;
              }
            }
          }
        }

        setReels(list);
        setHasMore(page.hasMore);
        nextCursorRef.current = page.nextCursor;
        setActiveIndex(0);

        requestAnimationFrame(() => {
          containerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
        });

        // Deep-linked notification opening comments automatically
        if (
          focusPostId &&
          (selectedPostNavContext?.openComments ||
            selectedPostNavContext?.commentId ||
            selectedPostNavContext?.parentCommentId)
        ) {
          const focused = list.find((p) => p.id === focusPostId);
          if (focused) {
            setCommentsPost(focused);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [currentUser.id, selectedPostNavContext, getContextFeedVideos]
  );

  useEffect(() => {
    setHasSwipedAway(false);
    loadInitialReels(selectedPostId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, selectedPostId, selectedPostNavContext?.navToken]);

  // Keep Reels synchronized if Home feed posts finish loading after Reels mounts
  useEffect(() => {
    const contextVideos = posts.filter((p) => isVideoPost(p)).map(normalizePostForReels);
    if (contextVideos.length === 0) return;

    if (selectedPostId && missingTargetPost) {
      const recovered = contextVideos.find((p) => p.id === selectedPostId);
      if (!recovered) return;
      setMissingTargetPost(false);
      setReels([recovered, ...contextVideos.filter((p) => p.id !== selectedPostId)]);
      return;
    }

    setReels((prev) => {
      if (prev.length === 0) {
        if (selectedPostId) {
          const focused = contextVideos.find((p) => p.id === selectedPostId);
          return focused ? [focused, ...contextVideos.filter((p) => p.id !== selectedPostId)] : prev;
        }
        return contextVideos;
      }
      const existingIds = new Set(prev.map((p) => p.id));
      const missing = contextVideos.filter((p) => !existingIds.has(p.id));
      if (missing.length === 0) return prev;
      const merged = [...prev, ...missing];
      if (selectedPostId) {
        const target = merged.find((p) => p.id === selectedPostId);
        if (target && merged[0]?.id !== selectedPostId) {
          return [target, ...merged.filter((p) => p.id !== selectedPostId)];
        }
      }
      return merged;
    });
  }, [posts, selectedPostId, missingTargetPost]);

  // Listen to new video posts created anywhere (Home or ReelsUploadModal) and deletions
  useEffect(() => {
    const handlePostCreated = (evt: Event) => {
      const created = (evt as CustomEvent<{ post?: Post }>).detail?.post;
      if (!created || !isVideoPost(created)) return;
      const normalized = normalizePostForReels(created);
      setReels((prev) => {
        if (prev.some((p) => p.id === normalized.id)) return prev;
        return [normalized, ...prev];
      });
      setActiveIndex(0);
      requestAnimationFrame(() => {
        containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      });
    };

    const handlePostDeleted = (evt: Event) => {
      const deletedId = (evt as CustomEvent<{ postId?: string }>).detail?.postId;
      if (!deletedId) return;
      setReels((prev) => prev.filter((p) => p.id !== deletedId));
    };

    const handleRefresh = () => {
      loadInitialReels(null);
    };

    const handleResetTop = () => {
      setHasSwipedAway(false);
      setActiveIndex(0);
      containerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    };

    const handleSavedChanged = (evt: Event) => {
      const detail = (evt as CustomEvent<{ postId?: string; isSaved?: boolean }>).detail;
      if (!detail?.postId || typeof detail.isSaved !== 'boolean') return;
      setReels((prev) =>
        prev.map((p) => (p.id === detail.postId ? { ...p, isSaved: detail.isSaved! } : p))
      );
    };

    window.addEventListener('absu:post-created', handlePostCreated);
    window.addEventListener('absu:post-deleted', handlePostDeleted);
    window.addEventListener('absu:refresh-reels', handleRefresh);
    window.addEventListener('absu:reels-reset-top', handleResetTop);
    window.addEventListener('absu:saved-posts-changed', handleSavedChanged);
    return () => {
      window.removeEventListener('absu:post-created', handlePostCreated);
      window.removeEventListener('absu:post-deleted', handlePostDeleted);
      window.removeEventListener('absu:refresh-reels', handleRefresh);
      window.removeEventListener('absu:reels-reset-top', handleResetTop);
      window.removeEventListener('absu:saved-posts-changed', handleSavedChanged);
    };
  }, [loadInitialReels]);

  const loadMoreReels = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchReelsFeedPage({
        currentUserId: currentUser.id || undefined,
        cursor,
        limit: 8,
      });
      setReels((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const appended = page.reels.filter((p) => !seen.has(p.id));
        return [...prev, ...appended];
      });
      setHasMore(page.hasMore);
      nextCursorRef.current = page.nextCursor;
    } finally {
      setLoadingMore(false);
    }
  }, [currentUser.id, loadingMore, hasMore]);

  // Track currently visible slide with IntersectionObserver
  useEffect(() => {
    const root = containerRef.current;
    if (!root || reels.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestIdx = -1;
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            const idxAttr = entry.target.getAttribute('data-reel-index');
            if (idxAttr !== null) {
              bestIdx = Number(idxAttr);
              bestRatio = entry.intersectionRatio;
            }
          }
        }
        if (bestIdx >= 0) {
          setActiveIndex(bestIdx);
          if (bestIdx >= 1) {
            setHasSwipedAway(true);
          }
        }
      },
      { root, threshold: [0.55, 0.75, 0.9] }
    );

    slideRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [reels.length]);

  useEffect(() => {
    if (reels.length > 0 && activeIndex >= reels.length - 2) {
      loadMoreReels();
    }
  }, [activeIndex, reels.length, loadMoreReels]);

  const scrollToSlide = (targetIdx: number) => {
    const clamped = Math.max(0, Math.min(reels.length - 1, targetIdx));
    const el = slideRefs.current.get(clamped);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Keyboard Up / Down arrow navigation on desktop
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (commentsPost || searchModalOpen || uploadModalOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        scrollToSlide(activeIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        scrollToSlide(activeIndex - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, reels.length, commentsPost, searchModalOpen, uploadModalOpen]);

  const handleLikeReel = (postId: string) => {
    setReels((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const isLiked = !p.isLiked;
          const likesCount = isLiked ? p.likesCount + 1 : Math.max(0, p.likesCount - 1);
          return { ...p, isLiked, likesCount };
        }
        return p;
      })
    );
    toggleLike(postId);
  };

  const handleSaveReel = async (post: Post) => {
    const prevSaved = post.isSaved;
    const nextSaved = !prevSaved;
    setReels((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, isSaved: nextSaved } : p))
    );
    const ok = await toggleSave(post.id, prevSaved);
    if (!ok) {
      setReels((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, isSaved: prevSaved } : p))
      );
    }
  };

  const handleSelectSearchReel = (selected: Post) => {
    const normalized = normalizePostForReels(selected);
    const existingIdx = reels.findIndex((r) => r.id === normalized.id);
    if (existingIdx >= 0) {
      setActiveIndex(existingIdx);
      if (existingIdx >= 1) setHasSwipedAway(true);
      requestAnimationFrame(() => scrollToSlide(existingIdx));
    } else {
      setReels((prev) => [normalized, ...prev]);
      setActiveIndex(0);
      requestAnimationFrame(() => {
        containerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      });
    }
  };

  // Session-scoped header ONLY shows on first video view until the user swipes down to video 2+
  const showFirstVideoHeader = activeIndex === 0 && !hasSwipedAway;

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black md:bg-transparent">
      <div className="relative w-full h-full md:max-w-[430px] md:h-[calc(100dvh-6rem)] md:rounded-3xl md:overflow-hidden md:border md:border-[var(--color-border)] md:shadow-2xl bg-black">
        {/* Session-Scoped Top Header ("Reels" + Search + Camera) — visible ONLY on initial first video view */}
        {showFirstVideoHeader && (
          <div className="absolute top-0 left-0 right-0 z-30 pt-[max(0.75rem,env(safe-area-inset-top))] px-4 pb-8 bg-gradient-to-b from-black/75 via-black/35 to-transparent flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              {selectedPostId && (
                <button
                  type="button"
                  onClick={goBack}
                  className="min-w-[44px] min-h-[44px] -ml-2 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-xs text-white flex items-center justify-center transition-colors"
                  aria-label="Back to feed"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <h1 className="text-xl font-extrabold tracking-tight text-white drop-shadow-sm">
                Reels
              </h1>
            </div>
            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={() => {
                  setSearchSeedQuery('');
                  setSearchModalOpen(true);
                }}
                className="min-w-[44px] min-h-[44px] rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-xs text-white flex items-center justify-center transition-colors"
                aria-label="Search Reels"
              >
                <Search className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setUploadModalOpen(true)}
                className="min-w-[44px] min-h-[44px] rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-xs text-white flex items-center justify-center transition-colors"
                aria-label="Upload Reel"
              >
                <Camera className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Feed Body */}
        {loading && reels.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-white">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            <p className="text-xs font-semibold text-white/75">Loading Campus Reels...</p>
          </div>
        ) : missingTargetPost ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
            <div className="w-16 h-16 rounded-3xl bg-white/10 flex items-center justify-center">
              <ReelsIcon className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-base font-extrabold">Reel Unavailable</h2>
            <p className="text-xs text-white/70 max-w-xs">
              This video post may have been deleted or is no longer accessible.
            </p>
            <div className="flex items-center gap-2.5 mt-1">
              <button
                type="button"
                onClick={goBack}
                className="min-h-[44px] px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Go Back</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMissingTargetPost(false);
                  navigateTo('reels');
                }}
                className="min-h-[44px] px-5 py-2 rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold shadow-lg"
              >
                Browse All Reels
              </button>
            </div>
          </div>
        ) : reels.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
            <div className="w-16 h-16 rounded-3xl bg-white/10 flex items-center justify-center">
              <ReelsIcon className="w-8 h-8 text-[var(--color-primary)]" />
            </div>
            <h2 className="text-base font-extrabold">No Reels Yet</h2>
            <p className="text-xs text-white/65 max-w-xs">
              Be the first student on campus to post a short video! Videos published on Home or here appear automatically in Reels.
            </p>
            <button
              type="button"
              onClick={() => setUploadModalOpen(true)}
              className="min-h-[44px] px-5 py-2.5 rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-2 shadow-lg"
            >
              <Camera className="w-4 h-4" />
              <span>Create First Reel</span>
            </button>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="w-full h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar"
          >
            {reels.map((post, idx) => (
              <div
                key={post.id}
                data-reel-index={idx}
                ref={(el) => {
                  if (el) slideRefs.current.set(idx, el);
                  else slideRefs.current.delete(idx);
                }}
                className="w-full h-full snap-start snap-always"
              >
                <ReelSlide
                  post={post}
                  isActive={activeIndex === idx}
                  shouldPreload={Math.abs(activeIndex - idx) <= 1}
                  globalMuted={globalMuted}
                  onToggleGlobalMute={() => setGlobalMuted((m) => !m)}
                  onLike={handleLikeReel}
                  onSave={handleSaveReel}
                  onOpenComments={(p) => setCommentsPost(p)}
                  onOpenHashtag={(tag) => {
                    setSearchSeedQuery(tag);
                    setSearchModalOpen(true);
                  }}
                />
              </div>
            ))}

            {loadingMore && (
              <div className="w-full py-6 flex items-center justify-center text-white/70 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs font-semibold">Loading more reels...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop Keyboard-Friendly Up / Down Controls */}
      {reels.length > 1 && (
        <div className="hidden md:flex flex-col gap-2 ml-4">
          <button
            type="button"
            disabled={activeIndex === 0}
            onClick={() => scrollToSlide(activeIndex - 1)}
            className="w-11 h-11 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-[var(--color-primary)] disabled:opacity-35 flex items-center justify-center shadow-sm transition-all"
            aria-label="Previous reel"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
          <button
            type="button"
            disabled={activeIndex >= reels.length - 1}
            onClick={() => scrollToSlide(activeIndex + 1)}
            className="w-11 h-11 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-[var(--color-primary)] disabled:opacity-35 flex items-center justify-center shadow-sm transition-all"
            aria-label="Next reel"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Comments Drawer */}
      <ReelsCommentsModal
        post={commentsPost}
        isOpen={Boolean(commentsPost)}
        onClose={() => setCommentsPost(null)}
        onCommentCountChange={(postId, nextCount) => {
          setReels((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, commentsCount: nextCount } : p))
          );
          setCommentsPost((prev) =>
            prev && prev.id === postId ? { ...prev, commentsCount: nextCount } : prev
          );
        }}
        highlightCommentId={selectedPostNavContext?.commentId || null}
        highlightParentCommentId={selectedPostNavContext?.parentCommentId || null}
        highlightActorId={selectedPostNavContext?.actorId || null}
        navToken={selectedPostNavContext?.navToken || 0}
      />

      {/* Video-Only Reels Search */}
      <ReelsSearchModal
        isOpen={searchModalOpen}
        initialQuery={searchSeedQuery}
        seedReels={reels}
        onClose={() => setSearchModalOpen(false)}
        onSelectReel={handleSelectSearchReel}
      />

      {/* Reels Video Upload */}
      <ReelsUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onPublished={() => loadInitialReels(null)}
      />
    </div>
  );
};
