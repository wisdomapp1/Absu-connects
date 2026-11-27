import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  MessageCircle,
  Share2,
  Shield,
  Pin,
  Plus,
  Flag,
  MapPin,
  Globe,
  Check,
  Loader2,
  AlertTriangle,
  ArrowRightLeft,
  RotateCcw,
  EyeOff,
  Lock,
  CheckCircle2,
  Settings,
  Users,
  Pencil,
} from 'lucide-react';
import {
  Page,
  formatPageCategoryLabel,
} from '../../types/pages.ts';
import {
  normalizePageRole,
  formatPageRoleLabel,
  getPageRoleCapabilities,
} from '../../lib/pageUtils.ts';
import { Post } from '../../types/index.ts';
import {
  MR_ANONYMOUS_PAGE_ID,
  MR_ANONYMOUS_SLUG,
  fetchPageById,
  fetchPagePosts,
  followPage,
  unfollowPage,
  createPageConversation,
  cancelPageDeletion,
  reportPage,
} from '../../lib/pageService.ts';
import { useApp } from '../../context/AppContext.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { PostCard } from '../home/PostCard.tsx';
import { AnonymousIntroModal } from '../anonymous/AnonymousIntroModal.tsx';
import { AnonymousSubmissionModal } from '../anonymous/AnonymousSubmissionModal.tsx';

type PageTab = 'posts' | 'about' | 'photos';

interface PageProfileViewProps {
  forcedPageId?: string;
}

/**
 * Clean Public Page Profile.
 * Strictly renders Posts, About, and Photos tabs without inline management workspaces.
 * Managers see a role notice and clean shortcut to Switch to Page or open Page Settings.
 */
export const PageProfileView: React.FC<PageProfileViewProps> = ({ forcedPageId }) => {
  const {
    currentUser,
    isSuperAdmin,
    selectedPageId,
    selectedPageTab,
    activeIdentity,
    switchIdentity,
    refreshManagedPages,
    refreshPosts,
    navigateTo,
    goBack,
    setImageLightboxUrl,
    addToast,
  } = useApp();

  const [page, setPage] = useState<Page | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pagePosts, setPagePosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<PageTab>('posts');

  const [followBusy, setFollowBusy] = useState(false);
  const [messagingBusy, setMessagingBusy] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [anonIntroModalOpen, setAnonIntroModalOpen] = useState(false);
  const [anonSubmitModalOpen, setAnonSubmitModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Spam or misleading content');
  const [reportDesc, setReportDesc] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const targetPageId =
    forcedPageId || selectedPageId || (activeIdentity.type === 'page' ? activeIdentity.pageId : null);

  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);
  const loadedPageKeyRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPageData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!targetPageId) {
        setPage(null);
        setUnavailable(true);
        setLoading(false);
        loadedPageKeyRef.current = null;
        return;
      }

      const loadKey = `${targetPageId}:${currentUser.id || 'anon'}`;
      const isInitialForTarget = loadedPageKeyRef.current !== loadKey;
      const seq = ++requestSeqRef.current;

      if (!opts?.silent && isInitialForTarget) {
        setLoading(true);
      }

      try {
        const [pageRes, postsList] = await Promise.all([
          fetchPageById(targetPageId, currentUser.id),
          fetchPagePosts(targetPageId, currentUser.id),
        ]);
        if (!mountedRef.current || seq !== requestSeqRef.current) return;

        setPage(pageRes.page);
        setUnavailable(Boolean(pageRes.unavailable));
        setPagePosts(postsList);
        loadedPageKeyRef.current = loadKey;
      } finally {
        if (mountedRef.current && seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [targetPageId, currentUser.id]
  );

  const pageIdPrimitive = page?.id || null;

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  useEffect(() => {
    if (selectedPageTab) {
      const normalized = selectedPageTab.toLowerCase();
      if (normalized === 'posts' || normalized === 'about' || normalized === 'photos') {
        setActiveTab(normalized as PageTab);
        return;
      }
    }
    setActiveTab('posts');
  }, [selectedPageTab, targetPageId]);

  useEffect(() => {
    let rtTimer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = (evt: Event) => {
      const detail = (evt as CustomEvent<{ table?: string; payload?: any }>).detail;
      if (detail?.table === 'page_conversation_reads') return;
      const rowPageId =
        detail?.payload?.new?.page_id ||
        detail?.payload?.new?.id ||
        detail?.payload?.old?.page_id ||
        detail?.payload?.old?.id;
      if (rowPageId && targetPageId && rowPageId !== targetPageId && rowPageId !== pageIdPrimitive) {
        return;
      }
      if (rtTimer) clearTimeout(rtTimer);
      rtTimer = setTimeout(() => {
        loadPageData({ silent: true });
      }, 450);
    };
    const onPostCreated = () => {
      loadPageData({ silent: true });
    };
    const onPostDeleted = (e: Event) => {
      const id = (e as CustomEvent<{ postId?: string }>).detail?.postId;
      if (id) setPagePosts((prev) => prev.filter((p) => p.id !== id));
    };
    const onPostUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ postId?: string; content?: string }>).detail;
      if (detail?.postId && typeof detail.content === 'string') {
        setPagePosts((prev) =>
          prev.map((p) => (p.id === detail.postId ? { ...p, content: detail.content! } : p))
        );
      }
    };

    window.addEventListener('absu:page-realtime', onRealtime);
    window.addEventListener('absu:post-created', onPostCreated);
    window.addEventListener('absu:post-deleted', onPostDeleted);
    window.addEventListener('absu:post-updated', onPostUpdated);
    return () => {
      if (rtTimer) clearTimeout(rtTimer);
      window.removeEventListener('absu:page-realtime', onRealtime);
      window.removeEventListener('absu:post-created', onPostCreated);
      window.removeEventListener('absu:post-deleted', onPostDeleted);
      window.removeEventListener('absu:post-updated', onPostUpdated);
    };
  }, [loadPageData, targetPageId, pageIdPrimitive]);

  const isAnonymousPage = Boolean(
    page && (page.id === MR_ANONYMOUS_PAGE_ID || page.slug === MR_ANONYMOUS_SLUG)
  );
  const rawManagerRole =
    page?.managerRole ?? (isAnonymousPage && isSuperAdmin ? 'admin' : null);
  const effectiveManagerRole = rawManagerRole ? normalizePageRole(rawManagerRole) : null;
  const managerCaps = effectiveManagerRole ? getPageRoleCapabilities(effectiveManagerRole) : null;
  const isManager = Boolean(effectiveManagerRole);
  const isOwner = effectiveManagerRole === 'owner';

  const photoItems = useMemo(() => {
    const list: Array<{ url: string; postId: string }> = [];
    for (const post of pagePosts) {
      if (post.mediaItems && post.mediaItems.length > 0) {
        for (const m of post.mediaItems) {
          if (m.kind === 'image' && m.secure_url) {
            list.push({ url: m.secure_url, postId: post.id });
          }
        }
      } else if (post.mediaUrl && post.mediaType !== 'video') {
        list.push({ url: post.mediaUrl, postId: post.id });
      }
    }
    return list;
  }, [pagePosts]);

  const handleFollowToggle = async () => {
    if (!page || !currentUser.id || followBusy) return;
    setFollowBusy(true);
    const wasFollowing = Boolean(page.isFollowing);
    setPage((prev) =>
      prev
        ? {
            ...prev,
            isFollowing: !wasFollowing,
            followersCount: Math.max(0, prev.followersCount + (wasFollowing ? -1 : 1)),
          }
        : prev
    );
    try {
      const res = wasFollowing
        ? await unfollowPage(page.id, currentUser.id)
        : await followPage(page.id, currentUser.id);
      if (!res.success) {
        setPage((prev) =>
          prev
            ? {
                ...prev,
                isFollowing: wasFollowing,
                followersCount: page.followersCount,
              }
            : prev
        );
        addToast(res.error || 'Could not update follow status.', 'warning');
      }
    } finally {
      setFollowBusy(false);
    }
  };

  const messagingPerm =
    page?.messaging_permission || (page?.allowMessages === false ? 'disabled' : 'everyone');

  const handleMessagePage = async () => {
    if (!page || messagingBusy) return;
    if (messagingPerm === 'disabled' || !page.allowMessages) {
      addToast('This Page is not accepting direct messages right now.', 'info');
      return;
    }
    if (messagingPerm === 'followers' && !page.isFollowing && !isManager) {
      addToast(`Follow ${page.name} first to send a direct message.`, 'info');
      return;
    }
    setMessagingBusy(true);
    try {
      const res = await createPageConversation(page.id);
      if (res.success && res.conversationId) {
        navigateTo('conversation', { convId: res.conversationId });
      } else {
        addToast(res.error || 'Could not start conversation with Page.', 'warning');
      }
    } finally {
      setMessagingBusy(false);
    }
  };

  const handleSharePage = async () => {
    if (!page) return;
    const shareUrl = `${window.location.origin}/?view=page-profile&pageId=${page.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: page.name,
          text: `Follow ${page.name} on ABSU Connect`,
          url: shareUrl,
        });
        return;
      }
    } catch {
      // fallback to clipboard
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      addToast('Page link copied to clipboard.', 'success');
    } catch {
      addToast(shareUrl, 'info');
    }
  };

  const handleReportPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!page || !currentUser.id || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await reportPage({
        pageId: page.id,
        reporterId: currentUser.id,
        reason: reportReason,
        description: reportDesc,
      });
      if (res.success) {
        addToast('Report submitted for moderation review.', 'info');
        setReportModalOpen(false);
        setReportDesc('');
      } else {
        addToast(res.error || 'Failed to submit report.', 'warning');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelDeletion = async () => {
    if (!page || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await cancelPageDeletion(page.id);
      if (res.success) {
        addToast('Page restored!', 'success');
        await refreshManagedPages();
        await loadPageData();
      } else {
        addToast(res.error || 'Could not restore Page.', 'warning');
      }
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-12 flex flex-col items-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--color-primary)]" />
        <p className="text-xs font-semibold text-[var(--color-text-secondary)]">Loading Page...</p>
      </div>
    );
  }

  if (!page || (unavailable && !isManager)) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={goBack}
          className="min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-10 text-center space-y-2">
          <AlertTriangle className="w-9 h-9 text-amber-500 mx-auto" />
          <h2 className="text-base font-extrabold text-[var(--color-text-primary)]">
            This Page is unavailable.
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            This Page may have been disabled or removed.
          </p>
        </div>
      </div>
    );
  }

  const tabsToShow: Array<{ id: PageTab; label: string }> = [
    { id: 'posts', label: 'Posts' },
    { id: 'about', label: 'About' },
    { id: 'photos', label: 'Photos' },
  ];

  const isSwitchedAsThisPage = activeIdentity.type === 'page' && activeIdentity.pageId === page.id;

  return (
    <div className="space-y-4">
      {/* Top Back Bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goBack}
          className="min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={handleSharePage}
          className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] inline-flex items-center gap-1.5"
        >
          <Share2 className="w-4 h-4" />
          <span>Share</span>
        </button>
      </div>

      {/* Disabled / Deletion Pending Banner for Authorized Managers */}
      {isManager && page.status === 'disabled' && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-rose-500">This Page is currently disabled</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              {page.disabled_reason || 'Disabled by ABSU Connect moderation.'}
            </p>
          </div>
        </div>
      )}

      {isManager && page.deletion_requested_at && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-amber-500">Scheduled for 30-day deletion</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              Requested on {new Date(page.deletion_requested_at).toLocaleDateString()}. You can cancel before permanent removal.
            </p>
          </div>
          {isOwner && (
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleCancelDeletion}
              className="min-h-[44px] px-4 rounded-xl bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restore Page</span>
            </button>
          )}
        </div>
      )}

      {/* Cover + Overlapping Avatar Header Card */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-xs">
        <div className="relative w-full aspect-video max-h-56 bg-[var(--color-bg-main)] overflow-hidden">
          {page.coverUrl ? (
            <img
              src={page.coverUrl}
              alt={`${page.name} cover`}
              onClick={() => setImageLightboxUrl(page.coverUrl!)}
              className="w-full h-full object-cover cursor-pointer"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1877F2]/20 via-[var(--color-primary-subtle)] to-purple-500/15" />
          )}
        </div>

        <div className="px-4 pb-4">
          <div className="relative -mt-11 mb-3 flex items-end justify-between gap-3">
            <div
              onClick={() => {
                if (page.avatarUrl) setImageLightboxUrl(page.avatarUrl);
              }}
              className={`rounded-full border-4 border-[var(--color-bg-card)] bg-[var(--color-bg-card)] shadow-md shrink-0 ${
                page.avatarUrl ? 'cursor-pointer' : ''
              }`}
            >
              <Avatar src={page.avatarUrl} name={page.name} size="xl" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-xl font-extrabold text-[var(--color-text-primary)] tracking-tight">
                {page.name}
              </h1>
              {page.isVerified && <VerifiedBadge size={18} />}
            </div>

            <p className="text-xs font-semibold text-[var(--color-text-secondary)]">
              @{page.slug} · {formatPageCategoryLabel(page.category)} ·{' '}
              <span className="tabular-nums font-bold text-[var(--color-text-primary)]">
                {page.followersCount.toLocaleString()}
              </span>{' '}
              followers ·{' '}
              <span className="tabular-nums font-bold text-[var(--color-text-primary)]">
                {Math.max(page.postsCount ?? page.posts_count ?? 0, pagePosts.length).toLocaleString()}
              </span>{' '}
              posts
            </p>

            {page.description && (
              <p className="text-sm text-[var(--color-text-primary)] pt-1 leading-relaxed">
                {page.description}
              </p>
            )}

            {isManager && effectiveManagerRole && (
              <p className="text-xs font-semibold text-[var(--color-primary)] pt-1 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 shrink-0" />
                <span>
                  You are managing this Page as {formatPageRoleLabel(effectiveManagerRole)}.
                </span>
              </p>
            )}
          </div>

          {/* Primary Action Bar */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {isManager ? (
              isSwitchedAsThisPage ? (
                <>
                  {managerCaps?.canEditInfo && (
                    <button
                      type="button"
                      onClick={() =>
                        navigateTo('page-settings', { pageId: page.id, pageTab: 'info' })
                      }
                      className="min-h-[44px] px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit Page</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => navigateTo('page-settings', { pageId: page.id })}
                    className="min-h-[44px] px-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Settings className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    <span>Page Settings</span>
                  </button>

                  {managerCaps?.canManageFollowers && (
                    <button
                      type="button"
                      onClick={() => navigateTo('page-followers', { pageId: page.id })}
                      className="min-h-[44px] px-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Users className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>Manage Followers</span>
                    </button>
                  )}

                  {managerCaps?.canManageRoles && (
                    <button
                      type="button"
                      onClick={() =>
                        navigateTo('page-settings', { pageId: page.id, pageTab: 'access' })
                      }
                      className="min-h-[44px] px-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Shield className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>Manage Administrators</span>
                    </button>
                  )}

                  {isAnonymousPage && (
                    <button
                      type="button"
                      onClick={() => setAnonIntroModalOpen(true)}
                      className="min-h-[44px] px-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <EyeOff className="w-3.5 h-3.5 text-violet-500" />
                      <span>Post anonymously</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void switchIdentity('personal')}
                    className="min-h-[44px] px-4 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Switch to Personal Profile</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => switchIdentity(page.id, { targetView: 'page-profile' })}
                    className="min-h-[44px] px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Switch to this Page</span>
                  </button>

                  {isAnonymousPage && (
                    <button
                      type="button"
                      onClick={() => setAnonIntroModalOpen(true)}
                      className="min-h-[44px] px-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <EyeOff className="w-3.5 h-3.5 text-violet-500" />
                      <span>Post anonymously</span>
                    </button>
                  )}
                </>
              )
            ) : (
              <>
                <button
                  type="button"
                  disabled={followBusy || page.isBlocked}
                  onClick={handleFollowToggle}
                  className={`min-h-[44px] px-5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                    page.isFollowing
                      ? 'bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)]'
                      : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white'
                  }`}
                >
                  {page.isFollowing ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  <span>{page.isFollowing ? 'Following' : 'Follow'}</span>
                </button>

                {isAnonymousPage && !page.isBlocked && (
                  <button
                    type="button"
                    onClick={() => setAnonIntroModalOpen(true)}
                    className="min-h-[44px] px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <EyeOff className="w-4 h-4" />
                    <span>Post anonymously</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={
                    messagingBusy ||
                    messagingPerm === 'disabled' ||
                    !page.allowMessages ||
                    page.isBlocked
                  }
                  onClick={handleMessagePage}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>
                    {messagingPerm === 'disabled' || !page.allowMessages
                      ? 'Messages Off'
                      : messagingPerm === 'followers' && !page.isFollowing
                      ? 'Followers Only'
                      : 'Message Page'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setReportModalOpen(true)}
                  className="min-h-[44px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)] hover:text-rose-500 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Report</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Public Navigation Tabs (Posts, About, Photos) */}
        <div className="border-t border-[var(--color-border)] px-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {tabsToShow.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`min-h-[44px] px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Blocked user notice */}
      {page.isBlocked && !isManager && (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-6 text-center text-xs text-[var(--color-text-secondary)]">
          You cannot interact with this Page.
        </div>
      )}

      {/* TAB: POSTS */}
      {activeTab === 'posts' && (
        <div className="space-y-4">
          {pagePosts.length === 0 ? (
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-8 text-center space-y-2">
              <p className="text-sm font-bold text-[var(--color-text-primary)]">No posts yet.</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {isManager
                  ? 'Use the composer on Home Feed while operating as this Page to share updates with followers.'
                  : `No posts yet. Follow to see updates from ${page.name}.`}
              </p>
            </div>
          ) : (
            pagePosts.map((post) => (
              <div key={post.id} className="space-y-1">
                {post.isPinned && (
                  <div className="px-3 flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-primary)]">
                    <Pin className="w-3.5 h-3.5" />
                    <span>Pinned Post</span>
                  </div>
                )}
                <PostCard post={post} />
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB: ABOUT */}
      {activeTab === 'about' && (
        <div className="space-y-4">
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-extrabold text-[var(--color-text-primary)]">About {page.name}</h3>
            {page.description && (
              <p className="text-sm text-[var(--color-text-primary)] leading-relaxed">{page.description}</p>
            )}
            <div className="space-y-2.5 text-xs text-[var(--color-text-secondary)]">
              <div className="flex items-center gap-2.5">
                <Flag className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <span>
                  Category:{' '}
                  <strong className="text-[var(--color-text-primary)]">
                    {formatPageCategoryLabel(page.category)}
                  </strong>
                </span>
              </div>
              {page.location && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{page.location}</span>
                </div>
              )}
              {page.whatsapp && (
                <div className="flex items-center gap-2.5">
                  <MessageCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>
                    WhatsApp: <strong className="text-[var(--color-text-primary)]">{page.whatsapp}</strong>
                  </span>
                </div>
              )}
              {page.website && (
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-blue-500 shrink-0" />
                  <a
                    href={page.website.startsWith('http') ? page.website : `https://${page.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-primary)] hover:underline truncate"
                  >
                    {page.website}
                  </a>
                </div>
              )}
            </div>
          </div>

          {isAnonymousPage && (
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 space-y-3.5">
              <h3 className="text-sm font-extrabold text-[var(--color-text-primary)] flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-500" />
                <span>Anonymity &amp; Privacy Charter</span>
              </h3>
              <div className="space-y-2.5 text-xs text-[var(--color-text-secondary)] leading-relaxed">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>No Personal Info Exposed:</strong> Every anonymous submission publishes strictly under {page.name}. Your student name, matric number, and email are never revealed.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Instant Publishing:</strong> Anonymous posts appear on {page.name} and in the campus feed immediately upon submission.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Campus Safety:</strong> Submissions that dox, threaten, or harass students remain subject to community safety removal.
                  </span>
                </div>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setAnonIntroModalOpen(true)}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Post anonymously</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: PHOTOS */}
      {activeTab === 'photos' && (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4">
          {photoItems.length === 0 ? (
            <p className="text-xs text-[var(--color-text-secondary)] text-center py-8">
              No photos posted by this Page yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {photoItems.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setImageLightboxUrl(item.url)}
                  className="aspect-square rounded-xl overflow-hidden bg-[var(--color-bg-main)]"
                >
                  <img src={item.url} alt="Page photo" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Report Page */}
      {reportModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setReportModalOpen(false)}
        >
          <form
            onSubmit={handleReportPage}
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-extrabold text-[var(--color-text-primary)]">
              Report {page.name}
            </h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-primary)]">Reason</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
              >
                <option value="Spam or misleading content">Spam or misleading content</option>
                <option value="Impersonation">Impersonation</option>
                <option value="Harassment or hate speech">Harassment or hate speech</option>
                <option value="Scam or fraud">Scam or fraud</option>
                <option value="Inappropriate content">Inappropriate content</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--color-text-primary)]">
                Details (Optional)
              </label>
              <textarea
                rows={3}
                value={reportDesc}
                onChange={(e) => setReportDesc(e.target.value)}
                placeholder="Describe what happened..."
                className="w-full px-3 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="min-h-[44px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Anonymous Confession Modals (for Mr Anonymous Page) */}
      {isAnonymousPage && (
        <>
          <AnonymousIntroModal
            isOpen={anonIntroModalOpen}
            onClose={() => setAnonIntroModalOpen(false)}
            onContinue={() => {
              setAnonIntroModalOpen(false);
              setAnonSubmitModalOpen(true);
            }}
          />

          <AnonymousSubmissionModal
            isOpen={anonSubmitModalOpen}
            onClose={() => setAnonSubmitModalOpen(false)}
            onSubmitted={() => {
              loadPageData();
              refreshPosts();
            }}
          />
        </>
      )}
    </div>
  );
};
