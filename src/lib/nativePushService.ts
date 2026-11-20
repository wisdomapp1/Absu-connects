/**
 * ABSU Connect — Unified Firebase Cloud Messaging (FCM) Service
 * Supports BOTH:
 * 1. Native Android APK via Capacitor PushNotifications + Android 13/14 channel management
 * 2. Web Browsers (Chrome, Edge, Safari PWA, Android Web) via Firebase Web Messaging SDK
 *
 * Device tokens for both platforms persist in Supabase `device_push_tokens`
 * (`platform`: 'android' | 'web') and are dispatched via the Supabase Edge Function
 * ("send-android-push").
 */

import { supabase, supabaseAnonKey } from './supabase.ts';
import { safeStorage } from '../utils/safeStorage.ts';

export const ANDROID_CHANNEL_ID = 'absu_notifications';
export const EDGE_FUNCTION_URL = 'https://aqzolewmhpmrcvkrvchn.supabase.co/functions/v1/send-android-push';

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
}

export interface PushDiagnosticInfo {
  isNativeApp: boolean;
  platform: 'android' | 'ios' | 'web';
  permissionStatus: string;
  hasRegisteredToken: boolean;
  maskedTokenFingerprint: string | null;
  channelId: string;
  channelCreated: boolean;
  registeredTokensCount: number;
  androidTokensCount: number;
  webTokensCount: number;
  firebaseWebConfigured: boolean;
  lastSyncAt: string | null;
}

// Guard flags so listeners are not duplicated across re-renders or token refreshes
let registeredNativeListenersForUser: string | null = null;
let registeredWebForegroundForUser: string | null = null;

function isPlaceholderValue(val: string): boolean {
  if (!val) return true;
  const upper = val.toUpperCase();
  return (
    upper.startsWith('MY_') ||
    upper.startsWith('YOUR_') ||
    upper.includes('REPLACE_WITH') ||
    upper === 'UNDEFINED' ||
    upper === 'NULL'
  );
}

/**
 * Read Firebase Web SDK & VAPID config strictly from Vite environment variables.
 */
export function getFirebaseWebConfig(): FirebaseWebConfig {
  const env = ((import.meta as any)?.env || {}) as Record<string, string | undefined>;
  const projectId = (env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const apiKey = (env.VITE_FIREBASE_API_KEY || '').trim();
  const authDomain = (env.VITE_FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : '')).trim();
  const storageBucket = (env.VITE_FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.firebasestorage.app` : '')).trim();
  const messagingSenderId = (env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim();
  const appId = (env.VITE_FIREBASE_APP_ID || '').trim();
  const vapidKey = (env.VITE_FIREBASE_VAPID_KEY || '').trim();

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    vapidKey,
  };
}

/**
 * Check whether all required Firebase Web Push keys are provided in env.
 */
export function isFirebaseWebConfigured(): boolean {
  const cfg = getFirebaseWebConfig();
  return (
    !isPlaceholderValue(cfg.apiKey) &&
    !isPlaceholderValue(cfg.projectId) &&
    !isPlaceholderValue(cfg.messagingSenderId) &&
    !isPlaceholderValue(cfg.appId) &&
    !isPlaceholderValue(cfg.vapidKey)
  );
}

/**
 * Resolve deep-link navigation URL from FCM/Push data payload so clicking any push notification
 * opens the exact post, comment thread, DM conversation, or friend requests view.
 */
export function resolvePushDataTargetUrl(rawData?: Record<string, any> | null): string {
  const data = rawData || {};
  const explicitUrl = typeof data.url === 'string' ? data.url.trim() : '';
  if (explicitUrl && explicitUrl !== '/') {
    return explicitUrl;
  }

  const postId = data.post_id || data.postId || '';
  const commentId = data.comment_id || data.commentId || '';
  const parentCommentId = data.parent_comment_id || data.parentCommentId || '';
  const convId = data.conversation_id || data.conversationId || data.convId || '';
  const notifType = String(data.type || '').toLowerCase();
  const entityId = data.entity_id || data.entityId || '';
  const entityType = String(data.entity_type || data.entityType || '').toLowerCase();

  if (postId) {
    const params = new URLSearchParams({ view: 'post-detail', postId: String(postId) });
    if (commentId) {
      params.set('commentId', String(commentId));
      params.set('openComments', '1');
    } else if (notifType === 'comment' || entityType === 'comment') {
      params.set('openComments', '1');
    }
    if (parentCommentId) {
      params.set('parentCommentId', String(parentCommentId));
    }
    return `/?${params.toString()}`;
  }

  if (notifType === 'message' || entityType === 'conversation' || convId) {
    const targetConvId = convId || (entityType === 'conversation' ? entityId : '');
    return targetConvId
      ? `/?view=conversation&convId=${encodeURIComponent(String(targetConvId))}`
      : '/?view=messages';
  }

  if (notifType === 'friend_request' || notifType === 'friend_accept' || notifType === 'friend_accepted') {
    return '/?view=friends';
  }

  if (entityId && (notifType === 'like' || notifType === 'comment' || entityType === 'post')) {
    const params = new URLSearchParams({ view: 'post-detail', postId: String(entityId) });
    if (notifType === 'comment') {
      params.set('openComments', '1');
    }
    return `/?${params.toString()}`;
  }

  return '/?view=alerts';
}

function triggerChimeNonBlocking(): void {
  import('./pushService.ts')
    .then((mod) => mod.playNotificationChime())
    .catch(() => {});
}

async function upsertDevicePushToken(
  userId: string,
  token: string,
  platform: 'android' | 'web'
): Promise<{ ok: boolean; error?: string }> {
  if (!userId || !token) return { ok: false, error: 'Missing userId or token' };
  safeStorage.setItem(`absu_fcm_token_${userId}`, token);
  safeStorage.setItem(`absu_fcm_platform_${userId}`, platform);
  safeStorage.setItem(`absu_fcm_registered_at_${userId}`, new Date().toISOString());

  try {
    const { error: upsertErr } = await supabase
      .from('device_push_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' }
      );

    if (upsertErr) {
      console.warn(`[Push/${platform}] device_push_tokens upsert note:`, upsertErr.message);
      return { ok: false, error: upsertErr.message };
    }

    console.log(`[Push/${platform}] FCM token synced to device_push_tokens.`);
    return { ok: true };
  } catch (dbErr) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    console.warn(`[Push/${platform}] DB token sync note:`, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Detect whether the app is executing inside the native Capacitor Android container.
 */
export function isNativeAndroidApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  if (!cap) return false;
  try {
    const isNative = typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : false;
    const platform = typeof cap.getPlatform === 'function' ? cap.getPlatform() : '';
    return isNative || platform === 'android';
  } catch {
    return false;
  }
}

/**
 * Safely access the Capacitor PushNotifications plugin if available.
 */
function getCapacitorPushPlugin(): any | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as any).Capacitor;
  return cap?.Plugins?.PushNotifications || null;
}

/**
 * Create or ensure the high-importance Android notification channel exists.
 * Android 8.0+ requires notification channels; importance 5 (High) enables
 * pop-up heads-up banners, vibration, sound, and lock-screen visibility.
 */
export async function setupAndroidNotificationChannel(): Promise<boolean> {
  const plugin = getCapacitorPushPlugin();
  if (!plugin || typeof plugin.createChannel !== 'function') {
    return false;
  }

  try {
    await plugin.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'ABSU Connect Notifications',
      description: 'Campus direct messages, friend requests, alerts and updates',
      importance: 5, // High: Heads-up pop-up alert
      visibility: 1, // Public: Visible on lockscreen
      sound: 'notification.wav',
      vibration: true,
      lights: true,
      lightColor: '#7c3aed', // ABSU purple brand color
    });
    console.log('[Native Push] Android notification channel configured:', ANDROID_CHANNEL_ID);
    return true;
  } catch (err) {
    console.warn('[Native Push] createChannel notice:', err);
    return false;
  }
}

/**
 * Check and request runtime notification permissions for Android 13+ (API 33+ POST_NOTIFICATIONS)
 * or Web Browsers.
 */
export async function requestAndroidNotificationPermission(): Promise<{
  granted: boolean;
  status: string;
}> {
  const plugin = getCapacitorPushPlugin();
  if (!plugin) {
    if (typeof Notification !== 'undefined') {
      const perm = await Notification.requestPermission();
      return { granted: perm === 'granted', status: perm };
    }
    return { granted: false, status: 'unsupported' };
  }

  try {
    let perm = await plugin.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await plugin.requestPermissions();
    }

    const granted = perm.receive === 'granted';
    console.log('[Native Push] Android notification permission result:', perm.receive);
    return { granted, status: perm.receive };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown permission error';
    console.warn('[Native Push] Permission request error:', msg);
    return { granted: false, status: 'error' };
  }
}

/**
 * Register the native Android device with Firebase Cloud Messaging (FCM)
 * and persist the device token to Supabase `device_push_tokens` (`platform: 'android'`).
 */
export async function initNativePush(userId: string): Promise<boolean> {
  if (!userId) return false;
  const plugin = getCapacitorPushPlugin();
  if (!plugin) {
    return false;
  }

  try {
    // 1. Create High-Importance Notification Channel
    await setupAndroidNotificationChannel();

    // 2. Request Android 13+ runtime permission
    const { granted } = await requestAndroidNotificationPermission();
    if (!granted) {
      console.warn('[Native Push] Notification permission not granted by user.');
      return false;
    }

    // 3. Register listeners once per active user session
    if (registeredNativeListenersForUser !== userId) {
      if (typeof plugin.removeAllListeners === 'function') {
        await plugin.removeAllListeners().catch(() => {});
      }
      registeredNativeListenersForUser = userId;

      // A. Registration Token received from Firebase
      plugin.addListener('registration', async (tokenData: { value: string }) => {
        const fcmToken = tokenData.value;
        if (!fcmToken) return;
        console.log('[Native Push] Android FCM token acquired. Length:', fcmToken.length);
        await upsertDevicePushToken(userId, fcmToken, 'android');
      });

      // B. Registration Error listener
      plugin.addListener('registrationError', (error: any) => {
        console.error('[Native Push] FCM registration error:', error);
      });

      // C. Foreground notification received
      plugin.addListener('pushNotificationReceived', (notification: any) => {
        console.log('[Native Push] Foreground notification received:', notification?.title);
        triggerChimeNonBlocking();
      });

      // D. Notification tapped by user
      plugin.addListener('pushNotificationActionPerformed', (action: any) => {
        console.log('[Native Push] Notification action performed:', action?.notification?.title);
        const targetUrl = resolvePushDataTargetUrl(action?.notification?.data);
        if (typeof window !== 'undefined' && targetUrl) {
          window.location.href = targetUrl;
        }
      });
    }

    // 4. Trigger actual native registration
    await plugin.register();
    return true;
  } catch (err) {
    console.warn('[Native Push] Error initializing native push:', err);
    return false;
  }
}

async function getActiveFcmServiceWorkerRegistration(): Promise<{
  registration: ServiceWorkerRegistration | null;
  error?: string;
}> {
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/firebase-cloud-messaging-push-scope',
    });
    if (reg.active) return { registration: reg };

    const worker = reg.installing || reg.waiting;
    if (!worker) return { registration: reg };

    await Promise.race([
      new Promise<void>((resolve) => {
        const onStateChange = () => {
          if (worker.state === 'activated' || worker.state === 'redundant') {
            worker.removeEventListener('statechange', onStateChange);
            resolve();
          }
        };
        worker.addEventListener('statechange', onStateChange);
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);

    return { registration: reg };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Service Worker registration failed';
    return { registration: null, error: msg };
  }
}

/**
 * Initialize Firebase Cloud Messaging (FCM) in a Web Browser (Chrome, Edge, Safari PWA, Android Web)
 * using the Firebase Web SDK + `/firebase-messaging-sw.js` under `/firebase-cloud-messaging-push-scope`
 * (keeping `/sw.js` at `/` free for Express Web Push without VAPID key collisions).
 * Persists the resulting Web FCM token to Supabase `device_push_tokens` (`platform: 'web'`).
 */
export async function initWebFirebasePush(userId: string): Promise<{
  success: boolean;
  token?: string;
  reason?: string;
}> {
  if (!userId || typeof window === 'undefined') {
    return { success: false, reason: 'missing-context' };
  }
  if (isNativeAndroidApp()) {
    return { success: false, reason: 'native-android-container' };
  }
  if (!isFirebaseWebConfigured()) {
    return { success: false, reason: 'firebase-web-not-configured' };
  }
  if (typeof Notification === 'undefined') {
    return { success: false, reason: 'notification-api-unsupported' };
  }
  if (Notification.permission !== 'granted') {
    return { success: false, reason: `permission-${Notification.permission}` };
  }
  if (!('serviceWorker' in navigator)) {
    return { success: false, reason: 'service-worker-unsupported' };
  }

  try {
    const [{ initializeApp, getApps, getApp }, messagingMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/messaging'),
    ]);

    const supported = await messagingMod.isSupported().catch(() => false);
    if (!supported) {
      return { success: false, reason: 'fcm-browser-unsupported' };
    }

    const cfg = getFirebaseWebConfig();
    const app =
      getApps().length > 0
        ? getApp()
        : initializeApp({
            apiKey: cfg.apiKey,
            authDomain: cfg.authDomain,
            projectId: cfg.projectId,
            storageBucket: cfg.storageBucket,
            messagingSenderId: cfg.messagingSenderId,
            appId: cfg.appId,
          });

    const messaging = messagingMod.getMessaging(app);

    // Register dedicated FCM service worker scope so it never conflicts with /sw.js Express Web Push
    const { registration, error: swErr } = await getActiveFcmServiceWorkerRegistration();

    if (!registration) {
      return { success: false, reason: `service-worker-error: ${swErr || 'not ready'}` };
    }

    const fcmToken = await messagingMod.getToken(messaging, {
      vapidKey: cfg.vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!fcmToken) {
      return { success: false, reason: 'no-token-returned' };
    }

    const dbRes = await upsertDevicePushToken(userId, fcmToken, 'web');
    if (!dbRes.ok) {
      return {
        success: false,
        token: fcmToken,
        reason: `db-upsert-failed: ${dbRes.error || 'unknown error'}`,
      };
    }

    // Attach foreground FCM listener once per user session
    if (registeredWebForegroundForUser !== userId) {
      registeredWebForegroundForUser = userId;
      messagingMod.onMessage(messaging, (payload) => {
        console.log('[Web FCM] Foreground message received:', payload);
        triggerChimeNonBlocking();

        const title = payload.notification?.title || payload.data?.title || 'ABSU Connect';
        const body =
          payload.notification?.body || payload.data?.body || 'You have a new campus alert.';
        const targetUrl = resolvePushDataTargetUrl(payload.data);

        // Display visible browser notification if permission is granted
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          registration
            .showNotification(title, {
              body,
              icon: payload.notification?.icon || '/pwa-192x192.png',
              badge: '/icon.svg',
              tag: `absu-fg-${payload.data?.type || 'alert'}-${Date.now()}`,
              data: {
                ...(payload.data || {}),
                url: targetUrl,
              },
            })
            .catch(() => {});
        }
      });
    }

    return { success: true, token: fcmToken };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error initializing Web FCM';
    console.warn('[Web FCM] Initialization note:', msg);
    return { success: false, reason: msg };
  }
}

/**
 * Initialize whichever Firebase push channel matches the current runtime:
 * - Android APK -> Capacitor native FCM (`platform: 'android'`)
 * - Web Browser -> Firebase Web Messaging (`platform: 'web'`, when Notification permission is granted)
 */
export async function initAllPushChannels(userId: string): Promise<boolean> {
  if (!userId) return false;
  if (isNativeAndroidApp()) {
    return initNativePush(userId);
  }
  const webRes = await initWebFirebasePush(userId);
  return webRes.success;
}

/**
 * Remove device token on user sign-out or when disabling notifications
 * to prevent cross-account notification leakage across both Android and Web.
 */
export async function unregisterAllPushChannels(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const fcmToken = safeStorage.getItem(`absu_fcm_token_${userId}`);
    if (fcmToken) {
      await supabase
        .from('device_push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('token', fcmToken);
    }

    if (!isNativeAndroidApp() && isFirebaseWebConfigured() && typeof window !== 'undefined') {
      try {
        const [{ getApps, getApp }, messagingMod] = await Promise.all([
          import('firebase/app'),
          import('firebase/messaging'),
        ]);
        if (getApps().length > 0 && (await messagingMod.isSupported().catch(() => false))) {
          const messaging = messagingMod.getMessaging(getApp());
          await messagingMod.deleteToken(messaging).catch(() => {});
        }
      } catch {}
    }

    if (registeredNativeListenersForUser === userId) {
      registeredNativeListenersForUser = null;
    }
    if (registeredWebForegroundForUser === userId) {
      registeredWebForegroundForUser = null;
    }

    safeStorage.removeItem(`absu_fcm_token_${userId}`);
    safeStorage.removeItem(`absu_fcm_platform_${userId}`);
    safeStorage.removeItem(`absu_fcm_registered_at_${userId}`);
  } catch (err) {
    console.debug('[Push] Token cleanup notice:', err);
  }
}

export async function unregisterNativePush(userId: string): Promise<void> {
  return unregisterAllPushChannels(userId);
}

/**
 * Dispatch an FCM Push notification via the deployed Supabase Edge Function
 * ("send-android-push"). The Edge Function authenticates the actor, verifies the
 * corresponding record in the `notifications` table, queries `device_push_tokens`,
 * and delivers the push through Google Firebase Cloud Messaging v1.
 */
export async function dispatchAndroidPush(params: {
  recipientId: string;
  type: string;
  entityId: string;
}): Promise<{ success: boolean; sent?: number; status?: number; raw?: any; error?: string }> {
  if (!params.recipientId || !params.type || !params.entityId) {
    return { success: false, error: 'Missing required parameters (recipientId, type, entityId)' };
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      return { success: false, error: 'No active session access token' };
    }

    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        recipient_id: params.recipientId,
        type: params.type,
        entity_id: params.entityId,
      }),
    });

    const rawText = await res.text().catch(() => '');
    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = rawText;
    }

    if (res.ok && (data?.ok || (typeof data?.sent === 'number' && data.sent > 0))) {
      return { success: true, sent: data?.sent ?? 0, status: res.status, raw: data };
    }

    return {
      success: false,
      sent: data?.sent ?? 0,
      status: res.status,
      raw: data,
      error:
        data?.error ||
        data?.message ||
        (typeof data === 'string' && data ? data : `Edge function HTTP ${res.status}`),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown Edge Function invoke error';
    return { success: false, error: msg };
  }
}

/**
 * Safely mask an FCM device token for logging and diagnostic displays.
 * Example: "cEzIe5...yJoU (163 chars)"
 */
export function maskTokenFingerprint(token?: string | null): string | null {
  if (!token || token.length < 12) return null;
  return `${token.slice(0, 6)}...${token.slice(-4)} (${token.length} chars)`;
}

/**
 * Retrieve comprehensive push diagnostic status for the currently authenticated student
 * across both Android APK and Web Browser channels.
 */
export async function getPushDiagnosticInfo(userId: string): Promise<PushDiagnosticInfo> {
  const isNative = isNativeAndroidApp();
  const plugin = getCapacitorPushPlugin();
  const firebaseWebConfigured = isFirebaseWebConfigured();
  let permStatus = 'unsupported';

  if (plugin && typeof plugin.checkPermissions === 'function') {
    try {
      const p = await plugin.checkPermissions();
      permStatus = p.receive || 'unknown';
    } catch {
      permStatus = 'error';
    }
  } else if (typeof Notification !== 'undefined') {
    permStatus = Notification.permission;
  }

  let tokenCount = 0;
  let androidTokensCount = 0;
  let webTokensCount = 0;
  let latestToken: string | null = null;
  let lastSyncAt: string | null = null;

  try {
    const { data: tokenRows } = await supabase
      .from('device_push_tokens')
      .select('token, platform, updated_at, created_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (tokenRows && tokenRows.length > 0) {
      tokenCount = tokenRows.length;
      const currentPlatform = isNative ? 'android' : 'web';
      const matchingRow =
        tokenRows.find((r: any) => r.platform === currentPlatform) || tokenRows[0];

      androidTokensCount = tokenRows.filter((r: any) => r.platform === 'android').length;
      webTokensCount = tokenRows.filter((r: any) => r.platform === 'web').length;

      latestToken = matchingRow?.token || null;
      lastSyncAt = matchingRow?.updated_at || matchingRow?.created_at || null;
    }
  } catch (err) {
    console.debug('[Push Diagnostics] DB token query note:', err);
  }

  if (!latestToken && userId) {
    latestToken = safeStorage.getItem(`absu_fcm_token_${userId}`);
    lastSyncAt = safeStorage.getItem(`absu_fcm_registered_at_${userId}`);
  }

  return {
    isNativeApp: isNative,
    platform: isNative ? 'android' : 'web',
    permissionStatus: permStatus,
    hasRegisteredToken: Boolean(latestToken),
    maskedTokenFingerprint: maskTokenFingerprint(latestToken),
    channelId: ANDROID_CHANNEL_ID,
    channelCreated: isNative,
    registeredTokensCount: tokenCount,
    androidTokensCount,
    webTokensCount,
    firebaseWebConfigured,
    lastSyncAt,
  };
}

/**
 * Perform a live diagnostic end-to-end FCM push test to the user's own registered devices.
 */
export async function sendDiagnosticFcmTest(userId: string): Promise<{
  success: boolean;
  message: string;
  sent?: number;
  fcmResult?: any;
}> {
  if (!userId) {
    return { success: false, message: 'User ID is required for push diagnostics.' };
  }

  try {
    let initNote = '';
    if (isNativeAndroidApp()) {
      await initNativePush(userId).catch(() => {});
    } else {
      const webInit = await initWebFirebasePush(userId);
      if (!webInit.success && webInit.reason) {
        initNote = ` [Web Token Sync: ${webInit.reason}]`;
      }
    }

    const testEntityId =
      '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');

    // 1. Create test notification via server endpoint if available, otherwise fall back to Supabase client insert (for Vercel static / Capacitor APK)
    let notifCreated = false;
    let createErrorDetail = '';
    try {
      const createRes = await fetch('/api/notifications/create-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          entityId: testEntityId,
        }),
      });
      const contentType = createRes.headers.get('content-type') || '';
      const createData = contentType.includes('application/json')
        ? await createRes.json().catch(() => null)
        : null;
      if (createRes.ok && createData?.success) {
        notifCreated = true;
      } else if (createData?.error) {
        createErrorDetail = createData.error;
      }
    } catch {}

    if (!notifCreated) {
      const { error: clientInsErr } = await supabase.from('notifications').insert({
        recipient_id: userId,
        actor_id: userId,
        type: 'announcement',
        title: '🎉 ABSU Connect Notification Test',
        body: 'FCM push notifications are successfully configured for your device!',
        entity_type: 'test',
        entity_id: testEntityId,
        read_at: null,
        created_at: new Date().toISOString(),
      });
      if (clientInsErr) {
        initNote += ` [Test notification insert note: ${createErrorDetail || clientInsErr.message}]`;
      } else {
        notifCreated = true;
      }
    }

    // 2. Invoke the deployed Supabase Edge Function to deliver real FCM message
    const fcmRes = await dispatchAndroidPush({
      recipientId: userId,
      type: 'announcement',
      entityId: testEntityId,
    });

    if (fcmRes.success && (fcmRes.sent ?? 0) > 0) {
      return {
        success: true,
        sent: fcmRes.sent,
        message: `Firebase FCM delivered to ${fcmRes.sent} registered device(s).`,
        fcmResult: fcmRes,
      };
    }

    const diag = await getPushDiagnosticInfo(userId);
    if (!diag.isNativeApp && !diag.firebaseWebConfigured) {
      return {
        success: false,
        sent: 0,
        message:
          'Edge Function is live, but Web FCM environment variables (VITE_FIREBASE_*) are missing in this web build.' +
          initNote,
        fcmResult: fcmRes,
      };
    }

    const edgeDetail =
      fcmRes.raw && typeof fcmRes.raw === 'object'
        ? JSON.stringify(fcmRes.raw)
        : fcmRes.error || `HTTP ${fcmRes.status ?? 'error'}`;

    if (fcmRes.success) {
      return {
        success: true,
        sent: 0,
        message: `Edge Function returned 0 sent (${edgeDetail}).${initNote} Registered tokens in DB -> Android: ${diag.androidTokensCount}, Web: ${diag.webTokensCount}. Make sure send-android-push queries platform IN ('android', 'web').`,
        fcmResult: fcmRes,
      };
    }

    return {
      success: false,
      sent: fcmRes.sent ?? 0,
      message: `Edge Function failed (${edgeDetail}).${initNote}`,
      fcmResult: fcmRes,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error executing FCM test';
    return { success: false, message: msg };
  }
}
