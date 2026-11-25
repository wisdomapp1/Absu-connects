import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Plus,
  Search,
  Flag,
  Check,
  X,
  Loader2,
  UserPlus,
  Shield,
} from 'lucide-react';
import {
  NEW_PAGE_CATEGORIES,
  Page,
  PageAdminInvitation,
  PageFollowInvite,
  formatPageCategoryLabel,
} from '../../types/pages.ts';
import {
  discoverPages,
  fetchMyPageAdminInvitations,
  fetchMyPageFollowInvites,
  respondPageAdminInvite,
  respondPageFollowInvite,
  followPage,
  unfollowPage,
} from '../../lib/pageService.ts';
import { filterPublicDirectoryPages } from '../../lib/pageUtils.ts';
import { useApp } from '../../context/AppContext.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { Avatar } from '../common/Avatar.tsx';

/**
 * Pure Public Campus Pages Discovery Directory.
 * Switching to managed Pages happens from the user's Personal Profile ("Switch to Page")
 * or Identity Switcher, keeping this directory cleanly focused on campus Page discovery.
 */
export const PagesDirectoryView: React.FC = () => {
  const {
    currentUser,
    refreshManagedPages,
    navigateTo,
    goBack,
    setCreatePageModalOpen,
    addToast,
  } = useApp();

  const [pages, setPages] = useState<Page[]>([]);
  const [adminInvites, setAdminInvites] = useState<PageAdminInvitation[]>([]);
  const [followInvites, setFollowInvites] = useState<PageFollowInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyPageId, setBusyPageId] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadDirectory = useCallback(
    async (opts?: { silent?: boolean }) => {
      const seq = ++requestSeqRef.current;
      if (!opts?.silent && !hasLoadedOnceRef.current) {
        setLoading(true);
      }
      try {
        const [discovered, aInvites, fInvites] = await Promise.all([
          discoverPages({
            currentUserId: currentUser.id,
            category: selectedCategory,
            search: searchQuery,
            limit: 60,
          }),
          currentUser.id ? fetchMyPageAdminInvitations(currentUser.id) : Promise.resolve([]),
          currentUser.id ? fetchMyPageFollowInvites(currentUser.id) : Promise.resolve([]),
        ]);
        if (!mountedRef.current || seq !== requestSeqRef.current) return;
        setPages(discovered);
        setAdminInvites(aInvites);
        setFollowInvites(fInvites);
        hasLoadedOnceRef.current = true;
      } finally {
        if (mountedRef.current && seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [currentUser.id, selectedCategory, searchQuery]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDirectory({ silent: hasLoadedOnceRef.current });
    }, hasLoadedOnceRef.current ? 220 : 0);
    return () => clearTimeout(timer);
  }, [loadDirectory]);

  useEffect(() => {
    let rtTimer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = (evt: Event) => {
      const table = (evt as CustomEvent<{ table?: string }>).detail?.table;
      if (table === 'page_conversation_reads') return;
      if (rtTimer) clearTimeout(rtTimer);
      rtTimer = setTimeout(() => {
        loadDirectory({ silent: true });
      }, 450);
    };
    window.addEventListener('absu:page-realtime', onRealtime);
    return () => {
      if (rtTimer) clearTimeout(rtTimer);
      window.removeEventListener('absu:page-realtime', onRealtime);
    };
  }, [loadDirectory]);

  const directoryPages = useMemo(
    () => filterPublicDirectoryPages(pages),
    [pages]
  );

  const handleToggleFollow = async (page: Page) => {
    if (!currentUser.id) return;
    setBusyPageId(page.id);
    const wasFollowing = Boolean(page.isFollowing);
    setPages((prev) =>
      prev.map((p) =>
        p.id === page.id
          ? {
              ...p,
              isFollowing: !wasFollowing,
              followersCount: Math.max(0, p.followersCount + (wasFollowing ? -1 : 1)),
            }
          : p
      )
    );
    try {
      const res = wasFollowing
        ? await unfollowPage(page.id, currentUser.id)
        : await followPage(page.id, currentUser.id);
      if (!res.success) {
        setPages((prev) =>
          prev.map((p) =>
            p.id === page.id
              ? {
                  ...p,
                  isFollowing: wasFollowing,
                  followersCount: page.followersCount,
                }
              : p
          )
        );
        addToast(res.error || 'Could not update follow status.', 'warning');
      }
    } finally {
      setBusyPageId(null);
    }
  };

  const handleAdminInviteResponse = async (inv: PageAdminInvitation, accept: boolean) => {
    setBusyInviteId(inv.id);
    try {
      const res = await respondPageAdminInvite(inv.id, accept);
      if (res.success) {
        setAdminInvites((prev) => prev.filter((i) => i.id !== inv.id));
        addToast(
          accept
            ? `You are now an Admin of ${inv.page?.name || 'this Page'}.`
            : 'Admin invitation declined.',
          accept ? 'success' : 'info'
        );
        if (accept) {
          await refreshManagedPages();
        }
      } else {
        addToast(res.error || 'Failed to respond to invitation.', 'warning');
      }
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleFollowInviteResponse = async (inv: PageFollowInvite, accept: boolean) => {
    setBusyInviteId(inv.id);
    try {
      const res = await respondPageFollowInvite(inv.id, accept);
      if (res.success) {
        setFollowInvites((prev) => prev.filter((i) => i.id !== inv.id));
        addToast(
          accept
            ? `You are now following ${inv.page?.name || 'this Page'}.`
            : 'Follow invitation declined.',
          accept ? 'success' : 'info'
        );
        if (accept) loadDirectory({ silent: true });
      } else {
        addToast(res.error || 'Failed to respond to follow invite.', 'warning');
      }
    } finally {
      setBusyInviteId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={goBack}
            className="min-w-[44px] min-h-[44px] rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-[var(--color-text-primary)] truncate">
              Discover Pages
            </h1>
            <p className="text-xs text-[var(--color-text-secondary)] truncate">
              Departments, fellowships, campus clubs &amp; student businesses
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCreatePageModalOpen(true)}
          className="min-h-[44px] px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Create Page</span>
        </button>
      </div>

      {/* Pending Page Admin Invitations */}
      {adminInvites.length > 0 && (
        <section className="bg-[var(--color-bg-card)] border border-[var(--color-primary)]/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--color-primary)]" />
            <h2 className="text-sm font-extrabold text-[var(--color-text-primary)]">
              Page Admin Invitations ({adminInvites.length})
            </h2>
          </div>
          <div className="space-y-2.5">
            {adminInvites.map((inv) => (
              <div
                key={inv.id}
                className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    src={inv.page?.avatarUrl}
                    name={inv.page?.name || 'Campus Page'}
                    size="md"
                    className="shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                        {inv.page?.name || 'Campus Page'}
                      </p>
                      {inv.page?.isVerified && <VerifiedBadge size={14} />}
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] truncate">
                      {inv.inviter?.display_name || 'Page Owner'} invited you to manage as Admin
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyInviteId === inv.id}
                    onClick={() => handleAdminInviteResponse(inv, true)}
                    className="min-h-[44px] px-4 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Accept</span>
                  </button>
                  <button
                    type="button"
                    disabled={busyInviteId === inv.id}
                    onClick={() => handleAdminInviteResponse(inv, false)}
                    className="min-h-[44px] px-3.5 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)] flex items-center gap-1 whitespace-nowrap"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pending Follow Invites */}
      {followInvites.length > 0 && (
        <section className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-extrabold text-[var(--color-text-primary)]">
              Page Follow Invites ({followInvites.length})
            </h2>
          </div>
          <div className="space-y-2.5">
            {followInvites.map((inv) => (
              <div
                key={inv.id}
                className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    src={inv.page?.avatarUrl}
                    name={inv.page?.name || 'Campus Page'}
                    size="md"
                    className="shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                        {inv.page?.name || 'Campus Page'}
                      </p>
                      {inv.page?.isVerified && <VerifiedBadge size={14} />}
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] truncate">
                      {inv.inviter?.display_name || 'A friend'} invited you to follow this Page
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyInviteId === inv.id}
                    onClick={() => handleFollowInviteResponse(inv, true)}
                    className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap"
                  >
                    Follow Page
                  </button>
                  <button
                    type="button"
                    disabled={busyInviteId === inv.id}
                    onClick={() => handleFollowInviteResponse(inv, false)}
                    className="min-h-[44px] px-3.5 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)] whitespace-nowrap"
                  >
                    Ignore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Discover Pages Search + Category Filters */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-extrabold text-[var(--color-text-primary)]">
            Campus Pages ({directoryPages.length})
          </h2>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search campus Pages by name, department, or category..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {['All', ...NEW_PAGE_CATEGORIES].map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors shrink-0 ${
                  active
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-10 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
            <p className="text-xs text-[var(--color-text-secondary)]">Loading campus Pages...</p>
          </div>
        ) : directoryPages.length === 0 ? (
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center mx-auto">
              <Flag className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--color-text-primary)]">
                {!searchQuery && selectedCategory === 'All'
                  ? 'No Pages available yet'
                  : 'No Pages match your filter'}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                Try another category or launch a new ABSU Page in this space.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreatePageModalOpen(true)}
              className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Create a Page</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {directoryPages.map((page) => (
              <div
                key={page.id}
                className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-3.5 flex items-center justify-between gap-3 hover:border-[var(--color-primary)]/40 transition-colors"
              >
                <div
                  onClick={() => navigateTo('page-profile', { pageId: page.id })}
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                >
                  <Avatar src={page.avatarUrl} name={page.name} size="md" className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <h3 className="text-sm font-extrabold text-[var(--color-text-primary)] truncate">
                        {page.name}
                      </h3>
                      {page.isVerified && <VerifiedBadge size={15} />}
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] truncate">
                      {formatPageCategoryLabel(page.category)} ·{' '}
                      <span className="tabular-nums">{page.followersCount.toLocaleString()}</span>{' '}
                      followers
                    </p>
                    {page.description && (
                      <p className="text-xs text-[var(--color-text-secondary)] line-clamp-1 mt-0.5">
                        {page.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyPageId === page.id}
                    onClick={() => handleToggleFollow(page)}
                    className={`min-h-[44px] px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                      page.isFollowing
                        ? 'bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)]'
                        : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white'
                    }`}
                  >
                    {page.isFollowing ? 'Following' : 'Follow'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
