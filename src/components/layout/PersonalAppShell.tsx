import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { Header } from './Header.tsx';
import { BottomNav } from './BottomNav.tsx';
import { DesktopSidebar } from './DesktopSidebar.tsx';
import { DesktopRightSidebar } from './DesktopRightSidebar.tsx';
import { PullToRefresh } from '../common/PullToRefresh.tsx';
import { HomeView } from '../home/HomeView.tsx';
import { ReelsView } from '../reels/ReelsView.tsx';
import { PostDetailView } from '../home/PostDetailView.tsx';
import { FriendsView } from '../friends/FriendsView.tsx';
import { MessagesInbox } from '../messages/MessagesInbox.tsx';
import { ConversationView } from '../messages/ConversationView.tsx';
import { ContactInfoView } from '../messages/ContactInfoView.tsx';
import { AlertsView } from '../alerts/AlertsView.tsx';
import { SearchView } from '../search/SearchView.tsx';
import { ProfileView } from '../profile/ProfileView.tsx';
import { MoreView } from '../more/MoreView.tsx';
import { MarketplacePreview } from '../more/MarketplacePreview.tsx';
import { SettingsView } from '../more/SettingsView.tsx';
import { SavedPostsView } from '../more/SavedPostsView.tsx';
import { YourActivityView } from '../more/YourActivityView.tsx';
import { SafetyCenterView } from '../more/SafetyCenterView.tsx';
import { MrAnonymousPageView } from '../pages/MrAnonymousPageView.tsx';
import { PagesDirectoryView } from '../pages/PagesDirectoryView.tsx';
import { PageProfileView } from '../pages/PageProfileView.tsx';

export const PersonalAppShell: React.FC = () => {
  const {
    activeView,
    searchOpen,
    platformBanner,
    selectedCommunityId,
    selectedEventId,
    selectedUserId,
    selectedConversationId,
    selectedPostId,
    selectedPageId,
  } = useApp();

  const mainScrollRef = React.useRef<HTMLDivElement>(null);
  const scrollPositionsRef = React.useRef<Map<string, number>>(new Map());
  const viewScrollKey = searchOpen
    ? 'personal:search'
    : `personal:${activeView}:${
        selectedPostId ||
        selectedUserId ||
        selectedPageId ||
        selectedCommunityId ||
        selectedEventId ||
        selectedConversationId ||
        ''
      }`;
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
      if (detail?.view) {
        scrollPositionsRef.current.set(`personal:${detail.view}:`, 0);
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
  }, []);

  const renderActiveView = () => {
    if (searchOpen || activeView === 'search') {
      return <SearchView />;
    }

    switch (activeView) {
      case 'home':
        return <HomeView />;
      case 'reels':
        return <ReelsView />;
      case 'friends':
        return <FriendsView />;
      case 'messages':
        return <MessagesInbox />;
      case 'conversation':
        return <ConversationView />;
      case 'contact-info':
        return <ContactInfoView />;
      case 'alerts':
        return <AlertsView />;
      case 'profile':
        return <ProfileView isAnotherUser={false} />;
      case 'user-profile':
        return <ProfileView isAnotherUser={true} />;
      case 'marketplace':
        return <MarketplacePreview />;
      case 'saved':
        return <SavedPostsView />;
      case 'games':
      case 'events':
      case 'event-detail':
      case 'organizer-centre':
      case 'communities':
      case 'community-detail':
        return <MoreView />;
      case 'activity':
        return <YourActivityView />;
      case 'safety':
        return <SafetyCenterView />;
      case 'settings':
        return <SettingsView />;
      case 'more':
        return <MoreView />;
      case 'mr-anonymous':
        return <MrAnonymousPageView />;
      case 'pages':
        return <PagesDirectoryView />;
      case 'page-profile':
        return <PageProfileView />;
      case 'post-detail':
        return <PostDetailView />;
      default:
        return <HomeView />;
    }
  };

  const isDedicatedChatView = activeView === 'conversation' || activeView === 'contact-info';
  const isDedicatedReelsView = activeView === 'reels' && !searchOpen;

  return (
    <div className="fixed inset-0 h-[100dvh] max-h-[100dvh] w-full overflow-hidden flex flex-col bg-[var(--color-bg-main)] text-[var(--color-text-primary)] transition-colors selection:bg-[var(--color-primary-subtle)] selection:text-[var(--color-primary)]">
      {platformBanner && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-semibold text-center flex items-center justify-center gap-2 shadow-sm z-50 shrink-0">
          <span>📢 {platformBanner}</span>
        </div>
      )}

      <div className={isDedicatedChatView || isDedicatedReelsView ? 'hidden md:block shrink-0' : 'block shrink-0'}>
        <Header />
      </div>

      {isDedicatedChatView ? (
        <main className="flex-1 w-full mx-auto p-0 sm:px-4 sm:py-3 flex justify-center h-full min-h-0 overflow-hidden">
          <div className="w-full max-w-3xl flex-1 flex flex-col h-full min-h-0 overflow-hidden">
            {renderActiveView()}
          </div>
        </main>
      ) : isDedicatedReelsView ? (
        <main className="flex-1 min-h-0 max-w-6xl w-full mx-auto px-0 md:px-6 flex justify-center gap-6 overflow-hidden pb-16 md:pb-0">
          <div className="hidden md:block h-full overflow-y-auto overscroll-y-contain py-4 sm:py-6 shrink-0">
            <DesktopSidebar />
          </div>
          <div className="flex-1 h-full min-h-0 flex items-center justify-center overflow-hidden">
            <ReelsView />
          </div>
        </main>
      ) : (
        <main className="flex-1 min-h-0 max-w-6xl w-full mx-auto px-3.5 sm:px-6 flex justify-center gap-6 overflow-hidden">
          <div className="hidden md:block h-full overflow-y-auto overscroll-y-contain py-4 sm:py-6 shrink-0">
            <DesktopSidebar />
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

          <div className="hidden lg:block h-full overflow-y-auto overscroll-y-contain py-4 sm:py-6 shrink-0">
            <DesktopRightSidebar />
          </div>
        </main>
      )}

      {!isDedicatedChatView && <BottomNav />}
    </div>
  );
};
