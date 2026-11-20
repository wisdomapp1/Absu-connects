import React from 'react';
import type { Community } from '../../types/communities.ts';
import { LinkifiedText } from '../common/LinkifiedText.tsx';
import { Users, ShieldCheck, Lock, Globe, Check, Settings, ArrowRight, MapPin } from 'lucide-react';

interface CommunityCardProps {
  community: Community;
  onSelect: (community: Community) => void;
  onJoinToggle?: (community: Community, e: React.MouseEvent) => void;
  isActionLoading?: boolean;
}

export const CommunityCard: React.FC<CommunityCardProps> = ({
  community,
  onSelect,
  onJoinToggle,
  isActionLoading,
}) => {
  const isPrivate = community.privacy === 'private';
  const isMember = community.isMember;
  const isPending = community.membershipStatus === 'pending';
  const isManager =
    community.userRole === 'owner' ||
    community.userRole === 'admin' ||
    community.userRole === 'moderator';

  // Default fallback covers based on category
  const coverBg =
    community.coverUrl ||
    'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800&auto=format&fit=crop&q=80';

  const avatarSrc =
    community.imageUrl ||
    `https://api.dicebear.com/7.x/identicon/svg?seed=${community.id}&backgroundColor=4f46e5`;

  return (
    <div
      onClick={() => onSelect(community)}
      className="group relative bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between select-none"
    >
      <div>
        {/* Cover Photo Header */}
        <div className="relative h-28 sm:h-32 w-full bg-slate-900 overflow-hidden">
          <img
            src={coverBg}
            alt={`${community.name} cover`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800&auto=format&fit=crop&q=80';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

          {/* Privacy badge at top right */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md text-[11px] font-bold text-white border border-white/10">
            {isPrivate ? (
              <>
                <Lock className="w-3 h-3 text-amber-400" />
                <span>Private Group</span>
              </>
            ) : (
              <>
                <Globe className="w-3 h-3 text-emerald-400" />
                <span>Public Group</span>
              </>
            )}
          </div>
        </div>

        {/* Profile Avatar overlapping cover */}
        <div className="px-4 relative flex items-end justify-between -mt-8 mb-2">
          <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-[var(--color-bg-card)] p-1 border-2 border-[var(--color-bg-card)] shadow-md group-hover:scale-105 transition-transform">
            <img
              src={avatarSrc}
              alt={community.name}
              className="w-full h-full object-cover rounded-xl"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/identicon/svg?seed=${community.id}&backgroundColor=4f46e5`;
              }}
            />
          </div>

          <div className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
            {community.category}
          </div>
        </div>

        {/* Community Info */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-extrabold text-sm sm:text-base text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors line-clamp-1">
              {community.name}
            </h3>
            {community.isVerified && (
              <span title="Verified University Organization" className="inline-flex">
                <ShieldCheck className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
              </span>
            )}
          </div>

          {community.location && (
            <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)] mt-0.5 truncate">
              <MapPin className="w-3 h-3 text-indigo-500 shrink-0" />
              <span className="truncate">{community.location}</span>
            </div>
          )}

          <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2 mt-2 leading-relaxed">
            <LinkifiedText text={community.description} />
          </p>
        </div>
      </div>

      {/* Footer Info: Member Count & Action Button */}
      <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-app)]/40 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] font-medium">
          <Users className="w-3.5 h-3.5 text-[var(--color-primary)]" />
          <span className="font-bold text-[var(--color-text-primary)]">
            {community.membersCount.toLocaleString()}
          </span>
          <span>{community.membersCount === 1 ? 'member' : 'members'}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {onJoinToggle && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onJoinToggle(community, e);
              }}
              disabled={isActionLoading}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 active:scale-95 ${
                isManager
                  ? 'bg-slate-800 text-white dark:bg-slate-700'
                  : isMember
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : isPending
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white shadow-xs'
              }`}
            >
              {isActionLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : isManager ? (
                <>
                  <Settings className="w-3 h-3" />
                  <span>Manage</span>
                </>
              ) : isMember ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>Joined</span>
                </>
              ) : isPending ? (
                <span>Pending</span>
              ) : (
                <span>Join Group</span>
              )}
            </button>
          )}

          <div className="w-7 h-7 rounded-lg bg-[var(--color-border)]/50 flex items-center justify-center text-[var(--color-text-secondary)] group-hover:text-[var(--color-primary)] transition-colors shrink-0">
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
};
