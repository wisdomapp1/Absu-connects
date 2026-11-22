import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  ArrowLeft,
  Moon,
  Sun,
  Laptop,
  Bell,
  Eye,
  Lock,
  Shield,
  Smartphone,
  Check,
  User,
  KeyRound,
  LogOut,
  Globe,
  FileText,
  Bookmark,
  Activity,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  Info,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  Volume2,
  Send,
  Sparkles,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import {
  getPushPermissionStatus,
  subscribeUserToPush,
  unsubscribeUserFromPush,
  playNotificationChime,
  sendTestNotification,
  isPushNotificationSupported,
  isRunningInIframe,
} from '../../lib/pushService.ts';
import {
  getPushDiagnosticInfo,
  initAllPushChannels,
  initWebFirebasePush,
  isNativeAndroidApp,
  sendDiagnosticFcmTest,
  type PushDiagnosticInfo,
} from '../../lib/nativePushService.ts';
import { safeStorage } from '../../utils/safeStorage.ts';

export const SettingsView: React.FC = () => {
  const {
    currentUser,
    theme,
    setTheme,
    resolvedTheme,
    goBack,
    navigateTo,
    setEditProfileModalOpen,
    addToast,
    openNotificationPrompt,
    notificationPromptOpen,
    refreshNotifications,
  } = useApp();
  const { user, signOut, updateUserPassword } = useAuth();

  // Push Notifications state
  const [pushStatus, setPushStatus] = useState<NotificationPermission | 'unsupported'>(() =>
    getPushPermissionStatus()
  );
  const [pushEnabled, setPushEnabled] = useState<boolean>(() => {
    return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  });
  const [pushLoading, setPushLoading] = useState(false);
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [pushDiagnostics, setPushDiagnostics] = useState<PushDiagnosticInfo | null>(null);
  const [syncingToken, setSyncingToken] = useState(false);
  const [fcmStatusNote, setFcmStatusNote] = useState<string | null>(null);

  const inPreviewIframe = isRunningInIframe();

  const loadPushDiagnostics = useCallback(async () => {
    if (!user?.id) return;
    const info = await getPushDiagnosticInfo(user.id).catch(() => null);
    if (info) {
      setPushDiagnostics(info);
      setPushStatus(getPushPermissionStatus());
      if (info.permissionStatus === 'granted') {
        setPushEnabled(true);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (!notificationPromptOpen) {
      loadPushDiagnostics();
    }
  }, [loadPushDiagnostics, notificationPromptOpen]);

  // Notification state
  const [notifCampus, setNotifCampus] = useState(true);
  const [notifMessages, setNotifMessages] = useState(true);
  const [notifFriends, setNotifFriends] = useState(true);

  // Audience & Visibility state
  const [postAudience, setPostAudience] = useState<'campus' | 'public' | 'friends'>('campus');
  const [profileAudience, setProfileAudience] = useState<'campus' | 'friends' | 'public'>('campus');
  const [friendRequestAudience, setFriendRequestAudience] = useState<'all' | 'friends_of_friends'>('all');

  // Change Password state
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // About modal state
  const [termsModalOpen, setTermsModalOpen] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordLoading(true);
    const res = await updateUserPassword(newPassword);
    setPasswordLoading(false);

    if (res.success) {
      addToast('Password updated successfully.', 'success');
      setPasswordModalOpen(false);
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPasswordError(res.error || 'Failed to update password.');
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Back button */}
      <button
        onClick={goBack}
        className="self-start flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors min-h-[36px]"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to More</span>
      </button>

      {/* Header */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)]">
          Settings & Privacy
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
          Manage your account credentials, display themes, privacy preferences, and notifications.
        </p>
      </div>

      {/* Section A: Your Account */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Your Account</span>
        </h2>

        <div className="flex flex-col divide-y divide-[var(--color-border)] text-xs">
          {/* Edit Profile */}
          <button
            onClick={() => setEditProfileModalOpen(true)}
            className="py-3 flex items-center justify-between text-left hover:text-[var(--color-primary)] transition-colors"
          >
            <div>
              <p className="font-bold text-[var(--color-text-primary)]">Edit Student Profile</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Update name, department, level, campus, and profile picture
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)] shrink-0" />
          </button>

          {/* Account Information */}
          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="font-bold text-[var(--color-text-primary)]">Account Email</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                {user?.email || 'Authenticated ABSU Account'}
              </p>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)]">
              {currentUser.handle}
            </span>
          </div>

          {/* Change Password */}
          <button
            onClick={() => setPasswordModalOpen(true)}
            className="py-3 flex items-center justify-between text-left hover:text-[var(--color-primary)] transition-colors"
          >
            <div>
              <p className="font-bold text-[var(--color-text-primary)]">Change Password</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Update your login security credentials
              </p>
            </div>
            <KeyRound className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
          </button>

          {/* Sign Out */}
          <button
            onClick={async () => {
              await signOut();
              addToast('Signed out of ABSU Connect', 'info');
            }}
            className="py-3 flex items-center justify-between text-left text-[var(--color-error)] font-bold hover:underline"
          >
            <div className="flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--color-error)]" />
          </button>
        </div>
      </div>

      {/* Section B: Preferences (Appearance & Language) */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 mb-3">
          {resolvedTheme === 'dark' ? (
            <Moon className="w-4 h-4 text-violet-400" />
          ) : (
            <Sun className="w-4 h-4 text-amber-500" />
          )}
          <span>Preferences</span>
        </h2>

        {/* Appearance Mode Grid */}
        <p className="text-xs font-semibold text-[var(--color-text-primary)] mb-1.5">
          Appearance Mode
        </p>
        <p className="text-[11px] text-[var(--color-text-secondary)] mb-2.5">
          Changes immediately update the ABSU Connect visual palette and persist across reloads.
        </p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <button
            onClick={() => setTheme('light')}
            className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
              theme === 'light'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)] font-bold text-[var(--color-primary)]'
                : 'border-[var(--color-border)] hover:bg-[var(--color-bg-main)] text-[var(--color-text-primary)]'
            }`}
          >
            <Sun className="w-5 h-5 text-amber-500" />
            <span className="text-xs">Light</span>
          </button>

          <button
            onClick={() => setTheme('dark')}
            className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
              theme === 'dark'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)] font-bold text-[var(--color-primary)]'
                : 'border-[var(--color-border)] hover:bg-[var(--color-bg-main)] text-[var(--color-text-primary)]'
            }`}
          >
            <Moon className="w-5 h-5 text-violet-400" />
            <span className="text-xs">Dark</span>
          </button>

          <button
            onClick={() => setTheme('system')}
            className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
              theme === 'system'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)] font-bold text-[var(--color-primary)]'
                : 'border-[var(--color-border)] hover:bg-[var(--color-bg-main)] text-[var(--color-text-primary)]'
            }`}
          >
            <Laptop className="w-5 h-5 text-[var(--color-text-secondary)]" />
            <span className="text-xs">System</span>
          </button>
        </div>

        {/* Language Row */}
        <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[var(--color-text-secondary)]" />
            <div>
              <p className="font-bold text-[var(--color-text-primary)]">Language</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">Campus Standard</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)]">
            English (NG)
          </span>
        </div>
      </div>

      {/* Section C: Audience & Visibility */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Audience & Visibility</span>
        </h2>

        {/* Profile Visibility */}
        <p className="text-xs font-semibold text-[var(--color-text-primary)] mb-1">
          Profile Visibility
        </p>
        <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">
          Control who can view your full student bio, department, and contact info.
        </p>
        <div className="flex flex-col gap-2 mb-4">
          {[
            { id: 'campus', title: 'ABSU Community Only (Recommended)', desc: 'Visible to students and faculty with verified campus credentials' },
            { id: 'friends', title: 'Friends Only', desc: 'Only mutual friends you have accepted can view your full profile' },
            { id: 'public', title: 'Public Web', desc: 'Discoverable to any student visitor' },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => {
                setProfileAudience(option.id as any);
                addToast(`Profile visibility: ${option.title}`, 'info');
              }}
              className={`p-3 rounded-xl border text-left flex items-start justify-between transition-colors ${
                profileAudience === option.id
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)]'
                  : 'border-[var(--color-border)] hover:bg-[var(--color-bg-main)]'
              }`}
            >
              <div>
                <p className="text-xs font-bold text-[var(--color-text-primary)]">{option.title}</p>
                <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">{option.desc}</p>
              </div>
              {profileAudience === option.id && (
                <Check className="w-4 h-4 text-[var(--color-primary)] shrink-0 mt-0.5" />
              )}
            </button>
          ))}
        </div>

        {/* Who Can See My Friend List */}
        <div className="pt-3 border-t border-[var(--color-border)]">
          <p className="text-xs font-semibold text-[var(--color-text-primary)] mb-1">
            Who Can See My Friend List?
          </p>
          <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">
            Choose who is allowed to view the connections list on your student profile.
          </p>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'everyone', label: 'Everyone' },
              { id: 'friends', label: 'Friends only (default)' },
              { id: 'selected', label: 'Selected friends' },
            ].map((opt) => {
              const currentFriendPrivacy = user
                ? safeStorage.getItem(`absu_friend_list_privacy_${user.id}`) || 'friends'
                : 'friends';
              const isSelected = currentFriendPrivacy === opt.id;

              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    if (user) {
                      safeStorage.setItem(`absu_friend_list_privacy_${user.id}`, opt.id);
                    }
                    addToast(`Friend list privacy: ${opt.label}`, 'info');
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${
                    isSelected
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] shadow-xs'
                      : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Friend Request Permissions */}
        <div className="pt-3 border-t border-[var(--color-border)]">
          <p className="text-xs font-semibold text-[var(--color-text-primary)] mb-1">
            Who Can Send You Friend Requests
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setFriendRequestAudience('all');
                addToast('Friend request permissions: Anyone in ABSU', 'info');
              }}
              className={`flex-1 p-2.5 rounded-xl border text-xs font-bold transition-all ${
                friendRequestAudience === 'all'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
              }`}
            >
              Anyone in ABSU
            </button>
            <button
              onClick={() => {
                setFriendRequestAudience('friends_of_friends');
                addToast('Friend request permissions: Friends of Friends', 'info');
              }}
              className={`flex-1 p-2.5 rounded-xl border text-xs font-bold transition-all ${
                friendRequestAudience === 'friends_of_friends'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
              }`}
            >
              Friends of Friends
            </button>
          </div>
        </div>
      </div>

      {/* Section D: Your Activity */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Your Activity</span>
        </h2>

        <div className="flex flex-col divide-y divide-[var(--color-border)] text-xs">
          <button
            onClick={() => navigateTo('activity')}
            className="py-3 flex items-center justify-between text-left hover:text-[var(--color-primary)] transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-[var(--color-text-secondary)]" />
              <div>
                <p className="font-bold text-[var(--color-text-primary)]">My Posts & Contributions</p>
                <p className="text-[11px] text-[var(--color-text-secondary)]">View your published updates and engagement metrics</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)] shrink-0" />
          </button>

          <button
            onClick={() => navigateTo('saved')}
            className="py-3 flex items-center justify-between text-left hover:text-[var(--color-primary)] transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Bookmark className="w-4 h-4 text-[var(--color-text-secondary)]" />
              <div>
                <p className="font-bold text-[var(--color-text-primary)]">Saved Posts & Handouts</p>
                <p className="text-[11px] text-[var(--color-text-secondary)]">Access bookmarked campus resources</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)] shrink-0" />
          </button>
        </div>
      </div>

      {/* Section E: Notifications */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <Bell className="w-4 h-4 text-[var(--color-primary)]" />
            <span>Device Push Notifications</span>
          </h2>

          {/* Real-time status pill */}
          <span
            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
              pushStatus === 'granted' || pushEnabled
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : pushStatus === 'denied'
                ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                pushStatus === 'granted' || pushEnabled
                  ? 'bg-emerald-500'
                  : pushStatus === 'denied'
                  ? 'bg-red-500'
                  : 'bg-amber-500 animate-pulse'
              }`}
            />
            {pushStatus === 'granted' || pushEnabled
              ? 'Active & Receiving Alerts'
              : pushStatus === 'denied'
              ? 'Blocked by Browser'
              : 'Not Yet Allowed'}
          </span>
        </div>

        <p className="text-xs text-[var(--color-text-secondary)] mb-4">
          Receive real-time push alerts on your phone or computer whenever coursemates message you, accept friend requests, or when urgent ABSU announcements are posted.
        </p>

        {/* Master Push Action Banner */}
        <div className="p-3.5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--color-text-primary)]">
                {pushStatus === 'granted' || pushEnabled
                  ? 'ABSU Connect Push is Connected'
                  : 'Enable Push Notifications'}
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                {pushStatus === 'granted' || pushEnabled
                  ? 'Your device is registered to receive background campus alerts.'
                  : 'Tap below to grant permission and subscribe this device.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!(pushStatus === 'granted' || pushEnabled) ? (
              <button
                onClick={openNotificationPrompt}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Allow Notifications</span>
              </button>
            ) : (
              <button
                onClick={async () => {
                  if (!user) return;
                  setPushLoading(true);
                  try {
                    await unsubscribeUserFromPush(user.id);
                    setPushEnabled(false);
                    setPushStatus(getPushPermissionStatus());
                    await loadPushDiagnostics();
                    addToast('Push notifications paused for this device', 'info');
                  } finally {
                    setPushLoading(false);
                  }
                }}
                disabled={pushLoading}
                className="w-full sm:w-auto px-3 py-1.5 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-red-500 hover:border-red-500/30 transition-all"
              >
                {pushLoading ? 'Updating...' : 'Turn Off Push'}
              </button>
            )}
          </div>
        </div>

        {/* Embedded Iframe Warning (AI Studio preview blocks browser Notification API) */}
        {inPreviewIframe && pushStatus !== 'granted' && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between gap-2">
            <span>
              Browser push prompts are blocked inside embedded preview frames. Open in a full window to allow notifications.
            </span>
            <button
              type="button"
              onClick={() => {
                const a = document.createElement('a');
                a.href = window.location.href;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.click();
              }}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--color-primary)] text-white text-[11px] font-bold"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Open Full Window</span>
            </button>
          </div>
        )}

        {/* Live Push Channel & Token Diagnostics */}
        {pushDiagnostics && (
          <div className="mb-4 p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[11px] flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-[var(--color-text-primary)]">
                Push Channel Diagnostics ({pushDiagnostics.isNativeApp ? 'Android APK' : 'Web Browser'})
              </span>
              <button
                type="button"
                disabled={syncingToken || !user}
                onClick={async () => {
                  if (!user) return;
                  setSyncingToken(true);
                  setFcmStatusNote(null);
                  try {
                    if (isNativeAndroidApp()) {
                      const ok = await initAllPushChannels(user.id);
                      setFcmStatusNote(
                        ok ? 'Android FCM token sync requested.' : 'Android notification permission not granted.'
                      );
                    } else {
                      const webFcm = await initWebFirebasePush(user.id);
                      setFcmStatusNote(
                        webFcm.success
                          ? 'Web FCM token synced to Supabase.'
                          : `Web FCM sync skipped/failed: ${webFcm.reason || 'unknown'}`
                      );
                    }
                    await loadPushDiagnostics();
                    addToast('Push channel diagnostics refreshed.', 'info');
                  } finally {
                    setSyncingToken(false);
                  }
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--color-border)] text-[10px] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${syncingToken ? 'animate-spin' : ''}`} />
                <span>Sync Token</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[var(--color-text-secondary)]">
              <span>
                Web FCM Config:{' '}
                <strong className={pushDiagnostics.firebaseWebConfigured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                  {pushDiagnostics.firebaseWebConfigured ? 'Configured' : 'Needs VITE_FIREBASE_* env'}
                </strong>
              </span>
              <span>
                Permission:{' '}
                <strong className="text-[var(--color-text-primary)]">
                  {pushDiagnostics.permissionStatus}
                </strong>
              </span>
              <span>
                Registered FCM Devices:{' '}
                <strong className="text-[var(--color-text-primary)]">
                  Android {pushDiagnostics.androidTokensCount} · Web {pushDiagnostics.webTokensCount}
                </strong>
              </span>
              {pushDiagnostics.maskedTokenFingerprint && (
                <span className="font-mono text-[10px] truncate">
                  Token: {pushDiagnostics.maskedTokenFingerprint}
                </span>
              )}
              {fcmStatusNote && (
                <span className="sm:col-span-2 text-[10px] text-[var(--color-text-primary)] break-all">
                  FCM Status: {fcmStatusNote}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Test Tools & Audio Chime */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-5">
          <button
            onClick={async () => {
              if (!user) return;
              setTestPushLoading(true);
              try {
                const webRes = await sendTestNotification(user.id, currentUser.name);
                const fcmRes = webRes.ranFcmFallback
                  ? {
                      success: webRes.success,
                      message: webRes.message,
                      sent: webRes.sent ?? 0,
                    }
                  : await sendDiagnosticFcmTest(user.id);

                setFcmStatusNote(fcmRes.message);
                await loadPushDiagnostics();
                refreshNotifications();

                if (fcmRes.success && (fcmRes.sent ?? 0) > 0) {
                  addToast(`🎉 ${fcmRes.message}`, 'success');
                } else if (webRes.pushDelivered) {
                  addToast('🎉 Web Push delivered! See FCM Status above for Edge Function details.', 'success');
                } else {
                  addToast(fcmRes.message || 'Alert added to inbox; check FCM Status for device delivery details.', 'info');
                }
              } finally {
                setTestPushLoading(false);
              }
            }}
            disabled={testPushLoading || !user}
            className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 text-left flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <Send className="w-4 h-4 text-[var(--color-primary)] group-hover:scale-110 transition-transform" />
              <div>
                <p className="text-xs font-bold text-[var(--color-text-primary)]">
                  {testPushLoading ? 'Dispatching Test...' : 'Send Live Test Notification'}
                </p>
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  Tests Web Push, Firebase FCM & Alerts inbox
                </p>
              </div>
            </div>
            {testPushLoading && <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />}
          </button>

          <button
            onClick={() => {
              playNotificationChime();
              addToast('Playing ABSU Connect notification chime 🔔', 'info');
            }}
            className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 text-left flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <Volume2 className="w-4 h-4 text-violet-500 group-hover:scale-110 transition-transform" />
              <div>
                <p className="text-xs font-bold text-[var(--color-text-primary)]">
                  Play Notification Chime
                </p>
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  Test the in-app audio chime sound
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* Category Toggles */}
        <p className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">
          Alert Types
        </p>

        <div className="flex flex-col gap-2.5 text-xs">
          <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] cursor-pointer">
            <div>
              <p className="font-semibold text-[var(--color-text-primary)]">Official Campus & SUG Alerts</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">Exam dates, academic senate notices & university updates</p>
            </div>
            <input
              type="checkbox"
              checked={notifCampus}
              onChange={(e) => {
                setNotifCampus(e.target.checked);
                addToast('Notification settings updated', 'info');
              }}
              className="w-4 h-4 accent-[var(--color-primary)] rounded"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] cursor-pointer">
            <div>
              <p className="font-semibold text-[var(--color-text-primary)]">Direct Messages</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">Privacy-safe message arrival alerts from coursemates</p>
            </div>
            <input
              type="checkbox"
              checked={notifMessages}
              onChange={(e) => {
                setNotifMessages(e.target.checked);
                addToast('Notification settings updated', 'info');
              }}
              className="w-4 h-4 accent-[var(--color-primary)] rounded"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] cursor-pointer">
            <div>
              <p className="font-semibold text-[var(--color-text-primary)]">Friend Requests & Connections</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">When fellow students invite or accept your connection</p>
            </div>
            <input
              type="checkbox"
              checked={notifFriends}
              onChange={(e) => {
                setNotifFriends(e.target.checked);
                addToast('Notification settings updated', 'info');
              }}
              className="w-4 h-4 accent-[var(--color-primary)] rounded"
            />
          </label>
        </div>

        {/* Troubleshooting help if blocked */}
        {pushStatus === 'denied' && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
            <p className="font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              <span>How to allow notifications in your browser</span>
            </p>
            <p className="text-[11px] mt-1 text-[var(--color-text-secondary)]">
              1. Tap the lock 🔒 or site settings icon next to the URL in your browser address bar.<br />
              2. Change &quot;Notifications&quot; from &quot;Block&quot; to &quot;Allow&quot;.<br />
              3. Reload ABSU Connect and tap &quot;Allow Notifications&quot; above.
            </p>
          </div>
        )}
      </div>

      {/* Section F: Security */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Account Security</span>
        </h2>

        <div className="flex flex-col divide-y divide-[var(--color-border)] text-xs">
          <div className="py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-500" />
              <div>
                <p className="font-bold text-[var(--color-text-primary)]">Active Session</p>
                <p className="text-[11px] text-[var(--color-text-secondary)]">Connected via Supabase Auth & JWT</p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Online</span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <div>
              <p className="font-bold text-[var(--color-text-primary)]">Blocked Accounts</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">No accounts currently blocked</p>
            </div>
            <span className="text-[11px] text-[var(--color-text-secondary)]">0 users</span>
          </div>
        </div>
      </div>

      {/* Section G: Help & Support */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 mb-3">
          <HelpCircle className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Help & Support</span>
        </h2>

        <div className="flex flex-col divide-y divide-[var(--color-border)] text-xs">
          <button
            onClick={() => navigateTo('safety')}
            className="py-3 flex items-center justify-between text-left hover:text-[var(--color-primary)] transition-colors"
          >
            <div>
              <p className="font-bold text-[var(--color-text-primary)]">Safety Center & Emergency Contacts</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">Emergency dispatch numbers and student guidelines</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)] shrink-0" />
          </button>

          <button
            onClick={() => addToast('Support Desk: support@absuconnect.edu.ng', 'info')}
            className="py-3 flex items-center justify-between text-left hover:text-[var(--color-primary)] transition-colors"
          >
            <div>
              <p className="font-bold text-[var(--color-text-primary)]">Report an Issue or Bug</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">Direct assistance from ABSU Connect dev team</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)] shrink-0" />
          </button>
        </div>
      </div>

      {/* Section H: About ABSU Connect */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-[var(--color-primary)]" />
          <span>About ABSU Connect</span>
        </h2>

        <div className="flex flex-col divide-y divide-[var(--color-border)] text-xs">
          <div className="py-2.5 flex items-center justify-between">
            <p className="font-bold text-[var(--color-text-primary)]">Application Version</p>
            <span className="font-mono text-[var(--color-text-secondary)]">v1.0.4 · Phase 1</span>
          </div>

          <button
            onClick={() => setTermsModalOpen(true)}
            className="py-3 flex items-center justify-between text-left hover:text-[var(--color-primary)] transition-colors"
          >
            <p className="font-bold text-[var(--color-text-primary)]">Terms of Service & Privacy Statement</p>
            <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)]" />
          </button>
        </div>
      </div>

      {/* Password Change Dialog Modal */}
      {passwordModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          role="dialog"
          aria-label="Change Password"
        >
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full max-w-sm rounded-2xl p-5 shadow-2xl flex flex-col gap-3">
            <h3 className="font-bold text-sm text-[var(--color-text-primary)]">Change Password</h3>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Enter a new secure password for your ABSU Connect account.
            </p>

            {passwordError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Minimum 6 characters"
                  className="w-full p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirm new password"
                  className="w-full p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white font-bold hover:bg-[var(--color-primary-hover)] transition-all flex items-center gap-1.5"
                >
                  {passwordLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{passwordLoading ? 'Updating...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Terms of Service Modal */}
      {termsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          role="dialog"
          aria-label="Terms of Service"
        >
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full max-w-lg rounded-2xl p-5 shadow-2xl flex flex-col gap-3 max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-base text-[var(--color-text-primary)]">
              ABSU Connect Terms & Privacy
            </h3>
            <div className="text-xs text-[var(--color-text-secondary)] flex flex-col gap-2.5 leading-relaxed">
              <p>
                <strong>1. Community Charter:</strong> ABSU Connect is built exclusively for students, faculty, and alumni of Abia State University across Uturu, Aba, and Umuahia campuses.
              </p>
              <p>
                <strong>2. Privacy Guarantee:</strong> In accordance with our security principles, private direct messages and personal communications are strictly confidential and never broadcast in notifications.
              </p>
              <p>
                <strong>3. Academic Integrity:</strong> Users must not exchange illicit examination materials or impersonate university officials.
              </p>
            </div>
            <button
              onClick={() => setTermsModalOpen(false)}
              className="mt-2 self-end px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white font-bold text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
