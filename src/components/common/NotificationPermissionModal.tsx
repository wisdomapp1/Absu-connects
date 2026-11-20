import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  isPushNotificationSupported,
  getPushPermissionStatus,
  subscribeUserToPush,
  playNotificationChime,
  sendTestNotification,
  isRunningInIframe,
} from '../../lib/pushService.ts';
import { safeStorage } from '../../utils/safeStorage.ts';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  UserPlus,
  Megaphone,
  Heart,
  Volume2,
  ExternalLink,
  X,
  Loader2,
  Sparkles,
} from 'lucide-react';

interface NotificationPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const NotificationPermissionModal: React.FC<NotificationPermissionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currentUser, addToast, refreshNotifications } = useApp();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [testingSound, setTestingSound] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isIframeBlocked, setIsIframeBlocked] = useState(false);

  if (!isOpen) return null;

  const currentPermission = getPushPermissionStatus();
  const isSupported = isPushNotificationSupported();

  const handleAllowNotifications = async () => {
    if (!user) {
      addToast('Please sign in to enable notifications.', 'warning');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setIsIframeBlocked(false);

    try {
      const res = await subscribeUserToPush(user.id);

      if (res.success) {
        addToast('🎉 Notifications enabled for ABSU Connect!', 'success');
        safeStorage.setItem('absu_notifications_prompt_responded', 'true');
        safeStorage.setItem(`absu_push_enabled_${user.id}`, 'true');

        // Send an immediate test notification to prove it works
        sendTestNotification(user.id, currentUser.name)
          .then(() => {
            refreshNotifications();
          })
          .catch(() => {});

        if (onSuccess) onSuccess();
        onClose();
      } else {
        if (res.isIframeBlocked) {
          setIsIframeBlocked(true);
          setErrorMsg(res.error || 'Notifications blocked in iframe preview.');
        } else if (res.permission === 'denied') {
          setErrorMsg(
            'Notifications were denied or blocked in your browser settings. Please click the lock or info icon in your browser address bar to allow notifications for ABSU Connect.'
          );
        } else {
          setErrorMsg(res.error || 'Failed to enable notifications. Please try again.');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error setting up notifications';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleMaybeLater = () => {
    // Dismiss for 12 hours so student is not repeatedly interrupted
    const cooldownMs = Date.now() + 12 * 60 * 60 * 1000;
    safeStorage.setItem('absu_notif_prompt_dismissed_until', String(cooldownMs));
    onClose();
  };

  const handleTestSound = () => {
    setTestingSound(true);
    playNotificationChime();
    setTimeout(() => setTestingSound(false), 600);
    addToast('Playing ABSU Connect notification chime 🔔', 'info');
  };

  const handleOpenInNewWindow = () => {
    try {
      window.open(window.location.href, '_blank');
    } catch {
      window.location.reload();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-modal-title"
    >
      <div className="relative w-full max-w-md bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-3xl p-5 sm:p-6 shadow-2xl transition-colors">
        {/* Close Button */}
        <button
          onClick={handleMaybeLater}
          className="absolute top-4 right-4 p-2 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
          aria-label="Close notification prompt"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon with Glowing Aura */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3">
            <div className="w-16 h-16 rounded-3xl bg-[var(--color-primary-subtle)] border border-[var(--color-primary)]/40 flex items-center justify-center shadow-lg shadow-[var(--color-primary)]/10">
              <Bell className="w-8 h-8 text-[var(--color-primary)] animate-bounce" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-[var(--color-primary)] border-2 border-[var(--color-bg-card)]"></span>
            </span>
          </div>

          <h2
            id="notif-modal-title"
            className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)] tracking-tight"
          >
            Allow Notifications for ABSU Connect
          </h2>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mt-1 max-w-sm">
            Stay connected with Abia State University life. Never miss urgent messages or campus updates.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="mt-5 space-y-2.5">
          <div className="flex items-start gap-3 p-2.5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[var(--color-text-primary)]">
                Direct Messages
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Instant privacy-safe alerts when coursemates chat with you.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-2.5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <UserPlus className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[var(--color-text-primary)]">
                Friend Requests & Accepts
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Know when peers invite or accept your connection.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-2.5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <Megaphone className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[var(--color-text-primary)]">
                Campus & SUG Bulletins
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Official academic senate news, exam timetables & alerts.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-2.5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)]">
            <div className="p-2 rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400 shrink-0">
              <Heart className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[var(--color-text-primary)]">
                Reactions & Comments
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Instant notifications when students interact with your feed posts.
              </p>
            </div>
          </div>
        </div>

        {/* Error or Help Notice */}
        {errorMsg && (
          <div className="mt-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex flex-col gap-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-semibold">{errorMsg}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button
                onClick={() => {
                  safeStorage.setItem('absu_notifications_prompt_responded', 'true');
                  if (user) safeStorage.setItem(`absu_push_enabled_${user.id}`, 'true');
                  playNotificationChime();
                  addToast('🔔 In-app notification alerts and chimes enabled!', 'success');
                  if (onSuccess) onSuccess();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-100 font-bold text-[11px] transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Turn On In-App Alerts & Sound</span>
              </button>
              {isIframeBlocked && (
                <button
                  onClick={handleOpenInNewWindow}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--color-primary)] text-white font-bold text-[11px] hover:opacity-90 transition-opacity"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full Window</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            onClick={handleAllowNotifications}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-2xl bg-[var(--color-primary)] text-white font-bold text-sm hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[var(--color-primary)]/25 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Enabling Notifications...</span>
              </>
            ) : (
              <>
                <Bell className="w-4 h-4" />
                <span>Allow Notifications</span>
              </>
            )}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleTestSound}
              disabled={testingSound}
              className="py-2.5 px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)] transition-all flex items-center justify-center gap-1.5"
            >
              <Volume2 className={`w-3.5 h-3.5 ${testingSound ? 'animate-ping text-[var(--color-primary)]' : ''}`} />
              <span>Test Chime</span>
            </button>

            <button
              onClick={handleMaybeLater}
              className="py-2.5 px-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all flex items-center justify-center"
            >
              Maybe Later
            </button>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-center text-[var(--color-text-secondary)]">
          You can customize alerts anytime in <strong>Settings & Privacy &gt; Notification Preferences</strong>.
        </p>
      </div>
    </div>
  );
};
