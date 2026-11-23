import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { BrandLogo } from './components/common/BrandLogo.tsx';
import { SignInView } from './components/auth/SignInView.tsx';
import { SignUpView } from './components/auth/SignUpView.tsx';
import { ForgotPasswordView } from './components/auth/ForgotPasswordView.tsx';
import { ResetPasswordView } from './components/auth/ResetPasswordView.tsx';
import { ProfileSetupView } from './components/auth/ProfileSetupView.tsx';
import { Header } from './components/layout/Header.tsx';
import { BottomNav } from './components/layout/BottomNav.tsx';
import { DesktopSidebar } from './components/layout/DesktopSidebar.tsx';
import { DesktopRightSidebar } from './components/layout/DesktopRightSidebar.tsx';
import { HomeView } from './components/home/HomeView.tsx';
import { ReelsView } from './components/reels/ReelsView.tsx';
import { PostDetailView } from './components/home/PostDetailView.tsx';
import { FriendsView } from './components/friends/FriendsView.tsx';
import { MessagesInbox } from './components/messages/MessagesInbox.tsx';
import { ConversationView } from './components/messages/ConversationView.tsx';
import { ContactInfoView } from './components/messages/ContactInfoView.tsx';
import { AlertsView } from './components/alerts/AlertsView.tsx';
import { SearchView } from './components/search/SearchView.tsx';
import { ProfileView } from './components/profile/ProfileView.tsx';
import { MoreView } from './components/more/MoreView.tsx';
import { MarketplacePreview } from './components/more/MarketplacePreview.tsx';
import { SettingsView } from './components/more/SettingsView.tsx';
import { SavedPostsView } from './components/more/SavedPostsView.tsx';
import { YourActivityView } from './components/more/YourActivityView.tsx';
import { SafetyCenterView } from './components/more/SafetyCenterView.tsx';
import { CreatePostModal } from './components/home/CreatePostModal.tsx';
import { EditProfileModal } from './components/profile/EditProfileModal.tsx';
import { ImageViewerModal } from './components/common/ImageViewerModal.tsx';
import { StoryViewerModal } from './components/stories/StoryViewerModal.tsx';
import { ToastContainer } from './components/common/Toast.tsx';
import { PullToRefresh } from './components/common/PullToRefresh.tsx';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { PWAInstallBanner } from './components/common/PWAInstallBanner.tsx';
import { NotificationPermissionModal } from './components/common/NotificationPermissionModal.tsx';
import { CallProvider } from './context/CallContext.tsx';
import { IncomingCallModal } from './components/calls/IncomingCallModal.tsx';
import { ActiveCallOverlay } from './components/calls/ActiveCallOverlay.tsx';
import { MrAnonymousPageView } from './components/pages/MrAnonymousPageView.tsx';

const AppContent: React.FC = () => {
  const { session, user, authView, loading } = useAuth();
  const {
    activeView,
    searchOpen,
    isSuperAdmin,
    adminViewOpen,
    closeAdminDashboard,
    platformBanner,
    notificationPromptOpen,
    setNotificationPromptOpen,
    selectedCommunityId,
    selectedEventId,
    selectedUserId,
    selectedConversationId,
    selectedPostId,
    currentUser,
    storyModalState,
    closeStoryModal,
    addToast,
  } = useApp();

  const mainScrollRef = React.useRef<HTMLDivElement>(null);
  const scrollPositionsRef = React.useRef<Map<string, number>>(new Map());
  const viewScrollKey = searchOpen
    ? 'search'
    : `${activeView}:${selectedPostId || selectedUserId || selectedCommunityId || selectedEventId || selectedConversationId || ''}`;
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
        scrollPositionsRef.current.set(`${detail.view}:`, 0);
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

  // 1. Initial Session Resolution Splash
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-main)] flex flex-col items-center justify-center p-4">
        <BrandLogo size="lg" className="animate-pulse mb-3" />
        <p className="text-xs font-semibold text-[var(--color-text-secondary)]">
          Connecting to ABSU Connect...
        </p>
      </div>
    );
  }

  // 2. Unauthenticated Routing: SignIn, SignUp, ForgotPassword, ResetPassword, ProfileSetup
  if (!session || !user) {
    if (authView === 'signup') return <SignUpView />;
    if (authView === 'forgot-password') return <ForgotPasswordView />;
    if (authView === 'reset-password') return <ResetPasswordView />;
    if (authView === 'profile-setup') return <ProfileSetupView />;
    return <SignInView />;
  }

  // 3. Post-Registration Profile Onboarding
  if (authView === 'profile-setup') {
    return <ProfileSetupView />;
  }

  // 4. Recovery Route while authenticated
  if (authView === 'reset-password') {
    return <ResetPasswordView />;
  }

  // 5. Dedicated Full-Screen Super Admin Dashboard
  if (isSuperAdmin && adminViewOpen && session?.access_token) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <AdminDashboard
          token={session.access_token}
          adminEmail={user.email || 'wisdomchinonso82@gmail.com'}
          onBackToApp={closeAdminDashboard}
        />
        <ToastContainer />
      </div>
    );
  }

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
      case 'post-detail':
        return <PostDetailView />;
      default:
        return <HomeView />;
    }
  };

  const isDedicatedChatView = activeView === 'conversation' || activeView === 'contact-info';
  const isDedicatedReelsView = activeView === 'reels' && !searchOpen;

  return (
    <div
      className="fixed inset-0 h-[100dvh] max-h-[100dvh] w-full overflow-hidden flex flex-col bg-[var(--color-bg-main)] text-[var(--color-text-primary)] transition-colors selection:bg-[var(--color-primary-subtle)] selection:text-[var(--color-primary)]"
    >
      {/* Global Campus Broadcast Banner */}
      {platformBanner && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-semibold text-center flex items-center justify-center gap-2 shadow-sm z-50 shrink-0">
          <span>📢 {platformBanner}</span>
        </div>
      )}

      {/* 1. Global Application Header (Hidden on mobile during DM / Contact Info / Reels for native full-screen experience) */}
      <div className={isDedicatedChatView || isDedicatedReelsView ? 'hidden md:block shrink-0' : 'block shrink-0'}>
        <Header />
      </div>

      {/* 2. Main Responsive Canvas (locked viewport height; each column/screen scrolls independently) */}
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
          {/* Left Desktop Sidebar Navigation (independent scroll container) */}
          <div className="hidden md:block h-full overflow-y-auto overscroll-y-contain py-4 sm:py-6 shrink-0">
            <DesktopSidebar />
          </div>

          {/* Center Main Screen Container (independent scrolling & preserved scroll state per screen) */}
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

          {/* Right Desktop Highlights & Discovery Sidebar (independent scroll container) */}
          <div className="hidden lg:block h-full overflow-y-auto overscroll-y-contain py-4 sm:py-6 shrink-0">
            <DesktopRightSidebar />
          </div>
        </main>
      )}

      {/* 3. Fixed Mobile Bottom Navigation Bar (< 768px, hidden during DM / Contact Info) */}
      {!isDedicatedChatView && <BottomNav />}

      {/* 4. Global Modals and Overlay Sheets */}
      <CreatePostModal />
      <EditProfileModal />
      <ImageViewerModal />
      <StoryViewerModal
        isOpen={storyModalState.isOpen}
        onClose={closeStoryModal}
        storyGroups={storyModalState.storyGroups}
        initialGroupIndex={storyModalState.initialGroupIndex}
        initialStoryId={storyModalState.initialStoryId}
        initialInsightsOpen={storyModalState.initialInsightsOpen}
        initialInsightsTab={storyModalState.initialInsightsTab}
        currentUserId={currentUser.id}
        onStoryViewed={(storyId) => {
          window.dispatchEvent(new CustomEvent('absu:story-viewed', { detail: { storyId } }));
        }}
        onStoryDeleted={(storyId) => {
          window.dispatchEvent(new CustomEvent('absu:story-deleted', { detail: { storyId } }));
        }}
        onStoryReacted={(storyId, reaction, reactionsCount) => {
          window.dispatchEvent(
            new CustomEvent('absu:story-reacted', {
              detail: { storyId, reaction, reactionsCount },
            })
          );
        }}
        onShowToast={(msg, type) =>
          addToast(msg, type === 'error' ? 'warning' : type || 'info')
        }
      />
      <NotificationPermissionModal
        isOpen={notificationPromptOpen}
        onClose={() => setNotificationPromptOpen(false)}
      />
      <IncomingCallModal />
      <ActiveCallOverlay />
      <PWAInstallBanner />
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <CallProvider>
          <AppContent />
        </CallProvider>
      </AppProvider>
    </AuthProvider>
  );
}
