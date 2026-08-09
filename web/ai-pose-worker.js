let landmarkerPromise = null;

const originalFetch = self.fetch.bind(self);
self.fetch = (input, init) => {
  const rawUrl = typeof input === "string" || input instanceof URL ? input : input?.url;
  const url = new URL(rawUrl, self.location.href);
  if (url.origin !== self.location.origin) {
    return Promise.reject(new Error("AIワーカーからの外部通信を遮断しました"));
  }
  return originalFetch(input, init);
};

if (typeof XMLHttpRequest === "function") {
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function restrictedOpen(method, rawUrl, ...rest) {
    const url = new URL(rawUrl, self.location.href);
    if (url.origin !== self.location.origin) throw new Error("AIワーカーからの外部通信を遮断しました");
    return originalOpen.call(this, method, rawUrl, ...rest);
  };
}

function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("./vendor/mediapipe/vision_bundle.mjs");
      const wasmRoot = new URL("./vendor/mediapipe/wasm/", import.meta.url).href;
      const modelPath = new URL("./vendor/mediapipe/pose_landmarker_lite.task", import.meta.url).href;
      const vision = await FilesetResolver.forVisionTasks(wasmRoot, true);
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPath },
        runningMode: "IMAGE",
        numPoses: 1,
        minPoseDetectionConfidence: 0.35,
        minPosePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
        outputSegmentationMasks: false,
      });
    })();
  }
  return landmarkerPromise;
}

self.addEventListener("message", async (event) => {
  const { id, type, image } = event.data || {};
  if (type !== "estimate_pose" || !image) return;
  const started = performance.now();
  try {
    const landmarker = await getLandmarker();
    const result = landmarker.detect(image);
    const landmarks = result.landmarks?.[0] || [];
    self.postMessage({
      id,
      ok: true,
      result: {
        landmarks: landmarks.map((point) => ({
          x: point.x,
          y: point.y,
          z: point.z,
          visibility: point.visibility,
          presence: point.presence,
        })),
        inference_ms: performance.now() - started,
      },
    });
  } catch (error) {
    landmarkerPromise = null;
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  } finally {
    image.close?.();
  }
});
