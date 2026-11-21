import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { Post } from '../../types/index.ts';
import {
  extractReelsHashtags,
  getPrimaryVideoMediaItem,
  searchReelsVideos,
} from '../../lib/reelsService.ts';
import { buildCloudinaryVideoPosterUrl } from '../../lib/cloudinaryService.ts';
import { Avatar } from '../common/Avatar.tsx';
import { ArrowLeft, Clapperboard, Heart, Play, Search, X } from 'lucide-react';

interface ReelsSearchModalProps {
  isOpen: boolean;
  initialQuery?: string;
  seedReels: Post[];
  onClose: () => void;
  onSelectReel: (reel: Post) => void;
}

export const ReelsSearchModal: React.FC<ReelsSearchModalProps> = ({
  isOpen,
  initialQuery = '',
  seedReels,
  onClose,
  onSelectReel,
}) => {
  const { currentUser } = useApp();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  const suggestedTags = React.useMemo(() => {
    const discovered = extractReelsHashtags(seedReels, 10);
    const defaults = ['#ABSU', '#CampusLife', '#Uturu', '#Talent'];
    const merged = Array.from(new Set([...discovered, ...defaults]));
    return merged.slice(0, 10);
  }, [seedReels]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery(initialQuery);
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const fetched = await searchReelsVideos(query, currentUser.id || undefined, 24);
        if (!cancelled) {
          setResults(fetched);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 240);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, query, currentUser.id]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Search Reels"
    >
      {/* Top Search Header */}
      <div className="px-3.5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-white/10 bg-neutral-950/95 backdrop-blur-md flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
          aria-label="Close Reels search"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-3.5 py-2 focus-within:border-[var(--color-primary)]">
          <Search className="w-4 h-4 text-white/60 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Reels by caption, #hashtag, or creator..."
            autoFocus
            className="flex-1 bg-transparent text-sm text-white placeholder-white/50 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-full text-white/60 hover:text-white"
              aria-label="Clear search query"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Hashtag Chips */}
      {suggestedTags.length > 0 && (
        <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          {suggestedTags.map((tag) => {
            const isSelected = query.trim().toLowerCase() === tag.toLowerCase();
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setQuery(isSelected ? '' : tag)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-colors ${
                  isSelected
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {/* Results Grid (Videos Only) */}
      <div className="flex-1 overflow-y-auto p-3.5 max-w-3xl w-full mx-auto">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-white/60">
            {query.trim() ? `Video results for "${query.trim()}"` : 'Discover Campus Reels'}
          </p>
          {!loading && (
            <span className="text-xs text-white/50">
              {results.length} {results.length === 1 ? 'reel' : 'reels'}
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div
                key={idx}
                className="aspect-[9/16] rounded-2xl bg-white/10 animate-pulse"
              />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center flex flex-col items-center justify-center gap-2.5">
            <Clapperboard className="w-10 h-10 text-white/40" />
            <p className="text-sm font-bold text-white">No matching video reels found</p>
            <p className="text-xs text-white/60 max-w-xs">
              Try a different keyword, creator username, or #hashtag. Only published video posts appear in Reels search.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pb-6">
            {results.map((reel) => {
              const videoItem = getPrimaryVideoMediaItem(reel);
              const rawUrl = videoItem?.secure_url || reel.mediaUrl || '';
              const posterUrl =
                videoItem?.thumbnail_url ||
                buildCloudinaryVideoPosterUrl(rawUrl, { timeOffset: videoItem?.trim_start ?? 0 }) ||
                '';

              return (
                <button
                  key={reel.id}
                  type="button"
                  onClick={() => {
                    onSelectReel(reel);
                    onClose();
                  }}
                  className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 text-left focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  {posterUrl ? (
                    <img
                      src={posterUrl}
                      alt={reel.content || `${reel.author.name} reel`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <video
                      src={rawUrl}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/30" />

                  <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur-xs flex items-center justify-center">
                    <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-2.5 flex flex-col gap-1">
                    {reel.content && (
                      <p className="text-[11px] font-semibold text-white line-clamp-2 leading-snug">
                        {reel.content}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Avatar src={reel.author.avatar} name={reel.author.name} size="xs" />
                        <span className="text-[11px] font-bold text-white/90 truncate">
                          {reel.author.name}
                        </span>
                      </div>
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-white/85 shrink-0">
                        <Heart className="w-3 h-3" />
                        {reel.likesCount}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
