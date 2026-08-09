const CACHE_NAME = "video-digitizer-shell-v1.6.0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=1.6.0",
  "./frame-source.js",
  "./pwa.js",
  "./ai-pose.js?v=1.6.0",
  "./ai-pose-worker.js?v=1.6.0",
  "./app.js?v=1.6.0",
  "./version.json?v=1.6.0",
  "./manifest.webmanifest?v=1.6.0",
  "./icon-192.png?v=1.6.0",
  "./icon-512.png?v=1.6.0",
  "./vendor/mediapipe/vision_bundle.mjs",
  "./vendor/mediapipe/pose_landmarker_lite.task",
  "./vendor/mediapipe/wasm/vision_wasm_internal.js",
  "./vendor/mediapipe/wasm/vision_wasm_internal.wasm",
  "./vendor/mediapipe/wasm/vision_wasm_module_internal.js",
  "./vendor/mediapipe/wasm/vision_wasm_module_internal.wasm",
  "./vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  "./vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
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
