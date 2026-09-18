/* Online VIP CRM — yalnız bildirim service worker'ı (FAZ 4).
 * Sayfa / dosya ÖNBELLEĞE ALMAZ (fetch dinleyicisi yok); site güncellemelerini etkilemez.
 * Kapsam: /crm/ */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Online VIP CRM', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Online VIP CRM';
  const url = data.url || '/crm/inbox';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // CRM ekranı açık ve odaktaysa sayfa kendi zilini / sesini gösterir; çift bildirim olmasın
      const focused = clients.find((c) => c.focused && new URL(c.url).pathname.startsWith('/crm'));
      if (focused) {
        focused.postMessage({ type: 'crm-push', payload: data });
        return undefined;
      }
      return self.registration.showNotification(title, {
        body: data.body || '',
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        icon: '/logo-mark-192.png',
        badge: '/logo-mark-192.png',
        data: { url }
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/crm/inbox', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const crm = clients.find((c) => new URL(c.url).pathname.startsWith('/crm'));
      if (crm) {
        return crm.focus().then((c) => (c && 'navigate' in c ? c.navigate(target) : undefined));
      }
      return self.clients.openWindow(target);
    })
  );
});
