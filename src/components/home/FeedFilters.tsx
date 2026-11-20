import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { FeedFilter } from '../../types/index.ts';
import { Sparkles, Users, GraduationCap } from 'lucide-react';

export const FeedFilters: React.FC = () => {
  const { feedFilter, setFeedFilter } = useApp();

  const filters: { id: FeedFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'for-you', label: 'For You', icon: Sparkles },
    { id: 'friends', label: 'Friends', icon: Users },
    { id: 'campus', label: 'Campus Updates', icon: GraduationCap },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar" role="tablist">
      {filters.map((f) => {
        const isActive = feedFilter === f.id;
        const Icon = f.icon;

        return (
          <button
            key={f.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => setFeedFilter(f.id)}
            className={`h-9 px-3.5 rounded-full text-xs font-semibold flex items-center gap-2 shrink-0 transition-all select-none border ${
              isActive
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-sm'
                : 'bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/40'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-[var(--color-primary)]'}`} />
            <span>{f.label}</span>
          </button>
        );
      })}
    </div>
  );
};
