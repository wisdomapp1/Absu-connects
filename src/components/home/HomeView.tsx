import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { PostComposer } from './PostComposer.tsx';
import { AnonymousPostFeedCard } from './AnonymousPostFeedCard.tsx';
import { AnonymousIntroModal } from '../anonymous/AnonymousIntroModal.tsx';
import { AnonymousSubmissionModal } from '../anonymous/AnonymousSubmissionModal.tsx';
import { DiscoverPeopleRow } from './DiscoverPeopleRow.tsx';
import { FeedFilters } from './FeedFilters.tsx';
import { PostCard } from './PostCard.tsx';
import { filterPosts } from '../../utils/logic.ts';
import { Loader2, Sparkles } from 'lucide-react';

export const HomeView: React.FC = () => {
  const {
    posts,
    loadingPosts,
    loadingMorePosts,
    hasMorePosts,
    loadMorePosts,
    feedFilter,
    setCreatePostModalOpen,
    refreshPosts,
  } = useApp();
  const [anonIntroOpen, setAnonIntroOpen] = useState(false);
  const [anonSubmitOpen, setAnonSubmitOpen] = useState(false);

  const displayedPosts = filterPosts(posts, feedFilter);

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Post Composer */}
      <PostComposer onOpenAnonymous={() => setAnonIntroOpen(true)} />

      {/* 1b. Post Anonymously Card (Directly below composer) */}
      <AnonymousPostFeedCard onOpenIntro={() => setAnonIntroOpen(true)} />

      {/* 2. Discover People Carousel */}
      <DiscoverPeopleRow />

      {/* 3. Feed Filters */}
      <div className="py-1">
        <FeedFilters />
      </div>

      {/* 4. Posts List */}
      {loadingPosts ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="p-5 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] animate-pulse flex flex-col gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--color-border)]" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="h-3 w-28 bg-[var(--color-border)] rounded-md" />
                  <div className="h-2.5 w-40 bg-[var(--color-border)] rounded-md" />
                </div>
              </div>
              <div className="h-4 w-full bg-[var(--color-border)] rounded-md mt-1" />
              <div className="h-4 w-3/4 bg-[var(--color-border)] rounded-md" />
            </div>
          ))}
        </div>
      ) : displayedPosts.length === 0 ? (
        <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">
              No posts found in this filter
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1 max-w-xs mx-auto">
              {feedFilter === 'friends'
                ? "Connect with coursemates in the Friends tab to see their posts here."
                : "Be the first to share an official campus update or study question!"}
            </p>
          </div>
          <button
            onClick={() => setCreatePostModalOpen(true)}
            className="mt-2 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold shadow-xs hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Create Post
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {displayedPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {hasMorePosts && (
            <button
              onClick={loadMorePosts}
              disabled={loadingMorePosts}
              className="w-full py-3 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loadingMorePosts ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading older posts...</span>
                </>
              ) : (
                <span>Load older posts</span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Anonymous Submissions Modals */}
      <AnonymousIntroModal
        isOpen={anonIntroOpen}
        onClose={() => setAnonIntroOpen(false)}
        onContinue={() => {
          setAnonIntroOpen(false);
          setAnonSubmitOpen(true);
        }}
      />

      <AnonymousSubmissionModal
        isOpen={anonSubmitOpen}
        onClose={() => setAnonSubmitOpen(false)}
        onSubmitted={() => {
          refreshPosts();
        }}
      />
    </div>
  );
};
