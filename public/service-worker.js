/* eslint-disable no-restricted-globals */

const cache_name = 'yoboba-v11';
const static_assets = [
  '/',
  '/login',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(cache_name).then((cache) => cache.addAll(static_assets))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== cache_name)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) return;

  // картинки меню — только сеть, без залипшего кеша 404
  if (url.pathname.startsWith('/images/menu/')) {
    event.respondWith(fetch(request));
    return;
  }

  // HTML / JS / CSS — сначала сеть, иначе старый бандл держит чёрные кнопки задач
  const is_nav = request.mode === 'navigate';
  const is_asset =
    url.pathname.startsWith('/_next/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css');

  if (is_nav || is_asset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(cache_name).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(cache_name).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'yomoyo',
    body: 'обновление по заказу',
    tag: 'yoboba',
    renotify: true,
    requireInteraction: false,
    vibrate: [100, 50, 100],
    data: {},
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  const status = payload.data && payload.data.status;
  const actions =
    status === 'ready'
      ? [{ action: 'open', title: 'забрать' }]
      : status === 'preparing' || status === 'new'
        ? [{ action: 'open', title: 'следить' }]
        : [{ action: 'open', title: 'открыть' }];

  event.waitUntil(
    self.registration.showNotification(payload.title || 'yomoyo', {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // крупная картинка в шторке (Android Chrome) — бренд по центру внимания
      image: '/icons/icon-512.png',
      tag: payload.tag || (payload.data?.order_id ? `yoboba-order-${payload.data.order_id}` : 'yoboba'),
      renotify: payload.renotify !== false,
      requireInteraction: Boolean(payload.requireInteraction) || status === 'ready',
      vibrate: payload.vibrate || [100, 50, 100],
      actions,
      data: payload.data || {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if (client.url.includes(target) || new URL(client.url).pathname === target) {
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(target);
      }
    })
  );
});
