/**
 * NOIR Admin — minimal service worker.
 *
 * This worker exists so the admin client can:
 *
 *   1. Display Notifications via `Notification` API. (Some mobile
 *      browsers — notably Chrome on Android — only allow
 *      Notifications to be created from a service worker context;
 *      having one registered is a prerequisite even when we trigger
 *      the notification from the page itself.)
 *
 *   2. Receive future Web Push deliveries. We listen for `push`
 *      events and forward them to `showNotification`. Today there
 *      is NO push backend (no VAPID keys / subscription store), so
 *      this branch is dormant; the hook is in place for when an
 *      operator wants to enable true background delivery.
 *
 *   3. Focus or open the admin tab when a notification is clicked.
 *
 * The worker intentionally does NOT cache app assets — Next.js
 * already handles asset versioning, and an unmanaged cache here
 * would cause stale dashboards on deploy.
 */

self.addEventListener('install', (event) => {
  // Activate immediately so admins don't need a second reload.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: 'New order', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'New order received';
  // `renotify:true` forces a re-buzz even when a notification with
  // the same tag is still on screen — essential for the "two orders
  // arrive back-to-back" case. Tag collapses duplicates coming from
  // different code paths (Realtime-in-tab vs Web Push via SW).
  const options = {
    body: payload.body || '',
    tag: payload.tag || 'admin-order',
    renotify: true,
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200],
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: payload.url || '/admin/dashboard' },
  };
  // icon + badge: required on Android Chrome to render a proper
  // notification. Some builds silently drop notifications with no
  // icon. We use favicon.ico as a safe universal fallback.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) ||
    '/admin/dashboard';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Re-focus an existing admin tab if one is open.
        for (const client of clientList) {
          if (client.url.includes('/admin') && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return null;
      }),
  );
});
