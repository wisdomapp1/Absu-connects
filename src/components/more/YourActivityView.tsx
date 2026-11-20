import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { PostCard } from '../home/PostCard.tsx';
import { ArrowLeft, Activity, Heart, MessageSquare, Bookmark, FileText, Plus } from 'lucide-react';

export const YourActivityView: React.FC = () => {
  const { currentUser, posts, goBack, setCreatePostModalOpen } = useApp();

  const myPosts = posts.filter((p) => p.author.id === currentUser.id);
  const totalLikes = myPosts.reduce((acc, p) => acc + (p.likesCount || 0), 0);
  const totalComments = myPosts.reduce((acc, p) => acc + (p.comments?.length || 0), 0);
  const totalSaved = posts.filter((p) => p.isSaved).length;

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)]">
                Your Activity
              </h1>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                Summary of your engagement and contributions across ABSU Connect.
              </p>
            </div>
          </div>
          <button
            onClick={() => setCreatePostModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold hover:bg-[var(--color-primary-hover)] transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Post</span>
          </button>
        </div>

        {/* Real Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-[var(--color-border)]">
          <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-center">
            <div className="flex items-center justify-center gap-1.5 text-[var(--color-primary)] mb-1">
              <FileText className="w-4 h-4" />
              <span className="text-lg font-extrabold">{myPosts.length}</span>
            </div>
            <p className="text-[11px] font-semibold text-[var(--color-text-secondary)]">Posts Published</p>
          </div>

          <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-center">
            <div className="flex items-center justify-center gap-1.5 text-red-500 mb-1">
              <Heart className="w-4 h-4 fill-current" />
              <span className="text-lg font-extrabold">{totalLikes}</span>
            </div>
            <p className="text-[11px] font-semibold text-[var(--color-text-secondary)]">Likes Received</p>
          </div>

          <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-center">
            <div className="flex items-center justify-center gap-1.5 text-blue-500 mb-1">
              <MessageSquare className="w-4 h-4 fill-current" />
              <span className="text-lg font-extrabold">{totalComments}</span>
            </div>
            <p className="text-[11px] font-semibold text-[var(--color-text-secondary)]">Comments</p>
          </div>

          <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-center">
            <div className="flex items-center justify-center gap-1.5 text-amber-500 mb-1">
              <Bookmark className="w-4 h-4 fill-current" />
              <span className="text-lg font-extrabold">{totalSaved}</span>
            </div>
            <p className="text-[11px] font-semibold text-[var(--color-text-secondary)]">Saved Items</p>
          </div>
        </div>
      </div>

      {/* Your Recent Posts */}
      <div>
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] px-1 mb-2">
          Your Published Posts ({myPosts.length})
        </h2>

        {myPosts.length === 0 ? (
          <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center gap-2">
            <FileText className="w-10 h-10 text-[var(--color-text-secondary)] opacity-40" />
            <p className="text-sm font-bold text-[var(--color-text-primary)]">
              You haven't posted anything yet
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] max-w-xs">
              Share updates, ask coursemates questions, or announce campus events to see your activity here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {myPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
