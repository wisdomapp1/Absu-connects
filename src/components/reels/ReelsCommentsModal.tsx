import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { Comment, Post } from '../../types/index.ts';
import { Avatar } from '../common/Avatar.tsx';
import {
  countThreadedComments,
  deleteRealComment,
  fetchPostComments,
  toggleRealCommentReaction,
  updateRealComment,
} from '../../lib/postService.ts';
import {
  Check,
  CornerDownRight,
  Heart,
  MessageCircle,
  Pencil,
  Send,
  Trash2,
  X,
} from 'lucide-react';

interface ReelsCommentsModalProps {
  post: Post | null;
  isOpen: boolean;
  onClose: () => void;
  onCommentCountChange?: (postId: string, nextCount: number) => void;
  highlightCommentId?: string | null;
  highlightParentCommentId?: string | null;
  highlightActorId?: string | null;
  navToken?: number;
}

const findAncestorIds = (list: Comment[], targetId: string): string[] | null => {
  for (const node of list) {
    if (node.id === targetId) return [];
    if (node.replies?.length) {
      const path = findAncestorIds(node.replies, targetId);
      if (path !== null) return [node.id, ...path];
    }
  }
  return null;
};

const findNewestCommentByActor = (list: Comment[], actorId: string): Comment | null => {
  const matches: Comment[] = [];
  const walk = (nodes: Comment[]) => {
    for (const node of nodes) {
      if (node.author.id === actorId) matches.push(node);
      if (node.replies?.length) walk(node.replies);
    }
  };
  walk(list);
  return matches.length > 0 ? matches[matches.length - 1] : null;
};

export const ReelsCommentsModal: React.FC<ReelsCommentsModalProps> = ({
  post,
  isOpen,
  onClose,
  onCommentCountChange,
  highlightCommentId = null,
  highlightParentCommentId = null,
  highlightActorId = null,
  navToken = 0,
}) => {
  const { currentUser, addComment, navigateTo, addToast } = useApp();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [missingNotice, setMissingNotice] = useState(false);

  const commentElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  const loadComments = async (postId: string) => {
    setLoading(true);
    try {
      const fetched = await fetchPostComments(postId, currentUser.id || undefined);
      setComments(fetched);
      const total = countThreadedComments(fetched);
      onCommentCountChange?.(postId, total);

      // Highlight deep-linked comment or fallback actor comment
      let targetId = highlightCommentId || null;
      if (!targetId && highlightActorId && !highlightParentCommentId) {
        const found = findNewestCommentByActor(fetched, highlightActorId);
        if (found) targetId = found.id;
      }

      if (targetId) {
        const ancestors = findAncestorIds(fetched, targetId);
        if (ancestors !== null) {
          if (ancestors.length > 0) {
            setExpandedReplies((prev) => {
              const next = { ...prev };
              for (const id of ancestors) next[id] = true;
              return next;
            });
          }
          setActiveHighlightId(targetId);
          setMissingNotice(false);
          setTimeout(() => {
            const el = commentElsRef.current.get(targetId!);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 180);
        } else {
          setMissingNotice(true);
        }
      } else if (highlightParentCommentId) {
        setExpandedReplies((prev) => ({ ...prev, [highlightParentCommentId]: true }));
        setActiveHighlightId(highlightParentCommentId);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !post?.id) return;
    setMissingNotice(false);
    setActiveHighlightId(null);
    loadComments(post.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, post?.id, navToken]);

  if (!isOpen || !post) return null;

  const totalCount =
    comments.length > 0 ? countThreadedComments(comments) : (post.commentsCount ?? 0);

  const handleSubmitMain = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await addComment(post.id, trimmed, null);
      setCommentText('');
      await loadComments(post.id);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: string) => {
    const trimmed = replyDraft.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await addComment(post.id, trimmed, parentId);
      setReplyDraft('');
      setReplyingTo(null);
      setExpandedReplies((prev) => ({ ...prev, [parentId]: true }));
      await loadComments(post.id);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleCommentLike = async (commentId: string) => {
    if (!currentUser.id) return;
    const toggleInTree = (list: Comment[]): Comment[] =>
      list.map((c) => {
        if (c.id === commentId) {
          const isLiked = !c.isLiked;
          const likesCount = isLiked ? c.likesCount + 1 : Math.max(0, c.likesCount - 1);
          return { ...c, isLiked, likesCount };
        }
        return {
          ...c,
          replies: c.replies ? toggleInTree(c.replies) : undefined,
        };
      });

    setComments((prev) => toggleInTree(prev));
    const res = await toggleRealCommentReaction(commentId, currentUser.id);
    if (!res.success) {
      setComments((prev) => toggleInTree(prev));
      addToast(res.error || 'Could not update comment reaction', 'warning');
    }
  };

  const handleSaveEdit = async (commentId: string) => {
    const trimmed = editDraft.trim();
    if (!trimmed || !currentUser.id) return;
    const res = await updateRealComment(commentId, currentUser.id, trimmed);
    if (res.success) {
      setEditingId(null);
      setEditDraft('');
      await loadComments(post.id);
      addToast('Comment updated', 'success');
    } else {
      addToast(res.error || 'Could not edit comment', 'warning');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!currentUser.id) return;
    const res = await deleteRealComment(commentId, currentUser.id);
    if (res.success) {
      await loadComments(post.id);
      addToast('Comment deleted', 'info');
    } else {
      addToast(res.error || 'Could not delete comment', 'warning');
    }
  };

  const renderComment = (c: Comment, depth = 0) => {
    const isOwn = c.author.id === currentUser.id;
    const isHighlighted = activeHighlightId === c.id;
    const hasReplies = Boolean(c.replies && c.replies.length > 0);
    const isRepliesExpanded = Boolean(expandedReplies[c.id] || depth === 0);

    return (
      <div
        key={c.id}
        ref={(el) => {
          if (el) commentElsRef.current.set(c.id, el);
          else commentElsRef.current.delete(c.id);
        }}
        className={`${depth > 0 ? 'ml-9 mt-2.5 pl-3 border-l border-[var(--color-border)]' : 'mt-3'} ${
          isHighlighted
            ? 'rounded-2xl bg-[var(--color-primary-subtle)]/50 ring-1 ring-[var(--color-primary)]/40 p-2 -mx-2'
            : ''
        }`}
      >
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigateTo(isOwn ? 'profile' : 'user-profile', { userId: c.author.id });
            }}
            className="shrink-0 mt-0.5"
          >
            <Avatar src={c.author.avatar} name={c.author.name} size="sm" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigateTo(isOwn ? 'profile' : 'user-profile', { userId: c.author.id });
                }}
                className="text-xs font-bold text-[var(--color-text-primary)] hover:underline truncate"
              >
                {c.author.name}
              </button>
              <span className="text-[10px] text-[var(--color-text-secondary)] shrink-0">
                {c.createdAt}
                {c.isEdited ? ' · edited' : ''}
              </span>
            </div>

            {editingId === c.id ? (
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  type="text"
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
                />
                <button
                  type="button"
                  onClick={() => handleSaveEdit(c.id)}
                  className="p-1.5 rounded-lg bg-[var(--color-primary)] text-white"
                  aria-label="Save edit"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setEditDraft('');
                  }}
                  className="p-1.5 rounded-lg bg-[var(--color-bg-main)] text-[var(--color-text-secondary)]"
                  aria-label="Cancel edit"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-primary)] leading-relaxed mt-0.5 break-words">
                {c.content}
              </p>
            )}

            <div className="flex items-center gap-4 mt-1.5">
              <button
                type="button"
                onClick={() => handleToggleCommentLike(c.id)}
                className={`flex items-center gap-1 text-[11px] font-semibold transition-colors ${
                  c.isLiked
                    ? 'text-rose-500'
                    : 'text-[var(--color-text-secondary)] hover:text-rose-500'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${c.isLiked ? 'fill-current' : ''}`} />
                <span>{c.likesCount > 0 ? c.likesCount : 'Like'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setReplyingTo({ id: c.id, name: c.author.name });
                  setReplyDraft('');
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              >
                <CornerDownRight className="w-3 h-3" />
                <span>Reply</span>
              </button>

              {isOwn && editingId !== c.id && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(c.id);
                      setEditDraft(c.content);
                    }}
                    className="text-[11px] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center gap-0.5"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(c.id)}
                    className="text-[11px] font-semibold text-[var(--color-text-secondary)] hover:text-rose-500 flex items-center gap-0.5"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </>
              )}
            </div>

            {replyingTo?.id === c.id && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  placeholder={`Reply to ${c.author.name}...`}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmitReply(c.id);
                    }
                  }}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
                />
                <button
                  type="button"
                  onClick={() => handleSubmitReply(c.id)}
                  disabled={!replyDraft.trim() || submitting}
                  className="px-3 py-1.5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold disabled:opacity-50"
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="p-1.5 rounded-xl text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                  aria-label="Cancel reply"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {hasReplies && !isRepliesExpanded && (
          <button
            type="button"
            onClick={() => setExpandedReplies((prev) => ({ ...prev, [c.id]: true }))}
            className="ml-9 mt-1.5 text-[11px] font-bold text-[var(--color-primary)] hover:underline"
          >
            View {c.replies!.length} {c.replies!.length === 1 ? 'reply' : 'replies'}
          </button>
        )}

        {hasReplies && isRepliesExpanded && (
          <div>{c.replies!.map((reply) => renderComment(reply, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Reel comments"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg h-[75dvh] sm:h-[70vh] bg-[var(--color-bg-card)] rounded-t-3xl sm:rounded-3xl border border-[var(--color-border)] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle + Header */}
        <div className="px-4 pt-2.5 pb-3 border-b border-[var(--color-border)] shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border)] mx-auto mb-2.5 sm:hidden" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-[var(--color-primary)]" />
              <h3 className="text-sm font-extrabold text-[var(--color-text-primary)]">
                Comments ({totalCount})
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
              aria-label="Close comments"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 overscroll-contain">
          {missingNotice && (
            <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              The referenced comment is no longer available, showing current comments for this reel.
            </div>
          )}

          {loading ? (
            <div className="py-8 flex flex-col gap-3">
              {[1, 2, 3].map((idx) => (
                <div key={idx} className="flex items-start gap-2.5 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-[var(--color-border)] shrink-0" />
                  <div className="flex-1 flex flex-col gap-1.5">
                    <div className="w-1/3 h-3 rounded bg-[var(--color-border)]" />
                    <div className="w-3/4 h-3 rounded bg-[var(--color-border)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-2">
              <MessageCircle className="w-9 h-9 text-[var(--color-text-secondary)] opacity-45" />
              <p className="text-sm font-bold text-[var(--color-text-primary)]">No comments yet</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Be the first student to share your thoughts on this reel.
              </p>
            </div>
          ) : (
            <div className="pb-2">{comments.map((c) => renderComment(c, 0))}</div>
          )}
        </div>

        {/* Sticky Comment Input */}
        <form
          onSubmit={handleSubmitMain}
          className="px-3.5 py-2.5 border-t border-[var(--color-border)] bg-[var(--color-bg-card)] flex items-center gap-2.5 shrink-0 pb-[max(0.65rem,env(safe-area-inset-bottom))]"
        >
          <Avatar src={currentUser.avatar} name={currentUser.name} size="sm" />
          <input
            ref={inputRef}
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 px-3.5 py-2 rounded-full bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] outline-none focus:border-[var(--color-primary)]"
          />
          <button
            type="submit"
            disabled={!commentText.trim() || submitting}
            className="min-w-[44px] min-h-[44px] rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white flex items-center justify-center disabled:opacity-45 transition-all active:scale-95"
            aria-label="Send comment"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
