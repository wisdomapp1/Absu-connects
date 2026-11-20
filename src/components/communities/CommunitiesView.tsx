import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  fetchCommunities,
  joinCommunity,
  leaveCommunity,
} from '../../lib/communityService.ts';
import { COMMUNITY_CATEGORIES, type Community } from '../../types/communities.ts';
import { CommunityCard } from './CommunityCard.tsx';
import { CreateCommunityModal } from './CreateCommunityModal.tsx';
import {
  ArrowLeft,
  Users,
  Search,
  Plus,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

interface CommunitiesViewProps {
  onSelectCommunity?: (communityId: string) => void;
}

export const CommunitiesView: React.FC<CommunitiesViewProps> = ({ onSelectCommunity }) => {
  const { goBack, navigateTo, addToast, currentUser } = useApp();
  const { user } = useAuth();
  const userId = user?.id || currentUser?.id;

  const [tab, setTab] = useState<'discover' | 'my' | 'managed'>('discover');
  const [category, setCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const loadCommunities = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchCommunities({
        tab,
        category: category === 'All' ? undefined : category,
        search: search.trim() || undefined,
        userId,
      });
      setCommunities(list);
    } finally {
      setLoading(false);
    }
  }, [tab, category, search, userId]);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  const handleJoinToggle = async (community: Community, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userId) {
      addToast('Please sign in to join a community.', 'warning');
      return;
    }

    const isManager =
      community.userRole === 'owner' ||
      community.userRole === 'admin' ||
      community.userRole === 'moderator';

    if (isManager) {
      if (onSelectCommunity) onSelectCommunity(community.id);
      else navigateTo('community-detail', { communityId: community.id });
      return;
    }

    setActionLoadingId(community.id);
    try {
      if (community.isMember || community.membershipStatus === 'pending') {
        const res = await leaveCommunity(community.id, userId);
        if (res.success) {
          addToast(`Left "${community.name}".`, 'info');
          await loadCommunities();
        } else {
          addToast(res.error || 'Could not update membership.', 'warning');
        }
      } else {
        const res = await joinCommunity(community.id, userId);
        if (res.success) {
          addToast(
            res.status === 'pending'
              ? `Join request sent to "${community.name}".`
              : `Joined "${community.name}"!`,
            'success'
          );
          await loadCommunities();
        } else {
          addToast(res.error || 'Could not join community.', 'warning');
        }
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenCommunity = (community: Community) => {
    if (onSelectCommunity) {
      onSelectCommunity(community.id);
    } else {
      navigateTo('community-detail', { communityId: community.id });
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-12">
      {/* Header */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={goBack}
              className="p-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-[var(--color-text-primary)] tracking-tight">
                ABSU Communities
              </h1>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Departmental hubs, faculty circles, study groups &amp; campus fellowships
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadCommunities}
              disabled={loading}
              className="p-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors"
              title="Refresh communities"
              aria-label="Refresh communities"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Create Community</span>
            </button>
          </div>
        </div>

        {/* Search & Tabs */}
        <div className="mt-4 flex flex-col gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search faculties, departments, study circles..."
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {[
              { id: 'discover' as const, label: 'Discover' },
              { id: 'my' as const, label: 'My Groups' },
              { id: 'managed' as const, label: 'Managed' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-[var(--color-primary)] text-white shadow-xs'
                    : 'bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
            {['All', ...COMMUNITY_CATEGORIES].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${
                  category === cat
                    ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-card)]'
                    : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Communities Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-64 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] animate-pulse"
            />
          ))}
        </div>
      ) : communities.length === 0 ? (
        <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
              No communities found
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1 max-w-xs mx-auto">
              {tab === 'my'
                ? 'Join a departmental or campus group from Discover, or launch one for your class.'
                : 'Be the first student to launch a community in this category!'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-1 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Launch a Community</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {communities.map((c) => (
            <CommunityCard
              key={c.id}
              community={c}
              onSelect={handleOpenCommunity}
              onJoinToggle={handleJoinToggle}
              isActionLoading={actionLoadingId === c.id}
            />
          ))}
        </div>
      )}

      <CreateCommunityModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(newCommunity) => {
          setCommunities((prev) => [newCommunity, ...prev]);
        }}
      />
    </div>
  );
};
