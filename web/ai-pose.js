(function initVideoDigitizerAI(global) {
  "use strict";

  let worker = null;
  let nextRequestId = 1;
  const pending = new Map();

  function rejectPending(error) {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }

  function ensureWorker() {
    if (worker) return worker;
    if (location.protocol === "file:") {
      throw new Error("AI機能はローカルサーバーまたはWeb版で利用してください");
    }
    if (typeof Worker !== "function" || typeof createImageBitmap !== "function") {
      throw new Error("このブラウザはAI姿勢推定に対応していません");
    }
    worker = new Worker(new URL("./ai-pose-worker.js?v=2.1.0", document.baseURI), { type: "module" });
    worker.addEventListener("message", (event) => {
      const request = pending.get(event.data?.id);
      if (!request) return;
      pending.delete(event.data.id);
      if (event.data.ok) request.resolve(event.data.result);
      else request.reject(new Error(event.data.error || "AI姿勢推定に失敗しました"));
    });
    worker.addEventListener("error", (event) => {
      rejectPending(new Error(event.message || "AIワーカーを起動できませんでした"));
      worker?.terminate();
      worker = null;
    });
    return worker;
  }

  async function estimatePose(image) {
    if (!image?.complete || !image.naturalWidth || !image.naturalHeight) {
      throw new Error("現在フレームの画像を読み込めませんでした");
    }
    const target = ensureWorker();
    const bitmap = await createImageBitmap(image);
    const id = nextRequestId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      target.postMessage({ id, type: "estimate_pose", image: bitmap }, [bitmap]);
    });
  }

  global.VideoDigitizerAI = {
    estimatePose,
    close() {
      rejectPending(new Error("AI処理を終了しました"));
      worker?.terminate();
      worker = null;
    },
  };
})(globalThis);
