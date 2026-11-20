import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchCommunities, joinCommunity } from '../../lib/communityService.ts';
import type { Community } from '../../types/communities.ts';
import { Users, ChevronRight, Check, Plus, Shield, Globe, Lock, Sparkles } from 'lucide-react';

export const DiscoverCommunitiesRow: React.FC = () => {
  const { navigateTo, addToast } = useApp();
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const loadCommunities = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchCommunities({ tab: 'discover', userId: currentUserId });
      setCommunities(data.slice(0, 8));
    } catch {
      setCommunities([]);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  const handleJoin = async (e: React.MouseEvent, comm: Community) => {
    e.stopPropagation();
    if (!currentUserId) {
      addToast('Please sign in to join communities', 'warning');
      return;
    }

    if (comm.isMember) {
      navigateTo('community-detail', { communityId: comm.id });
      return;
    }

    setJoiningId(comm.id);
    try {
      const res = await joinCommunity(comm.id, currentUserId);
      if (res.success) {
        addToast(
          comm.privacy === 'private'
            ? 'Membership request sent to administrators'
            : `🎉 Joined ${comm.name}!`,
          'success'
        );
        setCommunities((prev) =>
          prev.map((c) =>
            c.id === comm.id
              ? {
                  ...c,
                  isMember: (res.status as string) === 'active' || (res.status as string) === 'approved',
                  membershipStatus: res.status as any,
                  membersCount: (res.status as string) === 'active' || (res.status as string) === 'approved' ? c.membersCount + 1 : c.membersCount,
                }
              : c
          )
        );
      } else {
        addToast(res.error || 'Could not join community', 'warning');
      }
    } catch {
      addToast('Error joining community', 'warning');
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-3.5 sm:p-4 shadow-sm transition-colors overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-1.5 leading-tight">
            <Users className="w-4 h-4 text-[var(--color-primary)]" />
            <span>Discover Communities</span>
          </h2>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
            Join faculty groups, department hubs, lodges & student interests
          </p>
        </div>

        <button
          onClick={() => navigateTo('communities')}
          className="flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline shrink-0"
        >
          <span>See all</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-1 pt-1 -mx-3.5 sm:-mx-4 px-3.5 sm:px-4 hide-scrollbar">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-[160px] h-[190px] shrink-0 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : communities.length === 0 ? (
        <div className="p-4 rounded-xl bg-[var(--color-bg-main)] border border-dashed border-[var(--color-border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--color-text-primary)]">Be the First Creator</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">Create a faculty, lodge or department space</p>
            </div>
          </div>
          <button
            onClick={() => navigateTo('communities')}
            className="px-3 py-1.5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold hover:opacity-90 shrink-0"
          >
            Create
          </button>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 pt-1 -mx-3.5 sm:-mx-4 px-3.5 sm:px-4 hide-scrollbar snap-x">
          {communities.map((comm) => {
            const isJoining = joiningId === comm.id;
            const isMember = comm.isMember || comm.membershipStatus === 'active' || comm.membershipStatus === 'approved';
            const isPending = comm.membershipStatus === 'pending';

            return (
              <div
                key={comm.id}
                onClick={() => navigateTo('community-detail', { communityId: comm.id })}
                className="w-[160px] shrink-0 snap-start bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 rounded-2xl p-3 flex flex-col items-center text-center justify-between transition-all cursor-pointer hover:shadow-xs group"
              >
                {/* Community Icon / Image Banner */}
                <div className="relative w-14 h-14 rounded-2xl overflow-hidden mb-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center group-hover:scale-105 transition-transform">
                  {comm.imageUrl ? (
                    <img
                      src={comm.imageUrl}
                      alt={comm.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[var(--color-primary)]/20 via-violet-500/10 to-[var(--color-primary)]/30 flex items-center justify-center font-extrabold text-base text-[var(--color-primary)]">
                      {comm.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {comm.privacy === 'private' ? (
                    <span className="absolute bottom-1 right-1 p-0.5 rounded-md bg-black/60 text-white backdrop-blur-xs" title="Private community">
                      <Lock className="w-2.5 h-2.5" />
                    </span>
                  ) : (
                    <span className="absolute bottom-1 right-1 p-0.5 rounded-md bg-black/60 text-white backdrop-blur-xs" title="Public community">
                      <Globe className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                <div className="w-full min-w-0">
                  <span className="inline-block px-1.5 py-0.5 rounded-md bg-[var(--color-primary-subtle)] text-[var(--color-primary)] text-[9px] font-bold uppercase tracking-wider truncate max-w-full">
                    {comm.category}
                  </span>

                  <p className="font-bold text-xs text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate w-full mt-1">
                    {comm.name}
                  </p>

                  <p className="text-[10px] text-[var(--color-text-secondary)] font-medium mt-0.5">
                    {comm.membersCount} {comm.membersCount === 1 ? 'member' : 'members'}
                  </p>
                </div>

                {/* Join / View Action */}
                <div className="w-full mt-2.5">
                  <button
                    onClick={(e) => handleJoin(e, comm)}
                    disabled={isJoining}
                    className={`w-full py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95 ${
                      isMember
                        ? 'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'
                        : isPending
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                        : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white'
                    }`}
                  >
                    {isJoining ? (
                      <span className="animate-spin text-xs">...</span>
                    ) : isMember ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Joined</span>
                      </>
                    ) : isPending ? (
                      <span>Pending</span>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Join</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
