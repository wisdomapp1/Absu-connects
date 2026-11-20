// Firebase Cloud Messaging (FCM) Web Push Service Worker
// Runs under /firebase-cloud-messaging-push-scope so it never collides
// with the main PWA & Express Web Push service worker (/sw.js at /).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function resolveFcmTargetUrl(rawPayload) {
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
  const targetUrl = resolveFcmTargetUrl(rawJson);
  const tag =
    rawJson?.tag ||
    fcmNotif.tag ||
    dataPayload.tag ||
    `absu-fcm-${dataPayload.type || rawJson?.type || 'general'}-${Date.now()}`;

  event.waitUntil(
    self.registration.showNotification(title, {
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
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawTarget = event.notification.data?.url || '/?view=alerts';
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
