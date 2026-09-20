(function initVideoDigitizerNativeBridge(global) {
  "use strict";

  const requestedPlatform = new URLSearchParams(global.location.search).get("platform") || "web";
  const hasIOSHandlers = Boolean(
    global.webkit?.messageHandlers?.videoDigitizerExport?.postMessage
    && global.webkit?.messageHandlers?.videoDigitizerState?.postMessage,
  );
  const isIOSApp = requestedPlatform === "ios" && hasIOSHandlers;
  const platform = isIOSApp ? "ios" : "web";

  function post(name, payload) {
    const target = global.webkit?.messageHandlers?.[name];
    if (!target?.postMessage) return false;
    try {
      target.postMessage(payload);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function request(name, payload) {
    const reply = requestReply(name, payload);
    if (!reply) return false;
    return reply.then((value) => Boolean(value?.success));
  }

  function requestReply(name, payload) {
    const target = global.webkit?.messageHandlers?.[name];
    if (!target?.postMessage) return false;
    try {
      return Promise.resolve(target.postMessage(payload))
        .catch(() => null);
    } catch (_error) {
      return Promise.resolve(null);
    }
  }

  global.VideoDigitizerNative = Object.freeze({
    platform,
    isIOSApp,
    exportText({ text, filename, mimeType }) {
      if (!isIOSApp || typeof text !== "string") return false;
      return request("videoDigitizerExport", {
        text,
        filename: String(filename || "VideoDigitizer.txt"),
        mimeType: String(mimeType || "text/plain"),
      });
    },
    setAnalysisRunning(running) {
      if (!isIOSApp) return false;
      return post("videoDigitizerState", { analysisRunning: Boolean(running) });
    },
    saveRecovery(text) {
      if (!isIOSApp || typeof text !== "string") return Promise.resolve(false);
      return request("videoDigitizerRecovery", { action: "set", text }) || Promise.resolve(false);
    },
    loadRecovery() {
      if (!isIOSApp) return Promise.resolve(null);
      const reply = requestReply("videoDigitizerRecovery", { action: "get" });
      if (!reply) return Promise.resolve(null);
      return reply.then((value) => value?.success && typeof value.value === "string" ? value.value : null);
    },
  });

  if (isIOSApp) {
    document.documentElement.classList.add("ios-app");
    post("videoDigitizerState", { analysisRunning: false });
  }
})(globalThis);
