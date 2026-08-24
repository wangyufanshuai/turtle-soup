const CACHE_NAME = "black-soup-v09-c01-eval1";
const PRECACHE = [
  "/",
  "/404.html",
  "/404/",
  "/TESTER-INSTRUCTIONS.txt",
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
  "/case/c01-cold-room-knock/",
  "/case/c01-cold-room-knock/__next._full.txt",
  "/case/c01-cold-room-knock/__next._tree.txt",
  "/case/c01-cold-room-knock/__next.case/$d$caseId/__PAGE__.txt",
  "/case/c01-cold-room-knock/index.txt",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg",
  "/index.txt",
  "/manifest.webmanifest",
  "/scene-cold-room.svg"
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
