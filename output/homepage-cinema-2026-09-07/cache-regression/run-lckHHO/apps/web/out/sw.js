const CACHE_NAME = "black-soup-v2-12-m3-dev-681d25590f38";
const CACHE_PREFIX = "black-soup-v2-12-m3-";
const PRECACHE = [
  "/",
  "/_next/static/app.js",
  "/case/c01-cold-room-knock/"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
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
        : url.search ? undefined : await cache.match(event.request) ?? await cache.match(decodeURIComponent(url.pathname));
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        return response;
      } catch {
        return event.request.mode === "navigate" ? await cache.match(navigationKey) ?? await cache.match("/") ?? Response.error() : Response.error();
      }
    }),
  );
});
