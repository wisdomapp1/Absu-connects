import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { fetchSavedPosts } from '../../lib/postService.ts';
import { isVideoPost } from '../../lib/reelsService.ts';
import type { Post } from '../../types/index.ts';
import { PostCard } from '../home/PostCard.tsx';
import { ReelsIcon } from '../common/ReelsIcon.tsx';
import { ArrowLeft, Bookmark, Sparkles, Loader2 } from 'lucide-react';

export const SavedPostsView: React.FC = () => {
  const { posts, currentUser, goBack, navigateTo } = useApp();
  const [hydratedSaved, setHydratedSaved] = useState<Post[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'reels'>('all');

  useEffect(() => {
    let cancelled = false;
    if (!currentUser.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchSavedPosts(currentUser.id)
      .then((list) => {
        if (!cancelled) {
          setHydratedSaved(list);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser.id]);

  // Merge context saved posts + hydrated DB saved posts cleanly without duplicates
  const savedPosts = useMemo(() => {
    const contextSaved = posts.filter((p) => p.isSaved);
    const contextMap = new Map(posts.map((p) => [p.id, p]));
    const merged = new Map<string, Post>();

    for (const p of contextSaved) {
      merged.set(p.id, p);
    }
    for (const dbPost of hydratedSaved || []) {
      const liveVersion = contextMap.get(dbPost.id);
      if (liveVersion) {
        if (liveVersion.isSaved) merged.set(liveVersion.id, liveVersion);
      } else {
        merged.set(dbPost.id, dbPost);
      }
    }
    return Array.from(merged.values());
  }, [posts, hydratedSaved]);

  const savedReels = useMemo(
    () => savedPosts.filter((post) => isVideoPost(post)),
    [savedPosts]
  );

  const displayedPosts = filterTab === 'reels' ? savedReels : savedPosts;

  return (
    <div className="flex flex-col gap-4">
      {/* Back to More */}
      <button
        onClick={goBack}
        className="self-start flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors min-h-[44px]"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to More</span>
      </button>

      {/* Header & Filter Strip */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm transition-colors">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center">
              <Bookmark className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)]">
              Saved Posts
            </h1>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Announcements, lecture notes, discussions, and Reels bookmarked for later.
          </p>
        </div>

        <div className="flex border-t border-[var(--color-border)] bg-[var(--color-bg-main)] px-4">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`min-h-[44px] px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              filterTab === 'all'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>All Saved ({savedPosts.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('reels')}
            className={`min-h-[44px] px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              filterTab === 'reels'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <ReelsIcon className="w-3.5 h-3.5" />
            <span>Saved Reels ({savedReels.length})</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && displayedPosts.length === 0 ? (
        <div className="p-10 flex items-center justify-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : displayedPosts.length === 0 ? (
        <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)]">
            {filterTab === 'reels' ? (
              <ReelsIcon className="w-6 h-6" />
            ) : (
              <Bookmark className="w-6 h-6" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
              {filterTab === 'reels' ? 'No saved Reels yet' : 'No saved posts yet'}
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] max-w-sm mt-1">
              {filterTab === 'reels'
                ? 'Tap the bookmark icon while watching Reels to save videos here for quick replay.'
                : 'Tap the bookmark icon on any post or Reel to save it here for quick reference.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigateTo(filterTab === 'reels' ? 'reels' : 'home')}
            className="mt-2 min-h-[44px] px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold hover:bg-[var(--color-primary-hover)] transition-all flex items-center gap-1.5"
          >
            {filterTab === 'reels' ? (
              <>
                <ReelsIcon className="w-3.5 h-3.5" />
                <span>Explore Reels</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Explore Campus Feed</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayedPosts.map((post) => {
            const hasVideo = isVideoPost(post);
            return (
              <div key={post.id} className="flex flex-col gap-1.5">
                {hasVideo && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)]">
                    <span className="text-[11px] font-bold text-[var(--color-text-secondary)] flex items-center gap-1.5">
                      <ReelsIcon className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>Saved Video Reel</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => navigateTo('reels', { postId: post.id })}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <ReelsIcon className="w-3.5 h-3.5" />
                      <span>Watch in Reels</span>
                    </button>
                  </div>
                )}
                <PostCard post={post} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

