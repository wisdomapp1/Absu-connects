import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { PageHeader } from './PageHeader.tsx';
import { PageBottomNav } from './PageBottomNav.tsx';
import { PageDesktopSidebar } from './PageDesktopSidebar.tsx';
import { PullToRefresh } from '../common/PullToRefresh.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { HomeView } from '../home/HomeView.tsx';
import { ReelsView } from '../reels/ReelsView.tsx';
import { PostDetailView } from '../home/PostDetailView.tsx';
import { SearchView } from '../search/SearchView.tsx';
import { ProfileView } from '../profile/ProfileView.tsx';
import { SavedPostsView } from '../more/SavedPostsView.tsx';
import { MarketplacePreview } from '../more/MarketplacePreview.tsx';
import { MrAnonymousPageView } from '../pages/MrAnonymousPageView.tsx';
import { PagesDirectoryView } from '../pages/PagesDirectoryView.tsx';
import { PageProfileView } from '../pages/PageProfileView.tsx';
import { PageFollowersView } from '../pages/PageFollowersView.tsx';
import { PageInboxView } from '../pages/PageInboxView.tsx';
import { PageNotificationsView } from '../pages/PageNotificationsView.tsx';
import { PageSettingsView } from '../pages/PageSettingsView.tsx';
import {
  Users,
  MessageCircle,
  Bell,
  Settings,
  ArrowRightLeft,
} from 'lucide-react';

export const PageAppShell: React.FC = () => {
  const {
    activeView,
    activeIdentity,
    currentUser,
    searchOpen,
    platformBanner,
    selectedUserId,
    selectedPostId,
    selectedPageId,
    selectedPageInboxConvId,
    activePageInboxUnreadCount,
    activePageNotifsUnreadCount,
    navigateTo,
    switchIdentity,
  } = useApp();

  const mainScrollRef = React.useRef<HTMLDivElement>(null);
  const scrollPositionsRef = React.useRef<Map<string, number>>(new Map());

  const pageId = activeIdentity.type === 'page' ? activeIdentity.pageId : '';
  const viewScrollKey = searchOpen
    ? `page:${pageId}:search`
    : `page:${pageId}:${activeView}:${selectedPostId || selectedUserId || selectedPageId || ''}`;
  const viewScrollKeyRef = React.useRef<string>(viewScrollKey);
  viewScrollKeyRef.current = viewScrollKey;

  React.useLayoutEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const savedTop = scrollPositionsRef.current.get(viewScrollKey) ?? 0;
    el.scrollTop = savedTop;
    const rafId = requestAnimationFrame(() => {
      if (mainScrollRef.current && viewScrollKeyRef.current === viewScrollKey) {
        mainScrollRef.current.scrollTop = savedTop;
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [viewScrollKey]);

  const handleMainScroll = React.useCallback(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    scrollPositionsRef.current.set(viewScrollKeyRef.current, el.scrollTop);
  }, []);

  React.useEffect(() => {
    const handleScrollToTop = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: string }>).detail;
      scrollPositionsRef.current.set(viewScrollKeyRef.current, 0);
      if (detail?.view && pageId) {
        scrollPositionsRef.current.set(`page:${pageId}:${detail.view}:`, 0);
      }

      const el = mainScrollRef.current;
      if (el) {
        try {
          el.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        } catch {
          // Fallback for WebViews without 'instant' option
        }
        el.scrollTop = 0;

        const nestedScrollables = el.querySelectorAll<HTMLElement>('[data-scroll-container]');
        nestedScrollables.forEach((child) => {
          try {
            child.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
          } catch {
            // ignore
          }
          child.scrollTop = 0;
        });
      }

      if (typeof window !== 'undefined') {
        try {
          window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        } catch {
          window.scrollTo(0, 0);
        }
      }
    };

    window.addEventListener('absu:scroll-top', handleScrollToTop);
    return () => window.removeEventListener('absu:scroll-top', handleScrollToTop);
  }, [pageId]);

  if (activeIdentity.type !== 'page') {
    return null;
  }

  const { page, role } = activeIdentity;

  const renderActiveView = () => {
    if (searchOpen || activeView === 'search') {
      return <SearchView />;
    }

    switch (activeView) {
      case 'home':
        return <HomeView />;
      case 'reels':
        return <ReelsView />;
      case 'post-detail':
        return <PostDetailView />;
      case 'user-profile':
        return <ProfileView isAnotherUser={true} />;
      case 'saved':
        return <SavedPostsView />;
      case 'marketplace':
        return <MarketplacePreview />;
      case 'mr-anonymous':
        return <MrAnonymousPageView />;
      case 'pages':
        return <PagesDirectoryView />;
      case 'page-profile':
        return <PageProfileView />;
      case 'page-followers':
        return <PageFollowersView page={page} role={role} />;
      case 'page-inbox':
        return <PageInboxView page={page} initialConvId={selectedPageInboxConvId} />;
      case 'page-notifications':
        return <PageNotificationsView page={page} />;
      case 'page-settings':
        return <PageSettingsView page={page} role={role} />;
      default:
        return <HomeView />;
    }
  };

  const isDedicatedReelsView = activeView === 'reels' && !searchOpen;

  return (
    <div className="fixed inset-0 h-[100dvh] max-h-[100dvh] w-full overflow-hidden flex flex-col bg-[var(--color-bg-main)] text-[var(--color-text-primary)] transition-colors selection:bg-[var(--color-primary-subtle)] selection:text-[var(--color-primary)]">
      {platformBanner && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-semibold text-center flex items-center justify-center gap-2 shadow-sm z-50 shrink-0">
          <span>📢 {platformBanner}</span>
        </div>
      )}

      <div className={isDedicatedReelsView ? 'hidden md:block shrink-0' : 'block shrink-0'}>
        <PageHeader />
      </div>

      {isDedicatedReelsView ? (
        <main className="flex-1 min-h-0 max-w-6xl w-full mx-auto px-0 md:px-6 flex justify-center gap-6 overflow-hidden pb-16 md:pb-0">
          <div className="hidden md:block h-full overflow-y-auto overscroll-y-contain py-4 sm:py-6 shrink-0">
            <PageDesktopSidebar />
          </div>
          <div className="flex-1 h-full min-h-0 flex items-center justify-center overflow-hidden">
            <ReelsView />
          </div>
        </main>
      ) : (
        <main className="flex-1 min-h-0 max-w-6xl w-full mx-auto px-3.5 sm:px-6 flex justify-center gap-6 overflow-hidden">
          <div className="hidden md:block h-full overflow-y-auto overscroll-y-contain py-4 sm:py-6 shrink-0">
            <PageDesktopSidebar />
          </div>

          <div
            ref={mainScrollRef}
            onScroll={handleMainScroll}
            data-scroll-view={viewScrollKey}
            className="flex-1 max-w-xl w-full h-full min-h-0 overflow-y-auto overscroll-y-contain py-4 sm:py-6 pb-24 md:pb-8 min-w-0"
          >
            <PullToRefresh scrollContainerRef={mainScrollRef}>
              {renderActiveView()}
            </PullToRefresh>
          </div>

          {/* Right Desktop Page Workspace Summary */}
          <div className="hidden lg:block h-full overflow-y-auto overscroll-y-contain py-4 sm:py-6 shrink-0">
            <aside className="flex flex-col w-72 shrink-0 sticky top-20 self-start gap-4">
              <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-sm space-y-3">
                <div className="flex items-center gap-2.5">
                  <Avatar src={page.avatarUrl} name={page.name} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <h2 className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                        {page.name}
                      </h2>
                      {page.isVerified && <VerifiedBadge size={14} />}
                    </div>
                    <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                      {page.followersCount.toLocaleString()} followers ·{' '}
                      {role === 'owner' ? 'Owner' : 'Admin'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => navigateTo('page-followers', { pageId: page.id })}
                    className="p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-left hover:border-[var(--color-primary)]/40 transition-colors"
                  >
                    <Users className="w-4 h-4 text-[var(--color-primary)] mb-1" />
                    <p className="text-xs font-bold text-[var(--color-text-primary)] tabular-nums">
                      {page.followersCount.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-secondary)]">Followers</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateTo('page-inbox', { pageId: page.id })}
                    className="p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-left hover:border-[var(--color-primary)]/40 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-500 mb-1" />
                    <p className="text-xs font-bold text-[var(--color-text-primary)] tabular-nums">
                      {activePageInboxUnreadCount}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-secondary)]">Unread Inbox</p>
                  </button>
                </div>

                <div className="space-y-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => navigateTo('page-notifications', { pageId: page.id })}
                    className="w-full py-2 px-3 rounded-xl bg-[var(--color-bg-main)] hover:bg-[var(--color-primary-subtle)]/50 text-xs font-semibold text-[var(--color-text-primary)] flex items-center justify-between transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Bell className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>Page Alerts</span>
                    </span>
                    {activePageNotifsUnreadCount > 0 && (
                      <span className="text-[11px] font-bold text-rose-500 tabular-nums">
                        {activePageNotifsUnreadCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateTo('page-settings', { pageId: page.id })}
                    className="w-full py-2 px-3 rounded-xl bg-[var(--color-bg-main)] hover:bg-[var(--color-primary-subtle)]/50 text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2 transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    <span>Page Settings</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-[var(--color-border)]">
                  <button
                    type="button"
                    onClick={() => switchIdentity('personal')}
                    className="w-full py-2.5 px-3 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span className="truncate">Back to {currentUser.name}</span>
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </main>
      )}

      <PageBottomNav />
    </div>
  );
};
