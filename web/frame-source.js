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
  const MAX_MP4_TIMING_SAMPLES = 2_000_000;

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

  function samplePresentationTicks(view, stbl, sampleCount) {
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
      const compositionOffset = cttsVersion === 1 ? view.getInt32(offset + 4) : view.getUint32(offset + 4);
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
    if (!mapped.length && result.length) {
      const first = result[0];
      for (let index = 0; index < result.length; index += 1) result[index] -= first;
    }
    return Float64Array.from(result.filter((value) => Number.isFinite(value) && value >= 0));
  }

  function videoTrackTiming(view, trak, movieTimeScale) {
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
    const ticks = samplePresentationTicks(view, stbl, sampleCount);
    const timestamps = presentationTimeline(
      ticks,
      trackTimeScale,
      editListEntries(view, trak),
      movieTimeScale,
    );
    return {
      frameCount: timestamps?.length || sampleCount,
      timestamps,
    };
  }

  async function mp4VideoTiming(file) {
    if (!(file instanceof Blob) || file.size < 16) return { frameCount: 0, timestamps: null };
    const moov = await topLevelBox(file, "moov");
    if (!moov || moov.size - moov.headerSize > MAX_MP4_METADATA_BYTES) {
      return { frameCount: 0, timestamps: null };
    }
    const buffer = await file.slice(moov.offset + moov.headerSize, moov.offset + moov.size).arrayBuffer();
    const view = new DataView(buffer);
    const root = { dataStart: 0, end: view.byteLength };
    const movieTimeScale = mediaTimeScale(view, firstChild(view, root, "mvhd"));
    let best = { frameCount: 0, timestamps: null };
    for (const trak of childBoxes(view, root.dataStart, root.end).filter((box) => box.type === "trak")) {
      const timing = videoTrackTiming(view, trak, movieTimeScale);
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
      this.exactFrameCount = Math.max(0, Math.round(Number(timing.frameCount) || 0));
      this.fps = this.exactFrameCount > 0 && this.duration > 0
        ? this.exactFrameCount / this.duration
        : Math.max(0.001, Number(fps) || 30);
      this.closed = false;
      this.queue = Promise.resolve();
    }

    static async open(file, fps = 30) {
      if (!(file instanceof Blob)) throw new Error("動画ファイルが選択されていません");
      const objectUrl = URL.createObjectURL(file);
      const timingPromise = mp4VideoTiming(file).catch(() => ({ frameCount: 0, timestamps: null }));
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
        const source = new BrowserFrameSource(file, objectUrl, video, canvas, fps, await timingPromise);
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
      const hasExplicitTime = Number.isFinite(Number(timeSec));
      const requestedTime = hasExplicitTime ? Number(timeSec) : this.timeForFrame(frame);
      const targetTime = hasExplicitTime
        ? Math.max(0, Math.min(Math.max(0, this.duration - 0.000001), requestedTime + frameDuration * 0.25))
        : this.seekTimeForFrame(frame);

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

  global.VideoDigitizerFrames = { ApiFrameSource, BrowserFrameSource, exactMp4FrameCount, mp4VideoTiming };
})(globalThis);
