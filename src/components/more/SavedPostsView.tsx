import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { fetchSavedPosts } from '../../lib/postService.ts';
import type { Post } from '../../types/index.ts';
import { PostCard } from '../home/PostCard.tsx';
import { ArrowLeft, Bookmark, Sparkles, Loader2 } from 'lucide-react';

export const SavedPostsView: React.FC = () => {
  const { posts, currentUser, goBack, navigateTo } = useApp();
  const [hydratedSaved, setHydratedSaved] = useState<Post[] | null>(null);
  const [loading, setLoading] = useState(true);

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
  const savedPosts = React.useMemo(() => {
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

  return (
    <div className="flex flex-col gap-4">
      {/* Back to More */}
      <button
        onClick={goBack}
        className="self-start flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors min-h-[36px]"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to More</span>
      </button>

      {/* Header */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center">
            <Bookmark className="w-4 h-4" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)]">
            Saved Posts
          </h1>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Important announcements, academic notes, and peer discussions you saved for later.
        </p>
      </div>

      {/* Content */}
      {loading && savedPosts.length === 0 ? (
        <div className="p-10 flex items-center justify-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : savedPosts.length === 0 ? (
        <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)]">
            <Bookmark className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
              No saved posts yet
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] max-w-sm mt-1">
              Tap the bookmark icon on any post in your campus feed to save it here for quick reference.
            </p>
          </div>
          <button
            onClick={() => navigateTo('home')}
            className="mt-2 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold hover:bg-[var(--color-primary-hover)] transition-all flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Explore Campus Feed</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {savedPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
};
