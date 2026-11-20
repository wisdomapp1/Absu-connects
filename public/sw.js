// ABSU Connect Service Worker — WhatsApp-Grade Offline Shell & Supabase API Cache
const CACHE_NAME = 'absu-connect-shell-v4';
const SUPABASE_CACHE_NAME = 'absu-supabase-api-v1';
const FIVE_MINUTES_MS = 5 * 60 * 1000;

const STATIC_ASSETS = [
  '/manifest.json',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/favicon.ico',
];

// 1. Install: precache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[SW] Precache notice:', err);
      })
  );
});

// 2. Activate: claim clients immediately and prune old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== SUPABASE_CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// 3. Fetch interceptor
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip mutations, auth tokens, backend /api endpoints, service workers, and dev tools
  if (
    event.request.method !== 'GET' ||
    url.pathname === '/sw.js' ||
    url.pathname === '/firebase-messaging-sw.js' ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/storage/v1/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return;
  }

  // A. Supabase REST API caching (5-minute TTL with offline fallback)
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/rest/v1')) {
    event.respondWith(
      caches.open(SUPABASE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);

        // If online, fetch from network and update cache
        if (navigator.onLine) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout on slow 2G/3G

            const networkResponse = await fetch(event.request, {
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (networkResponse && networkResponse.status === 200) {
              const headers = new Headers(networkResponse.headers);
              headers.set('sw-cached-time', Date.now().toString());
              const blob = await networkResponse.clone().blob();
              const responseToCache = new Response(blob, {
                status: networkResponse.status,
                statusText: networkResponse.statusText,
                headers,
              });
              cache.put(event.request, responseToCache).catch(() => {});
            }
            return networkResponse;
          } catch (fetchErr) {
            // Network timed out or failed: fall back to cached data
            if (cached) return cached;
            throw fetchErr;
          }
        }

        // If offline: return cached response regardless of age so chats/feed display
        if (cached) {
          return cached;
        }

        // Return empty fallback array for database queries if offline with no cache
        return new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // B. Navigation requests (HTML document): Network First, fallback to cached shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', clone)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedApp = await caches.match('/');
          return (
            cachedApp ||
            new Response('<html><body>ABSU Connect is ready offline.</body></html>', {
              headers: { 'Content-Type': 'text/html' },
            })
          );
        })
    );
    return;
  }

  // C. Bundled JS, CSS, and manifest: Network First so deployed bugfixes apply immediately
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic'
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || new Response('', { status: 504 });
        })
    );
    return;
  }

  // D. Other static assets (Icons, Fonts, Images): Stale While Revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic'
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

// -------------------------------------------------------------
// WEB PUSH & FIREBASE CLOUD MESSAGING (FCM) HANDLERS
// -------------------------------------------------------------

function resolveNotificationTargetUrl(rawPayload) {
  const data = (rawPayload && typeof rawPayload.data === 'object' && rawPayload.data) || {};
  const explicitUrl =
    rawPayload?.fcmOptions?.link ||
    data.url ||
    rawPayload?.url ||
    '';

  if (explicitUrl && explicitUrl !== '/') {
    return explicitUrl;
  }

  const postId = data.post_id || data.postId || '';
  const commentId = data.comment_id || data.commentId || '';
  const parentCommentId = data.parent_comment_id || data.parentCommentId || '';
  const convId = data.conversation_id || data.conversationId || data.convId || '';
  const notifType = String(data.type || rawPayload?.type || '').toLowerCase();
  const entityId = data.entity_id || data.entityId || '';
  const entityType = String(data.entity_type || data.entityType || '').toLowerCase();

  if (postId) {
    const params = new URLSearchParams({ view: 'post-detail', postId });
    if (commentId) {
      params.set('commentId', commentId);
      params.set('openComments', '1');
    } else if (notifType === 'comment' || entityType === 'comment') {
      params.set('openComments', '1');
    }
    if (parentCommentId) {
      params.set('parentCommentId', parentCommentId);
    }
    return `/?${params.toString()}`;
  }

  if (notifType === 'message' || entityType === 'conversation' || convId) {
    const targetConvId = convId || (entityType === 'conversation' ? entityId : '');
    return targetConvId
      ? `/?view=conversation&convId=${encodeURIComponent(targetConvId)}`
      : '/?view=messages';
  }

  if (notifType === 'friend_request' || notifType === 'friend_accept' || notifType === 'friend_accepted') {
    return '/?view=friends';
  }

  if (
    entityId &&
    (notifType === 'like' || notifType === 'comment' || entityType === 'post')
  ) {
    const params = new URLSearchParams({ view: 'post-detail', postId: entityId });
    if (notifType === 'comment') {
      params.set('openComments', '1');
    }
    return `/?${params.toString()}`;
  }

  return explicitUrl || '/?view=alerts';
}

self.addEventListener('push', (event) => {
  let rawJson = null;
  let fallbackBody = 'You have a new campus notification.';

  if (event.data) {
    try {
      rawJson = event.data.json();
    } catch {
      fallbackBody = event.data.text() || fallbackBody;
    }
  }

  const fcmNotif = (rawJson && typeof rawJson.notification === 'object' && rawJson.notification) || {};
  const dataPayload = (rawJson && typeof rawJson.data === 'object' && rawJson.data) || {};

  const title =
    fcmNotif.title ||
    rawJson?.title ||
    dataPayload.title ||
    'ABSU Connect';

  const body =
    fcmNotif.body ||
    rawJson?.body ||
    dataPayload.body ||
    fallbackBody;

  const icon = fcmNotif.icon || rawJson?.icon || dataPayload.icon || '/pwa-192x192.png';
  const badge = rawJson?.badge || '/icon.svg';
  const targetUrl = resolveNotificationTargetUrl(rawJson);
  const tag =
    rawJson?.tag ||
    fcmNotif.tag ||
    dataPayload.tag ||
    `absu-${dataPayload.type || rawJson?.type || 'general'}-${Date.now()}`;

  const notificationOptions = {
    body,
    icon,
    badge,
    tag,
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      ...dataPayload,
      url: targetUrl,
      timestamp: Date.now(),
    },
    actions: [{ action: 'open', title: 'Open ABSU Connect' }],
  };

  event.waitUntil(
    self.registration.showNotification(title, notificationOptions)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawTarget = event.notification.data?.url || '/';
  const fullTargetUrl = new URL(rawTarget, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      for (const client of windowClients) {
        if (client.url && 'focus' in client) {
          try {
            if ('navigate' in client && typeof client.navigate === 'function') {
              await client.navigate(fullTargetUrl);
            } else if ('postMessage' in client) {
              client.postMessage({
                type: 'ABSU_NOTIFICATION_NAVIGATE',
                url: fullTargetUrl,
              });
            }
          } catch {
            if ('postMessage' in client) {
              client.postMessage({
                type: 'ABSU_NOTIFICATION_NAVIGATE',
                url: fullTargetUrl,
              });
            }
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(fullTargetUrl);
      }
    })
  );
});

