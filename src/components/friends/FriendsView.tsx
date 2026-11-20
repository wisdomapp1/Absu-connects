import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import type { FriendTab, User } from '../../types/index.ts';
import { Avatar } from '../common/Avatar.tsx';
import { fetchMrAnonymousPage, toggleFollowPage, MR_ANONYMOUS_PAGE_ID } from '../../lib/pageService.ts';
import { EXCLUDED_STUDENT_IDS } from '../../lib/profileService.ts';
import type { Page } from '../../types/pages.ts';
import {
  Users,
  UserCheck,
  UserPlus,
  Search,
  MessageSquare,
  Check,
  X,
  UserMinus,
  Sparkles,
  ArrowLeft,
  ShieldCheck,
  Plus,
} from 'lucide-react';

export const FriendsView: React.FC = () => {
  const {
    users,
    friends,
    discoverUsers: contextDiscoverUsers,
    currentUser,
    friendRequests,
    friendTab,
    setFriendTab,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    startConversationWithUser,
    navigateTo,
    goBack,
    isUserOnline,
    addToast,
  } = useApp();
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [discoverySearch, setDiscoverySearch] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [dismissedUserIds, setDismissedUserIds] = useState<string[]>([]);

  // Mr Anonymous page data
  const [anonPage, setAnonPage] = useState<Page | null>(null);
  const [followingAnon, setFollowingAnon] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    fetchMrAnonymousPage(currentUserId).then((page) => {
      if (page) {
        setAnonPage(page);
        setFollowingAnon(Boolean(page.isFollowing));
      }
    });
  }, [currentUserId]);

  const handleFollowAnon = async () => {
    if (!anonPage || !currentUserId || followLoading) return;
    setFollowLoading(true);
    const nextState = !followingAnon;
    setFollowingAnon(nextState);

    try {
      const ok = await toggleFollowPage(anonPage.id, currentUserId, followingAnon);
      if (ok) {
        addToast(
          nextState ? '🎉 Following Mr Anonymous!' : 'Unfollowed Mr Anonymous.',
          'info'
        );
      } else {
        setFollowingAnon(!nextState);
      }
    } catch {
      setFollowingAnon(!nextState);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleDismissUser = (userId: string) => {
    setDismissedUserIds((prev) => [...prev, userId]);
  };

  // Categorize users with strict separation
  const myFriends = friends.length > 0 ? friends : users.filter((u) => u.relationshipState === 'friends');
  const receivedReqs = friendRequests.filter((r) => r.type === 'received');

  // Discoverable users: pure eligible non-friends, not requested, not blocked, not self, not Mr Anonymous
  const discoverUsers = contextDiscoverUsers.filter((u) => {
    if (EXCLUDED_STUDENT_IDS.includes(u.id) || u.id === MR_ANONYMOUS_PAGE_ID || u.name.toLowerCase() === 'mr anonymous') {
      return false;
    }
    if (dismissedUserIds.includes(u.id)) {
      return false;
    }
    if (discoverySearch.trim()) {
      const q = discoverySearch.toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.department.toLowerCase().includes(q) ||
        (u.interests && u.interests.some((i) => i.toLowerCase().includes(q)))
      );
    }
    return true;
  });

  // Exactly 3 tabs: Requests, Discover, Friends (Sent tab removed from UI per specification)
  const tabs: { id: FriendTab; label: string; count?: number; dot?: boolean }[] = [
    { id: 'requests', label: 'Friend requests', count: receivedReqs.length },
    { id: 'discover', label: 'Discover', dot: true },
    { id: 'friends', label: 'Your friends', count: myFriends.length },
  ];

  return (
    <div className="flex flex-col gap-3 pb-8">
      {/* Facebook-style Friends Header with Back Arrow and Search */}
      <div className="flex items-center justify-between px-1 py-1">
        <div className="flex items-center gap-2">
          <button
            onClick={goBack}
            className="p-2 -ml-2 rounded-full hover:bg-[var(--color-bg-card)] text-[var(--color-text-primary)] transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight">
            Friends
          </h1>
        </div>

        <button
          onClick={() => setShowSearchInput(!showSearchInput)}
          className="p-2 rounded-full hover:bg-[var(--color-bg-card)] text-[var(--color-text-primary)] transition-colors"
          aria-label="Search friends"
        >
          <Search className="w-5 h-5" />
        </button>
      </div>

      {/* Expandable Search Input */}
      {showSearchInput && (
        <div className="relative animate-in fade-in duration-150">
          <Search className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={discoverySearch}
            onChange={(e) => setDiscoverySearch(e.target.value)}
            placeholder="Search students, departments..."
            autoFocus
            className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
      )}

      {/* Pill Buttons Carousel */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-1">
        {tabs.map((tab) => {
          const isActive = friendTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFriendTab(tab.id)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                isActive
                  ? 'bg-[var(--color-primary)] text-white shadow-xs'
                  : 'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/40'
              }`}
            >
              {tab.dot && (
                <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-300' : 'bg-emerald-500'}`} />
              )}
              <span>{tab.label}</span>
              {Boolean(tab.count !== undefined && tab.count > 0) && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: DISCOVER ("People you may know") */}
      {friendTab === 'discover' && (
        <div className="flex flex-col gap-3 mt-1">
          {/* Mr Anonymous Verified Campus Page Card */}
          {anonPage && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-violet-900/15 via-[var(--color-bg-card)] to-[var(--color-bg-card)] border-2 border-violet-500/40 shadow-xs flex items-center justify-between gap-3">
              <div
                onClick={() => navigateTo('mr-anonymous')}
                className="flex items-center gap-3 min-w-0 cursor-pointer group flex-1"
              >
                <div className="relative w-14 h-14 rounded-2xl overflow-hidden ring-2 ring-violet-500 shadow-sm shrink-0 bg-slate-900">
                  <img
                    src={anonPage.avatarUrl || '/pwa-192x192.png'}
                    alt="Mr Anonymous"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-extrabold text-sm sm:text-base text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                      {anonPage.name}
                    </p>
                    <ShieldCheck className="w-4 h-4 text-violet-500 shrink-0" />
                  </div>
                  <p className="text-xs text-violet-600 dark:text-violet-400 font-bold truncate">
                    Official Page · @{anonPage.slug}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                    {anonPage.followersCount} followers · Campus confessions & gist
                  </p>
                </div>
              </div>

              <button
                onClick={handleFollowAnon}
                disabled={followLoading}
                className={`py-2 px-4 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 active:scale-95 shadow-xs ${
                  followingAnon
                    ? 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
                    : 'bg-violet-600 hover:bg-violet-700 text-white'
                }`}
              >
                {followingAnon ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Follow</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Section Heading: "People you may know" */}
          <div className="pt-2">
            <h2 className="text-lg font-black text-[var(--color-text-primary)] tracking-tight">
              People you may know
            </h2>
          </div>

          {/* List of Students */}
          {discoverUsers.length === 0 ? (
            <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl">
              <p className="text-sm font-bold text-[var(--color-text-primary)]">
                No matching students found
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                You have connected with all recommended peers or no new students match your search.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {discoverUsers.map((discovered) => {
                const isSent = discovered.relationshipState === 'request_sent';
                const onlineNow = isUserOnline(discovered.id);

                const myDept = (currentUser.department || '').trim().toLowerCase();
                const myFaculty = (currentUser.faculty || '').trim().toLowerCase();
                const myLevel = (currentUser.level || '').trim().toLowerCase();
                const dDept = (discovered.department || '').trim().toLowerCase();
                const dFaculty = (discovered.faculty || '').trim().toLowerCase();
                const dLevel = (discovered.level || '').trim().toLowerCase();
                const sharedInterest = (discovered.interests || []).find((i) =>
                  (currentUser.interests || []).some((m) => m.trim().toLowerCase() === i.trim().toLowerCase())
                );
                let matchLabel: string | null = null;
                if (myDept && myDept !== 'student' && myDept !== 'undergraduate' && dDept === myDept) {
                  matchLabel = 'Same Department';
                } else if (myFaculty && myFaculty !== 'abia state university' && dFaculty === myFaculty) {
                  matchLabel = 'Same Faculty';
                } else if (myLevel && dLevel === myLevel) {
                  matchLabel = 'Same Level';
                } else if (sharedInterest) {
                  matchLabel = `Shared: ${sharedInterest}`;
                }

                return (
                  <div
                    key={discovered.id}
                    className="p-3.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-xs flex items-center justify-between gap-3 transition-colors hover:border-[var(--color-primary)]/40"
                  >
                    {/* Left: Avatar + Details */}
                    <div
                      onClick={() => navigateTo('user-profile', { userId: discovered.id })}
                      className="flex items-center gap-3.5 min-w-0 cursor-pointer flex-1 group"
                    >
                      <div className="relative shrink-0">
                        <Avatar
                          src={discovered.avatar}
                          name={discovered.name}
                          size="lg"
                          showOnline={onlineNow}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-extrabold text-sm sm:text-base text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                            {discovered.name}
                          </p>
                          {onlineNow && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Online now
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--color-text-secondary)] truncate">
                          {discovered.department} · {discovered.level}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <span className="text-[11px] font-medium text-[var(--color-primary)] truncate">
                            {discovered.campus}
                          </span>
                          {matchLabel && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--color-primary-subtle)] text-[var(--color-primary)] text-[10px] font-bold">
                              <Sparkles className="w-2.5 h-2.5" />
                              {matchLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Add friend and Remove buttons */}
                    <div className="flex flex-col sm:flex-row items-center gap-1.5 shrink-0">
                      {isSent ? (
                        <span className="py-2 px-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)]">
                          Request Sent
                        </span>
                      ) : (
                        <button
                          onClick={() => sendFriendRequest(discovered.id)}
                          className="w-full sm:w-auto py-2 px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold shadow-xs transition-transform active:scale-95 flex items-center justify-center gap-1"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Add friend</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDismissUser(discovered.id)}
                        className="w-full sm:w-auto py-2 px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:bg-[var(--color-border)]/50 text-[var(--color-text-secondary)] text-xs font-semibold transition-colors"
                        title="Remove suggestion"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: FRIEND REQUESTS */}
      {friendTab === 'requests' && (
        <div className="flex flex-col gap-3 mt-1">
          {receivedReqs.length === 0 ? (
            <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center gap-2">
              <UserCheck className="w-10 h-10 text-[var(--color-text-secondary)] opacity-50" />
              <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                No pending friend requests
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] max-w-xs">
                When students from your faculty or campus invite you to connect, they'll appear here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {receivedReqs.map((req) => (
                <div
                  key={req.id}
                  className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div
                    onClick={() => navigateTo('user-profile', { userId: req.user.id })}
                    className="flex items-center gap-3 cursor-pointer group flex-1"
                  >
                    <Avatar src={req.user.avatar} name={req.user.name} size="lg" />
                    <div className="min-w-0">
                      <p className="font-bold text-sm sm:text-base text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                        {req.user.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)] truncate">
                        {req.user.department} · {req.user.level}
                      </p>
                      <p className="text-[11px] text-[var(--color-primary)] font-medium mt-0.5">
                        {req.user.campus ? `${req.user.campus} · ` : ''}{req.createdAt}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center w-full sm:w-auto">
                    <button
                      onClick={() => acceptFriendRequest(req.id)}
                      className="flex-1 sm:flex-initial py-2 px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold shadow-xs transition-all active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Confirm</span>
                    </button>
                    <button
                      onClick={() => declineFriendRequest(req.id)}
                      className="flex-1 sm:flex-initial py-2 px-4 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)] transition-colors flex items-center justify-center gap-1.5"
                    >
                      <X className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: YOUR FRIENDS */}
      {friendTab === 'friends' && (
        <div className="flex flex-col gap-3 mt-1">
          {myFriends.length === 0 ? (
            <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center gap-2">
              <Users className="w-10 h-10 text-[var(--color-text-secondary)] opacity-50" />
              <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                You haven't added friends yet
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] max-w-xs">
                Switch to the Discover tab to connect with Abia State University peers.
              </p>
              <button
                onClick={() => setFriendTab('discover')}
                className="mt-2 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold"
              >
                Discover Friends
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {myFriends.map((friend) => (
                <div
                  key={friend.id}
                  className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3 transition-colors"
                >
                  <div
                    onClick={() => navigateTo('user-profile', { userId: friend.id })}
                    className="flex items-center gap-3 min-w-0 cursor-pointer flex-1 group"
                  >
                    <Avatar
                      src={friend.avatar}
                      name={friend.name}
                      size="md"
                      showOnline={isUserOnline(friend.id)}
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                        {friend.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)] truncate">
                        {friend.department} · {friend.level}
                      </p>
                      <p className="text-[10px] text-[var(--color-primary)] font-medium truncate">
                        {friend.campus}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => startConversationWithUser(friend)}
                      className="p-2 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-colors"
                      title="Send message"
                      aria-label={`Message ${friend.name}`}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => removeFriend(friend.id)}
                      className="p-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-error)] transition-colors"
                      title="Unfriend"
                      aria-label={`Unfriend ${friend.name}`}
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
