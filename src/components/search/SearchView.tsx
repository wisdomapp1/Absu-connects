import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { searchEntities } from '../../utils/logic.ts';
import { searchPages } from '../../lib/pageService.ts';
import type { Page } from '../../types/pages.ts';
import { Avatar } from '../common/Avatar.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { PostCard } from '../home/PostCard.tsx';
import { Search, X, ArrowLeft, Clock, UserPlus, Users, Sparkles, Flag } from 'lucide-react';

export const SearchView: React.FC = () => {
  const {
    currentUser,
    users,
    posts,
    sendFriendRequest,
    navigateTo,
    goBack,
    setSearchOpen,
  } = useApp();

  const [query, setQuery] = useState('');
  const [pageResults, setPageResults] = useState<Page[]>([]);
  const [searchingPages, setSearchingPages] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([
    'Computer Science',
    'Amaka',
    'Law',
    'Library',
  ]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setPageResults([]);
      setSearchingPages(false);
      return;
    }
    let cancelled = false;
    setSearchingPages(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchPages(trimmed, currentUser.id || undefined, 12);
        if (!cancelled) {
          setPageResults(res);
        }
      } finally {
        if (!cancelled) {
          setSearchingPages(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, currentUser.id]);

  const searchResults = query.trim()
    ? searchEntities(query, users, posts)
    : { users: [], posts: [] };

  const handleSelectRecent = (term: string) => {
    setQuery(term);
  };

  const handleClearQuery = () => {
    setQuery('');
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Search Header Bar */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-3.5 sm:p-4 shadow-sm transition-colors">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSearchOpen(false);
              goBack();
            }}
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-xl min-w-[36px] min-h-[36px] flex items-center justify-center shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ABSU students, Pages, departments, posts..."
              autoCorrect="on"
              autoCapitalize="none"
              spellCheck={true}
              enterKeyHint="search"
              className="w-full pl-9 pr-9 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              autoFocus
            />
            {query && (
              <button
                onClick={handleClearQuery}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Recent Searches row when query is empty */}
        {!query && recentSearches.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
            <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] mb-2">
              <span className="font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Recent Searches</span>
              </span>
              <button
                onClick={() => setRecentSearches([])}
                className="text-[11px] text-[var(--color-primary)] hover:underline"
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recentSearches.map((term) => (
                <button
                  key={term}
                  onClick={() => handleSelectRecent(term)}
                  className="px-3 py-1 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] hover:border-[var(--color-primary)] transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results View */}
      {query.trim() ? (
        <div className="flex flex-col gap-4">
          {/* Matching Pages */}
          {pageResults.length > 0 && (
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm transition-colors">
              <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
                <Flag className="w-4 h-4 text-[var(--color-primary)]" />
                <span>Pages ({pageResults.length})</span>
              </h2>

              <div className="flex flex-col gap-2.5">
                {pageResults.map((pg) => (
                  <button
                    key={pg.id}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      navigateTo('page-profile', { pageId: pg.id });
                    }}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 text-left group transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={pg.avatarUrl} name={pg.name} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-xs sm:text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                            {pg.name}
                          </p>
                          {pg.isVerified && <VerifiedBadge size={14} />}
                        </div>
                        <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                          {pg.category} · <span className="tabular-nums">{pg.followersCount.toLocaleString()}</span> followers
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[var(--color-primary)] shrink-0 ml-2">
                      View
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Matching Students */}
          {searchResults.users.length > 0 && (
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm transition-colors">
              <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--color-primary)]" />
                <span>Students ({searchResults.users.length})</span>
              </h2>

              <div className="flex flex-col gap-2.5">
                {searchResults.users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]"
                  >
                    <button
                      onClick={() => navigateTo('user-profile', { userId: user.id })}
                      className="flex items-center gap-2.5 min-w-0 text-left group"
                    >
                      <Avatar src={user.avatar} name={user.name} size="md" />
                      <div className="min-w-0">
                        <p className="font-bold text-xs sm:text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                          {user.name}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                          {user.department} · {user.campus}
                        </p>
                      </div>
                    </button>

                    {user.relationshipState === 'none' && (
                      <button
                        onClick={() => sendFriendRequest(user.id)}
                        className="p-1.5 rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] transition-colors shrink-0"
                        title="Add friend"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matching Posts */}
          {searchResults.posts.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-bold text-[var(--color-text-primary)] px-1 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                <span>Posts & Campus Updates ({searchResults.posts.length})</span>
              </h2>
              {searchResults.posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          {/* No results */}
          {!searchingPages &&
            pageResults.length === 0 &&
            searchResults.users.length === 0 &&
            searchResults.posts.length === 0 && (
            <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center gap-2">
              <Search className="w-10 h-10 text-[var(--color-text-secondary)] opacity-50" />
              <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                No matching results found for "{query}"
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] max-w-xs">
                Try searching by Page name, student name, faculty, course code, or campus location.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Suggested Discovery when not searching */
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm transition-colors">
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-3">
            Popular Campus Searches
          </h2>
          <div className="flex flex-wrap gap-2">
            {[
              'Computer Science',
              'Medicine Aba',
              'Law Faculty',
              'Hostel B Pumping',
              'Intramural football',
              'Library power',
              'SUG debate',
            ].map((tag) => (
              <button
                key={tag}
                onClick={() => setQuery(tag)}
                className="px-3 py-1.5 rounded-xl bg-[var(--color-bg-main)] hover:bg-[var(--color-primary-subtle)] text-xs text-[var(--color-text-primary)] hover:text-[var(--color-primary)] border border-[var(--color-border)] transition-colors"
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
