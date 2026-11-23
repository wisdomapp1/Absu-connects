import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchMrAnonymousPage,
  toggleFollowPage,
  checkIsPageManager,
  fetchPagePosts,
} from '../../lib/pageService.ts';
import type { Page } from '../../types/pages.ts';
import type { Post } from '../../types/index.ts';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { PostCard } from '../home/PostCard.tsx';
import { AnonymousIntroModal } from '../anonymous/AnonymousIntroModal.tsx';
import { AnonymousSubmissionModal } from '../anonymous/AnonymousSubmissionModal.tsx';
import { EditPageModal } from './EditPageModal.tsx';
import {
  ShieldCheck,
  EyeOff,
  ArrowLeft,
  Check,
  Plus,
  Loader2,
  FileText,
  Info,
  Image as ImageIcon,
  MapPin,
  Calendar,
  Lock,
  Sparkles,
  CheckCircle2,
  Users,
  Edit3,
} from 'lucide-react';

export const MrAnonymousPageView: React.FC = () => {
  const { navigateTo, addToast, isSuperAdmin, setImageLightboxUrl, refreshPosts } = useApp();
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [page, setPage] = useState<Page | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);

  // Tabs: 'posts' (default), 'about', 'photos'
  const [activeTab, setActiveTab] = useState<'posts' | 'about' | 'photos'>('posts');

  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  // Modals for anonymous submission & editing
  const [introModalOpen, setIntroModalOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const pageData = await fetchMrAnonymousPage(currentUserId);
      if (pageData) {
        setPage(pageData);
        setIsFollowing(Boolean(pageData.isFollowing));
        setFollowersCount(pageData.followersCount || 0);

        // Check manager status (for Edit Page)
        if (currentUserId) {
          const managerCheck = await checkIsPageManager(pageData.id, currentUserId);
          setIsManager(managerCheck || isSuperAdmin);
        }

        // Load all published posts for this page
        const pagePosts = await fetchPagePosts(pageData.id, currentUserId);
        setPosts(pagePosts);
      }
    } catch (err) {
      console.warn('[MrAnonymousPage] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, isSuperAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFollowToggle = async () => {
    if (!page || !currentUserId || followLoading) return;

    setFollowLoading(true);
    const nextState = !isFollowing;
    setIsFollowing(nextState);
    setFollowersCount((prev) => (nextState ? prev + 1 : Math.max(0, prev - 1)));

    try {
      const success = await toggleFollowPage(page.id, currentUserId, isFollowing);
      if (success) {
        addToast(
          nextState ? '🎉 Following Mr Anonymous!' : 'Unfollowed Mr Anonymous.',
          'info'
        );
      } else {
        // Rollback on failure
        setIsFollowing(!nextState);
        setFollowersCount((prev) => (nextState ? Math.max(0, prev - 1) : prev + 1));
        addToast('Could not update follow status.', 'warning');
      }
    } catch {
      setIsFollowing(!nextState);
      setFollowersCount((prev) => (nextState ? Math.max(0, prev - 1) : prev + 1));
    } finally {
      setFollowLoading(false);
    }
  };

  // Collect all photos from posts
  const postPhotos = posts.flatMap((p) => {
    const list: string[] = [];
    if (p.mediaUrl && p.mediaType !== 'video') {
      list.push(p.mediaUrl);
    }
    if (p.mediaItems) {
      p.mediaItems.forEach((m) => {
        if (m.kind === 'image' && m.secure_url) {
          list.push(m.secure_url);
        }
      });
    }
    return list;
  });

  const totalPublishedPosts = page?.postsCount ?? posts.length;

  if (loading && !page) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-[var(--color-text-secondary)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)] mb-3" />
        <p className="text-xs font-semibold">Loading Mr Anonymous...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-12">
      {/* 1. SOCIAL PROFILE HEADER & BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs transition-colors">
        {/* Cover Photo / Banner */}
        <div className="h-40 sm:h-52 w-full bg-gradient-to-r from-violet-950 via-purple-900 to-indigo-950 relative overflow-hidden">
          {/* Subtle geometric pattern overlay */}
          <div
            className="absolute inset-0 opacity-15"
            style={{
              backgroundImage:
                'radial-gradient(circle at 25px 25px, white 2%, transparent 0%), radial-gradient(circle at 75px 75px, white 2%, transparent 0%)',
              backgroundSize: '100px 100px',
            }}
          />

          {/* Top Bar Actions */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
            <button
              onClick={() => navigateTo('home')}
              className="p-2.5 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all active:scale-95"
              aria-label="Back to feed"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Profile Card Body (overlapping cover) */}
        <div className="px-5 pb-6 sm:px-7 sm:pb-7 relative">
          {/* Profile Picture & Top Row */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-14 sm:-mt-16 mb-4">
            {/* Avatar */}
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-3xl ring-4 ring-[var(--color-bg-card)] shadow-2xl overflow-hidden bg-slate-900 shrink-0">
              <img
                src={page?.avatarUrl || '/pwa-192x192.png'}
                alt="Mr Anonymous"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Action Buttons: Follow + Post Anonymously */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                onClick={handleFollowToggle}
                disabled={followLoading}
                className={`px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${
                  isFollowing
                    ? 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-rose-500 hover:border-rose-500/30'
                    : 'bg-violet-600 hover:bg-violet-700 text-white'
                }`}
              >
                {isFollowing ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Follow</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setIntroModalOpen(true)}
                className="px-5 py-2.5 rounded-2xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs sm:text-sm font-bold shadow-md shadow-[var(--color-primary)]/20 transition-all flex items-center gap-2 active:scale-95"
              >
                <EyeOff className="w-4 h-4" />
                <span>Post anonymously</span>
              </button>

              {isManager && (
                <button
                  onClick={() => setEditModalOpen(true)}
                  className="px-4 py-2.5 rounded-2xl bg-[var(--color-bg-main)] hover:bg-[var(--color-border)] text-[var(--color-text-main)] border border-[var(--color-border)] text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 active:scale-95"
                  title="Edit page branding and information"
                >
                  <Edit3 className="w-4 h-4 text-violet-500" />
                  <span>Edit Page</span>
                </button>
              )}
            </div>
          </div>

          {/* Page Identity & Badges */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-[var(--color-text-primary)] tracking-tight">
                {page?.name || 'Mr Anonymous'}
              </h1>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-600/15 text-violet-700 dark:text-violet-300 text-[11px] font-bold"
                title="Verified Official Campus Page"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                <span>Official Community Page</span>
              </span>
            </div>

            <p className="text-xs sm:text-sm text-violet-600 dark:text-violet-400 font-bold">
              @{page?.slug || 'mr-anonymous'} · <span className="text-[var(--color-text-secondary)] font-normal">Media &amp; News Company</span>
            </p>

            {/* Description / Bio */}
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed mt-1 max-w-2xl">
              {page?.description ||
                'An open, identity-protected space for ABSU confessions, campus gist, student experiences, questions, advice, and discussions.'}
            </p>

            {/* Meta Tags: Campus, Category, Followers, Posts */}
            <div className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)] font-medium mt-2 flex-wrap pt-2 border-t border-[var(--color-border)]/60">
              <div className="flex items-center gap-1.5 text-[var(--color-text-primary)] font-bold">
                <Users className="w-4 h-4 text-[var(--color-primary)]" />
                <span>{followersCount.toLocaleString()}</span>
                <span className="text-[var(--color-text-secondary)] font-normal">
                  {followersCount === 1 ? 'Follower' : 'Followers'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[var(--color-text-primary)] font-bold">
                <FileText className="w-4 h-4 text-[var(--color-primary)]" />
                <span>{totalPublishedPosts.toLocaleString()}</span>
                <span className="text-[var(--color-text-secondary)] font-normal">
                  {totalPublishedPosts === 1 ? 'Post' : 'Posts'}
                </span>
              </div>

              <div className="flex items-center gap-1 text-[var(--color-text-secondary)]">
                <MapPin className="w-3.5 h-3.5 text-violet-500" />
                <span>Abia State University (Uturu &amp; Umuahia)</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. PROFILE NAVIGATION TABS */}
        <div className="flex items-center gap-1 px-5 sm:px-7 border-t border-[var(--color-border)] bg-[var(--color-bg-main)]/40 overflow-x-auto hide-scrollbar">
          <button
            onClick={() => setActiveTab('posts')}
            className={`py-3.5 px-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'posts'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Posts</span>
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)] font-extrabold">
              {posts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('about')}
            className={`py-3.5 px-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'about'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Info className="w-4 h-4" />
            <span>About</span>
          </button>

          <button
            onClick={() => setActiveTab('photos')}
            className={`py-3.5 px-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'photos'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Photos</span>
            {postPhotos.length > 0 && (
              <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-[var(--color-border)] text-[var(--color-text-secondary)] font-bold">
                {postPhotos.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. TAB CONTENTS */}
      {/* TAB A: POSTS FEED */}
      {activeTab === 'posts' && (
        <div className="flex flex-col gap-4">
          {posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-3xl">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 text-violet-600 flex items-center justify-center mb-3">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                No published posts yet
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1 max-w-sm">
                Have a campus confession, question, or story to share? Submit it anonymously to get published on Mr Anonymous!
              </p>
              <button
                onClick={() => setIntroModalOpen(true)}
                className="mt-4 px-5 py-2.5 rounded-2xl bg-[var(--color-primary)] text-white text-xs font-bold shadow-sm"
              >
                Post anonymously
              </button>
            </div>
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </div>
      )}

      {/* TAB B: ABOUT PAGE */}
      {activeTab === 'about' && (
        <div className="flex flex-col gap-4">
          {/* Page Details Card */}
          <div className="p-5 sm:p-6 rounded-3xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs flex flex-col gap-4">
            <h3 className="text-sm sm:text-base font-extrabold text-[var(--color-text-primary)] flex items-center gap-2">
              <Info className="w-4 h-4 text-[var(--color-primary)]" />
              <span>About Mr Anonymous</span>
            </h3>

            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
              Mr Anonymous is the official community confessions &amp; gist page of Abia State University on ABSU Connect. It provides a safe, identity-protected platform for students to express thoughts, share confessions, discuss campus issues, ask for academic and relationship advice, and publish anonymously in real time.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--color-border)]">
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-[var(--color-bg-main)]">
                <ShieldCheck className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-[var(--color-text-primary)]">Page Type</p>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">Official Community Page · Media &amp; News</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-[var(--color-bg-main)]">
                <MapPin className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-[var(--color-text-primary)]">Location</p>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">Abia State University, Uturu &amp; Umuahia</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-[var(--color-bg-main)]">
                <Calendar className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-[var(--color-text-primary)]">Audience</p>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">All ABSU students, faculties, and alumni</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-[var(--color-bg-main)]">
                <Lock className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-[var(--color-text-primary)]">Privacy Guarantee</p>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">100% Submitter Anonymity Ensured</p>
                </div>
              </div>
            </div>
          </div>

          {/* Anonymity Charter Card */}
          <div className="p-5 sm:p-6 rounded-3xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs flex flex-col gap-3.5">
            <h3 className="text-sm sm:text-base font-extrabold text-[var(--color-text-primary)] flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-500" />
              <span>Anonymity &amp; Privacy Charter</span>
            </h3>

            <div className="space-y-2.5 text-xs text-[var(--color-text-secondary)] leading-relaxed">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>No Personal Info Exposed:</strong> Every published post appears strictly under the name and avatar of &quot;Mr Anonymous&quot;. Your student name, matric number, and email are never shown.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Instant Publishing:</strong> Anonymous posts are automatically approved and published immediately to the campus feed upon submission.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Campus Safety:</strong> Posts that violate campus safety, dox others, or harass students remain subject to community safety removal.</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setIntroModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Submit a Story Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB C: PHOTOS GRID */}
      {activeTab === 'photos' && (
        <div className="p-5 sm:p-6 rounded-3xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[var(--color-text-primary)]">
                Photos from Mr Anonymous
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                Images and media shared in Mr Anonymous community posts
              </p>
            </div>
            <span className="text-xs font-bold text-[var(--color-text-secondary)]">
              {postPhotos.length} {postPhotos.length === 1 ? 'photo' : 'photos'}
            </span>
          </div>

          {postPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] flex items-center justify-center mb-3">
                <ImageIcon className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-[var(--color-text-primary)]">
                No photos published yet
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 max-w-xs">
                Photos attached to published anonymous posts will automatically appear in this gallery.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {postPhotos.map((url, idx) => (
                <div
                  key={idx}
                  onClick={() => setImageLightboxUrl(url)}
                  className="aspect-square rounded-2xl overflow-hidden bg-slate-900 cursor-pointer group relative border border-[var(--color-border)]"
                >
                  <img
                    src={url}
                    alt={`Mr Anonymous photo ${idx + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Anonymous Submission Modals */}
      <AnonymousIntroModal
        isOpen={introModalOpen}
        onClose={() => setIntroModalOpen(false)}
        onContinue={() => {
          setIntroModalOpen(false);
          setSubmitModalOpen(true);
        }}
      />

      <AnonymousSubmissionModal
        isOpen={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        onSubmitted={() => {
          loadData();
          refreshPosts();
        }}
      />

      {page && (
        <EditPageModal
          isOpen={editModalOpen}
          page={page}
          userId={currentUserId || ''}
          onClose={() => setEditModalOpen(false)}
          onPageUpdated={(updated: Page) => {
            setPage(updated);
            addToast('Page branding updated successfully!', 'success');
          }}
          onShowToast={addToast}
        />
      )}
    </div>
  );
};
