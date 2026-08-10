(function initFrameSources(global) {
  "use strict";

  function waitForEvent(target, successEvent, errorEvent = "error") {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        target.removeEventListener(successEvent, onSuccess);
        target.removeEventListener(errorEvent, onError);
      };
      const onSuccess = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("動画をブラウザでデコードできませんでした"));
      };
      target.addEventListener(successEvent, onSuccess, { once: true });
      target.addEventListener(errorEvent, onError, { once: true });
    });
  }

  function canvasToBlob(canvas, format) {
    const png = format === "png";
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("フレーム画像を作成できませんでした")),
        png ? "image/png" : "image/jpeg",
        png ? undefined : 0.97,
      );
    });
  }

  const MAX_MP4_METADATA_BYTES = 64 * 1024 * 1024;

  function fourcc(view, offset) {
    if (offset < 0 || offset + 4 > view.byteLength) return "";
    return String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
  }

  function uint64(view, offset) {
    const high = view.getUint32(offset);
    const low = view.getUint32(offset + 4);
    const value = high * 4294967296 + low;
    return Number.isSafeInteger(value) ? value : 0;
  }

  async function topLevelBox(file, wantedType) {
    let offset = 0;
    let inspected = 0;
    while (offset + 8 <= file.size && inspected < 10000) {
      const headerBuffer = await file.slice(offset, Math.min(file.size, offset + 16)).arrayBuffer();
      const header = new DataView(headerBuffer);
      let size = header.getUint32(0);
      const type = fourcc(header, 4);
      let headerSize = 8;
      if (size === 1) {
        if (header.byteLength < 16) return null;
        size = uint64(header, 8);
        headerSize = 16;
      } else if (size === 0) {
        size = file.size - offset;
      }
      if (!Number.isFinite(size) || size < headerSize || offset + size > file.size) return null;
      if (type === wantedType) return { offset, size, headerSize };
      offset += size;
      inspected += 1;
    }
    return null;
  }

  function childBoxes(view, start, end) {
    const boxes = [];
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset);
      const type = fourcc(view, offset + 4);
      let headerSize = 8;
      if (size === 1) {
        if (offset + 16 > end) break;
        size = uint64(view, offset + 8);
        headerSize = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (!Number.isFinite(size) || size < headerSize || offset + size > end) break;
      boxes.push({ type, dataStart: offset + headerSize, end: offset + size });
      offset += size;
    }
    return boxes;
  }

  function firstChild(view, parent, type) {
    return childBoxes(view, parent.dataStart, parent.end).find((box) => box.type === type) || null;
  }

  async function exactMp4FrameCount(file) {
    if (!(file instanceof Blob) || file.size < 16) return 0;
    const moov = await topLevelBox(file, "moov");
    if (!moov || moov.size - moov.headerSize > MAX_MP4_METADATA_BYTES) return 0;
    const buffer = await file.slice(moov.offset + moov.headerSize, moov.offset + moov.size).arrayBuffer();
    const view = new DataView(buffer);
    const root = { dataStart: 0, end: view.byteLength };
    for (const trak of childBoxes(view, root.dataStart, root.end).filter((box) => box.type === "trak")) {
      const mdia = firstChild(view, trak, "mdia");
      const hdlr = mdia && firstChild(view, mdia, "hdlr");
      if (!hdlr || hdlr.dataStart + 12 > hdlr.end || fourcc(view, hdlr.dataStart + 8) !== "vide") continue;
      const minf = firstChild(view, mdia, "minf");
      const stbl = minf && firstChild(view, minf, "stbl");
      if (!stbl) continue;
      const sampleSize = firstChild(view, stbl, "stsz") || firstChild(view, stbl, "stz2");
      if (!sampleSize || sampleSize.dataStart + 12 > sampleSize.end) continue;
      const count = view.getUint32(sampleSize.dataStart + 8);
      if (count > 0) return count;
    }
    return 0;
  }

  class ApiFrameSource {
    constructor(urlForFrame) {
      this.kind = "api";
      this.urlForFrame = urlForFrame;
    }

    async getFrameBlob(frame, format, timeSec) {
      const response = await fetch(this.urlForFrame(frame, format, timeSec), { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.blob();
    }

    close() {}
  }

  class BrowserFrameSource {
    constructor(file, objectUrl, video, canvas, fps, exactFrameCount = 0) {
      this.kind = "browser";
      this.file = file;
      this.objectUrl = objectUrl;
      this.video = video;
      this.canvas = canvas;
      this.context = canvas.getContext("2d", { alpha: false, desynchronized: true });
      this.duration = Number(video.duration) || 0;
      this.exactFrameCount = Math.max(0, Math.round(Number(exactFrameCount) || 0));
      this.fps = this.exactFrameCount > 0 && this.duration > 0
        ? this.exactFrameCount / this.duration
        : Math.max(0.001, Number(fps) || 30);
      this.closed = false;
      this.queue = Promise.resolve();
    }

    static async open(file, fps = 30) {
      if (!(file instanceof Blob)) throw new Error("動画ファイルが選択されていません");
      const objectUrl = URL.createObjectURL(file);
      const frameCountPromise = exactMp4FrameCount(file).catch(() => 0);
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.disablePictureInPicture = true;
      video.src = objectUrl;
      try {
        if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
          video.load();
          await waitForEvent(video, "loadedmetadata");
        }
        if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
          throw new Error("動画の解像度または再生時間を取得できませんでした");
        }
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const source = new BrowserFrameSource(file, objectUrl, video, canvas, fps, await frameCountPromise);
        await source.detectFps();
        return {
          source,
          metadata: source.metadata(file.name),
        };
      } catch (error) {
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(objectUrl);
        throw error;
      }
    }

    metadata(name = this.file?.name || "video") {
      return {
        name,
        fps: this.fps,
        frame_count: this.frameCount(),
        width: this.video.videoWidth,
        height: this.video.videoHeight,
        codec: this.file?.type || "browser-decoder",
        duration: this.duration,
        decoder: "browser",
        frame_count_estimated: this.exactFrameCount <= 0,
        frame_count_method: this.exactFrameCount > 0 ? "container_samples" : "duration_fps_estimate",
      };
    }

    frameCount() {
      if (this.exactFrameCount > 0) return this.exactFrameCount;
      return Math.max(1, Math.round(this.duration * this.fps));
    }

    async detectFps() {
      if (this.exactFrameCount > 0) return this.fps;
      if (typeof this.video.requestVideoFrameCallback !== "function" || this.duration < 0.2) return this.fps;
      const expected = this.fps;
      const mediaTimes = [];
      let callbackId = 0;
      let timeoutId = 0;
      let finished = false;
      const completed = new Promise((resolve) => {
        const finish = () => {
          if (finished) return;
          finished = true;
          if (callbackId && this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(callbackId);
          clearTimeout(timeoutId);
          resolve();
        };
        const collect = (_now, metadata) => {
          const mediaTime = Number(metadata?.mediaTime);
          if (Number.isFinite(mediaTime) && (mediaTimes.length === 0 || mediaTime > mediaTimes.at(-1))) {
            mediaTimes.push(mediaTime);
          }
          if (mediaTimes.length >= 16 || mediaTime >= Math.min(this.duration, 1)) finish();
          else callbackId = this.video.requestVideoFrameCallback(collect);
        };
        callbackId = this.video.requestVideoFrameCallback(collect);
        timeoutId = setTimeout(finish, 1500);
      });
      try {
        this.video.currentTime = 0;
        await this.video.play();
      } catch (_error) {
        // Keep the user-provided FPS when muted playback is restricted.
      }
      await completed;
      this.video.pause();

      const deltas = [];
      for (let index = 1; index < mediaTimes.length; index += 1) {
        const delta = mediaTimes[index] - mediaTimes[index - 1];
        if (delta > 0.001 && delta < 1) deltas.push(delta);
      }
      if (deltas.length < 3) return this.fps;
      deltas.sort((a, b) => a - b);
      const detected = 1 / deltas[Math.floor(deltas.length / 2)];
      if (detected < 1 || detected > 240) return this.fps;

      // Browsers may skip presentation callbacks under load. Only correct upward
      // harmonics toward the configured FPS; never halve a genuinely high FPS.
      for (let multiplier = 1; multiplier <= 4; multiplier += 1) {
        const candidate = detected * multiplier;
        if (Math.abs(candidate - expected) / expected <= 0.03) {
          this.fps = multiplier === 1 ? detected : expected;
          return this.fps;
        }
      }
      this.fps = detected;
      return this.fps;
    }

    setFps(fps) {
      this.fps = Math.max(0.001, Number(fps) || 30);
      return this.frameCount();
    }

    getFrameBlob(frame, format, timeSec) {
      const task = () => this._decodeFrameBlob(frame, format, timeSec);
      this.queue = this.queue.catch(() => {}).then(task);
      return this.queue;
    }

    getFrameImage(frame, timeSec) {
      if (typeof createImageBitmap !== "function") return null;
      const task = async () => {
        await this._seekToFrame(frame, timeSec);
        return createImageBitmap(this.video);
      };
      this.queue = this.queue.catch(() => {}).then(task);
      return this.queue;
    }

    async _seekToFrame(frame, timeSec) {
      if (this.closed) throw new Error("動画は閉じられています");
      const frameDuration = 1 / this.fps;
      const requestedTime = Number.isFinite(Number(timeSec))
        ? Number(timeSec)
        : Math.max(0, Number(frame) || 0) * frameDuration;
      const centeredTime = requestedTime + frameDuration * 0.25;
      const targetTime = Math.max(0, Math.min(Math.max(0, this.duration - frameDuration * 0.25), centeredTime));

      if (Math.abs(this.video.currentTime - targetTime) > Math.max(0.0001, frameDuration * 0.05)) {
        const seeked = waitForEvent(this.video, "seeked");
        this.video.currentTime = targetTime;
        await seeked;
      }
      if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await waitForEvent(this.video, "loadeddata");
      }
    }

    async _decodeFrameBlob(frame, format, timeSec) {
      await this._seekToFrame(frame, timeSec);
      this.context.imageSmoothingEnabled = false;
      this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      return canvasToBlob(this.canvas, format);
    }

    close() {
      if (this.closed) return;
      this.closed = true;
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
      URL.revokeObjectURL(this.objectUrl);
    }
  }

  global.VideoDigitizerFrames = { ApiFrameSource, BrowserFrameSource, exactMp4FrameCount };
})(globalThis);
