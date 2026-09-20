const CACHE_NAME = "video-digitizer-shell-v2.2.0-qa1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./native-bridge.js?v=2.2.0-ios1",
  "./styles.css?v=2.2.0-qa1",
  "./frame-source.js?v=2.2.0-qa1",
  "./pwa.js?v=2.2.0-qa1",
  "./ai-pose.js?v=2.2.0-qa1",
  "./ai-pose-worker.js?v=2.2.0-qa1",
  "./point-tracker.js?v=2.2.0-qa1",
  "./point-tracker-worker.js?v=2.2.0",
  "./step-analysis-core.js?v=2.2.0-qa1",
  "./step-analysis.js?v=2.2.0-qa1",
  "./app.js?v=2.2.0-qa1",
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
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("video-digitizer-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  event.respondWith(
    fetch(event.request, { cache: event.request.mode === "navigate" ? "no-store" : "default" })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {}));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(async (cached) => {
        if (cached) return cached;
        if (event.request.mode === "navigate" && (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html"))) {
          return await caches.match("./index.html") || Response.error();
        }
        return Response.error();
      })),
  );
});
