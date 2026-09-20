let visionPromise = null;
const landmarkerPromises = new Map();

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

function normalizedPoseLimit(value) {
  return Math.max(1, Math.min(4, Math.trunc(Number(value) || 1)));
}

function getLandmarker(requestedLimit) {
  const numPoses = normalizedPoseLimit(requestedLimit);
  if (!landmarkerPromises.has(numPoses)) {
    const promise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("./vendor/mediapipe/vision_bundle.mjs");
      const wasmRoot = new URL("./vendor/mediapipe/wasm/", import.meta.url).href;
      const modelPath = new URL("./vendor/mediapipe/pose_landmarker_lite.task", import.meta.url).href;
      if (!visionPromise) {
        visionPromise = FilesetResolver.forVisionTasks(wasmRoot, true).catch((error) => {
          visionPromise = null;
          throw error;
        });
      }
      const vision = await visionPromise;
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPath },
        runningMode: "IMAGE",
        numPoses,
        minPoseDetectionConfidence: 0.35,
        minPosePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
        outputSegmentationMasks: false,
      });
    })().catch((error) => {
      landmarkerPromises.delete(numPoses);
      throw error;
    });
    landmarkerPromises.set(numPoses, promise);
  }
  return landmarkerPromises.get(numPoses);
}

self.addEventListener("message", async (event) => {
  const { id, type, image, maxPoses } = event.data || {};
  if (type !== "estimate_pose" || !image) return;
  const started = performance.now();
  try {
    const landmarker = await getLandmarker(maxPoses);
    const result = landmarker.detect(image);
    const poses = (result.landmarks || []).map((landmarks) => landmarks.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z,
      visibility: point.visibility,
      presence: point.presence,
    })));
    self.postMessage({
      id,
      ok: true,
      result: {
        // Keep `landmarks` for the existing single-person digitize preview.
        landmarks: poses[0] || [],
        poses,
        inference_ms: performance.now() - started,
      },
    });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  } finally {
    image.close?.();
  }
});
