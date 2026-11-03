// Explore&Earn service worker: shows web push notifications and opens their link when clicked.
// The server sends { title, body, data: { url, notificationId, type } }
// (src/modules/notifications/push.ts).
/* global self, clients, URL */

const DEFAULT_TITLE = 'Explore&Earn';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  if (!event.data) return {};
  try {
    const parsed = event.data.json();
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { body: event.data.text() };
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const title = typeof payload.title === 'string' && payload.title ? payload.title : DEFAULT_TITLE;
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    data,
    lang: 'en',
  };
  // One notification per item: a retried push replaces it instead of stacking a duplicate.
  if (typeof data.notificationId === 'string') options.tag = data.notificationId;
  event.waitUntil(self.registration.showNotification(title, options));
});

/** The http(s) URL to open, resolved against this site; anything else opens the home page. */
function targetUrl(data) {
  try {
    const url = new URL(
      data && typeof data.url === 'string' ? data.url : '/',
      self.location.origin,
    );
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch {
    // Fall through to the home page.
  }
  return new URL('/', self.location.origin).href;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = targetUrl(event.notification.data);
  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })(),
  );
});
