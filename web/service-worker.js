const CACHE_NAME = "video-digitizer-shell-v2.2.0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=2.2.0",
  "./frame-source.js",
  "./pwa.js",
  "./ai-pose.js?v=2.2.0",
  "./ai-pose-worker.js?v=2.2.0",
  "./point-tracker.js?v=2.2.0",
  "./point-tracker-worker.js?v=2.2.0",
  "./app.js?v=2.2.0",
  "./version.json?v=2.2.0",
  "./manifest.webmanifest?v=2.2.0",
  "./icon-192.png?v=2.2.0",
  "./icon-512.png?v=2.2.0",
  "./signin-google.png?v=2.2.0",
  "./privacy.html?v=2.2.0",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.includes("/api/")) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))),
  );
});
