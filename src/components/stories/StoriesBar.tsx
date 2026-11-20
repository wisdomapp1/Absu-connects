import React from 'react';
import type { UserStoryGroup } from '../../types/stories.ts';
import { Avatar } from '../common/Avatar.tsx';
import { Plus } from 'lucide-react';

interface StoriesBarProps {
  currentUserId?: string;
  currentUserProfile?: {
    name: string;
    avatar_url?: string;
  };
  storyGroups: UserStoryGroup[];
  loading: boolean;
  onSelectGroup: (groupIndex: number) => void;
  onAddStory?: () => void;
}

export const StoriesBar: React.FC<StoriesBarProps> = ({
  currentUserId,
  currentUserProfile,
  storyGroups,
  loading,
  onSelectGroup,
  onAddStory,
}) => {
  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-3 shadow-sm overflow-hidden transition-colors">
      <div className="flex items-center space-x-3 overflow-x-auto no-scrollbar py-1">
        {/* Add Story Tile (Always accessible) */}
        {onAddStory && (
          <button
            type="button"
            onClick={onAddStory}
            className="flex flex-col items-center flex-shrink-0 cursor-pointer group focus:outline-none"
            aria-label="Add to your campus story"
          >
            <div className="relative w-14 h-14 rounded-full p-0.5 border-2 border-dashed border-[var(--color-primary)]/60 group-hover:border-[var(--color-primary)] transition-transform group-hover:scale-105">
              <div className="w-full h-full rounded-full overflow-hidden bg-[var(--color-bg-main)]">
                <Avatar
                  src={currentUserProfile?.avatar_url}
                  name={currentUserProfile?.name || 'You'}
                  size="md"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[var(--color-primary)] text-white border-2 border-[var(--color-bg-card)] flex items-center justify-center shadow-xs">
                <Plus className="w-3 h-3 stroke-[3]" />
              </span>
            </div>
            <span className="text-[11px] font-semibold text-[var(--color-text-primary)] mt-1.5 max-w-[68px] truncate text-center">
              Add story
            </span>
          </button>
        )}

        {/* Loading skeleton */}
        {loading && storyGroups.length === 0 && (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col items-center flex-shrink-0 animate-pulse">
                <div className="w-14 h-14 rounded-full bg-[var(--color-border)]" />
                <div className="w-10 h-2.5 rounded bg-[var(--color-border)] mt-1.5" />
              </div>
            ))}
          </>
        )}

        {/* Active Stories */}
        {storyGroups.map((group, idx) => {
          const isSelf = group.user_id === currentUserId;
          return (
            <button
              key={group.user_id}
              type="button"
              onClick={() => onSelectGroup(idx)}
              className="flex flex-col items-center flex-shrink-0 cursor-pointer group focus:outline-none"
            >
              <div
                className={`w-14 h-14 rounded-full p-0.5 transition-transform group-hover:scale-105 ${
                  group.has_unviewed
                    ? 'bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 shadow-sm'
                    : isSelf
                    ? 'bg-gradient-to-tr from-blue-600 via-indigo-500 to-sky-400'
                    : 'border-2 border-slate-300 dark:border-slate-700'
                }`}
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <Avatar
                    src={group.user_avatar}
                    name={group.user_name}
                    size="md"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <span className="text-[11px] font-medium text-[var(--color-text-secondary)] mt-1.5 max-w-[64px] truncate text-center">
                {isSelf ? 'Your story' : group.user_name.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
