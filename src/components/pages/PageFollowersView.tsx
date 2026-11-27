import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Users,
  Search,
  UserPlus,
  UserX,
  Ban,
  Check,
  X,
  Loader2,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';
import type {
  Page,
  PageFollower,
  PageBlock,
  PageRestrictedUser,
  PageManagerRole,
  CanonicalPageRole,
} from '../../types/pages.ts';
import {
  fetchPageFollowers,
  fetchPageBlocks,
  fetchPageRestrictedUsers,
  removePageFollower,
  blockUserFromPage,
  unblockUserFromPage,
  restrictUserFromPage,
  unrestrictUserFromPage,
  inviteFriendToPage,
} from '../../lib/pageService.ts';
import { getPageRoleCapabilities } from '../../lib/pageUtils.ts';
import { useApp } from '../../context/AppContext.tsx';
import { Avatar } from '../common/Avatar.tsx';

interface PageFollowersViewProps {
  page: Page;
  role: PageManagerRole | CanonicalPageRole;
}

export const PageFollowersView: React.FC<PageFollowersViewProps> = ({ page, role }) => {
  const { friends, navigateTo, goBack, addToast, refreshManagedPages } = useApp();
  const caps = useMemo(() => getPageRoleCapabilities(role), [role]);

  const [followers, setFollowers] = useState<PageFollower[]>([]);
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [restrictedUsers, setRestrictedUsers] = useState<PageRestrictedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<'followers' | 'restricted' | 'blocked'>('followers');
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invitedFriendIds, setInvitedFriendIds] = useState<Set<string>>(new Set());
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fols, blks, rests] = await Promise.all([
        fetchPageFollowers(page.id, 120),
        fetchPageBlocks(page.id),
        fetchPageRestrictedUsers(page.id),
      ]);
      setFollowers(fols);
      setBlocks(blks);
      setRestrictedUsers(rests);
    } finally {
      setLoading(false);
    }
  }, [page.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredFollowers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return followers;
    return followers.filter((f) => {
      const name = (f.user?.display_name || '').toLowerCase();
      const username = (f.user?.username || '').toLowerCase();
      const dept = (f.user?.department || '').toLowerCase();
      return name.includes(q) || username.includes(q) || dept.includes(q);
    });
  }, [followers, searchQuery]);

  const filteredRestricted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return restrictedUsers;
    return restrictedUsers.filter((r) => {
      const name = (r.user?.display_name || '').toLowerCase();
      const username = (r.user?.username || '').toLowerCase();
      const dept = (r.user?.department || '').toLowerCase();
      return name.includes(q) || username.includes(q) || dept.includes(q);
    });
  }, [restrictedUsers, searchQuery]);

  const filteredBlocks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return blocks;
    return blocks.filter((b) => {
      const name = (b.user?.display_name || '').toLowerCase();
      const username = (b.user?.username || '').toLowerCase();
      return name.includes(q) || username.includes(q);
    });
  }, [blocks, searchQuery]);

  const restrictedIdSet = useMemo(
    () => new Set(restrictedUsers.map((r) => r.user_id)),
    [restrictedUsers]
  );

  const handleRemoveFollower = async (userId: string) => {
    if (busyUserId || !caps.canManageFollowers) return;
    setBusyUserId(userId);
    try {
      const res = await removePageFollower(page.id, userId);
      if (res.success) {
        setFollowers((prev) => prev.filter((f) => f.user_id !== userId));
        addToast('Follower removed from this Page.', 'info');
        void refreshManagedPages();
      } else {
        addToast(res.error || 'Could not remove follower.', 'warning');
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRestrictUser = async (userId: string) => {
    if (busyUserId || !caps.canManageFollowers) return;
    setBusyUserId(userId);
    try {
      const res = await restrictUserFromPage(page.id, userId, 'Restricted by Page moderator');
      if (res.success) {
        addToast('User restricted from commenting and messaging this Page.', 'info');
        await loadData();
      } else {
        addToast(res.error || 'Could not restrict user.', 'warning');
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const handleUnrestrictUser = async (userId: string) => {
    if (busyUserId || !caps.canManageFollowers) return;
    setBusyUserId(userId);
    try {
      const res = await unrestrictUserFromPage(page.id, userId);
      if (res.success) {
        setRestrictedUsers((prev) => prev.filter((r) => r.user_id !== userId));
        addToast('User restriction lifted.', 'info');
      } else {
        addToast(res.error || 'Could not unrestrict user.', 'warning');
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const handleBlockUser = async (userId: string) => {
    if (busyUserId || !caps.canManageFollowers) return;
    setBusyUserId(userId);
    try {
      const res = await blockUserFromPage(page.id, userId, 'Blocked by Page manager');
      if (res.success) {
        addToast('User blocked from interacting with this Page.', 'info');
        await loadData();
        void refreshManagedPages();
      } else {
        addToast(res.error || 'Could not block user.', 'warning');
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const handleUnblockUser = async (userId: string) => {
    if (busyUserId || !caps.canManageFollowers) return;
    setBusyUserId(userId);
    try {
      const res = await unblockUserFromPage(page.id, userId);
      if (res.success) {
        setBlocks((prev) => prev.filter((b) => b.user_id !== userId));
        addToast('User unblocked.', 'info');
      } else {
        addToast(res.error || 'Could not unblock user.', 'warning');
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const handleInviteFriend = async (friendId: string) => {
    const res = await inviteFriendToPage(page.id, friendId);
    if (res.success) {
      setInvitedFriendIds((prev) => new Set(prev).add(friendId));
      addToast('Follow invitation sent.', 'success');
    } else {
      addToast(res.error || 'Could not invite friend.', 'warning');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2">
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
              Page Audience
            </h1>
            <p className="text-xs text-[var(--color-text-secondary)] truncate">
              {page.name} ·{' '}
              <span className="tabular-nums font-semibold">
                {Math.max(page.followersCount, followers.length).toLocaleString()}
              </span>{' '}
              followers
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setInviteModalOpen(true)}
          className="min-h-[44px] px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Invite Friends</span>
        </button>
      </div>

      {!caps.canManageFollowers && (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl px-4 py-3 text-xs text-[var(--color-text-secondary)]">
          Viewing audience in read-only mode. Owners, Admins, and Moderators can remove, restrict, or block followers.
        </div>
      )}

      {/* Tabs & Search */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setTab('followers')}
            className={`min-h-[40px] px-4 rounded-xl text-xs font-bold transition-colors whitespace-nowrap tabular-nums ${
              tab === 'followers'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'
            }`}
          >
            Followers ({followers.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('restricted')}
            className={`min-h-[40px] px-4 rounded-xl text-xs font-bold transition-colors whitespace-nowrap tabular-nums ${
              tab === 'restricted'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'
            }`}
          >
            Restricted ({restrictedUsers.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('blocked')}
            className={`min-h-[40px] px-4 rounded-xl text-xs font-bold transition-colors whitespace-nowrap tabular-nums ${
              tab === 'blocked'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'
            }`}
          >
            Blocked ({blocks.length})
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              tab === 'followers'
                ? 'Search followers by name, username, or department...'
                : tab === 'restricted'
                ? 'Search restricted accounts...'
                : 'Search blocked users...'
            }
            className="w-full min-h-[42px] pl-10 pr-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-10 flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
          <p className="text-xs text-[var(--color-text-secondary)]">Loading Page audience...</p>
        </div>
      ) : tab === 'followers' ? (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
          {filteredFollowers.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Users className="w-8 h-8 text-[var(--color-text-secondary)] mx-auto opacity-60" />
              <p className="text-sm font-bold text-[var(--color-text-primary)]">
                {searchQuery.trim() ? 'No matching followers' : 'No followers yet'}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Invite campus friends or publish engaging posts to grow {page.name}.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {filteredFollowers.map((f) => {
                const name = f.user?.display_name || f.user?.username || 'ABSU Student';
                const busy = busyUserId === f.user_id;
                const isRestricted = restrictedIdSet.has(f.user_id);
                return (
                  <div
                    key={f.user_id}
                    className="p-3.5 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => navigateTo('user-profile', { userId: f.user_id })}
                      className="flex items-center gap-3 min-w-0 text-left flex-1"
                    >
                      <Avatar src={f.user?.avatar_url} name={name} size="md" className="shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                          {name}
                        </p>
                        <p className="text-xs text-[var(--color-text-secondary)] truncate">
                          {f.user?.username ? `@${f.user.username}` : 'Student'}
                          {f.user?.department ? ` · ${f.user.department}` : ''}
                          {isRestricted ? ' · Restricted' : ''}
                        </p>
                      </div>
                    </button>

                    {caps.canManageFollowers && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            isRestricted
                              ? handleUnrestrictUser(f.user_id)
                              : handleRestrictUser(f.user_id)
                          }
                          className="min-h-[40px] px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-semibold text-amber-500 hover:bg-amber-500/10 flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                          title={isRestricted ? 'Unrestrict user' : 'Restrict commenting/messaging'}
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">
                            {isRestricted ? 'Unrestrict' : 'Restrict'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRemoveFollower(f.user_id)}
                          className="min-h-[40px] px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                          title="Remove follower"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Remove</span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleBlockUser(f.user_id)}
                          className="min-h-[40px] px-3 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 text-xs font-bold flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                          title="Block from Page"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Block</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : tab === 'restricted' ? (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
          {filteredRestricted.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <ShieldAlert className="w-8 h-8 text-[var(--color-text-secondary)] mx-auto opacity-60" />
              <p className="text-sm font-bold text-[var(--color-text-primary)]">
                No restricted accounts
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Restricted users can still follow {page.name} but cannot comment or send inbox messages.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {filteredRestricted.map((r) => {
                const name = r.user?.display_name || r.user?.username || 'Restricted user';
                const busy = busyUserId === r.user_id;
                return (
                  <div
                    key={r.user_id}
                    className="p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar src={r.user?.avatar_url} name={name} size="md" className="shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                          {name}
                        </p>
                        <p className="text-xs text-[var(--color-text-secondary)] truncate">
                          {r.reason || 'Restricted from commenting and messaging'}
                        </p>
                      </div>
                    </div>
                    {caps.canManageFollowers && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleUnrestrictUser(r.user_id)}
                        className="min-h-[40px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Unrestrict</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
          {filteredBlocks.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <ShieldAlert className="w-8 h-8 text-[var(--color-text-secondary)] mx-auto opacity-60" />
              <p className="text-sm font-bold text-[var(--color-text-primary)]">
                No blocked users
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Users you block from commenting, following, or messaging {page.name} appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {filteredBlocks.map((b) => {
                const name = b.user?.display_name || b.user?.username || 'Blocked user';
                const busy = busyUserId === b.user_id;
                return (
                  <div
                    key={b.user_id}
                    className="p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar src={b.user?.avatar_url} name={name} size="md" className="shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                          {name}
                        </p>
                        <p className="text-xs text-[var(--color-text-secondary)] truncate">
                          {b.reason || 'Blocked from Page interactions'}
                        </p>
                      </div>
                    </div>
                    {caps.canManageFollowers && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleUnblockUser(b.user_id)}
                        className="min-h-[40px] px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Unblock</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Invite Friends Modal */}
      {inviteModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setInviteModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[var(--color-text-primary)]">
                Invite Friends to Follow
              </h3>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--color-text-secondary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {friends.length === 0 ? (
                <p className="text-xs text-[var(--color-text-secondary)] text-center py-6">
                  Connect with coursemates in Friends to invite them to follow {page.name}.
                </p>
              ) : (
                friends.map((friend) => {
                  const invited = invitedFriendIds.has(friend.id);
                  return (
                    <div
                      key={friend.id}
                      className="p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={friend.avatar} name={friend.name} size="sm" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                            {friend.name}
                          </p>
                          <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                            {friend.department}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={invited}
                        onClick={() => handleInviteFriend(friend.id)}
                        className={`min-h-[38px] px-3 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1 ${
                          invited
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : 'bg-[var(--color-primary)] text-white'
                        }`}
                      >
                        {invited ? <Check className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                        <span>{invited ? 'Invited' : 'Invite'}</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
