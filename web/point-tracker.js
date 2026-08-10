(function initVideoDigitizerPointTracker(global) {
  let worker = null;
  let sequence = 0;
  const requests = new Map();

  function ensureWorker() {
    if (worker) return worker;
    if (!global.Worker || !global.createImageBitmap) {
      throw new Error("このブラウザは画像追跡に対応していません");
    }
    worker = new Worker("./point-tracker-worker.js", { type: "module" });
    worker.addEventListener("message", (event) => {
      const request = requests.get(event.data.id);
      if (!request) return;
      requests.delete(event.data.id);
      if (event.data.ok) request.resolve(event.data.result);
      else request.reject(new Error(event.data.error || "画像追跡に失敗しました"));
    });
    worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "画像追跡Workerを起動できませんでした");
      for (const request of requests.values()) request.reject(error);
      requests.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  }

  async function request(type, sourceImage, targetImage, payload = {}) {
    const activeWorker = ensureWorker();
    const [source, target] = await Promise.all([
      global.createImageBitmap(sourceImage),
      global.createImageBitmap(targetImage),
    ]);
    const id = ++sequence;
    const response = new Promise((resolve, reject) => requests.set(id, { resolve, reject }));
    activeWorker.postMessage({ type, id, source, target, ...payload }, [source, target]);
    return response;
  }

  function track(sourceImage, targetImage, point, options = {}) {
    return request("track", sourceImage, targetImage, { point, options });
  }

  function trackMany(sourceImage, targetImage, items) {
    if (!Array.isArray(items) || items.length === 0) return Promise.resolve([]);
    return request("track-many", sourceImage, targetImage, { items });
  }

  function terminate() {
    worker?.terminate();
    worker = null;
    for (const request of requests.values()) request.reject(new Error("画像追跡を終了しました"));
    requests.clear();
  }

  global.VideoDigitizerPointTracker = { track, trackMany, terminate };
})(globalThis);
