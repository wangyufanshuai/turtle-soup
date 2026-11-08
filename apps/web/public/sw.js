const CACHE_NAME = "black-soup-v24-investigation-rhythm-rc-1";
const CACHE_PREFIX = "black-soup-v24-";
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
// Everything else in the release: fetched on demand (and cached when first
// used), or all at once when the player asks for a full offline download.
const LAZY = [];

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

// Cache-on-use: once a case page, scene or cover has been fetched, it stays
// playable offline. Only successful same-origin responses are stored.
async function remember(cache, request, key, response) {
  if (!response || !response.ok || response.type !== "basic") return;
  try {
    await cache.put(key ?? request, response.clone());
  } catch {
    /* quota or opaque response: serve from network without caching */
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_ALL") return;
  const port = event.ports?.[0];
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const total = LAZY.length;
      let done = 0;
      let failed = 0;
      for (let i = 0; i < total; i += 8) {
        const batch = LAZY.slice(i, i + 8);
        await Promise.all(
          batch.map(async (path) => {
            try {
              if (!(await cache.match(path))) await cache.add(path);
            } catch {
              failed++;
            }
            done++;
          }),
        );
        port?.postMessage({ type: "progress", done, total, failed });
      }
      port?.postMessage({ type: "complete", done, total, failed });
    }),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const url = new URL(event.request.url);
      const navigationKey = url.pathname === "/" ? "/" : `${url.pathname.replace(/\/$/, "")}/`;
      // Static-export RSC files carry a router cache-busting parameter. Their
      // bytes are already versioned by this service worker's precache manifest.
      const staticQuery = [...url.searchParams.keys()].every((key) => key === "_rsc");
      const cached = event.request.mode === "navigate"
        ? await cache.match(navigationKey, { ignoreSearch: true })
        : !staticQuery ? undefined : await cache.match(event.request) ?? await cache.match(decodeURIComponent(url.pathname));
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (event.request.mode === "navigate") await remember(cache, event.request, navigationKey, response);
        else if (staticQuery) await remember(cache, event.request, url.search ? decodeURIComponent(url.pathname) : undefined, response);
        return response;
      } catch {
        return event.request.mode === "navigate" ? await cache.match(navigationKey) ?? await cache.match("/") ?? Response.error() : Response.error();
      }
    }),
  );
});
