/* RailGaadi push service worker. Displays payload from the server; opens the train page on click. */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let title = 'RailGaadi';
  let body = 'Train update';
  let data = { url: '/' };

  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.title === 'string') title = parsed.title;
        if (typeof parsed.body === 'string') body = parsed.body;
        data = parsed;
        if (typeof parsed.url !== 'string' || !parsed.url.startsWith('/')) {
          data.url = parsed.trainId ? `/train/${parsed.trainId}` : '/';
        }
      }
    }
  } catch {
    try {
      body = event.data ? event.data.text() : body;
    } catch {
      /* ignore */
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path =
    event.notification.data && typeof event.notification.data.url === 'string'
      ? event.notification.data.url
      : '/';
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        try {
          const existing = new URL(client.url);
          const dest = new URL(target);
          if (existing.origin === dest.origin && existing.pathname === dest.pathname && 'focus' in client) {
            return client.focus();
          }
        } catch {
          if (client.url === target && 'focus' in client) {
            return client.focus();
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    })
  );
});
