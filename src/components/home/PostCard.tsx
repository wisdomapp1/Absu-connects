import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { Post, Comment, PostMediaItem } from '../../types/index.ts';
import { Avatar } from '../common/Avatar.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { LinkifiedText } from '../common/LinkifiedText.tsx';
import { ReelsIcon } from '../common/ReelsIcon.tsx';
import { MR_ANONYMOUS_PAGE_ID } from '../../lib/pageService.ts';
import {
  fetchPostComments,
  countThreadedComments,
  updateRealComment,
  deleteRealComment,
  toggleRealCommentReaction,
} from '../../lib/postService.ts';
import { resolveSinglePostMediaSignedUrl } from '../../lib/storageService.ts';
import {
  buildCloudinaryVideoDeliveryUrl,
  buildCloudinaryVideoPosterUrl,
} from '../../lib/cloudinaryService.ts';
import { createRealNotification } from '../../lib/notificationService.ts';
import { sendPrivacySafePush } from '../../lib/pushService.ts';
import {
  Heart,
  MessageCircle,
  Bookmark,
  MoreHorizontal,
  Globe,
  Users,
  GraduationCap,
  Send,
  Trash2,
  EyeOff,
  Flag,
  Play,
  Pin,
  CornerDownRight,
  Pencil,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';

interface PostCardProps {
  post: Post;
  defaultExpandComments?: boolean;
  highlightCommentId?: string | null;
  highlightParentCommentId?: string | null;
  highlightActorId?: string | null;
  navToken?: number;
  onOpenPost?: (post: Post) => void;
}

const findCommentById = (list: Comment[], id: string): Comment | null => {
  for (const node of list) {
    if (node.id === id) return node;
    if (node.replies && node.replies.length > 0) {
      const found = findCommentById(node.replies, id);
      if (found) return found;
    }
  }
  return null;
};

const findAncestorIdsForComment = (list: Comment[], targetId: string): string[] | null => {
  for (const node of list) {
    if (node.id === targetId) return [];
    if (node.replies && node.replies.length > 0) {
      const childPath = findAncestorIdsForComment(node.replies, targetId);
      if (childPath !== null) {
        return [node.id, ...childPath];
      }
    }
  }
  return null;
};

const findNewestCommentByActor = (list: Comment[], actorId: string): Comment | null => {
  const flat: Comment[] = [];
  const walk = (nodes: Comment[]) => {
    for (const n of nodes) {
      if (n.author.id === actorId) flat.push(n);
      if (n.replies?.length) walk(n.replies);
    }
  };
  walk(list);
  return flat.length > 0 ? flat[flat.length - 1] : null;
};

function formatDurationBadge(seconds?: number | null): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const FeedReelPreviewCard: React.FC<{
  src: string;
  item?: PostMediaItem;
  onOpenReel: () => void;
}> = ({ src, item, onOpenReel }) => {
  const [posterFailed, setPosterFailed] = useState(false);
  const [videoPreviewFailed, setVideoPreviewFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const deliverySrc = buildCloudinaryVideoDeliveryUrl(src, {
    trimStart: item?.trim_start,
    trimEnd: item?.trim_end,
    isMuted: item?.is_muted,
    aspectRatio: item?.aspect_ratio,
  });

  const posterSrc =
    item?.thumbnail_url ||
    buildCloudinaryVideoPosterUrl(src, { timeOffset: item?.trim_start ?? 0 }) ||
    undefined;

  const durationLabel = formatDurationBadge(item?.duration_seconds);

  const aspectClass =
    item?.aspect_ratio === '1:1'
      ? 'aspect-square max-h-[460px]'
      : item?.aspect_ratio === '16:9'
      ? 'aspect-video max-h-[440px]'
      : item?.aspect_ratio === '9:16'
      ? 'aspect-[4/5] max-h-[480px]'
      : 'aspect-[4/5] sm:aspect-video max-h-[460px]';

  if (videoPreviewFailed && (!posterSrc || posterFailed)) {
    return (
      <div className="rounded-2xl bg-neutral-950 p-6 flex flex-col items-center justify-center gap-2.5 text-center min-h-[220px]">
        <p className="text-xs font-semibold text-white">Video preview unavailable</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPosterFailed(false);
              setVideoPreviewFailed(false);
              setRetryKey((k) => k + 1);
            }}
            className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
          <button
            type="button"
            onClick={onOpenReel}
            className="min-h-[44px] px-4 py-1.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Watch Reel</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenReel}
      className={`relative group block w-full rounded-2xl overflow-hidden bg-neutral-950 focus:outline-none ${aspectClass}`}
      aria-label="Open video in Reels"
    >
      {posterSrc && !posterFailed ? (
        <img
          key={`poster_${retryKey}`}
          src={posterSrc}
          alt="Campus reel thumbnail"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setPosterFailed(true)}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <video
          key={`frame_${retryKey}`}
          src={deliverySrc}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            try {
              const targetTime = typeof item?.trim_start === 'number' && item.trim_start > 0 ? item.trim_start : 0.1;
              e.currentTarget.currentTime = targetTime;
            } catch {
              // Ignore seek errors on unseekable streams
            }
          }}
          onError={() => setVideoPreviewFailed(true)}
          className="w-full h-full object-cover pointer-events-none"
        />
      )}

      {/* Subtle gradient scrim for crisp contrast */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-black/25 group-hover:via-black/25 transition-colors" />

      {/* Top-left Reels indicator */}
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-xs text-white text-[11px] font-bold border border-white/15">
        <ReelsIcon className="w-3.5 h-3.5" />
        <span>Reel</span>
        {durationLabel && <span className="text-white/80 tabular-nums">· {durationLabel}</span>}
      </div>

      {/* Centered Play Launcher */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="w-15 h-15 rounded-full bg-black/60 group-hover:bg-[var(--color-primary)]/90 text-white flex items-center justify-center backdrop-blur-xs transition-all duration-200 group-hover:scale-105 group-active:scale-95 shadow-xl ring-2 ring-white/30">
          <Play className="w-7 h-7 ml-1 fill-white" />
        </span>
      </div>
    </button>
  );
};

export const PostCard: React.FC<PostCardProps> = ({
  post,
  defaultExpandComments = false,
  highlightCommentId = null,
  highlightParentCommentId = null,
  highlightActorId = null,
  navToken = 0,
  onOpenPost,
}) => {
  const {
    currentUser,
    activeIdentity,
    managedPages,
    toggleLike,
    toggleSave,
    addComment,
    editPost,
    pinPagePost,
    deletePost,
    hidePost,
    reportPost,
    setImageLightboxUrl,
    navigateTo,
    addToast,
  } = useApp();

  const shouldAutoExpand = Boolean(defaultExpandComments || highlightCommentId || highlightParentCommentId);
  const [commentsExpanded, setCommentsExpanded] = useState(shouldAutoExpand);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<Comment[]>(post.comments || []);
  const [commentCount, setCommentCount] = useState<number>(
    post.commentsCount ?? (post.comments ? countThreadedComments(post.comments) : 0)
  );
  const [loadingComments, setLoadingComments] = useState(false);

  // Sync reactive like / bookmark state for standalone views (e.g., PostDetailView)
  const [localIsLiked, setLocalIsLiked] = useState<boolean>(post.isLiked);
  const [localLikesCount, setLocalLikesCount] = useState<number>(post.likesCount);
  const [localIsSaved, setLocalIsSaved] = useState<boolean>(post.isSaved);

  useEffect(() => {
    setLocalIsLiked(post.isLiked);
    setLocalLikesCount(post.likesCount);
    setLocalIsSaved(post.isSaved);
  }, [post.id, post.isLiked, post.likesCount, post.isSaved]);

  // Threaded reply / edit / collapse / deep-link highlight state
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [activeHighlightCommentId, setActiveHighlightCommentId] = useState<string | null>(null);
  const [missingHighlightNotice, setMissingHighlightNotice] = useState(false);

  // Media error & retry tracking (supports re-signing expired/failed Supabase Storage URLs)
  const [brokenMediaKeys, setBrokenMediaKeys] = useState<Record<string, boolean>>({});
  const [retryingMediaKeys, setRetryingMediaKeys] = useState<Record<string, boolean>>({});
  const [resolvedMediaUrls, setResolvedMediaUrls] = useState<Record<string, string>>({});
  const [mediaRetryCounters, setMediaRetryCounters] = useState<Record<string, number>>({});

  const handleRetryMedia = async (
    mediaKey: string,
    assetId?: string | null,
    currentUrl?: string | null,
    provider?: string | null
  ) => {
    setRetryingMediaKeys((prev) => ({ ...prev, [mediaKey]: true }));
    try {
      const freshUrl = await resolveSinglePostMediaSignedUrl(assetId, currentUrl, provider);
      if (freshUrl) {
        setResolvedMediaUrls((prev) => ({ ...prev, [mediaKey]: freshUrl }));
        setBrokenMediaKeys((prev) => ({ ...prev, [mediaKey]: false }));
      } else {
        setBrokenMediaKeys((prev) => ({ ...prev, [mediaKey]: true }));
      }
    } catch {
      setBrokenMediaKeys((prev) => ({ ...prev, [mediaKey]: true }));
    } finally {
      setMediaRetryCounters((prev) => ({
        ...prev,
        [mediaKey]: (prev[mediaKey] || 0) + 1,
      }));
      setRetryingMediaKeys((prev) => ({ ...prev, [mediaKey]: false }));
    }
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [postEditDraft, setPostEditDraft] = useState(post.content);
  const [savingPostEdit, setSavingPostEdit] = useState(false);

  useEffect(() => {
    if (!isEditingPost) {
      setPostEditDraft(post.content);
    }
  }, [post.content, isEditingPost]);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (post.comments && post.comments.length > 0) {
      setComments(post.comments);
      setCommentCount((prev) =>
        Math.max(prev, countThreadedComments(post.comments), post.commentsCount ?? 0)
      );
    } else if (post.commentsCount !== undefined) {
      setCommentCount((prev) => Math.max(prev, post.commentsCount ?? 0));
    }
  }, [post.comments, post.commentsCount]);

  const reloadComments = async (): Promise<Comment[]> => {
    const loaded = await fetchPostComments(post.id, currentUser.id);
    if (loaded) {
      setComments(loaded);
      setCommentCount(countThreadedComments(loaded));
      return loaded;
    }
    return [];
  };

  // Auto-open comments and scroll/highlight target comment or reply thread for deep links
  useEffect(() => {
    if (!defaultExpandComments && !highlightCommentId && !highlightParentCommentId) {
      return;
    }

    let cancelled = false;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    let clearHighlightTimer: ReturnType<typeof setTimeout> | null = null;

    const runDeepLinkScroll = async () => {
      setCommentsExpanded(true);
      setLoadingComments(true);
      setMissingHighlightNotice(false);

      const loaded = await fetchPostComments(post.id, currentUser.id);
      if (cancelled) return;

      setComments(loaded);
      setCommentCount(countThreadedComments(loaded));
      setLoadingComments(false);

      let resolvedTargetId = highlightCommentId || null;
      if (!resolvedTargetId && highlightActorId && loaded.length > 0) {
        const actorMatch = findNewestCommentByActor(loaded, highlightActorId);
        if (actorMatch) resolvedTargetId = actorMatch.id;
      }

      if (!resolvedTargetId) return;

      const ancestorIds = findAncestorIdsForComment(loaded, resolvedTargetId);
      if (ancestorIds === null) {
        if (highlightCommentId) {
          setMissingHighlightNotice(true);
        }
        return;
      }

      const nextExpanded: Record<string, boolean> = {};
      for (const aid of ancestorIds) {
        nextExpanded[aid] = true;
      }
      if (highlightParentCommentId) {
        nextExpanded[highlightParentCommentId] = true;
      }
      if (Object.keys(nextExpanded).length > 0) {
        setExpandedReplies((prev) => ({ ...prev, ...nextExpanded }));
      }

      setActiveHighlightCommentId(resolvedTargetId);

      // Allow React one commit + paint cycle after expanding reply threads before scrolling
      scrollTimer = setTimeout(() => {
        if (cancelled) return;
        const escapedId = resolvedTargetId!.replace(/"/g, '\\"');
        const targetEl = document.querySelector(`[data-comment-id="${escapedId}"]`);
        if (targetEl && typeof targetEl.scrollIntoView === 'function') {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 120);

      clearHighlightTimer = setTimeout(() => {
        if (!cancelled) {
          setActiveHighlightCommentId((prev) => (prev === resolvedTargetId ? null : prev));
        }
      }, 4000);
    };

    runDeepLinkScroll();

    return () => {
      cancelled = true;
      if (scrollTimer) clearTimeout(scrollTimer);
      if (clearHighlightTimer) clearTimeout(clearHighlightTimer);
    };
  }, [
    post.id,
    defaultExpandComments,
    highlightCommentId,
    highlightParentCommentId,
    highlightActorId,
    navToken,
    currentUser.id,
  ]);

  const handleToggleComments = async () => {
    const nextState = !commentsExpanded;
    setCommentsExpanded(nextState);
    if (nextState) {
      setLoadingComments(true);
      await reloadComments();
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleToggleSave = async () => {
    const prevSaved = localIsSaved;
    setLocalIsSaved(!prevSaved);
    const ok = await toggleSave(post.id, prevSaved);
    if (!ok) {
      setLocalIsSaved(prevSaved);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const textToSubmit = commentText;
    setCommentText('');
    setCommentsExpanded(true);
    setCommentCount((prev) => prev + 1);
    await addComment(post.id, textToSubmit);
    await reloadComments();
  };

  const handleReplySubmit = async (parentId: string) => {
    if (!replyDraft.trim()) return;
    const textToSubmit = replyDraft;
    setReplyDraft('');
    setReplyingToId(null);
    setExpandedReplies((prev) => ({ ...prev, [parentId]: true }));
    setCommentCount((prev) => prev + 1);
    await addComment(post.id, textToSubmit, parentId);
    await reloadComments();
  };

  const handleToggleCommentLike = async (targetCommentId: string) => {
    if (!currentUser.id) {
      addToast('Sign in to like comments.', 'warning');
      return;
    }

    const targetNode = findCommentById(comments, targetCommentId);
    const wasLiked = Boolean(targetNode?.isLiked);

    // Optimistic update strictly targeting ONLY the specific comment or reply ID
    const toggleNode = (list: Comment[]): Comment[] =>
      list.map((node) => {
        if (node.id === targetCommentId) {
          const nextLiked = !node.isLiked;
          return {
            ...node,
            isLiked: nextLiked,
            likesCount: nextLiked ? node.likesCount + 1 : Math.max(0, node.likesCount - 1),
          };
        }
        if (node.replies && node.replies.length > 0) {
          return { ...node, replies: toggleNode(node.replies) };
        }
        return node;
      });

    setComments((prev) => toggleNode(prev));

    const res = await toggleRealCommentReaction(targetCommentId, currentUser.id);
    if (!res.success) {
      addToast(res.error || 'Could not update comment like.', 'warning');
      // Revert strictly the same target ID
      setComments((prev) => toggleNode(prev));
      return;
    }

    // Dispatch privacy-safe notification to the liked comment's author
    if (
      !wasLiked &&
      res.isLiked &&
      targetNode &&
      targetNode.author.id &&
      targetNode.author.id !== currentUser.id &&
      targetNode.author.id !== '0c3240e3-ae39-461d-bd7a-4963859b9bc7'
    ) {
      const qs = new URLSearchParams({
        view: 'post-detail',
        postId: post.id,
        commentId: targetCommentId,
        openComments: '1',
      });
      if (targetNode.parentId) {
        qs.set('parentCommentId', targetNode.parentId);
      }
      const deepUrl = `/?${qs.toString()}`;

      createRealNotification({
        recipientId: targetNode.author.id,
        actorId: currentUser.id,
        type: 'like',
        entityType: 'comment_reaction',
        entityId: targetCommentId,
        postId: post.id,
        commentId: targetCommentId,
        parentCommentId: targetNode.parentId || undefined,
        body: 'liked your comment.',
        senderName: currentUser.name,
        url: deepUrl,
      }).catch(() => {});

      sendPrivacySafePush({
        recipientId: targetNode.author.id,
        type: 'like',
        senderName: currentUser.name,
        url: deepUrl,
      }).catch(() => {});
    }
  };

  const handleSaveEditComment = async (commentId: string) => {
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    const res = await updateRealComment(commentId, currentUser.id, trimmed);
    if (res.success) {
      setEditingCommentId(null);
      setEditDraft('');
      addToast('Comment updated', 'info');
      await reloadComments();
    } else {
      addToast(res.error || 'Could not update comment.', 'warning');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const res = await deleteRealComment(commentId, currentUser.id);
    if (res.success) {
      addToast('Comment deleted', 'info');
      await reloadComments();
    } else {
      addToast(res.error || 'Could not delete comment.', 'warning');
    }
  };

  const isOwnPost = !post.isPagePost && post.author.id === currentUser.id;
  const isPageManagedByMe = Boolean(
    post.isPagePost &&
      post.pageId &&
      managedPages.some((m) => m.page.id === post.pageId && m.page.status === 'active')
  );
  const canManagePost = isOwnPost || isPageManagedByMe;
  const commentsLocked = post.allowComments === false && !isPageManagedByMe;

  const AudienceIcon =
    post.audience === 'Public'
      ? Globe
      : post.audience === 'Campus Only'
      ? GraduationCap
      : Users;

  const navigateToAuthor = (
    authorId: string,
    asPage?: boolean,
    authorPageId?: string | null,
    authorName?: string
  ) => {
    if (asPage && (authorPageId || (authorName || '').toLowerCase() === 'mr anonymous')) {
      navigateTo('page-profile', { pageId: authorPageId || MR_ANONYMOUS_PAGE_ID });
      return;
    }
    if (authorId === currentUser.id) {
      navigateTo('profile');
    } else {
      navigateTo('user-profile', { userId: authorId });
    }
  };

  const handleSavePostEdit = async () => {
    const trimmed = postEditDraft.trim();
    if (!trimmed || savingPostEdit) return;
    setSavingPostEdit(true);
    try {
      const ok = await editPost(post.id, trimmed);
      if (ok) {
        setIsEditingPost(false);
      }
    } finally {
      setSavingPostEdit(false);
    }
  };

  const renderCommentNode = (comment: Comment, isReply = false) => {
    const isCommentOwner = comment.author.id === currentUser.id;
    const isEditing = editingCommentId === comment.id;
    const childReplies = comment.replies || [];
    const repliesVisible = Boolean(expandedReplies[comment.id]);
    const isHighlighted = activeHighlightCommentId === comment.id;

    return (
      <div
        key={comment.id}
        data-comment-id={comment.id}
        className={`flex flex-col gap-2 ${isReply ? 'ml-6 pl-3 border-l border-[var(--color-border)]' : ''}`}
      >
        <div className="flex items-start gap-2.5 text-xs">
          <button
            type="button"
            onClick={() =>
              navigateToAuthor(
                comment.author.id,
                comment.authorAsPage,
                comment.authorPageId,
                comment.author.name
              )
            }
            className="shrink-0 focus:outline-none"
          >
            <Avatar src={comment.author.avatar} name={comment.author.name} size="xs" />
          </button>

          <div
            className={`flex-1 min-w-0 rounded-2xl p-2.5 border transition-all duration-500 ${
              isHighlighted
                ? 'bg-[var(--color-primary-subtle)]/60 border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/40 shadow-sm'
                : 'bg-[var(--color-bg-main)] border-[var(--color-border)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  navigateToAuthor(
                    comment.author.id,
                    comment.authorAsPage,
                    comment.authorPageId,
                    comment.author.name
                  )
                }
                className="font-bold text-[var(--color-text-primary)] hover:text-[var(--color-primary)] truncate text-left flex items-center gap-1"
              >
                <span className="truncate">{comment.author.name}</span>
                {comment.author.isVerified && <VerifiedBadge size={12} />}
              </button>
              <span className="text-[10px] text-[var(--color-text-secondary)] shrink-0">
                {comment.createdAt}
                {comment.isEdited ? ' · edited' : ''}
              </span>
            </div>

            <p className="text-[11px] text-[var(--color-text-secondary)] mb-1">
              {comment.authorAsPage
                ? 'Page'
                : `${comment.author.department} · ${comment.author.level}`}
            </p>

            {isEditing ? (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  type="text"
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck={true}
                  enterKeyHint="done"
                  className="flex-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
                <button
                  type="button"
                  onClick={() => handleSaveEditComment(comment.id)}
                  className="p-1.5 rounded-lg bg-[var(--color-primary)] text-white"
                  title="Save edit"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCommentId(null);
                    setEditDraft('');
                  }}
                  className="p-1.5 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)]"
                  title="Cancel edit"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-[var(--color-text-primary)] leading-normal break-words">
                <LinkifiedText text={comment.content} />
              </p>
            )}

            {/* Comment / Reply action row */}
            <div className="flex items-center gap-3 mt-1.5 pt-1 text-[11px] text-[var(--color-text-secondary)]">
              <button
                type="button"
                onClick={() => handleToggleCommentLike(comment.id)}
                className={`inline-flex items-center gap-1 font-semibold transition-colors ${
                  comment.isLiked
                    ? 'text-[var(--color-badge)]'
                    : 'hover:text-[var(--color-text-primary)]'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${comment.isLiked ? 'fill-current' : ''}`} />
                <span className="tabular-nums">{comment.likesCount}</span>
              </button>

              {!isReply && (
                <button
                  type="button"
                  onClick={() => {
                    setReplyingToId(replyingToId === comment.id ? null : comment.id);
                    setReplyDraft('');
                  }}
                  className="inline-flex items-center gap-1 font-semibold hover:text-[var(--color-primary)]"
                >
                  <CornerDownRight className="w-3 h-3" />
                  <span>Reply</span>
                </button>
              )}

              {isCommentOwner && !isEditing && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCommentId(comment.id);
                      setEditDraft(comment.content);
                    }}
                    className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(comment.id)}
                    className="inline-flex items-center gap-1 hover:text-[var(--color-error)]"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Inline Reply Input */}
        {!isReply && replyingToId === comment.id && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleReplySubmit(comment.id);
            }}
            className="ml-8 flex items-center gap-2"
          >
            <input
              type="text"
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              placeholder={`Reply to ${comment.author.name.split(' ')[0]}...`}
              autoFocus
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck={true}
              enterKeyHint="send"
              className="flex-1 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl px-3 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <button
              type="submit"
              disabled={!replyDraft.trim()}
              className="min-h-[32px] px-3 rounded-xl bg-[var(--color-primary)] text-white text-xs font-semibold disabled:opacity-40"
            >
              Reply
            </button>
          </form>
        )}

        {/* Child Replies Toggle & List */}
        {childReplies.length > 0 && (
          <div className="ml-8 flex flex-col gap-2">
            <button
              type="button"
              onClick={() =>
                setExpandedReplies((prev) => ({
                  ...prev,
                  [comment.id]: !prev[comment.id],
                }))
              }
              className="self-start text-[11px] font-semibold text-[var(--color-primary)] hover:underline"
            >
              {repliesVisible
                ? 'Hide replies'
                : `View ${childReplies.length} ${childReplies.length === 1 ? 'reply' : 'replies'}`}
            </button>

            {repliesVisible && childReplies.map((reply) => renderCommentNode(reply, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <article className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
      {/* Header: Author info, timestamp, audience, options */}
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => {
            if (post.isPagePost || post.pageId) {
              const targetPid =
                post.pageId ||
                post.authorPageId ||
                (post.author.name.toLowerCase() === 'mr anonymous' ? MR_ANONYMOUS_PAGE_ID : null);
              if (targetPid) {
                navigateTo('page-profile', { pageId: targetPid });
              } else {
                navigateTo('user-profile', { userId: post.author.id });
              }
            } else if (isOwnPost) {
              navigateTo('profile');
            } else {
              navigateTo('user-profile', { userId: post.author.id });
            }
          }}
          className="flex items-center gap-3 text-left group min-w-0 focus:outline-none"
        >
          <Avatar src={post.author.avatar} name={post.author.name} size="md" />

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-sm sm:text-base text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                {post.author.name}
              </span>
              {(post.pageIsVerified || post.author.isVerified) && <VerifiedBadge size={15} />}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] mt-0.5">
              <span>{post.isPagePost ? post.pageCategory || 'Page' : post.author.department}</span>
              <span aria-hidden="true">·</span>
              <span>{post.createdAt}</span>
              <span title={post.audience} className="inline-flex items-center">
                <AudienceIcon className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </button>

        {/* Options Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
            aria-label="Post options"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-48 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xl p-1.5 z-20 animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void handleToggleSave();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[36px]"
              >
                <Bookmark className={`w-4 h-4 text-[var(--color-primary)] ${localIsSaved ? 'fill-current' : ''}`} />
                <span>{localIsSaved ? 'Saved' : 'Save Post'}</span>
              </button>

              {isPageManagedByMe && post.pageId && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void pinPagePost(post.pageId!, post.isPinned ? null : post.id);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[36px]"
                >
                  <Pin className="w-4 h-4 text-[var(--color-primary)]" />
                  <span>{post.isPinned ? 'Unpin Post' : 'Pin to Page Top'}</span>
                </button>
              )}

              {canManagePost && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setPostEditDraft(post.content);
                    setIsEditingPost(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[36px]"
                >
                  <Pencil className="w-4 h-4" />
                  <span>Edit Post</span>
                </button>
              )}

              <button
                onClick={() => {
                  hidePost(post.id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[36px]"
              >
                <EyeOff className="w-4 h-4" />
                <span>Hide Post</span>
              </button>

              <button
                onClick={() => {
                  setReportModalOpen(true);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10 rounded-xl transition-colors min-h-[36px]"
              >
                <Flag className="w-4 h-4" />
                <span>Report Content</span>
              </button>

              {canManagePost && (
                <>
                  <div className="h-px bg-[var(--color-border)] my-1" />
                  <button
                    onClick={() => {
                      deletePost(post.id);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-error)] hover:bg-[var(--color-error)]/10 rounded-xl transition-colors min-h-[36px]"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Post</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Category Hashtag or Category Tag (clean unboxed text) */}
      {post.categoryHashtag ? (
        <div className="mt-2 text-xs font-semibold text-[var(--color-primary)] font-mono">
          {post.categoryHashtag}
        </div>
      ) : post.category && post.category !== 'General' ? (
        <div className="mt-2 text-xs font-semibold text-[var(--color-primary)] font-mono">
          #{post.category.replace(/\s+/g, '')}
        </div>
      ) : null}

      {/* Content text or inline edit composer */}
      {isEditingPost ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={postEditDraft}
            onChange={(e) => setPostEditDraft(e.target.value)}
            maxLength={2000}
            rows={4}
            className="w-full rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-primary)]/50 px-3 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-y"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={savingPostEdit}
              onClick={() => {
                setIsEditingPost(false);
                setPostEditDraft(post.content);
              }}
              className="min-h-[36px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingPostEdit || !postEditDraft.trim()}
              onClick={handleSavePostEdit}
              className="min-h-[36px] px-4 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold disabled:opacity-50"
            >
              {savingPostEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={(e) => {
            if (!onOpenPost) return;
            const target = e.target as HTMLElement;
            if (target.closest('a, button')) return;
            onOpenPost(post);
          }}
          className={`mt-3 text-[14px] sm:text-[15px] leading-relaxed text-[var(--color-text-primary)] whitespace-pre-line break-words ${
            onOpenPost ? 'cursor-pointer hover:opacity-90' : ''
          }`}
        >
          <LinkifiedText text={post.content} />
        </div>
      )}

      {/* Media Image or Video Preview */}
      {post.mediaItems && post.mediaItems.length > 1 ? (
        <div className="mt-3 rounded-2xl overflow-hidden border border-[var(--color-border)] bg-black/90 grid grid-cols-2 gap-1">
          {post.mediaItems.slice(0, 4).map((item, idx) => {
            const mediaKey = item.id || `${post.id}_${idx}`;
            const effectiveUrl = resolvedMediaUrls[mediaKey] || item.secure_url || '';
            const isVideo =
              item.kind === 'video' ||
              item.format === 'mp4' ||
              effectiveUrl.includes('/video/') ||
              Boolean(effectiveUrl.match(/\.(mp4|webm|mov|ogg|m4v)(\?.*)?$/i));
            const isSpan = post.mediaItems!.length === 3 && idx === 0;
            const remainingCount = post.mediaItems!.length - 4;
            const isBroken = Boolean(brokenMediaKeys[mediaKey]) || !effectiveUrl;
            const isRetrying = Boolean(retryingMediaKeys[mediaKey]);
            const retryCount = mediaRetryCounters[mediaKey] || 0;

            return (
              <div
                key={mediaKey}
                className={`relative overflow-hidden bg-black/40 min-h-[160px] max-h-[260px] flex items-center justify-center ${
                  isSpan ? 'col-span-2' : ''
                }`}
              >
                {isBroken ? (
                  <div className="p-4 text-center flex flex-col items-center justify-center gap-2">
                    <span className="text-[11px] text-white/85 font-medium">Media could not be loaded</span>
                    <button
                      type="button"
                      disabled={isRetrying}
                      onClick={() => handleRetryMedia(mediaKey, item.asset_id, item.secure_url, item.provider)}
                      className="px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
                      <span>{isRetrying ? 'Retrying...' : 'Retry'}</span>
                    </button>
                  </div>
                ) : isVideo ? (
                  <button
                    type="button"
                    onClick={() => navigateTo('reels', { postId: post.id })}
                    className="w-full h-full relative group block focus:outline-none"
                    aria-label="Watch video in Reels"
                  >
                    {item.thumbnail_url || buildCloudinaryVideoPosterUrl(effectiveUrl, { timeOffset: item.trim_start ?? 0 }) ? (
                      <img
                        key={retryCount}
                        src={
                          item.thumbnail_url ||
                          buildCloudinaryVideoPosterUrl(effectiveUrl, { timeOffset: item.trim_start ?? 0 }) ||
                          undefined
                        }
                        alt={`Reel attachment ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        onError={() => setBrokenMediaKeys((prev) => ({ ...prev, [mediaKey]: true }))}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        key={retryCount}
                        src={buildCloudinaryVideoDeliveryUrl(effectiveUrl, {
                          trimStart: item.trim_start,
                          trimEnd: item.trim_end,
                          isMuted: item.is_muted,
                          aspectRatio: item.aspect_ratio,
                        })}
                        muted
                        playsInline
                        preload="metadata"
                        onError={() => setBrokenMediaKeys((prev) => ({ ...prev, [mediaKey]: true }))}
                        className="w-full h-full object-cover pointer-events-none"
                      />
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-black/25 group-hover:bg-black/35 flex items-center justify-center transition-colors">
                      <span className="w-12 h-12 rounded-full bg-black/60 text-white flex items-center justify-center ring-2 ring-white/30">
                        <Play className="w-5 h-5 ml-0.5 fill-white" />
                      </span>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setImageLightboxUrl(effectiveUrl)}
                    className="w-full h-full block relative group cursor-zoom-in"
                  >
                    <img
                      key={retryCount}
                      src={effectiveUrl}
                      alt={`Post attachment ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      onError={() => setBrokenMediaKeys((prev) => ({ ...prev, [mediaKey]: true }))}
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                      loading="lazy"
                    />
                    {idx === 3 && remainingCount > 0 && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-lg backdrop-blur-xs">
                        +{remainingCount}
                      </div>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (post.mediaUrl || (post.mediaItems && post.mediaItems.length === 1)) ? (
        (() => {
          const singleItem = post.mediaItems?.[0];
          const mediaKey = singleItem?.id || `${post.id}_single`;
          const singleMedia = resolvedMediaUrls[mediaKey] || post.mediaUrl || singleItem?.secure_url || '';
          const isBroken = Boolean(brokenMediaKeys[mediaKey]) || !singleMedia;
          const isRetrying = Boolean(retryingMediaKeys[mediaKey]);
          const retryCount = mediaRetryCounters[mediaKey] || 0;
          const isSingleVideo =
            post.mediaType === 'video' ||
            singleItem?.kind === 'video' ||
            singleMedia.includes('/video/upload/') ||
            Boolean(singleMedia.match(/\.(mp4|webm|mov|ogg|m4v)(\?.*)?$/i));
          return (
            <div className="mt-3 rounded-2xl overflow-hidden border border-[var(--color-border)] bg-black/90">
              {isSingleVideo && !isBroken ? (
                <FeedReelPreviewCard
                  src={singleMedia}
                  item={singleItem}
                  onOpenReel={() => navigateTo('reels', { postId: post.id })}
                />
              ) : isBroken ? (
                <div className="p-6 text-center flex flex-col items-center justify-center gap-2.5 min-h-[180px]">
                  <p className="text-xs font-semibold text-white">Photo could not be loaded</p>
                  <button
                    type="button"
                    disabled={isRetrying}
                    onClick={() =>
                      handleRetryMedia(
                        mediaKey,
                        singleItem?.asset_id,
                        singleItem?.secure_url || post.mediaUrl,
                        singleItem?.provider
                      )
                    }
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                    <span>{isRetrying ? 'Retrying...' : 'Retry Photo'}</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setImageLightboxUrl(singleMedia)}
                  className="w-full block relative group cursor-zoom-in"
                  aria-label="Enlarge campus photo"
                >
                  <img
                    key={retryCount}
                    src={singleMedia}
                    alt="Campus post media"
                    referrerPolicy="no-referrer"
                    onError={() => setBrokenMediaKeys((prev) => ({ ...prev, [mediaKey]: true }))}
                    className="w-full max-h-[420px] object-cover transition-transform duration-300 group-hover:scale-[1.01]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="px-3 py-1.5 rounded-xl bg-black/70 text-white text-xs font-medium backdrop-blur-xs">
                      Tap to expand
                    </span>
                  </div>
                </button>
              )}
            </div>
          );
        })()
      ) : null}

      {/* Reactions count summary */}
      <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] mt-3 pt-2.5 border-t border-[var(--color-border)]">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[var(--color-badge)] tabular-nums">{localLikesCount}</span>
          <span>{localLikesCount === 1 ? 'like' : 'likes'}</span>
        </div>

        <button
          onClick={handleToggleComments}
          className="hover:underline font-medium"
        >
          <span className="tabular-nums">
            {commentsExpanded ? countThreadedComments(comments) : commentCount}
          </span>{' '}
          {commentCount === 1 ? 'comment' : 'comments'}
        </button>
      </div>

      {/* Social Action Bar */}
      <div className="grid grid-cols-3 gap-1 mt-2 pt-1 border-t border-[var(--color-border)]">
        {/* Like Button */}
        <button
          onClick={() => {
            const nextLiked = !localIsLiked;
            setLocalIsLiked(nextLiked);
            setLocalLikesCount((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));
            toggleLike(post.id);
          }}
          className={`min-h-[44px] flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-95 ${
            localIsLiked
              ? 'text-[var(--color-badge)] bg-[var(--color-badge)]/10'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)]'
          }`}
          aria-label={localIsLiked ? 'Unlike post' : 'Like post'}
        >
          <Heart className={`w-4 h-4 ${localIsLiked ? 'fill-current stroke-current' : ''}`} />
          <span>{localIsLiked ? 'Liked' : 'Like'}</span>
        </button>

        {/* Comment Button */}
        <button
          onClick={handleToggleComments}
          className={`min-h-[44px] flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
            commentsExpanded
              ? 'text-[var(--color-primary)] bg-[var(--color-primary-subtle)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)]'
          }`}
          aria-label="Comment on post"
        >
          <MessageCircle className="w-4 h-4" />
          <span>Comment</span>
        </button>

        {/* Save Button */}
        <button
          type="button"
          onClick={handleToggleSave}
          className={`min-h-[44px] flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-95 ${
            localIsSaved
              ? 'text-[var(--color-primary)] bg-[var(--color-primary-subtle)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)]'
          }`}
          aria-label={localIsSaved ? 'Unsave post' : 'Save post'}
        >
          <Bookmark className={`w-4 h-4 ${localIsSaved ? 'fill-current stroke-current' : ''}`} />
          <span>{localIsSaved ? 'Saved' : 'Save'}</span>
        </button>
      </div>

      {/* Expandable Comments Section */}
      {commentsExpanded && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex flex-col gap-3">
          {/* Comment composer (disabled when Page comments are turned off for non-managers) */}
          {commentsLocked ? (
            <p className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-center">
              Comments are turned off for this Page post.
            </p>
          ) : (
            <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
              <Avatar
                src={activeIdentity.type === 'page' ? activeIdentity.page.avatarUrl : currentUser.avatar}
                name={activeIdentity.type === 'page' ? activeIdentity.page.name : currentUser.name}
                size="sm"
              />
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={
                    activeIdentity.type === 'page'
                      ? `Write a comment as ${activeIdentity.page.name}...`
                      : 'Write a comment...'
                  }
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck={true}
                  enterKeyHint="send"
                  className="w-full min-h-[40px] bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl px-4 py-2 text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
              </div>
              <button
                type="submit"
                disabled={!commentText.trim()}
                className="p-2 rounded-xl bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40 transition-opacity min-w-[40px] min-h-[40px] flex items-center justify-center"
                aria-label="Submit comment"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Missing highlighted comment notice */}
          {!loadingComments && missingHighlightNotice && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-center">
              The referenced comment or reply may have been deleted.
            </p>
          )}

          {/* Comments list */}
          {loadingComments ? (
            <p className="text-xs text-[var(--color-text-secondary)] italic text-center py-2">
              Loading comments...
            </p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-[var(--color-text-secondary)] italic text-center py-2">
              No comments yet. Be the first to share your thoughts!
            </p>
          ) : (
            <div className="flex flex-col gap-3 mt-1">
              {comments.map((comment) => renderCommentNode(comment, false))}
            </div>
          )}
        </div>
      )}

      {/* Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">
              Report Post
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              Help us maintain a safe and supportive student community at ABSU.
            </p>

            <div className="flex flex-col gap-1.5 mt-3">
              {[
                'Spam or fake news',
                'Harassment or bullying',
                'Exam malpractice solicitation',
                'Hate speech',
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setReportReason(reason)}
                  className={`min-h-[40px] px-3 py-2 rounded-xl text-xs text-left border transition-colors ${
                    reportReason === reason
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] font-semibold'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-bg-main)] text-[var(--color-text-primary)]'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reportReason}
                onClick={() => {
                  reportPost(post.id, reportReason);
                  setReportModalOpen(false);
                }}
                className="min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-semibold bg-[var(--color-warning)] text-white disabled:opacity-40"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
};
