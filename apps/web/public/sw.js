const CACHE_NAME = "black-soup-v13-preview-1";
const PRECACHE = [
  "/",
  "/case/c01-cold-room-knock/",
  "/case/c02-snow-route/",
  "/case/c03-second-shadow/",
  "/case/c04-unpostable-reply/",
  "/case/c05-third-lamp/",
  "/case/c06-nonexistent-ticket/",
  "/case/c07-key-returns/",
  "/case/c08-unclaimed-recording/",
  "/case/c09-rain-room/",
  "/case/c10-single-ring/",
  "/case/c11-borrowed-signature/",
  "/case/c12-zero-floor-elevator/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/scene-cold-room.svg",
  "/scene-snow-route.svg",
  "/scene-second-shadow.svg",
  "/scene-unpostable-reply.svg",
  "/scene-third-lamp.svg",
  "/scene-nonexistent-ticket.svg",
  "/scene-key-returns.svg",
  "/scene-unclaimed-recording.svg",
  "/scene-rain-room.svg",
  "/scene-single-ring.svg",
  "/scene-borrowed-signature.svg",
  "/scene-zero-floor-elevator.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const url = new URL(event.request.url);
      const navigationKey = url.pathname === "/" ? "/" : `${url.pathname.replace(/\/$/, "")}/`;
      const cached = event.request.mode === "navigate"
        ? await cache.match(navigationKey, { ignoreSearch: true })
        : await cache.match(event.request, { ignoreSearch: true }) ?? await cache.match(decodeURIComponent(url.pathname), { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        return event.request.mode === "navigate" ? await cache.match(navigationKey) ?? await cache.match("/") ?? Response.error() : Response.error();
      }
    }),
  );
});
