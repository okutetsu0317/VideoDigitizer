(function initVideoDigitizerAI(global) {
  "use strict";

  let worker = null;
  let nextRequestId = 1;
  const REQUEST_TIMEOUT_MS = 45_000;
  const pending = new Map();

  function settleRequest(id, error, result) {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    global.clearTimeout(request.timer);
    if (error) request.reject(error);
    else request.resolve(result);
  }

  function rejectPending(error, target) {
    for (const [id, request] of pending) {
      if (request.target === target) settleRequest(id, error);
    }
  }

  function stopWorker(target, error) {
    // A terminated worker can still deliver queued events. Those events must
    // never reject a retry or terminate its replacement worker.
    if (!target || worker !== target) return;
    worker = null;
    target.terminate();
    rejectPending(error, target);
  }

  function ensureWorker() {
    if (worker) return worker;
    if (location.protocol === "file:") {
      throw new Error("AI機能はローカルサーバーまたはWeb版で利用してください");
    }
    if (typeof Worker !== "function" || typeof createImageBitmap !== "function") {
      throw new Error("このブラウザはAI姿勢推定に対応していません");
    }
    const target = new Worker(new URL("./ai-pose-worker.js?v=2.2.0-integrity4", document.baseURI), { type: "module" });
    worker = target;
    target.addEventListener("message", (event) => {
      if (worker !== target) return;
      const request = pending.get(event.data?.id);
      if (!request || request.target !== target) return;
      settleRequest(event.data.id,
        event.data.ok ? null : new Error(event.data.error || "AI姿勢推定に失敗しました"),
        event.data.result);
    });
    target.addEventListener("error", (event) => {
      stopWorker(target, new Error(event.message || "AIワーカーを起動できませんでした。もう一度分析してください。"));
    });
    target.addEventListener("messageerror", () => {
      stopWorker(target, new Error("AIの応答を読み取れませんでした。もう一度分析してください。"));
    });
    return target;
  }

  function sourceDimensions(source) {
    if (!source) return { width: 0, height: 0 };
    if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
      if (!source.complete) return { width: 0, height: 0 };
      return { width: source.naturalWidth, height: source.naturalHeight };
    }
    return {
      width: Number(source.videoWidth || source.naturalWidth || source.width) || 0,
      height: Number(source.videoHeight || source.naturalHeight || source.height) || 0,
    };
  }

  async function estimatePose(image, options = {}) {
    const dimensions = sourceDimensions(image);
    if (!dimensions.width || !dimensions.height) {
      throw new Error("現在フレームの画像を読み込めませんでした");
    }
    const target = ensureWorker();
    const suppliedBitmap = typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap;
    const id = nextRequestId++;
    const maxPoses = Math.max(1, Math.min(4, Math.trunc(Number(options.maxPoses) || 1)));
    return new Promise((resolve, reject) => {
      const timer = global.setTimeout(() => {
        stopWorker(target, new Error("AIの準備または姿勢推定が45秒以内に完了しませんでした。もう一度分析してください。"));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, target, timer });
      // Include image preparation in the deadline. A late bitmap from an
      // expired/closed request must be released rather than sent to a worker.
      (async () => {
        let bitmap = null;
        let posting = false;
        try {
          bitmap = suppliedBitmap ? image : await createImageBitmap(image);
          if (!pending.has(id) || worker !== target) {
            if (!suppliedBitmap) bitmap?.close?.();
            return;
          }
          posting = true;
          target.postMessage({ id, type: "estimate_pose", image: bitmap, maxPoses }, [bitmap]);
        } catch (error) {
          if (!suppliedBitmap) bitmap?.close?.();
          if (posting) stopWorker(target, error);
          else settleRequest(id, error);
        }
      })();
    });
  }

  global.VideoDigitizerAI = {
    estimatePose,
    close() {
      stopWorker(worker, new Error("AI処理を終了しました"));
    },
  };
})(globalThis);
