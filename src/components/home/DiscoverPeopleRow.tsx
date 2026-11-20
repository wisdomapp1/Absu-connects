import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { fetchMrAnonymousPage, toggleFollowPage, MR_ANONYMOUS_PAGE_ID } from '../../lib/pageService.ts';
import { EXCLUDED_STUDENT_IDS } from '../../lib/profileService.ts';
import type { Page } from '../../types/pages.ts';
import { UserPlus, Check, ChevronRight, ShieldCheck, Plus } from 'lucide-react';

export const DiscoverPeopleRow: React.FC = () => {
  const { discoverUsers, sendFriendRequest, navigateTo, addToast } = useApp();
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [anonPage, setAnonPage] = useState<Page | null>(null);
  const [followingAnon, setFollowingAnon] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    fetchMrAnonymousPage(currentUserId).then((data) => {
      if (data) {
        setAnonPage(data);
        setFollowingAnon(Boolean(data.isFollowing));
      }
    });
  }, [currentUserId]);

  const handleFollowAnon = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  // Filter out any Mr Anonymous accounts from normal student cards
  const peopleToDiscover = discoverUsers
    .filter(
      (person) =>
        !EXCLUDED_STUDENT_IDS.includes(person.id) &&
        person.id !== MR_ANONYMOUS_PAGE_ID &&
        person.name.toLowerCase() !== 'mr anonymous'
    )
    .slice(0, 10);

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-3.5 sm:p-4 shadow-sm transition-colors overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] leading-tight">
            Discover People & Pages
          </h2>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
            Connect with ABSU coursemates and campus pages
          </p>
        </div>

        <button
          onClick={() => navigateTo('friends')}
          className="flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
        >
          <span>See all</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Horizontal Carousel */}
      <div className="flex gap-3 overflow-x-auto pb-1 pt-1 -mx-3.5 sm:-mx-4 px-3.5 sm:px-4 hide-scrollbar snap-x">
        {/* Featured Page: Mr Anonymous */}
        {anonPage && (
          <div
            className="w-[155px] shrink-0 snap-start bg-gradient-to-b from-violet-500/10 via-[var(--color-bg-main)] to-[var(--color-bg-main)] border-2 border-violet-500/40 rounded-2xl p-3 flex flex-col items-center text-center justify-between transition-all hover:border-[var(--color-primary)] hover:shadow-md relative overflow-hidden"
          >
            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-violet-600 text-white text-[9px] font-extrabold uppercase tracking-wider">
              Page
            </div>

            <button
              onClick={() => navigateTo('mr-anonymous')}
              className="w-full flex flex-col items-center focus:outline-none group mt-1"
            >
              <div className="w-16 h-16 rounded-2xl overflow-hidden mb-2 ring-2 ring-violet-500 shadow-md group-hover:scale-105 transition-transform bg-slate-900">
                <img
                  src={anonPage.avatarUrl || '/pwa-192x192.png'}
                  alt="Mr Anonymous"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex items-center gap-1">
                <p className="font-extrabold text-xs text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                  {anonPage.name}
                </p>
                <ShieldCheck className="w-3.5 h-3.5 text-violet-500 shrink-0" />
              </div>

              <p className="text-[11px] text-violet-600 dark:text-violet-400 font-semibold truncate w-full mt-0.5">
                Official Page
              </p>

              <p className="text-[10px] text-[var(--color-text-secondary)] font-medium truncate w-full mt-0.5">
                @{anonPage.slug}
              </p>
            </button>

            <div className="w-full mt-3">
              <button
                onClick={handleFollowAnon}
                disabled={followLoading}
                className={`w-full py-1.5 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95 ${
                  followingAnon
                    ? 'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'
                    : 'bg-violet-600 hover:bg-violet-700 text-white'
                }`}
                aria-label={followingAnon ? 'Unfollow Mr Anonymous' : 'Follow Mr Anonymous'}
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
          </div>
        )}

        {/* Ordinary Students */}
        {peopleToDiscover.map((person) => {
          const isRequested = person.relationshipState === 'request_sent';
          const isFriend = person.relationshipState === 'friends';

          return (
            <div
              key={person.id}
              className="w-[155px] shrink-0 snap-start bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-2xl p-3 flex flex-col items-center text-center justify-between transition-all hover:border-[var(--color-primary)]/40 hover:shadow-sm"
            >
              <button
                onClick={() => navigateTo('user-profile', { userId: person.id })}
                className="w-full flex flex-col items-center focus:outline-none group"
              >
                <div className="w-16 h-16 rounded-full overflow-hidden mb-2 ring-2 ring-[var(--color-primary)]/20 group-hover:ring-[var(--color-primary)] transition-all">
                  <Avatar src={person.avatar} name={person.name} size="lg" className="w-full h-full" />
                </div>

                <p className="font-bold text-xs text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate w-full">
                  {person.name}
                </p>

                <p className="text-[11px] text-[var(--color-text-secondary)] truncate w-full mt-0.5">
                  {person.department}
                </p>

                <p className="text-[10px] text-[var(--color-primary)] font-medium truncate w-full mt-1">
                  {person.level || person.campus.split(' ')[0]}
                </p>
              </button>

              <div className="w-full mt-3">
                {isFriend ? (
                  <span className="w-full py-1.5 px-2 rounded-xl bg-[var(--color-success)]/10 text-[var(--color-success)] font-semibold text-xs flex items-center justify-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    Friends
                  </span>
                ) : isRequested ? (
                  <span className="w-full py-1.5 px-2 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] font-medium text-xs flex items-center justify-center">
                    Sent
                  </span>
                ) : (
                  <button
                    onClick={() => sendFriendRequest(person.id)}
                    className="w-full py-1.5 px-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium text-xs flex items-center justify-center gap-1 shadow-xs transition-transform active:scale-95"
                    aria-label={`Add friend ${person.name}`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
