import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { PostComposer } from './PostComposer.tsx';
import { AnonymousPostFeedCard } from './AnonymousPostFeedCard.tsx';
import { AnonymousIntroModal } from '../anonymous/AnonymousIntroModal.tsx';
import { AnonymousSubmissionModal } from '../anonymous/AnonymousSubmissionModal.tsx';
import { DiscoverPeopleRow } from './DiscoverPeopleRow.tsx';
import { FeedFilters } from './FeedFilters.tsx';
import { PostCard } from './PostCard.tsx';
import { StoriesBar } from '../stories/StoriesBar.tsx';
import { CreateStoryModal } from '../stories/CreateStoryModal.tsx';
import { StoryViewerModal } from '../stories/StoryViewerModal.tsx';
import { fetchActiveStories, sortStoryGroups } from '../../lib/storyService.ts';
import type { UserStoryGroup } from '../../types/stories.ts';
import { filterPosts } from '../../utils/logic.ts';
import { Loader2, Sparkles } from 'lucide-react';

export const HomeView: React.FC = () => {
  const {
    currentUser,
    posts,
    loadingPosts,
    loadingMorePosts,
    hasMorePosts,
    loadMorePosts,
    feedFilter,
    setCreatePostModalOpen,
    refreshPosts,
    addToast,
  } = useApp();
  const [anonIntroOpen, setAnonIntroOpen] = useState(false);
  const [anonSubmitOpen, setAnonSubmitOpen] = useState(false);

  // Stories state
  const [storyGroups, setStoryGroups] = useState<UserStoryGroup[]>([]);
  const [loadingStories, setLoadingStories] = useState<boolean>(true);
  const [createStoryOpen, setCreateStoryOpen] = useState<boolean>(false);
  const [storyViewerOpen, setStoryViewerOpen] = useState<boolean>(false);
  const [selectedStoryGroupIdx, setSelectedStoryGroupIdx] = useState<number>(0);

  const loadStories = useCallback(async () => {
    if (!currentUser.id) {
      setStoryGroups([]);
      setLoadingStories(false);
      return;
    }
    try {
      const groups = await fetchActiveStories(currentUser.id);
      setStoryGroups(groups);
    } finally {
      setLoadingStories(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    setLoadingStories(true);
    loadStories();
  }, [loadStories]);

  const handleStoryViewed = useCallback(
    (storyId: string) => {
      setStoryGroups((prev) =>
        sortStoryGroups(
          prev.map((g) => ({
            ...g,
            stories: g.stories.map((s) =>
              s.id === storyId ? { ...s, has_viewed: true } : s
            ),
          })),
          currentUser.id || undefined
        )
      );
    },
    [currentUser.id]
  );

  const handleStoryDeleted = useCallback(
    (storyId: string) => {
      setStoryGroups((prev) =>
        sortStoryGroups(
          prev
            .map((g) => ({
              ...g,
              stories: g.stories.filter((s) => s.id !== storyId),
            }))
            .filter((g) => g.stories.length > 0),
          currentUser.id || undefined
        )
      );
    },
    [currentUser.id]
  );

  const displayedPosts = filterPosts(posts, feedFilter);

  return (
    <div className="flex flex-col gap-4">
      {/* 0. Campus Stories Bar */}
      <StoriesBar
        currentUserId={currentUser.id || undefined}
        currentUserProfile={{
          name: currentUser.name,
          avatar_url: currentUser.avatar,
        }}
        storyGroups={storyGroups}
        loading={loadingStories}
        onSelectGroup={(idx) => {
          setSelectedStoryGroupIdx(idx);
          setStoryViewerOpen(true);
        }}
        onAddStory={() => setCreateStoryOpen(true)}
      />

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

      {/* Stories Modals */}
      <CreateStoryModal
        isOpen={createStoryOpen}
        onClose={() => setCreateStoryOpen(false)}
        userId={currentUser.id}
        onStoryCreated={loadStories}
        onShowToast={(msg, type) =>
          addToast(msg, type === 'error' ? 'warning' : type || 'info')
        }
      />

      <StoryViewerModal
        isOpen={storyViewerOpen}
        onClose={() => setStoryViewerOpen(false)}
        storyGroups={storyGroups}
        initialGroupIndex={selectedStoryGroupIdx}
        currentUserId={currentUser.id}
        onStoryDeleted={handleStoryDeleted}
        onStoryViewed={handleStoryViewed}
        onShowToast={(msg, type) =>
          addToast(msg, type === 'error' ? 'warning' : type || 'info')
        }
      />

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
