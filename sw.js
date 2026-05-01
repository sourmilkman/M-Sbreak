const CACHE = 'ms-breaktimer-v6';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

let alarmTimer = null;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Network-first for the HTML and JS (so updates always come through)
  const isAppShell = url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('.js');
  if (isAppShell) {
    e.respondWith(
      fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => { try { c.put(e.request, copy); } catch(_){} });
        return resp;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
  } else {
    // Cache-first for icons/manifest
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => { try { c.put(e.request, copy); } catch(_){} });
        return resp;
      }))
    );
  }
});

self.addEventListener('message', e => {
  const data = e.data || {};
  if (data.type === 'schedule-alarm') {
    if (alarmTimer) clearTimeout(alarmTimer);
    const delay = Math.max(0, data.endAt - Date.now());
    alarmTimer = setTimeout(() => fireAlarm(data), delay);
  } else if (data.type === 'cancel-alarm') {
    if (alarmTimer) { clearTimeout(alarmTimer); alarmTimer = null; }
  }
});

async function fireAlarm(data) {
  alarmTimer = null;
  // Check if any client is visible — if so, the page handles it
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const visibleClient = clients.find(c => c.visibilityState === 'visible');
  if (visibleClient) {
    visibleClient.postMessage({ type: 'alarm-fired' });
    return;
  }
  // Otherwise fire a notification (with vibration pattern + sound)
  if (data.notify && self.registration && self.registration.showNotification) {
    try {
      await self.registration.showNotification('M&S Breaktimer — Time\u2019s up', {
        body: 'Your ' + (data.label || 'break') + ' has finished.',
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: 'ms-break-done',
        requireInteraction: true,
        vibrate: data.vibrate ? [500, 200, 500, 200, 500, 200, 800] : undefined,
        silent: false
      });
    } catch (e) { /* ignore */ }
  }
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const c = clients[0];
      if (c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});
