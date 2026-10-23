/* Xyron service worker: shows admin broadcasts as phone/desktop notifications
   even when the site is closed, and opens the app when one is tapped. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Xyron";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/popup/xyron-x.jpg",
      tag: data.id ? `broadcast-${data.id}` : undefined,
      data: { url: data.url || "/", id: data.id || "" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url = "/", id = "" } = event.notification.data || {};
  const target = new URL(url, self.location.origin);
  const sameOrigin = target.origin === self.location.origin;
  event.waitUntil((async () => {
    if (!sameOrigin) { await self.clients.openWindow(target.href); return; }
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = open.find((c) => new URL(c.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      existing.postMessage({ type: "xyron-notification-click", url: target.pathname + target.search + target.hash, id });
      return;
    }
    if (id) target.searchParams.set("bc", id);
    await self.clients.openWindow(target.href);
  })());
});
