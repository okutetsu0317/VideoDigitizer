(function initFrameSources(global) {
  "use strict";

  const MEDIA_LOAD_TIMEOUT_MS = 15000;

  function abortedLoadError() {
    const error = new Error("動画の読み込みをキャンセルしました");
    error.name = "AbortError";
    return error;
  }

  function waitForEvent(target, successEvent, errorEvent = "error", options = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeoutId);
        target.removeEventListener(successEvent, onSuccess);
        target.removeEventListener(errorEvent, onError);
        options.signal?.removeEventListener("abort", onAbort);
      };
      const onSuccess = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error("動画をブラウザでデコードできませんでした"));
      };
      const onAbort = () => onError(abortedLoadError());
      const timeoutId = setTimeout(
        () => onError(new Error("動画の読み込みがタイムアウトしました。端末に保存した短い動画を選び直してください")),
        options.timeoutMs || MEDIA_LOAD_TIMEOUT_MS,
      );
      target.addEventListener(successEvent, onSuccess, { once: true });
      target.addEventListener(errorEvent, onError, { once: true });
      options.signal?.addEventListener("abort", onAbort, { once: true });
      // Subscribe before load/currentTime changes; a local Blob can become ready
      // before the next listener would otherwise have been registered.
      try {
        if (options.signal?.aborted) {
          onAbort();
          return;
        }
        options.start?.();
        if (target.error) onError();
        else if (options.isReady?.()) onSuccess();
      } catch (error) {
        onError(error);
      }
    });
  }

  function withTimeout(promise, timeoutMs, message, signal) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onAbort);
      };
      const fail = (error) => { cleanup(); reject(error); };
      const onAbort = () => fail(abortedLoadError());
      const timeoutId = setTimeout(() => fail(new Error(message)), timeoutMs);
      signal?.addEventListener("abort", onAbort, { once: true });
      Promise.resolve(promise).then((value) => { cleanup(); resolve(value); }, fail);
      if (signal?.aborted) onAbort();
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
  const MAX_MP4_TIMING_SAMPLES = 2_000_000;
  const MAX_TIMED_SEEKS_PER_DECODER = 48;
  const UNKNOWN_TIMING_PRESENTATION_TIMEOUT_MS = 120;

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

  function int64(view, offset) {
    const high = view.getInt32(offset);
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

  function mediaTimeScale(view, box) {
    if (!box || box.dataStart + 16 > box.end) return 0;
    const version = view.getUint8(box.dataStart);
    const offset = version === 1 ? box.dataStart + 20 : box.dataStart + 12;
    return offset + 4 <= box.end ? view.getUint32(offset) : 0;
  }

  function samplePresentationTicks(view, stbl, sampleCount, quickTime = false) {
    if (sampleCount <= 0 || sampleCount > MAX_MP4_TIMING_SAMPLES) return null;
    const stts = firstChild(view, stbl, "stts");
    if (!stts || stts.dataStart + 8 > stts.end) return null;
    const entryCount = view.getUint32(stts.dataStart + 4);
    if (stts.dataStart + 8 + entryCount * 8 > stts.end) return null;

    const ticks = new Float64Array(sampleCount);
    let sample = 0;
    let decodeTime = 0;
    let offset = stts.dataStart + 8;
    for (let entry = 0; entry < entryCount; entry += 1, offset += 8) {
      const count = view.getUint32(offset);
      const delta = view.getUint32(offset + 4);
      if (!count || !delta || sample + count > sampleCount) return null;
      for (let index = 0; index < count; index += 1) {
        ticks[sample] = decodeTime;
        decodeTime += delta;
        sample += 1;
      }
    }
    if (sample !== sampleCount) return null;

    const ctts = firstChild(view, stbl, "ctts");
    if (!ctts) return ticks;
    if (ctts.dataStart + 8 > ctts.end) return null;
    const cttsVersion = view.getUint8(ctts.dataStart);
    const cttsEntryCount = view.getUint32(ctts.dataStart + 4);
    if (ctts.dataStart + 8 + cttsEntryCount * 8 > ctts.end) return null;
    sample = 0;
    offset = ctts.dataStart + 8;
    for (let entry = 0; entry < cttsEntryCount; entry += 1, offset += 8) {
      const count = view.getUint32(offset);
      // QuickTime ctts permits signed composition deltas even at version 0.
      // ISO-BMFF/MP4 version 0 remains unsigned; do not infer the format from
      // a .MOV filename or silently discard its negative-offset B frames.
      const compositionOffset = cttsVersion === 1 || quickTime
        ? view.getInt32(offset + 4) : view.getUint32(offset + 4);
      if (!count || sample + count > sampleCount) return null;
      for (let index = 0; index < count; index += 1) {
        ticks[sample] += compositionOffset;
        sample += 1;
      }
    }
    return sample === sampleCount ? ticks : null;
  }

  function editListEntries(view, trak) {
    const edts = firstChild(view, trak, "edts");
    const elst = edts && firstChild(view, edts, "elst");
    if (!elst || elst.dataStart + 8 > elst.end) return [];
    const version = view.getUint8(elst.dataStart);
    const entryCount = view.getUint32(elst.dataStart + 4);
    const entrySize = version === 1 ? 20 : 12;
    if (elst.dataStart + 8 + entryCount * entrySize > elst.end) return [];
    const entries = [];
    let offset = elst.dataStart + 8;
    for (let index = 0; index < entryCount; index += 1, offset += entrySize) {
      const segmentDuration = version === 1 ? uint64(view, offset) : view.getUint32(offset);
      const mediaTime = version === 1 ? int64(view, offset + 8) : view.getInt32(offset + 4);
      const rateOffset = offset + (version === 1 ? 16 : 8);
      entries.push({ segmentDuration, mediaTime, mediaRate: view.getInt32(rateOffset) / 65536 });
    }
    return entries;
  }

  function presentationTimeline(ticks, trackTimeScale, edits, movieTimeScale) {
    if (!ticks?.length || trackTimeScale <= 0) return null;
    const mediaTimes = Array.from(ticks, (value) => value / trackTimeScale);
    const mapped = [];
    if (edits.length && movieTimeScale > 0) {
      let movieCursor = 0;
      for (const edit of edits) {
        const segmentDuration = edit.segmentDuration / movieTimeScale;
        if (edit.mediaTime >= 0 && edit.mediaRate > 0 && segmentDuration > 0) {
          const mediaStart = edit.mediaTime / trackTimeScale;
          const mediaEnd = mediaStart + segmentDuration * edit.mediaRate;
          const epsilon = Math.max(1e-9, segmentDuration * 1e-9);
          for (const mediaTime of mediaTimes) {
            if (mediaTime + epsilon < mediaStart || mediaTime >= mediaEnd - epsilon) continue;
            mapped.push(movieCursor + (mediaTime - mediaStart) / edit.mediaRate);
          }
        }
        movieCursor += segmentDuration;
      }
    }

    const result = mapped.length ? mapped : mediaTimes;
    result.sort((a, b) => a - b);
    let mediaTimeOrigin = 0;
    if (!mapped.length && result.length) {
      mediaTimeOrigin = result[0];
      for (let index = 0; index < result.length; index += 1) result[index] -= mediaTimeOrigin;
    }
    return {
      timestamps: Float64Array.from(result.filter((value) => Number.isFinite(value) && value >= 0)),
      mediaTimeOrigin,
    };
  }

  function videoTrackTiming(view, trak, movieTimeScale, quickTime = false) {
    const mdia = firstChild(view, trak, "mdia");
    const hdlr = mdia && firstChild(view, mdia, "hdlr");
    if (!hdlr || hdlr.dataStart + 12 > hdlr.end || fourcc(view, hdlr.dataStart + 8) !== "vide") return null;
    const mdhd = firstChild(view, mdia, "mdhd");
    const trackTimeScale = mediaTimeScale(view, mdhd);
    const minf = firstChild(view, mdia, "minf");
    const stbl = minf && firstChild(view, minf, "stbl");
    if (!stbl) return null;
    const sampleSize = firstChild(view, stbl, "stsz") || firstChild(view, stbl, "stz2");
    if (!sampleSize || sampleSize.dataStart + 12 > sampleSize.end) return null;
    const sampleCount = view.getUint32(sampleSize.dataStart + 8);
    const ticks = samplePresentationTicks(view, stbl, sampleCount, quickTime);
    const timeline = presentationTimeline(
      ticks,
      trackTimeScale,
      editListEntries(view, trak),
      movieTimeScale,
    );
    return {
      frameCount: timeline?.timestamps?.length || sampleCount,
      timestamps: timeline?.timestamps || null,
      mediaTimeOrigin: timeline?.mediaTimeOrigin || 0,
    };
  }

  async function mp4VideoTiming(file) {
    if (!(file instanceof Blob) || file.size < 16) return { frameCount: 0, timestamps: null };
    const moov = await topLevelBox(file, "moov");
    if (!moov || moov.size - moov.headerSize > MAX_MP4_METADATA_BYTES) {
      return { frameCount: 0, timestamps: null };
    }
    const ftyp = await topLevelBox(file, "ftyp");
    let quickTime = false;
    if (ftyp && ftyp.size >= ftyp.headerSize + 4) {
      const brand = await file.slice(ftyp.offset + ftyp.headerSize, ftyp.offset + ftyp.headerSize + 4).arrayBuffer();
      quickTime = fourcc(new DataView(brand), 0) === "qt  ";
    }
    const buffer = await file.slice(moov.offset + moov.headerSize, moov.offset + moov.size).arrayBuffer();
    const view = new DataView(buffer);
    const root = { dataStart: 0, end: view.byteLength };
    const movieTimeScale = mediaTimeScale(view, firstChild(view, root, "mvhd"));
    let best = { frameCount: 0, timestamps: null, mediaTimeOrigin: 0 };
    for (const trak of childBoxes(view, root.dataStart, root.end).filter((box) => box.type === "trak")) {
      const timing = videoTrackTiming(view, trak, movieTimeScale, quickTime);
      if (timing && timing.frameCount > best.frameCount) best = timing;
    }
    return best;
  }

  async function exactMp4FrameCount(file) {
    return (await mp4VideoTiming(file)).frameCount;
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
    constructor(file, objectUrl, video, canvas, fps, timing = {}) {
      this.kind = "browser";
      this.file = file;
      this.objectUrl = objectUrl;
      this.video = video;
      this.canvas = canvas;
      this.context = canvas.getContext("2d", { alpha: false, desynchronized: true });
      this.duration = Number(video.duration) || 0;
      this.frameTimes = timing.timestamps?.length ? timing.timestamps : null;
      this.mediaTimeOrigin = Number.isFinite(Number(timing.mediaTimeOrigin))
        ? Number(timing.mediaTimeOrigin) : 0;
      this.browserMediaTimeOffset = null;
      this.exactFrameCount = Math.max(0, Math.round(Number(timing.frameCount) || 0));
      this.fps = this.exactFrameCount > 0 && this.duration > 0
        ? this.exactFrameCount / this.duration
        : Math.max(0.001, Number(fps) || 30);
      this.presentedFrame = null;
      this.timedSeeksSinceRefresh = 0;
      this.closed = false;
      this.closeController = new AbortController();
      this.queue = Promise.resolve();
    }

    static async open(file, fps = 30, options = {}) {
      if (!(file instanceof Blob)) throw new Error("動画ファイルが選択されていません");
      if (options.signal?.aborted) throw abortedLoadError();
      const objectUrl = URL.createObjectURL(file);
      const timingPromise = mp4VideoTiming(file).catch(() => ({ frameCount: 0, timestamps: null }));
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.disablePictureInPicture = true;
      let initialPresentation = null;
      let initialCallbackId = null;
      let source = null;
      try {
        options.onProgress?.("動画の情報を確認しています");
        // On WebKit the first decoded frame may be presented during load().
        // Capture its real timestamp instead of missing it and forcing a seek.
        if (typeof video.requestVideoFrameCallback === "function") {
          initialCallbackId = video.requestVideoFrameCallback((_now, metadata) => {
            initialPresentation = metadata;
            initialCallbackId = null;
          });
        }
        video.src = objectUrl;
        if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
          await waitForEvent(video, "loadedmetadata", "error", {
            start: () => video.load(),
            isReady: () => video.readyState >= HTMLMediaElement.HAVE_METADATA,
            signal: options.signal,
          });
        }
        if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
          throw new Error("動画の解像度または再生時間を取得できませんでした");
        }
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        options.onProgress?.("フレーム時刻を読み取っています");
        const timing = await withTimeout(timingPromise, MEDIA_LOAD_TIMEOUT_MS,
          "動画の時刻情報を読み込めませんでした。端末に保存した動画を選び直してください", options.signal);
        source = new BrowserFrameSource(file, objectUrl, video, canvas, fps, timing);
        await withTimeout(source.detectFps(), 2500, "動画のFPSを確認できませんでした", options.signal);
        const initialMediaTime = source._mediaTimeForTimeline(initialPresentation?.mediaTime, 0);
        if (source.frameTimes?.length && Number.isFinite(initialMediaTime)
          && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          && source.frameForMediaTime(initialMediaTime) === 0
          && Math.abs(initialMediaTime - source.timeForFrame(0)) < 0.000001) {
          source.presentedFrame = 0;
        }
        options.onProgress?.("最初のフレームを確認しています");
        await withTimeout(source._resetToFirstFrame(), MEDIA_LOAD_TIMEOUT_MS,
          "最初のフレームを確認できませんでした。動画を選び直してください", options.signal);
        return {
          source,
          metadata: source.metadata(file.name),
        };
      } catch (error) {
        if (source) source.close();
        else {
          video.removeAttribute("src");
          video.load();
          URL.revokeObjectURL(objectUrl);
        }
        throw error;
      } finally {
        if (initialCallbackId !== null) video.cancelVideoFrameCallback?.(initialCallbackId);
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
        frame_count_method: this.frameTimes ? "container_timestamps" : (this.exactFrameCount > 0 ? "container_samples" : "duration_fps_estimate"),
        timing_mode: this.frameTimes ? "per_frame_container" : "constant_fps",
      };
    }

    frameCount() {
      if (this.exactFrameCount > 0) return this.exactFrameCount;
      return Math.max(1, Math.round(this.duration * this.fps));
    }

    timeForFrame(frame) {
      const index = Math.max(0, Math.min(this.frameCount() - 1, Math.round(Number(frame) || 0)));
      if (this.frameTimes) return this.frameTimes[index];
      return index / this.fps;
    }

    seekTimeForFrame(frame) {
      const index = Math.max(0, Math.min(this.frameCount() - 1, Math.round(Number(frame) || 0)));
      const start = this.timeForFrame(index);
      const next = index + 1 < this.frameCount() ? this.timeForFrame(index + 1) : this.duration;
      const fallbackGap = 1 / Math.max(0.001, this.fps);
      const gap = next > start ? next - start : fallbackGap;
      return Math.max(0, Math.min(Math.max(0, this.duration - 0.000001), start + gap * 0.45));
    }

    async detectFps() {
      if (this.exactFrameCount > 0) return this.fps;
      if (typeof this.video.requestVideoFrameCallback !== "function" || this.duration < 0.2) return this.fps;
      const expected = this.fps;
      const mediaTimes = [];
      let callbackId = 0;
      let timeoutId = 0;
      let finished = false;
      let finishSampling = () => {};
      const completed = new Promise((resolve) => {
        const finish = () => {
          if (finished) return;
          finished = true;
          if (callbackId && this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(callbackId);
          clearTimeout(timeoutId);
          this.closeController.signal.removeEventListener("abort", finish);
          resolve();
        };
        finishSampling = finish;
        const collect = (_now, metadata) => {
          if (finished) return;
          const mediaTime = Number(metadata?.mediaTime);
          if (Number.isFinite(mediaTime) && (mediaTimes.length === 0 || mediaTime > mediaTimes.at(-1))) {
            mediaTimes.push(mediaTime);
          }
          if (mediaTimes.length >= 16 || mediaTime >= Math.min(this.duration, 1)) finish();
          else callbackId = this.video.requestVideoFrameCallback(collect);
        };
        callbackId = this.video.requestVideoFrameCallback(collect);
        timeoutId = setTimeout(finish, 1500);
        this.closeController.signal.addEventListener("abort", finish, { once: true });
      });
      try {
        this.video.currentTime = 0;
        // play() may stay pending while iOS prepares media. The sampling timer
        // must remain authoritative even when that promise never settles.
        Promise.resolve(this.video.play()).catch(() => finishSampling());
      } catch (_error) {
        // Keep the user-provided FPS when muted playback is restricted.
        finishSampling();
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

    frameForMediaTime(mediaTime) {
      const value = Number(mediaTime);
      if (!Number.isFinite(value)) return this.presentedFrame;
      if (!this.frameTimes?.length) {
        return Math.max(0, Math.min(this.frameCount() - 1, Math.round(value * this.fps)));
      }
      let low = 0;
      let high = this.frameTimes.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (this.frameTimes[middle] < value) low = middle + 1;
        else high = middle;
      }
      if (low > 0 && Math.abs(this.frameTimes[low - 1] - value) <= Math.abs(this.frameTimes[low] - value)) {
        return low - 1;
      }
      return low;
    }

    _mediaTimeForTimeline(mediaTime, targetFrame = null) {
      const value = Number(mediaTime);
      if (!Number.isFinite(value)) return value;
      if (this.browserMediaTimeOffset === null && Number.isFinite(Number(targetFrame))) {
        const expected = this.timeForFrame(targetFrame);
        const rawError = Math.abs(value - expected);
        const shiftedError = Math.abs((value - this.mediaTimeOrigin) - expected);
        if (rawError <= 0.000001) this.browserMediaTimeOffset = 0;
        else if (Math.abs(this.mediaTimeOrigin) > 0.000001 && shiftedError <= 0.000001) {
          this.browserMediaTimeOffset = this.mediaTimeOrigin;
        }
      }
      return value - (this.browserMediaTimeOffset || 0);
    }

    async _resetToFirstFrame() {
      if (this.closed) throw new Error("動画は閉じられています");
      this.video.pause();
      if (this.frameTimes?.length) {
        await this._seekToTimedFrame(0);
        return;
      }
      if (Math.abs(this.video.currentTime) > 0.0001) {
        await this._seekVideo(0);
      }
      if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await waitForEvent(this.video, "loadeddata", "error", {
          isReady: () => this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
          signal: this.closeController.signal,
        });
      }
      if (typeof this.video.requestVideoFrameCallback !== "function") {
        this.presentedFrame = 0;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return;
      }

      const metadata = await this._playUntilNextPresentation();
      this.presentedFrame = this.frameForMediaTime(metadata?.mediaTime);
      if (!Number.isFinite(this.presentedFrame) || this.presentedFrame > 1) this.presentedFrame = 0;
    }

    _playUntilNextPresentation() {
      const video = this.video;
      return new Promise((resolve, reject) => {
        let settled = false;
        let callbackId = 0;
        const finish = (error, metadata) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          this.closeController.signal.removeEventListener("abort", onAbort);
          video.pause();
          if (callbackId && video.cancelVideoFrameCallback) {
            video.cancelVideoFrameCallback(callbackId);
          }
          if (error) reject(error);
          else resolve(metadata);
        };
        const onAbort = () => finish(abortedLoadError());
        const timeoutId = setTimeout(() => finish(new Error("次の動画フレームを表示できませんでした")), 2000);
        this.closeController.signal.addEventListener("abort", onAbort, { once: true });
        callbackId = video.requestVideoFrameCallback((_now, metadata) => finish(null, metadata));
        Promise.resolve(video.play()).catch((error) => finish(error));
      });
    }

    _seekVideo(targetTime, timeoutMs = 2000) {
      const video = this.video;
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", onError);
          this.closeController.signal.removeEventListener("abort", onAbort);
          if (error) reject(error);
          else resolve();
        };
        const onSeeked = () => finish();
        const onError = () => finish(new Error("動画フレームへ移動できませんでした"));
        const onAbort = () => finish(abortedLoadError());
        const timeoutId = setTimeout(() => finish(new Error("動画フレームへの移動がタイムアウトしました")), timeoutMs);
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });
        this.closeController.signal.addEventListener("abort", onAbort, { once: true });
        try {
          if (this.closed) onAbort();
          else video.currentTime = targetTime;
        } catch (error) {
          finish(error instanceof Error ? error : new Error("動画フレームへ移動できませんでした"));
        }
      });
    }

    _waitForPresentationMetadata(timeoutMs = 2000) {
      const video = this.video;
      if (typeof video.requestVideoFrameCallback !== "function") {
        return Promise.reject(new Error("このOSでは正確なフレーム照合を利用できません"));
      }
      return new Promise((resolve, reject) => {
        let settled = false;
        let callbackId = 0;
        const finish = (error, metadata) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          this.closeController.signal.removeEventListener("abort", onAbort);
          if (callbackId && video.cancelVideoFrameCallback) {
            video.cancelVideoFrameCallback(callbackId);
          }
          if (error) reject(error);
          else resolve(metadata);
        };
        const onAbort = () => finish(abortedLoadError());
        const timeoutId = setTimeout(
          () => finish(new Error("デコードしたフレームを照合できませんでした")),
          timeoutMs,
        );
        this.closeController.signal.addEventListener("abort", onAbort, { once: true });
        callbackId = video.requestVideoFrameCallback((_now, metadata) => finish(null, metadata));
      });
    }

    _timedSeekTarget(frame, fraction) {
      const target = Math.max(0, Math.min(this.frameCount() - 1, Math.round(Number(frame) || 0)));
      const start = this.timeForFrame(target);
      const fallbackGap = 1 / Math.max(0.001, this.fps);
      const following = target + 1 < this.frameCount() ? this.timeForFrame(target + 1) : this.duration;
      const gap = following > start ? following - start : fallbackGap;
      const maximum = Math.max(0, this.duration - Math.min(0.000001, gap * 0.01));
      return Math.max(0, Math.min(maximum, start + gap * fraction));
    }

    async _replaceVideoDecoder() {
      if (this.closed) throw new Error("動画は閉じられています");
      const replacement = document.createElement("video");
      replacement.preload = "auto";
      replacement.muted = true;
      replacement.playsInline = true;
      replacement.disablePictureInPicture = true;
      replacement.src = this.objectUrl;
      try {
        if (replacement.readyState < HTMLMediaElement.HAVE_METADATA) {
          await waitForEvent(replacement, "loadedmetadata", "error", {
            start: () => replacement.load(),
            isReady: () => replacement.readyState >= HTMLMediaElement.HAVE_METADATA,
            signal: this.closeController.signal,
          });
        }
        if (!replacement.videoWidth || !replacement.videoHeight || !Number.isFinite(replacement.duration)) {
          throw new Error("動画デコーダーを再準備できませんでした");
        }
        if (this.closed) throw new Error("動画は閉じられています");
      } catch (error) {
        replacement.removeAttribute("src");
        replacement.load();
        throw error;
      }

      const previous = this.video;
      this.video = replacement;
      this.duration = Number(replacement.duration) || this.duration;
      this.presentedFrame = null;
      this.timedSeeksSinceRefresh = 0;
      previous.pause();
      previous.removeAttribute("src");
      previous.load();
    }

    async _seekToTimedFrame(targetFrame, allowDecoderRefresh = true) {
      const target = Math.max(0, Math.min(this.frameCount() - 1, Math.round(Number(targetFrame) || 0)));
      if (this.presentedFrame === target) return;
      if (typeof this.video.requestVideoFrameCallback !== "function") {
        throw new Error("このOSではコンテナ時刻と表示フレームを照合できません");
      }
      if (this.timedSeeksSinceRefresh >= MAX_TIMED_SEEKS_PER_DECODER) {
        await this._replaceVideoDecoder();
      }

      const observed = [];
      let lastError = null;
      for (const fraction of [0.5, 0.25, 0.75]) {
        if (this.closed) throw new Error("動画は閉じられています");
        const seekTime = this._timedSeekTarget(target, fraction);
        try {
          if (Math.abs(this.video.currentTime - seekTime) <= 0.0000001) {
            const nudge = this._timedSeekTarget(target, fraction === 0.5 ? 0.15 : 0.5);
            if (Math.abs(nudge - seekTime) > 0.0000001) await this._seekVideo(nudge);
          }
          const presented = this._waitForPresentationMetadata();
          const seeked = this._seekVideo(seekTime);
          const [, metadata] = await Promise.all([seeked, presented]);
          const rawMediaTime = Number(metadata?.mediaTime);
          const mediaTime = this._mediaTimeForTimeline(rawMediaTime, target);
          const actual = this.frameForMediaTime(mediaTime);
          observed.push({ actual, mediaTime: rawMediaTime });
          if (actual === target) {
            // Nearest-frame lookup alone is not verification: if a malformed
            // timeline drops every other frame it can label an in-between
            // decoded frame as the requested one. Require its real PTS too.
            if (!Number.isFinite(metadata?.mediaTime)
              || Math.abs(mediaTime - this.timeForFrame(target)) > 0.000001) continue;
            this.presentedFrame = actual;
            this.timedSeeksSinceRefresh += 1;
            return;
          }
        } catch (error) {
          lastError = error;
        }
      }
      const details = observed
        .map((item) => `${item.actual}@${Number.isFinite(item.mediaTime) ? item.mediaTime.toFixed(6) : "?"}s`)
        .join(", ");
      const suffix = details ? `（実測 ${details}）` : `（${lastError?.message || "照合失敗"}）`;
      if (allowDecoderRefresh) {
        await this._replaceVideoDecoder();
        return this._seekToTimedFrame(target, false);
      }
      throw new Error(`フレームID ${target}を正確にデコードできませんでした${suffix}`);
    }

    async _seekToFrame(frame, timeSec) {
      if (this.closed) throw new Error("動画は閉じられています");
      const targetFrame = Math.max(0, Math.min(this.frameCount() - 1, Math.round(Number(frame) || 0)));
      if (this.frameTimes?.length) {
        await this._seekToTimedFrame(targetFrame);
        return;
      }
      const frameDuration = 1 / this.fps;
      const hasExplicitTime = Number.isFinite(Number(timeSec));
      const requestedTime = hasExplicitTime ? Number(timeSec) : this.timeForFrame(frame);
      const targetTime = hasExplicitTime
        ? Math.max(0, Math.min(Math.max(0, this.duration - 0.000001), requestedTime + frameDuration * 0.25))
        : this.seekTimeForFrame(frame);

      let didSeek = false;
      if (Math.abs(this.video.currentTime - targetTime) > Math.max(0.0001, frameDuration * 0.05)) {
        // A paused, detached video may not emit another presentation callback
        // after `seeked`. Subscribe before changing currentTime so Chrome's
        // decoded target frame cannot be missed.
        const presented = typeof this.video.requestVideoFrameCallback === "function"
          ? this._waitForPresentedFrame(targetTime, frameDuration)
          : null;
        const seeked = this._seekVideo(targetTime);
        await Promise.all([seeked, presented]);
        didSeek = true;
      }
      if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await waitForEvent(this.video, "loadeddata", "error", {
          isReady: () => this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
          signal: this.closeController.signal,
        });
      }
      if (didSeek && typeof this.video.requestVideoFrameCallback !== "function") {
        await this._waitForPresentedFrame(targetTime, frameDuration);
      }
    }

    _waitForPresentedFrame(targetTime, frameDuration, timeoutMs = UNKNOWN_TIMING_PRESENTATION_TIMEOUT_MS) {
      if (typeof this.video.requestVideoFrameCallback !== "function") {
        return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      return new Promise((resolve) => {
        let settled = false;
        let callbackId = 0;
        const tolerance = Math.max(0.001, frameDuration * 0.45);
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          this.closeController.signal.removeEventListener("abort", finish);
          if (callbackId && this.video.cancelVideoFrameCallback) {
            this.video.cancelVideoFrameCallback(callbackId);
          }
          resolve();
        };
        const checkFrame = (_now, metadata) => {
          const mediaTime = Number(metadata?.mediaTime);
          if (!Number.isFinite(mediaTime) || Math.abs(mediaTime - targetTime) <= tolerance) {
            finish();
            return;
          }
          callbackId = this.video.requestVideoFrameCallback(checkFrame);
        };
        // Some Chromium builds do not emit another video-frame callback for a
        // paused, detached video after `seeked`. The seek event already makes
        // the decoded frame drawable, so keep this as a short settling window
        // instead of blocking every frame move for more than a second.
        const timeoutId = setTimeout(finish, timeoutMs);
        this.closeController.signal.addEventListener("abort", finish, { once: true });
        callbackId = this.video.requestVideoFrameCallback(checkFrame);
      });
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
      this.closeController.abort();
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
      URL.revokeObjectURL(this.objectUrl);
    }
  }

  global.VideoDigitizerFrames = { ApiFrameSource, BrowserFrameSource, exactMp4FrameCount, mp4VideoTiming };
})(globalThis);
