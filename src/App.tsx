import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { BrandLogo } from './components/common/BrandLogo.tsx';
import { SignInView } from './components/auth/SignInView.tsx';
import { SignUpView } from './components/auth/SignUpView.tsx';
import { ForgotPasswordView } from './components/auth/ForgotPasswordView.tsx';
import { ResetPasswordView } from './components/auth/ResetPasswordView.tsx';
import { ProfileSetupView } from './components/auth/ProfileSetupView.tsx';
import { PersonalAppShell } from './components/layout/PersonalAppShell.tsx';
import { PageAppShell } from './components/layout/PageAppShell.tsx';
import { CreatePostModal } from './components/home/CreatePostModal.tsx';
import { EditProfileModal } from './components/profile/EditProfileModal.tsx';
import { ImageViewerModal } from './components/common/ImageViewerModal.tsx';
import { StoryViewerModal } from './components/stories/StoryViewerModal.tsx';
import { ToastContainer } from './components/common/Toast.tsx';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { PWAInstallBanner } from './components/common/PWAInstallBanner.tsx';
import { NotificationPermissionModal } from './components/common/NotificationPermissionModal.tsx';
import { CallProvider } from './context/CallContext.tsx';
import { IncomingCallModal } from './components/calls/IncomingCallModal.tsx';
import { ActiveCallOverlay } from './components/calls/ActiveCallOverlay.tsx';
import { CreatePageModal } from './components/pages/CreatePageModal.tsx';

const AppContent: React.FC = () => {
  const { session, user, authView, loading } = useAuth();
  const {
    activeIdentity,
    isSuperAdmin,
    adminViewOpen,
    closeAdminDashboard,
    notificationPromptOpen,
    setNotificationPromptOpen,
    createPageModalOpen,
    setCreatePageModalOpen,
    currentUser,
    storyModalState,
    closeStoryModal,
    addToast,
  } = useApp();

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

  // 2. Unauthenticated Routing
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

  return (
    <>
      {activeIdentity.type === 'page' ? (
        <PageAppShell key={`page:${activeIdentity.pageId}`} />
      ) : (
        <PersonalAppShell key="personal" />
      )}

      {/* Global Modals and Overlay Sheets */}
      <CreatePostModal />
      <CreatePageModal
        isOpen={createPageModalOpen}
        onClose={() => setCreatePageModalOpen(false)}
      />
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
    </>
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
