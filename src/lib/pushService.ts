/**
 * ABSU Connect — Web Push Notification Service
 * Client-side integration for browser push notifications, in-app audio chimes,
 * and device subscription management.
 */

import { safeStorage } from '../utils/safeStorage.ts';
import { supabase } from './supabase.ts';
import {
  isNativeAndroidApp,
  requestAndroidNotificationPermission,
  initNativePush,
  initWebFirebasePush,
  unregisterAllPushChannels,
  sendDiagnosticFcmTest,
} from './nativePushService.ts';

// Helper to convert base64 VAPID key to Uint8Array required by PushManager
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isPushNotificationSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window;
}

export function getPushPermissionStatus(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

export function isPushNotificationActive(userId?: string): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  return Notification.permission === 'granted';
}

/**
 * Synthesizes a clean, pleasant, dual-tone campus notification chime using Web Audio API.
 * Instantaneous, 100% offline, zero asset dependencies.
 */
export function playNotificationChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Tone 1: E5 (659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.18, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.36);

    // Tone 2: B5 (987.77 Hz) slightly delayed for a joyful harmonic chime
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.09);
    gain2.gain.setValueAtTime(0, now + 0.09);
    gain2.gain.linearRampToValueAtTime(0.22, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.56);
  } catch (err) {
    console.debug('[Push Service] Audio chime notice:', err);
  }
}

let cachedVapidPublicKey: string | null = null;

// Built-in campus VAPID public key corresponding to ABSU Connect server keypair
export const DEFAULT_VAPID_PUBLIC_KEY =
  (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY ||
  'BK6dMIWFFY6CJ3dRLnR4V0bXl4OLkzLM5tDw2EBDqhPpdNL_AAtHw0XG8BKwwO1_xlZFnZMH1ABpvwz4Xgk8KH4';

export async function fetchVapidPublicKey(): Promise<string> {
  if (cachedVapidPublicKey) return cachedVapidPublicKey;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch('/api/push/public-key', { signal: controller.signal })
      .catch(() => fetch('/api/notifications/vapid-public-key', { signal: controller.signal }));
    clearTimeout(timeoutId);

    if (res && res.ok) {
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) {
        const data = await res.json().catch(() => null);
        if (data?.success && data?.publicKey) {
          cachedVapidPublicKey = data.publicKey;
          return data.publicKey;
        }
      }
    }
  } catch (err) {
    console.debug('[Push Service] Network fetch of VAPID key fell back to default:', err);
  }

  // Gracefully use the built-in campus VAPID public key
  cachedVapidPublicKey = DEFAULT_VAPID_PUBLIC_KEY;
  return DEFAULT_VAPID_PUBLIC_KEY;
}

/**
 * Triggers the native browser notification permission prompt directly on a user gesture.
 * Dual compatibility for both modern Promise-based and legacy callback-based browsers.
 */
export async function requestBrowserNotificationPermission(): Promise<{
  granted: boolean;
  permission: NotificationPermission | 'unsupported';
  isIframeBlocked?: boolean;
  error?: string;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      granted: false,
      permission: 'unsupported',
      error: 'Browser notifications are not supported on this device/browser.',
    };
  }

  // Already granted
  if (Notification.permission === 'granted') {
    return { granted: true, permission: 'granted' };
  }

  // If already explicitly denied in site settings, browser will not show pop-up again
  if (Notification.permission === 'denied') {
    return {
      granted: false,
      permission: 'denied',
      error:
        'Notifications are blocked in your browser site settings. Tap the lock or tune icon beside the URL in your browser address bar, tap "Permissions" > "Notifications", and select "Allow".',
    };
  }

  try {
    // Dual compatibility wrapper (supports Promise and callback across Chrome, Safari, Android)
    const result = await new Promise<NotificationPermission>((resolve) => {
      let resolved = false;
      const finish = (p: NotificationPermission) => {
        if (!resolved) {
          resolved = true;
          resolve(p);
        }
      };

      try {
        const maybePromise = Notification.requestPermission((p) => {
          finish(p);
        });

        if (maybePromise && typeof (maybePromise as any).then === 'function') {
          (maybePromise as Promise<NotificationPermission>)
            .then(finish)
            .catch(() => finish(Notification.permission));
        }
      } catch {
        finish(Notification.permission);
      }
    });

    const isGranted = result === 'granted';
    return {
      granted: isGranted,
      permission: result,
      error:
        result === 'denied'
          ? 'Notification permission was denied. Tap the lock or tune icon in your browser URL bar to allow notifications.'
          : result === 'default'
          ? 'Notification prompt was dismissed without being allowed.'
          : undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error requesting permission';
    const isIframe = msg.includes('sub-frame') || msg.includes('iframe') || isRunningInIframe();
    return {
      granted: false,
      permission: 'denied',
      isIframeBlocked: isIframe,
      error: isIframe
        ? 'Browser policy restricts notification popups inside embedded preview frames. Please open in a full window.'
        : msg,
    };
  }
}

/**
 * Request permission and subscribe to real device push notifications.
 * Works reliably offline, online, and across mobile web views.
 */
export async function subscribeUserToPush(userId: string): Promise<{
  success: boolean;
  permission: NotificationPermission | 'unsupported';
  isIframeBlocked?: boolean;
  pushSubscribed?: boolean;
  fcmWebSubscribed?: boolean;
  error?: string;
}> {
  // Handle native Android APK Capacitor runtime cleanly
  if (isNativeAndroidApp()) {
    const androidPerm = await requestAndroidNotificationPermission();
    if (!androidPerm.granted) {
      return {
        success: false,
        permission: androidPerm.status === 'denied' ? 'denied' : 'default',
        error:
          'Android notification permission was denied. Enable Notifications for ABSU Connect in your phone Settings.',
      };
    }

    safeStorage.setItem(`absu_push_enabled_${userId}`, 'true');
    safeStorage.setItem('absu_notifications_prompt_responded', 'true');
    const nativeReady = await initNativePush(userId).catch(() => false);
    playNotificationChime();
    return {
      success: true,
      permission: 'granted',
      pushSubscribed: nativeReady,
    };
  }

  // 1. Immediately request the browser permission directly on user tap/click
  const permRes = await requestBrowserNotificationPermission();

  if (!permRes.granted) {
    return {
      success: false,
      permission: permRes.permission,
      isIframeBlocked: permRes.isIframeBlocked,
      error: permRes.error,
    };
  }

  // Permission is GRANTED! Immediately mark notifications enabled
  safeStorage.setItem(`absu_push_enabled_${userId}`, 'true');
  safeStorage.setItem('absu_notifications_prompt_responded', 'true');

  // 2. Obtain VAPID key for standard Web Push
  const publicKey = await fetchVapidPublicKey();

  // 3. Register service worker and attempt PushManager subscription
  let pushSubscribed = false;
  try {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
      ]);

      if (registration && registration.pushManager && publicKey) {
        let subscription = await registration.pushManager.getSubscription().catch(() => null);
        const convertedKey = urlBase64ToUint8Array(publicKey);

        if (subscription) {
          try {
            const currentKeyBuffer = subscription.options.applicationServerKey;
            if (currentKeyBuffer) {
              const currentKeyArray = new Uint8Array(currentKeyBuffer);
              let mismatch = currentKeyArray.length !== convertedKey.length;
              if (!mismatch) {
                for (let i = 0; i < currentKeyArray.length; i++) {
                  if (currentKeyArray[i] !== convertedKey[i]) {
                    mismatch = true;
                    break;
                  }
                }
              }
              if (mismatch) {
                console.log('[Push Service] Renewing device subscription...');
                await subscription.unsubscribe();
                subscription = null;
              }
            }
          } catch (inspectErr) {
            console.warn('[Push Service] Subscription inspection note:', inspectErr);
          }
        }

        if (!subscription) {
          try {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedKey as unknown as BufferSource,
            });
          } catch (subErr) {
            console.warn('[Push Service] PushManager subscribe notice:', subErr);
          }
        }

        if (subscription) {
          pushSubscribed = true;
          const subJson = subscription.toJSON();

          // Sync with server if available
          fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              subscription: subJson,
              userAgent: navigator.userAgent,
            }),
          }).catch(() => {});

          // Persist into Supabase push_subscriptions table
          if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
            Promise.resolve(
              supabase
                .from('push_subscriptions')
                .upsert(
                  {
                    user_id: userId,
                    endpoint: subJson.endpoint,
                    p256dh: subJson.keys.p256dh,
                    auth: subJson.keys.auth,
                    user_agent: navigator.userAgent,
                    created_at: new Date().toISOString(),
                  },
                  { onConflict: 'user_id,endpoint' }
                )
            ).catch(() => {});
          }
        }

        // Trigger local welcome notification as immediate proof
        try {
          await registration.showNotification('🎉 ABSU Connect Notifications Active', {
            body: 'You will now receive instant alerts for coursemate chats, campus news, and course bulletins.',
            icon: '/pwa-192x192.png',
            badge: '/icon.svg',
            tag: 'absu-welcome-notif',
            renotify: true,
            data: { url: '/?view=alerts', timestamp: Date.now() },
          } as any);
        } catch {
          if (typeof Notification !== 'undefined') {
            new Notification('🎉 ABSU Connect Notifications Active', {
              body: 'You will now receive instant alerts for coursemate chats, campus news, and course bulletins.',
              icon: '/pwa-192x192.png',
            });
          }
        }
      }
    }
  } catch (pushErr) {
    console.warn('[Push Service] Background push manager note:', pushErr);
  }

  // 4. Register Firebase Web Messaging (FCM) token alongside standard Web Push
  let fcmWebSubscribed = false;
  try {
    const fcmRes = await initWebFirebasePush(userId);
    fcmWebSubscribed = fcmRes.success;
  } catch (fcmErr) {
    console.debug('[Push Service] Web FCM registration note:', fcmErr);
  }

  // Play joyful chime to celebrate successful setup
  playNotificationChime();

  return {
    success: true,
    permission: 'granted',
    pushSubscribed,
    fcmWebSubscribed,
  };
}

/**
 * Unsubscribe from real device push notifications (Web Push + Android/Web FCM).
 */
export async function unsubscribeUserFromPush(userId: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    if (!isNativeAndroidApp() && 'serviceWorker' in navigator && 'PushManager' in window) {
      const registration = await navigator.serviceWorker.ready.catch(() => null);
      if (registration && registration.pushManager) {
        const subscription = await registration.pushManager.getSubscription().catch(() => null);
        if (subscription) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              endpoint: subscription.endpoint,
            }),
          }).catch(() => {});
          await subscription.unsubscribe().catch(() => {});
        }
      }
    }
    await unregisterAllPushChannels(userId).catch(() => {});
    safeStorage.removeItem(`absu_push_enabled_${userId}`);
    return true;
  } catch (err) {
    console.warn('[Push Service] Error unsubscribing:', err);
    return false;
  }
}

/**
 * Check push subscription status on the server
 */
export async function checkPushSubscriptionStatus(userId: string): Promise<{
  subscribed: boolean;
  count: number;
}> {
  try {
    const res = await fetch(`/api/push/status/${encodeURIComponent(userId)}`).catch(() => null);
    const ct = (res?.headers.get('content-type') || '').toLowerCase();
    if (res && res.ok && ct.includes('application/json')) {
      const data = await res.json().catch(() => null);
      if (data) {
        return {
          subscribed: Boolean(data.subscribed),
          count: Number(data.count) || 0,
        };
      }
    }

    // Fallback directly to Supabase tables on static deployments
    const [fcmRes, webPushRes] = await Promise.all([
      supabase
        .from('device_push_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('push_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);
    const total = (fcmRes.count ?? 0) + (webPushRes.count ?? 0);
    return {
      subscribed: total > 0,
      count: total,
    };
  } catch {
    return { subscribed: false, count: 0 };
  }
}

/**
 * Trigger privacy-safe push notification to a recipient student.
 * Never leaks private DM content.
 */
export async function sendPrivacySafePush(params: {
  recipientId: string;
  type: 'message' | 'friend_request' | 'friend_accept' | 'comment' | 'like' | 'mention' | 'campus_notice' | 'game_invitation' | 'test';
  senderName?: string;
  url?: string;
  data?: Record<string, any>;
}): Promise<boolean> {
  try {
    let title = 'ABSU Connect Alert';
    let body = 'You have a new campus notification.';

    switch (params.type) {
      case 'message':
        title = params.senderName ? `${params.senderName}` : 'ABSU Connect Message';
        body = 'sent you a message.';
        break;
      case 'friend_request':
        title = 'Friend Request';
        body = params.senderName ? `${params.senderName} sent you a friend request.` : 'New friend request received.';
        break;
      case 'friend_accept':
        title = 'Friend Request Accepted';
        body = params.senderName ? `${params.senderName} accepted your friend request.` : 'Your friend request was accepted.';
        break;
      case 'comment':
        title = 'New Comment';
        body = params.senderName ? `${params.senderName} commented on your post.` : 'Someone commented on your post.';
        break;
      case 'like':
        title = 'Post Reaction';
        body = params.senderName ? `${params.senderName} liked your post.` : 'Someone reacted to your post.';
        break;
      case 'campus_notice':
        title = 'ABSU Campus Notice';
        body = 'An official announcement was posted to the campus feed.';
        break;
      case 'game_invitation':
        title = 'Game Invitation';
        body = params.senderName ? `${params.senderName} invited you to play a game!` : 'You were invited to play a game!';
        break;
      case 'test':
        title = '🎉 Notification Test';
        body = 'Notifications are working perfectly!';
        break;
    }

    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientId: params.recipientId,
        type: params.type,
        title,
        body,
        icon: '/pwa-192x192.png',
        url: params.url || '/',
        data: params.data,
      }),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Dispatch a live test notification to verify end-to-end functionality
 */
export async function sendTestNotification(userId: string, userName?: string): Promise<{
  success: boolean;
  message: string;
  pushDelivered?: boolean;
  ranFcmFallback?: boolean;
  sent?: number;
}> {
  try {
    playNotificationChime();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch('/api/notifications/send-test', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, userName }),
    }).catch(() => null);

    const ct = (res?.headers.get('content-type') || '').toLowerCase();
    if (res && res.ok && ct.includes('application/json')) {
      const data = await res.json().catch(() => null);
      if (data?.success) {
        return {
          success: true,
          message: data?.message || 'Test notification delivered!',
          pushDelivered: Boolean(data?.pushDelivered),
          ranFcmFallback: false,
        };
      }
    }

    // Fallback cleanly to FCM / Supabase Edge Function diagnostic test on static hosts (Vercel / APK)
    const fcmDiag = await sendDiagnosticFcmTest(userId);
    return {
      success: fcmDiag.success,
      message: fcmDiag.message,
      pushDelivered: (fcmDiag.sent ?? 0) > 0,
      ranFcmFallback: true,
      sent: fcmDiag.sent ?? 0,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Chime played!';
    return { success: false, message: msg };
  }
}
