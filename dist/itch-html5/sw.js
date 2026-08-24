const CACHE_NAME = "black-soup-v09-gm1";
const PRECACHE = [
  "/",
  "/__next.__PAGE__.txt",
  "/__next._full.txt",
  "/__next._tree.txt",
  "/_next/static/chunks/245.01f3d922766030ab.js",
  "/_next/static/chunks/387.b486e5600dfa16f8.js",
  "/_next/static/chunks/446.9f3b84c08c540e01.js",
  "/_next/static/chunks/585-75eac32d984ac39a.js",
  "/_next/static/chunks/825-c56ef468f97f379e.js",
  "/_next/static/chunks/87c73c54-fd33669cffb637e8.js",
  "/_next/static/chunks/968-639e78bfc5547bbf.js",
  "/_next/static/chunks/app/_global-error/page-327b769f8d5a8082.js",
  "/_next/static/chunks/app/_not-found/page-3b668e18432afbd9.js",
  "/_next/static/chunks/app/case/[caseId]/page-dfafe3722a5152fd.js",
  "/_next/static/chunks/app/layout-90d9f82651ba6091.js",
  "/_next/static/chunks/app/page-eced159b654d6bc1.js",
  "/_next/static/chunks/framework-626cbd48ac5aca57.js",
  "/_next/static/chunks/main-9929ea32eb1a8d7b.js",
  "/_next/static/chunks/main-app-428fc4faf781d155.js",
  "/_next/static/chunks/next/dist/client/components/builtin/app-error-327b769f8d5a8082.js",
  "/_next/static/chunks/next/dist/client/components/builtin/forbidden-327b769f8d5a8082.js",
  "/_next/static/chunks/next/dist/client/components/builtin/global-error-136c7281e753378a.js",
  "/_next/static/chunks/next/dist/client/components/builtin/not-found-327b769f8d5a8082.js",
  "/_next/static/chunks/next/dist/client/components/builtin/unauthorized-327b769f8d5a8082.js",
  "/_next/static/chunks/polyfills-42372ed130431b0a.js",
  "/_next/static/chunks/webpack-8c6f3d5fe9ace9c4.js",
  "/_next/static/css/21a1b3b58f2e4fc3.css",
  "/_next/static/css/c8df91ebc727e7e4.css",
  "/_next/static/css/cc7e79d8acbc9200.css",
  "/_next/static/pqvX5obU5HBqVDaiRWqEm/_buildManifest.js",
  "/_next/static/pqvX5obU5HBqVDaiRWqEm/_ssgManifest.js",
  "/_not-found/",
  "/_not-found/__next._full.txt",
  "/_not-found/__next._not-found/__PAGE__.txt",
  "/_not-found/__next._tree.txt",
  "/_not-found/index.txt",
  "/404.html",
  "/404/",
  "/case/c01-cold-room-knock/",
  "/case/c01-cold-room-knock/__next._full.txt",
  "/case/c01-cold-room-knock/__next._tree.txt",
  "/case/c01-cold-room-knock/__next.case/$d$caseId/__PAGE__.txt",
  "/case/c01-cold-room-knock/index.txt",
  "/case/c02-snow-route/",
  "/case/c02-snow-route/__next._full.txt",
  "/case/c02-snow-route/__next._tree.txt",
  "/case/c02-snow-route/__next.case/$d$caseId/__PAGE__.txt",
  "/case/c02-snow-route/index.txt",
  "/case/c03-second-shadow/",
  "/case/c03-second-shadow/__next._full.txt",
  "/case/c03-second-shadow/__next._tree.txt",
  "/case/c03-second-shadow/__next.case/$d$caseId/__PAGE__.txt",
  "/case/c03-second-shadow/index.txt",
  "/case/c04-unpostable-reply/",
  "/case/c04-unpostable-reply/__next._full.txt",
  "/case/c04-unpostable-reply/__next._tree.txt",
  "/case/c04-unpostable-reply/__next.case/$d$caseId/__PAGE__.txt",
  "/case/c04-unpostable-reply/index.txt",
  "/case/c05-third-lamp/",
  "/case/c05-third-lamp/__next._full.txt",
  "/case/c05-third-lamp/__next._tree.txt",
  "/case/c05-third-lamp/__next.case/$d$caseId/__PAGE__.txt",
  "/case/c05-third-lamp/index.txt",
  "/case/c06-nonexistent-ticket/",
  "/case/c06-nonexistent-ticket/__next._full.txt",
  "/case/c06-nonexistent-ticket/__next._tree.txt",
  "/case/c06-nonexistent-ticket/__next.case/$d$caseId/__PAGE__.txt",
  "/case/c06-nonexistent-ticket/index.txt",
  "/case/c07-key-returns/",
  "/case/c07-key-returns/__next._full.txt",
  "/case/c07-key-returns/__next._tree.txt",
  "/case/c07-key-returns/__next.case/$d$caseId/__PAGE__.txt",
  "/case/c07-key-returns/index.txt",
  "/case/c08-unclaimed-recording/",
  "/case/c08-unclaimed-recording/__next._full.txt",
  "/case/c08-unclaimed-recording/__next._tree.txt",
  "/case/c08-unclaimed-recording/__next.case/$d$caseId/__PAGE__.txt",
  "/case/c08-unclaimed-recording/index.txt",
  "/case/c09-rain-room/",
  "/case/c09-rain-room/__next._full.txt",
  "/case/c09-rain-room/__next._tree.txt",
  "/case/c09-rain-room/__next.case/$d$caseId/__PAGE__.txt",
  "/case/c09-rain-room/index.txt",
  "/case/c10-single-ring/",
  "/case/c10-single-ring/__next._full.txt",
  "/case/c10-single-ring/__next._tree.txt",
  "/case/c10-single-ring/__next.case/$d$caseId/__PAGE__.txt",
  "/case/c10-single-ring/index.txt",
  "/case/c11-borrowed-signature/",
  "/case/c11-borrowed-signature/__next._full.txt",
  "/case/c11-borrowed-signature/__next._tree.txt",
  "/case/c11-borrowed-signature/__next.case/$d$caseId/__PAGE__.txt",
  "/case/c11-borrowed-signature/index.txt",
  "/case/c12-zero-floor-elevator/",
  "/case/c12-zero-floor-elevator/__next._full.txt",
  "/case/c12-zero-floor-elevator/__next._tree.txt",
  "/case/c12-zero-floor-elevator/__next.case/$d$caseId/__PAGE__.txt",
  "/case/c12-zero-floor-elevator/index.txt",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg",
  "/index.txt",
  "/manifest.webmanifest",
  "/scene-borrowed-signature.svg",
  "/scene-cold-room.svg",
  "/scene-key-returns.svg",
  "/scene-nonexistent-ticket.svg",
  "/scene-rain-room.svg",
  "/scene-second-shadow.svg",
  "/scene-single-ring.svg",
  "/scene-snow-route.svg",
  "/scene-third-lamp.svg",
  "/scene-unclaimed-recording.svg",
  "/scene-unpostable-reply.svg",
  "/scene-zero-floor-elevator.svg"
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
      const cached = await cache.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        return event.request.mode === "navigate" ? await cache.match("/") ?? Response.error() : Response.error();
      }
    }),
  );
});
