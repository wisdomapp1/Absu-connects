import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Post } from '../../types/index.ts';
import { fetchSinglePostById } from '../../lib/postService.ts';
import { PostCard } from './PostCard.tsx';
import { ArrowLeft, AlertCircle, Lock, RefreshCw } from 'lucide-react';

type LoadState = 'loading' | 'ok' | 'not_found' | 'restricted' | 'error';

export const PostDetailView: React.FC = () => {
  const {
    selectedPostId,
    selectedPostNavContext,
    posts,
    currentUser,
    goBack,
  } = useApp();
  const { loading: authLoading } = useAuth();

  const cachedPost = selectedPostId
    ? posts.find((p) => p.id === selectedPostId) || null
    : null;

  const [fetchedPost, setFetchedPost] = useState<Post | null>(null);
  const [loadState, setLoadState] = useState<LoadState>(cachedPost ? 'ok' : 'loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const loadPost = useCallback(async () => {
    if (!selectedPostId) {
      setLoadState('not_found');
      setErrorMessage('This post could not be found.');
      return;
    }

    if (authLoading && !cachedPost) {
      setLoadState('loading');
      return;
    }

    if (!cachedPost) {
      setLoadState('loading');
    }
    setErrorMessage('');

    const result = await fetchSinglePostById(selectedPostId, currentUser.id || undefined);
    if (result.status === 'ok' && result.post) {
      setFetchedPost(result.post);
      setLoadState('ok');
    } else if (result.status === 'not_found') {
      setFetchedPost(null);
      setLoadState('not_found');
      setErrorMessage(result.error || 'This post may have been deleted.');
    } else if (result.status === 'restricted') {
      setFetchedPost(null);
      setLoadState('restricted');
      setErrorMessage(result.error || 'You do not have permission to view this post.');
    } else if (!cachedPost) {
      setLoadState('error');
      setErrorMessage(result.error || 'Unable to load this post right now.');
    }
  }, [selectedPostId, currentUser.id, authLoading, cachedPost]);

  useEffect(() => {
    setFetchedPost(null);
    loadPost();
  }, [selectedPostId, currentUser.id, authLoading]);

  // Prefer live reactive fields from context if the post is in feed state, enriched with fetched details
  const activePost: Post | null =
    loadState === 'not_found' || loadState === 'restricted'
      ? null
      : cachedPost && fetchedPost
      ? {
          ...fetchedPost,
          isLiked: cachedPost.isLiked,
          likesCount: cachedPost.likesCount,
          isSaved: cachedPost.isSaved,
          commentsCount: Math.max(
            cachedPost.commentsCount ?? 0,
            fetchedPost.commentsCount ?? 0
          ),
        }
      : cachedPost || fetchedPost;

  return (
    <div className="flex flex-col gap-3">
      {/* Top Back Bar */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl px-3.5 py-2.5 flex items-center gap-3 shadow-xs">
        <button
          type="button"
          onClick={goBack}
          className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-extrabold text-[var(--color-text-primary)] truncate">
            Post
          </h1>
        </div>
      </div>

      {/* Content */}
      {loadState === 'loading' && !activePost ? (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 flex flex-col gap-3 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--color-border)] shrink-0" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="w-1/3 h-3.5 rounded bg-[var(--color-border)]" />
              <div className="w-1/4 h-2.5 rounded bg-[var(--color-border)]" />
            </div>
          </div>
          <div className="w-full h-4 rounded bg-[var(--color-border)] mt-2" />
          <div className="w-4/5 h-4 rounded bg-[var(--color-border)]" />
        </div>
      ) : activePost ? (
        <PostCard
          key={activePost.id}
          post={activePost}
          defaultExpandComments={Boolean(
            selectedPostNavContext?.openComments ||
              selectedPostNavContext?.commentId ||
              selectedPostNavContext?.parentCommentId
          )}
          highlightCommentId={selectedPostNavContext?.commentId || null}
          highlightParentCommentId={selectedPostNavContext?.parentCommentId || null}
          highlightActorId={selectedPostNavContext?.actorId || null}
          navToken={selectedPostNavContext?.navToken || 0}
        />
      ) : (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3 shadow-xs">
          {loadState === 'restricted' ? (
            <Lock className="w-10 h-10 text-[var(--color-text-secondary)] opacity-60" />
          ) : (
            <AlertCircle className="w-10 h-10 text-[var(--color-text-secondary)] opacity-60" />
          )}
          <h2 className="text-sm font-bold text-[var(--color-text-primary)]">
            {loadState === 'restricted'
              ? 'Post Not Accessible'
              : loadState === 'error'
              ? 'Could Not Load Post'
              : 'Post Unavailable'}
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] max-w-xs">
            {errorMessage || 'This post may have been removed or is no longer available.'}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {loadState === 'error' && (
              <button
                type="button"
                onClick={loadPost}
                className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-90"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            )}
            <button
              type="button"
              onClick={goBack}
              className="px-4 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] hover:border-[var(--color-primary)]"
            >
              Go Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
