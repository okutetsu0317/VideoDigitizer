(function initPwa(global) {
  "use strict";

  const DB_NAME = "video_digitizer_local";
  const STORE_NAME = "projects";

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
    window.addEventListener("load", () => {
      navigator.serviceWorker?.register("./service-worker.js").catch(() => {});
    });
  }
})(globalThis);
