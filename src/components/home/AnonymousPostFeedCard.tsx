import React from 'react';
import { ShieldCheck, ChevronRight, Sparkles } from 'lucide-react';

interface AnonymousPostFeedCardProps {
  onOpenIntro: () => void;
}

export const AnonymousPostFeedCard: React.FC<AnonymousPostFeedCardProps> = ({
  onOpenIntro,
}) => {
  return (
    <div
      onClick={onOpenIntro}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenIntro();
        }
      }}
      className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-900/15 via-[var(--color-bg-card)] to-purple-900/10 border border-violet-500/25 hover:border-violet-500/45 p-4 sm:p-4.5 shadow-xs hover:shadow-md transition-all cursor-pointer select-none active:scale-[0.99]"
      aria-label="Post anonymously to Mr Anonymous"
    >
      <div className="flex items-center gap-3.5">
        {/* Subtle Shield Privacy Badge */}
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-violet-600/20 group-hover:scale-105 transition-transform">
          <ShieldCheck className="w-6 h-6" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors tracking-tight">
              Post anonymously
            </h3>
            <span className="hidden xs:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/15 text-violet-700 dark:text-violet-300">
              <Sparkles className="w-2.5 h-2.5" />
              Mr Anonymous
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-2 leading-relaxed">
            Share a confession, campus gist, experience, or question without publishing it under your profile.
          </p>
        </div>

        {/* Chevron Action */}
        <div className="w-8 h-8 rounded-full bg-[var(--color-bg-main)] group-hover:bg-[var(--color-primary)] text-[var(--color-text-secondary)] group-hover:text-white flex items-center justify-center shrink-0 transition-colors shadow-xs">
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
};
