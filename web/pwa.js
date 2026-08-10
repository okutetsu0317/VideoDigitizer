(function initPwa(global) {
  "use strict";

  const DB_NAME = "video_digitizer_local";
  const STORE_NAME = "projects";
  const BUILD_ID = "2.2.0-perf7";

  function openDatabase() {
    if (!global.indexedDB) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDBを開けませんでした"));
    });
  }

  async function withStore(mode, callback) {
    const database = await openDatabase();
    if (!database) return null;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = callback(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error || new Error("ブラウザ保存に失敗しました"));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error("ブラウザ保存に失敗しました"));
      };
    });
  }

  global.VideoDigitizerStorage = {
    get: (key) => withStore("readonly", (store) => store.get(key)),
    set: (key, value) => withStore("readwrite", (store) => store.put(value, key)),
    requestPersistence: async () => {
      if (!navigator.storage?.persist) return false;
      try {
        return await navigator.storage.persist();
      } catch (_error) {
        return false;
      }
    },
  };

  const standaloneWebMode = !new URLSearchParams(location.search).has("token");
  if (standaloneWebMode && (location.protocol === "http:" || location.protocol === "https:")) {
    let refreshing = false;
    navigator.serviceWorker?.addEventListener("controllerchange", () => {
      if (refreshing) return;
      const videoName = document.querySelector("#videoName")?.textContent?.trim() || "未選択";
      const dirty = document.querySelector("#dirtyMark")?.textContent?.includes("*");
      if (videoName === "未選択" && !dirty) {
        refreshing = true;
        location.reload();
        return;
      }
      const status = document.querySelector("#statusText");
      if (status) status.textContent = "更新があります。プロジェクト保存後にページを再読み込みしてください";
    });
    window.addEventListener("load", () => {
      navigator.serviceWorker
        ?.register(`./service-worker.js?v=${BUILD_ID}`, { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {});
    });
  }
})(globalThis);
