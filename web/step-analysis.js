(function initStepAnalysis(global) {
  "use strict";

  const CACHE_DB = "video_digitizer_step_analysis_v1";
  const CACHE_STORE = "pose_cache";
  const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const CACHE_CHUNK_FRAMES = 25;
  const MEDIAPIPE_MODEL = Object.freeze({
    id: "mediapipe_pose_landmarker_lite",
    version: "sha256-59929e1d1ee95287",
    runtime: "mediapipe_tasks_vision_1.0.1_multi_pose4_v1",
  });

  const state = {
    bridge: null,
    initialized: false,
    active: false,
    videoIdentity: null,
    frame: 0,
    rangeStart: 0,
    rangeEnd: 0,
    trimStartTime: null,
    trimEndTime: null,
    crop: null,
    cropSourceSize: null,
    selectingCrop: false,
    cropDrag: null,
    useDigitizeRange: true,
    captureFps: 30,
    captureFpsConfirmed: false,
    direction: "auto",
    backend: "auto",
    effectiveBackend: "",
    capabilities: null,
    subject: null,
    selectingSubject: false,
    playing: false,
    playTimer: 0,
    renderSerial: 0,
    previewPending: null,
    previewTask: null,
    lastPreviewSerial: 0,
    preparation: { phase: "idle", message: "" },
    running: false,
    cancelRequested: false,
    jobId: "",
    runGeneration: 0,
    activeRun: null,
    videoResetPending: false,
    progress: { current: 0, total: 0, message: "待機中" },
    poseFrames: [],
    analysis: null,
    model: null,
    cacheKey: "",
    resumedFromCache: false,
    audit: [],
    restoredIdentity: null,
  };
  const els = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function context() {
    return state.bridge?.getVideoContext?.() || {
      ready: false, frameCount: 0, width: 1, height: 1, playbackFps: 30,
      trimStart: 0, trimEnd: 0, sourceMode: "browser", videoIdentity: null,
    };
  }

  function identityMatches(a, b) {
    if (!a || !b) return false;
    if (a.digest && b.digest) return String(a.digest) === String(b.digest);
    return String(a.name || "") === String(b.name || "")
      && Number(a.size || 0) === Number(b.size || 0)
      && Number(a.frame_count || 0) === Number(b.frame_count || 0);
  }

  function setStatus(message) {
    state.progress.message = String(message || "");
    if (els.stepStatus) {
      els.stepStatus.textContent = state.progress.message;
      syncStatusVisibility();
    }
  }

  function syncStatusVisibility() {
    if (!els.stepStatus) return;
    els.stepStatus.hidden = Boolean(global.VideoDigitizerNative?.isIOSApp
      && els.stepReadinessStatus
      && state.progress.message === analysisReadiness().message);
  }

  function analysisReadiness() {
    const video = context();
    if (state.running) return { phase: "analyzing", canAnalyze: false, message: "AIで姿勢とステップを分析しています。" };
    if (video.loading || state.preparation.phase === "loading" || state.videoResetPending) {
      return {
        phase: "loading", canAnalyze: false,
        message: state.preparation.message || "動画を準備しています。フレーム時刻の確認後に分析できます。",
      };
    }
    if (state.preparation.phase === "error") {
      return { phase: "error", canAnalyze: false, message: state.preparation.message || "動画を準備できませんでした。動画を選び直してください。" };
    }
    if (!video.ready) return { phase: "empty", canAnalyze: false, message: "動画を選択するか撮影すると、AIでステップを分析できます。" };
    if (state.rangeEnd <= state.rangeStart) {
      return { phase: "range", canAnalyze: false, message: "分析範囲を2フレーム以上にしてください。" };
    }
    if (global.VideoDigitizerNative?.isIOSApp
      && video.sourceMode === "browser"
      && video.timingMode !== "per_frame_container") {
      return {
        phase: "unsupported", canAnalyze: false,
        message: "この動画は実フレーム時刻を確認できないためAI分析できません。H.264のMP4/MOVへ書き出し直してください（手動閲覧は利用できます）。",
      };
    }
    return {
      phase: "ready", canAnalyze: true,
      message: state.subject
        ? "分析できます。指定した人物をAIで追跡します。"
        : "分析できます。対象人物はAIが自動選択します。複数人が映る場合は対象を指定してください。",
    };
  }

  function setPreviewStatus(message) {
    if (!els.stepPreviewStatus) return;
    els.stepPreviewStatus.textContent = message;
    els.stepPreviewStatus.hidden = !message;
  }

  function recordAudit(action, details = {}) {
    const entry = {
      at: new Date().toISOString(),
      action,
      analyst: String(state.bridge?.getMetadata?.()?.analyst || ""),
      ...details,
    };
    state.audit.push(entry);
    if (state.audit.length > 20000) state.audit.splice(0, state.audit.length - 20000);
    state.bridge?.recordAudit?.(`step_analysis:${action}`, details);
  }

  function markDirty() {
    state.bridge?.markDirty?.();
  }

  function copySubject(subject = state.subject) {
    return subject ? { ...subject } : null;
  }

  function snapshotData(value) {
    if (value === undefined) return undefined;
    if (typeof global.structuredClone === "function") return global.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function hasAnalyzablePoseFrames(frames = state.poseFrames) {
    const usableFrames = frames.filter((pose) => ["left", "right"].some((side) => (
      ["ankle", "heel", "toe"].filter((part) => {
        const point = pose?.keypoints?.[`${side}_${part}`];
        return finite(point?.x) !== null && finite(point?.y) !== null;
      }).length >= 2
    )));
    return usableFrames.length >= 2;
  }

  function beginRun() {
    const video = context();
    const run = {
      generation: state.runGeneration + 1,
      cancelled: false,
      invalidated: false,
      jobId: "",
      cacheKey: "",
      video: {
        ready: Boolean(video.ready),
        videoName: String(video.videoName || ""),
        videoIdentity: video.videoIdentity ? { ...video.videoIdentity } : null,
        playbackFps: Number(video.playbackFps) || 30,
        frameCount: Math.max(0, Number(video.frameCount) || 0),
        width: Math.max(1, Number(video.width) || 1),
        height: Math.max(1, Number(video.height) || 1),
        sourceMode: String(video.sourceMode || "browser"),
        timingMode: String(video.timingMode || ""),
        frameCountEstimated: Boolean(video.frameCountEstimated),
        frameCountMethod: String(video.frameCountMethod || ""),
      },
      config: {
        rangeStart: state.rangeStart,
        rangeEnd: state.rangeEnd,
        captureFps: state.captureFps,
        captureFpsConfirmed: state.captureFpsConfirmed,
        direction: state.direction,
        backend: state.backend,
        effectiveBackend: "",
        subject: copySubject(),
        crop: state.crop ? { ...state.crop } : null,
      },
    };
    run.completion = new Promise((resolve) => {
      run.resolveCompletion = resolve;
    });
    state.runGeneration = run.generation;
    state.activeRun = run;
    state.running = true;
    state.cancelRequested = false;
    state.jobId = "";
    return run;
  }

  function ownsRun(run) {
    return Boolean(run && state.activeRun === run && state.runGeneration === run.generation && !run.invalidated);
  }

  function shouldStopRun(run) {
    return !ownsRun(run) || run.cancelled;
  }

  function cancelServerRun(run) {
    if (!run?.jobId || run.video?.sourceMode !== "api" || !state.bridge?.apiUrl) return;
    fetch(state.bridge.apiUrl("step-analysis/cancel"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: run.jobId }),
      cache: "no-store",
    }).catch(() => {});
  }

  function invalidateActiveRun() {
    const run = state.activeRun;
    if (run) {
      run.cancelled = true;
      run.invalidated = true;
      cancelServerRun(run);
    }
    state.runGeneration += 1;
    state.activeRun = null;
    state.cancelRequested = true;
    state.running = false;
    state.jobId = "";
    global.VideoDigitizerNative?.setAnalysisRunning?.(false);
  }

  function normalizeRange() {
    const video = context();
    const maximum = video.ready
      ? Math.max(0, Number(video.frameCount || 1) - 1)
      : Math.max(0, state.rangeEnd, state.frame);
    state.rangeStart = clamp(Math.round(finite(state.rangeStart) ?? 0), 0, maximum);
    state.rangeEnd = clamp(Math.round(finite(state.rangeEnd) ?? maximum), state.rangeStart, maximum);
    state.frame = clamp(Math.round(finite(state.frame) ?? state.rangeStart), state.rangeStart, state.rangeEnd);
  }

  function readControls() {
    state.rangeStart = Math.round(finite(els.stepRangeStart?.value) ?? state.rangeStart);
    state.rangeEnd = Math.round(finite(els.stepRangeEnd?.value) ?? state.rangeEnd);
    state.captureFps = Math.max(0.001, finite(els.stepCaptureFps?.value) ?? state.captureFps);
    state.captureFpsConfirmed = Boolean(els.stepFpsConfirmed?.checked);
    state.direction = ["auto", "left_to_right", "right_to_left"].includes(els.stepDirection?.value)
      ? els.stepDirection.value
      : "auto";
    state.backend = ["auto", "mmpose", "mediapipe"].includes(els.stepBackend?.value)
      ? els.stepBackend.value
      : "auto";
    normalizeRange();
    writeControls();
  }

  function canEditInput() {
    const video = context();
    return video.ready && !video.loading && !state.running && !state.videoResetPending
      && state.preparation.phase !== "loading" && state.preparation.phase !== "error";
  }

  function playbackTime(frame) {
    const stored = state.bridge?.playbackTime?.(frame) ?? state.bridge?.frameTime?.(frame);
    return Number.isFinite(stored) ? stored : frame / Math.max(0.001, Number(context().playbackFps) || 30);
  }

  function playbackDuration() {
    const video = context();
    return Math.max(0, Number(video.durationSec) || playbackTime(Math.max(0, Number(video.frameCount) - 1)));
  }

  function frameAtPlaybackTime(time, edge) {
    const maximum = Math.max(0, Number(context().frameCount) - 1);
    // Source presentation timestamps, not capture-FPS-derived analysis times.
    // Lower/upper bounds retain each original frame ID even for VFR video.
    let low = 0;
    let high = maximum + 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const pts = playbackTime(middle);
      const before = edge === "start" ? pts < time - 1e-6 : pts <= time + 1e-6;
      if (before) low = middle + 1;
      else high = middle;
    }
    return edge === "start" ? low : low - 1;
  }

  function applyTimeTrim(startValue, endValue) {
    if (!canEditInput()) return false;
    const duration = playbackDuration();
    const start = finite(startValue);
    const requestedEnd = finite(endValue);
    const end = requestedEnd === null ? null : Math.min(duration, requestedEnd);
    if (start === null || end === null || start < 0 || requestedEnd > duration + 1e-6 || end <= start) {
      setStatus(`開始・終了を0〜${duration.toFixed(3)}秒の順序で指定してください`);
      writeControls({ forceTrimInputs: true });
      return false;
    }
    const first = frameAtPlaybackTime(start, "start");
    const last = frameAtPlaybackTime(end, "end");
    if (last <= first || first < 0 || last >= context().frameCount) {
      setStatus("分析区間に2フレーム以上含まれるように指定してください");
      writeControls({ forceTrimInputs: true });
      return false;
    }
    stopPlayback();
    const previous = [state.rangeStart, state.rangeEnd];
    state.useDigitizeRange = false;
    state.rangeStart = first;
    state.rangeEnd = last;
    state.trimStartTime = start;
    state.trimEndTime = end;
    state.frame = clamp(state.frame, first, last);
    if (previous[0] !== first || previous[1] !== last) {
      invalidateAnalysis("time_trim_changed", { from: previous, to: [first, last], source_seconds: [start, end] });
    } else { markDirty(); }
    writeControls({ forceTrimInputs: true });
    renderFrame();
    setStatus(`分析区間を${start.toFixed(3)}〜${end.toFixed(3)}秒に設定しました（元動画は変更しません）`);
    return true;
  }

  function normalizeCrop(crop, video = context()) {
    if (!crop || ![crop.x, crop.y, crop.width, crop.height].every((value) => finite(value) !== null)) return null;
    const width = Math.max(1, Math.floor(Number(video.width) || 1));
    const height = Math.max(1, Math.floor(Number(video.height) || 1));
    if (Number(crop.width) <= 0 || Number(crop.height) <= 0) return null;
    const x = clamp(Math.floor(Number(crop.x)), 0, width);
    const y = clamp(Math.floor(Number(crop.y)), 0, height);
    const right = clamp(Math.ceil(Number(crop.x) + Number(crop.width)), 0, width);
    const bottom = clamp(Math.ceil(Number(crop.y) + Number(crop.height)), 0, height);
    return right - x >= 2 && bottom - y >= 2 ? { x, y, width: right - x, height: bottom - y } : null;
  }

  function cropFromPoints(start, end) {
    return normalizeCrop({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
      width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) });
  }

  function cancelCropSelection() {
    const pointerId = state.cropDrag?.pointerId;
    state.cropDrag = null;
    state.selectingCrop = false;
    if (pointerId !== undefined) {
      try { els.stepOverlayCanvas?.releasePointerCapture?.(pointerId); } catch (_error) { /* Already released. */ }
    }
    els.stepOverlayCanvas?.classList.remove("selecting-crop");
    els.stepSelectCrop?.classList.remove("active");
    els.stepSelectCrop?.setAttribute("aria-pressed", "false");
  }

  function applyCrop(crop) {
    if (!canEditInput()) return false;
    const next = crop ? normalizeCrop(crop) : null;
    if (crop && !next) return false;
    cancelCropSelection();
    if (stableStringify(next) === stableStringify(state.crop)) { drawOverlay(); return true; }
    const previous = state.crop;
    state.crop = next;
    state.cropSourceSize = next ? { width: Number(context().width), height: Number(context().height) } : null;
    if (state.subject && next && (state.subject.x < next.x || state.subject.x >= next.x + next.width
      || state.subject.y < next.y || state.subject.y >= next.y + next.height)) state.subject = null;
    invalidateAnalysis("crop_changed", { from: previous, to: next });
    setStatus(next ? "画像範囲を指定しました。この範囲だけをAIで分析します" : "画像範囲を解除しました。映像全体をAIで分析します");
    return true;
  }

  function beginCropSelection() {
    if (!global.VideoDigitizerNative?.isIOSApp || !canEditInput()) return;
    stopPlayback();
    if (state.selectingCrop) { cancelCropSelection(); writeControls(); drawOverlay(); return; }
    state.selectingSubject = false;
    els.stepOverlayCanvas?.classList.remove("selecting-subject");
    els.stepSelectSubject?.classList.remove("active");
    state.selectingCrop = true;
    els.stepOverlayCanvas?.classList.add("selecting-crop");
    els.stepSelectCrop?.classList.add("active");
    els.stepSelectCrop?.setAttribute("aria-pressed", "true");
    els.stepCanvasStack?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    setStatus("動画上をドラッグして、頭から足先まで含む画像範囲を指定してください");
  }

  function cropPointerPoint(event) {
    const rect = els.stepOverlayCanvas?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    const { width, height } = canvasSize();
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1) * width,
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1) * height };
  }

  function beginCropDrag(event) {
    if (!state.selectingCrop || !canEditInput() || event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
    const point = cropPointerPoint(event);
    if (!point) return;
    event.preventDefault();
    state.cropDrag = { pointerId: event.pointerId, start: point, current: point };
    try { els.stepOverlayCanvas.setPointerCapture?.(event.pointerId); } catch (_error) { /* Pointer may already be released. */ }
  }

  function moveCropDrag(event) {
    if (!state.cropDrag || event.pointerId !== state.cropDrag.pointerId || !canEditInput()) return;
    const point = cropPointerPoint(event);
    if (!point) return;
    event.preventDefault();
    state.cropDrag.current = point;
    drawOverlay();
  }

  function finishCropDrag(event) {
    if (!state.cropDrag || event.pointerId !== state.cropDrag.pointerId) return;
    moveCropDrag(event);
    const crop = cropFromPoints(state.cropDrag.start, state.cropDrag.current);
    cancelCropSelection();
    if (crop) applyCrop(crop);
    else { drawOverlay(); setStatus("画像範囲が小さすぎます。範囲を広げて指定してください"); }
  }

  function writeControls(options = {}) {
    normalizeRange();
    if (els.stepRangeStart) {
      els.stepRangeStart.min = "0";
      els.stepRangeStart.max = String(Math.max(0, context().frameCount - 1));
      els.stepRangeStart.value = String(state.rangeStart);
    }
    if (els.stepRangeEnd) {
      els.stepRangeEnd.min = "0";
      els.stepRangeEnd.max = String(Math.max(0, context().frameCount - 1));
      els.stepRangeEnd.value = String(state.rangeEnd);
    }
    if (els.stepCaptureFps) els.stepCaptureFps.value = String(Number(state.captureFps.toFixed(6)));
    if (els.stepFpsConfirmed) els.stepFpsConfirmed.checked = state.captureFpsConfirmed;
    if (els.stepDirection) els.stepDirection.value = state.direction;
    if (els.stepBackend) els.stepBackend.value = state.backend;
    if (els.stepUseDigitizeRange) els.stepUseDigitizeRange.checked = state.useDigitizeRange;
    const duration = playbackDuration();
    for (const [control, value] of [[els.stepTrimStartTime, state.trimStartTime ?? playbackTime(state.rangeStart)],
      [els.stepTrimEndTime, state.trimEndTime ?? (state.rangeEnd === context().frameCount - 1 ? duration : playbackTime(state.rangeEnd))]]) {
      if (!control) continue;
      control.min = "0";
      control.max = String(duration);
      if (document.activeElement !== control || options.forceTrimInputs) {
        control.value = String(Number(value.toFixed(6)));
      }
      control.disabled = !canEditInput();
    }
    if (els.stepTrimStatus) els.stepTrimStatus.textContent = context().ready
      ? `${Math.max(0, state.rangeEnd - state.rangeStart + 1)}フレーム / 元動画 ${duration.toFixed(3)}秒。開始・終了は元動画の再生時刻です。`
      : "動画を選ぶと、分析する区間を秒で指定できます";
    if (els.stepCropStatus) els.stepCropStatus.textContent = state.crop
      ? `画像範囲: ${state.crop.width} × ${state.crop.height} px（左 ${state.crop.x}・上 ${state.crop.y}）。元動画は変更しません。`
      : "画像範囲: 全体。必要なら頭から足先まで含む範囲を指定してください。";
    const rangeLocked = state.running || !context().ready || context().loading || state.videoResetPending
      || state.preparation.phase === "loading" || state.preparation.phase === "error" || state.useDigitizeRange;
    if (els.stepRangeStart) els.stepRangeStart.disabled = rangeLocked;
    if (els.stepRangeEnd) els.stepRangeEnd.disabled = rangeLocked;
    if (els.stepFrameSlider) {
      els.stepFrameSlider.min = String(state.rangeStart);
      els.stepFrameSlider.max = String(state.rangeEnd);
      els.stepFrameSlider.value = String(state.frame);
    }
    if (els.stepFrameInput) {
      els.stepFrameInput.min = String(state.rangeStart);
      els.stepFrameInput.max = String(state.rangeEnd);
      els.stepFrameInput.value = String(state.frame);
    }
    if (els.stepFrameBadge) {
      const events = state.analysis?.events || [];
      const eventIndex = events.findLastIndex((event) => Number(event.frame) <= state.frame);
      const current = eventIndex >= 0 ? events[eventIndex] : null;
      const step = current ? ` / Step ${eventIndex + 1} ${sideLabel(current.side)}` : " / Step -";
      els.stepFrameBadge.textContent = `Frame ${state.frame} / ${state.rangeEnd}${step}`;
    }
  }

  function fpsMismatch() {
    const playback = Number(context().playbackFps) || 0;
    return state.captureFpsConfirmed && playback > 0
      && Math.abs(state.captureFps - playback) / playback >= 0.05;
  }

  function captureTime(frame, run = null) {
    const captureFps = run?.config?.captureFps ?? state.captureFps;
    const confirmed = run?.config?.captureFpsConfirmed ?? state.captureFpsConfirmed;
    const playbackFps = run?.video?.playbackFps ?? context().playbackFps;
    if (confirmed && captureFps > 0) return frame / captureFps;
    const stored = state.bridge?.frameTime?.(frame);
    return Number.isFinite(stored) ? stored : frame / Math.max(0.001, playbackFps || 30);
  }

  function stopPlayback() {
    state.playing = false;
    if (state.playTimer) global.clearInterval(state.playTimer);
    state.playTimer = 0;
    if (els.stepPlay) els.stepPlay.textContent = "再生";
    els.stepPlay?.setAttribute("aria-pressed", "false");
  }

  function togglePlayback() {
    if (state.playing) {
      stopPlayback();
      return;
    }
    if (!context().ready || context().loading || state.videoResetPending || state.running) {
      setStatus(analysisReadiness().message);
      return;
    }
    state.playing = true;
    if (els.stepPlay) els.stepPlay.textContent = "停止";
    els.stepPlay?.setAttribute("aria-pressed", "true");
    const playbackFps = clamp(Number(context().playbackFps) || 30, 1, 60);
    const increment = Math.max(1, Math.round((Number(context().playbackFps) || playbackFps) / playbackFps));
    state.playTimer = global.setInterval(() => {
      if (!state.playing || !state.active || state.frame >= state.rangeEnd) {
        stopPlayback();
        return;
      }
      setFrame(state.frame + increment, { quiet: true });
    }, 1000 / playbackFps);
  }

  async function setFrame(frame, options = {}) {
    if (state.running || context().loading || state.videoResetPending) return false;
    normalizeRange();
    state.frame = clamp(Math.round(Number(frame) || 0), state.rangeStart, state.rangeEnd);
    writeControls();
    const displayed = await renderFrame();
    if (displayed && !options.quiet) setStatus(`${state.frame}F を表示しました`);
    return displayed;
  }

  function poseAt(frame) {
    return state.poseFrames.find((item) => Number(item.frame) === Number(frame)) || null;
  }

  function poseBounds(pose) {
    const points = Object.values(pose?.keypoints || {}).filter((point) => (point.score ?? 0) >= 0.15);
    if (!points.length) return null;
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    return { x: minX, y: minY, width, height, score: 0, track_id: 0 };
  }

  function poseCenter(pose) {
    const bounds = pose?.bbox || poseBounds(pose);
    return bounds ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } : null;
  }

  function distanceToBounds(point, bounds) {
    if (!point || !bounds) return Number.POSITIVE_INFINITY;
    const dx = Math.max(bounds.x - point.x, 0, point.x - bounds.x - bounds.width);
    const dy = Math.max(bounds.y - point.y, 0, point.y - bounds.y - bounds.height);
    return Math.hypot(dx, dy);
  }

  function choosePoseCandidate(frame, result, previousPose = null, run = null) {
    const rawPoses = Array.isArray(result?.poses) && result.poses.length
      ? result.poses
      : Array.isArray(result?.landmarks) && result.landmarks.length ? [result.landmarks] : [];
    const width = Number(run?.video?.width ?? context().width) || 1;
    const height = Number(run?.video?.height ?? context().height) || 1;
    const subject = run?.config?.subject ?? state.subject;
    const candidates = rawPoses.map((landmarks) => {
      const pose = global.VideoDigitizerStepCore.landmarksToPoseFrame(
        frame,
        { landmarks, inference_ms: result?.inference_ms },
        width,
        height,
        state.bridge.frameTime?.(frame),
      );
      if (pose) pose.bbox = poseBounds(pose);
      return pose;
    }).filter(Boolean);
    if (!candidates.length) {
      return global.VideoDigitizerStepCore.normalizePoseFrame({
        frame,
        time_sec: captureTime(frame, run),
        keypoints: {},
        inference_ms: finite(result?.inference_ms),
      });
    }

    const previousCenter = poseCenter(previousPose);
    const useSubjectAnchor = subject && Number(subject.selected_frame) === Number(frame);
    let method = "model_primary";
    let selected = candidates[0];
    if (useSubjectAnchor) {
      method = "subject_click";
      selected = candidates.reduce((best, candidate) => (
        distanceToBounds(subject, candidate.bbox) < distanceToBounds(subject, best.bbox) ? candidate : best
      ), candidates[0]);
    } else if (previousCenter) {
      method = "temporal_continuity";
      selected = candidates.reduce((best, candidate) => {
        const center = poseCenter(candidate);
        const bestCenter = poseCenter(best);
        return center && bestCenter
          && Math.hypot(center.x - previousCenter.x, center.y - previousCenter.y)
            < Math.hypot(bestCenter.x - previousCenter.x, bestCenter.y - previousCenter.y)
          ? candidate
          : best;
      }, candidates[0]);
    } else if (subject) {
      method = "subject_click";
      selected = candidates.reduce((best, candidate) => (
        distanceToBounds(subject, candidate.bbox) < distanceToBounds(subject, best.bbox) ? candidate : best
      ), candidates[0]);
    }
    selected.selection = { candidate_count: candidates.length, method };
    return selected;
  }

  function uncropPoseResult(result, crop, video) {
    if (!crop) return result;
    const remap = (landmarks) => landmarks.map((point) => {
      if (!point || finite(point.x) === null || finite(point.y) === null) return point;
      return { ...point,
        // Predictions can extend outside the ROI. Mapping them linearly avoids
        // pinning feet to a crop edge and manufacturing stationary contacts.
        x: (crop.x + Number(point.x) * (crop.width - 1)) / Math.max(1, video.width - 1),
        y: (crop.y + Number(point.y) * (crop.height - 1)) / Math.max(1, video.height - 1),
      };
    });
    return { ...result,
      ...(Array.isArray(result?.landmarks) ? { landmarks: remap(result.landmarks) } : {}),
      ...(Array.isArray(result?.poses) ? { poses: result.poses.map((points) => Array.isArray(points) ? remap(points) : []) } : {}),
    };
  }

  function canvasSize() {
    const video = context();
    return { width: Math.max(1, Number(video.width) || 1), height: Math.max(1, Number(video.height) || 1) };
  }

  function ensureCanvasSize() {
    const { width, height } = canvasSize();
    for (const canvas of [els.stepFrameCanvas, els.stepOverlayCanvas]) {
      if (!canvas) continue;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }
    if (els.stepCanvasStack) els.stepCanvasStack.style.setProperty("--step-aspect", `${width} / ${height}`);
  }

  function drawOverlay() {
    const canvas = els.stepOverlayCanvas;
    if (!canvas) return;
    ensureCanvasSize();
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pose = poseAt(state.frame);
    if (pose) {
      ctx.lineCap = "round";
      for (const [fromName, toName] of global.VideoDigitizerStepCore.SKELETON) {
        const from = pose.keypoints?.[fromName];
        const to = pose.keypoints?.[toName];
        if (!from || !to) continue;
        const side = fromName.startsWith("left") && toName.startsWith("left")
          ? "left"
          : fromName.startsWith("right") && toName.startsWith("right") ? "right" : "center";
        ctx.strokeStyle = side === "left" ? "#2f7ee6" : side === "right" ? "#e46b2e" : "#ecf4ff";
        ctx.globalAlpha = Math.max(0.25, Math.min(1, Math.min(from.score ?? 0, to.score ?? 0)));
        ctx.lineWidth = Math.max(2, canvas.width / 550);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
      for (const [name, point] of Object.entries(pose.keypoints || {})) {
        ctx.globalAlpha = Math.max(0.3, Math.min(1, point.score ?? 0));
        ctx.fillStyle = name.startsWith("left") ? "#2f7ee6" : name.startsWith("right") ? "#e46b2e" : "#ffffff";
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(3, canvas.width / 300), 0, Math.PI * 2);
        ctx.fill();
      }
      const points = Object.values(pose.keypoints || {});
      if (points.length) {
        const minX = Math.min(...points.map((point) => point.x));
        const maxX = Math.max(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxY = Math.max(...points.map((point) => point.y));
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = "#ffffff";
        ctx.setLineDash([8, 5]);
        ctx.lineWidth = Math.max(2, canvas.width / 700);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        ctx.setLineDash([]);
      }
    }
    if (state.subject) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#ffe066";
      ctx.lineWidth = Math.max(2, canvas.width / 500);
      const radius = Math.max(10, canvas.width / 75);
      ctx.beginPath();
      ctx.arc(state.subject.x, state.subject.y, radius, 0, Math.PI * 2);
      ctx.moveTo(state.subject.x - radius * 1.4, state.subject.y);
      ctx.lineTo(state.subject.x + radius * 1.4, state.subject.y);
      ctx.moveTo(state.subject.x, state.subject.y - radius * 1.4);
      ctx.lineTo(state.subject.x, state.subject.y + radius * 1.4);
      ctx.stroke();
    }
    const activeEvents = state.analysis?.events?.filter((event) => event.frame === state.frame) || [];
    if (activeEvents.length) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
      ctx.fillRect(12, canvas.height - 54, Math.min(360, canvas.width - 24), 40);
      ctx.fillStyle = "#ffffff";
      ctx.font = `${Math.max(14, canvas.width / 55)}px sans-serif`;
      ctx.fillText(activeEvents.map((event) => event.side === "left" ? "左接地" : "右接地").join(" / "), 24, canvas.height - 27);
    }
    const crop = state.cropDrag ? cropFromPoints(state.cropDrag.start, state.cropDrag.current) : state.crop;
    if (crop) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(0, 0, canvas.width, crop.y);
      ctx.fillRect(0, crop.y + crop.height, canvas.width, canvas.height - crop.y - crop.height);
      ctx.fillRect(0, crop.y, crop.x, crop.height);
      ctx.fillRect(crop.x + crop.width, crop.y, canvas.width - crop.x - crop.width, crop.height);
      ctx.strokeStyle = "#5eead4";
      ctx.lineWidth = Math.max(2, canvas.width / 400);
      ctx.setLineDash([]);
      ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);
    }
    ctx.globalAlpha = 1;
  }

  async function drainPreviewQueue() {
    while (state.previewPending) {
      const request = state.previewPending;
      state.previewPending = null;
      let bitmap = null;
      try {
        bitmap = await state.bridge.getFrameBitmap(request.frame);
        if (request.serial !== state.renderSerial) continue;
        const canvas = els.stepFrameCanvas;
        const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        state.lastPreviewSerial = request.serial;
        setPreviewStatus("");
        drawOverlay();
      } catch (error) {
        if (request.serial === state.renderSerial) {
          const message = `フレーム表示に失敗しました: ${error.message}`;
          setPreviewStatus(message);
          setStatus(message);
        }
      } finally {
        bitmap?.close?.();
      }
    }
  }

  async function renderFrame() {
    const video = context();
    const serial = ++state.renderSerial;
    ensureCanvasSize();
    drawOverlay();
    if (!video.ready || video.loading || state.videoResetPending || !state.bridge?.getFrameBitmap || !els.stepFrameCanvas) {
      state.previewPending = null;
      setPreviewStatus("");
      const frameContext = els.stepFrameCanvas?.getContext("2d");
      frameContext?.clearRect(0, 0, els.stepFrameCanvas.width, els.stepFrameCanvas.height);
      return false;
    }
    // Scrubbing and playback may request frames faster than an iPhone can seek.
    // Keep one decoder request in flight and replace queued previews with the
    // latest frame instead of building an unbounded seek backlog ahead of AI.
    state.previewPending = { serial, frame: state.frame };
    setPreviewStatus("プレビューを表示しています…");
    if (!state.previewTask) {
      state.previewTask = Promise.resolve().then(drainPreviewQueue).finally(() => {
        state.previewTask = null;
        if (state.previewPending) renderFrame();
      });
    }
    await state.previewTask;
    return serial === state.renderSerial && serial === state.lastPreviewSerial;
  }

  function selectSubjectFromPointer(event) {
    if (!canEditInput() || state.selectingCrop || !state.selectingSubject) return;
    const rect = els.stepOverlayCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const { width, height } = canvasSize();
    const subject = {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1) * width,
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1) * height,
      selected_frame: state.frame,
      method: "user_click",
    };
    if (state.crop && (subject.x < state.crop.x || subject.x >= state.crop.x + state.crop.width
      || subject.y < state.crop.y || subject.y >= state.crop.y + state.crop.height)) {
      setStatus("指定した画像範囲の内側で対象人物を選択してください");
      return;
    }
    state.subject = subject;
    state.selectingSubject = false;
    els.stepOverlayCanvas.classList.remove("selecting-subject");
    if (els.stepSelectSubject) els.stepSelectSubject.classList.remove("active");
    recordAudit("select_subject", { frame: state.frame, x: state.subject.x, y: state.subject.y });
    invalidateAnalysis("subject_changed", {
      selected_frame: state.subject.selected_frame,
      x: state.subject.x,
      y: state.subject.y,
    });
    setStatus("分析対象者を選択しました。AI分析を実行してください");
  }

  function beginSubjectSelection() {
    if (state.running || context().loading || state.preparation.phase === "loading") return;
    if (!context().ready || state.videoResetPending) {
      setStatus("先に動画を開いてください");
      return;
    }
    cancelCropSelection();
    drawOverlay();
    state.selectingSubject = !state.selectingSubject;
    els.stepOverlayCanvas?.classList.toggle("selecting-subject", state.selectingSubject);
    els.stepSelectSubject?.classList.toggle("active", state.selectingSubject);
    setStatus(state.selectingSubject ? "動画上の分析対象者をクリックしてください" : "対象者選択を中止しました");
  }

  function updateProgress(current = state.progress.current, total = state.progress.total) {
    state.progress.current = Math.max(0, Number(current) || 0);
    state.progress.total = Math.max(0, Number(total) || 0);
    if (els.stepProgress) {
      els.stepProgress.max = Math.max(1, state.progress.total);
      els.stepProgress.value = Math.min(els.stepProgress.max, state.progress.current);
    }
    const percent = state.progress.total ? Math.round(state.progress.current / state.progress.total * 100) : 0;
    if (els.stepProgressText) els.stepProgressText.textContent = state.running ? `${percent}%` : "";
  }

  function invalidateAnalysis(reason, details = {}, options = {}) {
    if (state.running) invalidateActiveRun();
    const clearPoseFrames = options.clearPoseFrames !== false;
    const hadDerivedData = Boolean(state.analysis || state.poseFrames.length);
    state.analysis = null;
    if (clearPoseFrames) {
      state.poseFrames = [];
      state.model = null;
      state.effectiveBackend = "";
    }
    state.cacheKey = "";
    state.resumedFromCache = false;
    updateProgress(0, 0);
    recordAudit("invalidate_analysis", { reason, had_derived_data: hadDerivedData, ...details });
    markDirty();
    renderResults();
    renderFrame();
    setStatus(hadDerivedData
      ? "分析条件が変わったため、以前の結果を無効化しました。AI分析を再実行してください"
      : "分析条件を更新しました");
  }

  function applyTimeBasisChange(previous) {
    for (const pose of state.poseFrames) pose.time_sec = captureTime(pose.frame);
    const previousAnalysis = state.analysis;
    const correctedEvents = (previousAnalysis?.events || [])
      .filter((event) => event?.corrected_by_user)
      .map(snapshotData);
    let redetected = false;
    const preservedCorrections = [];
    const invalidatedCorrections = [];
    const canRedetect = hasAnalyzablePoseFrames();
    if (previousAnalysis && canRedetect) {
      const nextAnalysis = global.VideoDigitizerStepCore.analyzePoseSequence(state.poseFrames, analysisOptions());
      for (const corrected of correctedEvents) {
        const frame = finite(corrected?.frame);
        if (frame === null || frame < state.rangeStart || frame > state.rangeEnd
          || !["left", "right"].includes(corrected?.side)) {
          invalidatedCorrections.push(corrected);
          continue;
        }
        const originalFrame = finite(corrected.original_frame);
        let matchIndex = -1;
        if (originalFrame !== null) {
          matchIndex = nextAnalysis.events.findIndex((candidate) => (
            candidate.side === corrected.side
            && finite(candidate.original_frame) === originalFrame
          ));
          if (matchIndex < 0) {
            invalidatedCorrections.push(corrected);
            continue;
          }
        } else {
          matchIndex = nextAnalysis.events.findIndex((candidate) => (
            candidate.side === corrected.side && candidate.frame === frame
          ));
        }
        const detected = matchIndex >= 0 ? nextAnalysis.events[matchIndex] : null;
        const preserved = {
          ...(detected || {}),
          ...corrected,
          frame: Math.round(frame),
          time_sec: captureTime(Math.round(frame)),
          quality_reasons: [...new Set([
            ...(detected?.quality_reasons || []),
            ...(corrected.quality_reasons || []),
          ])],
          corrected_by_user: true,
          correction_history: Array.isArray(corrected.correction_history)
            ? corrected.correction_history.map(snapshotData)
            : [],
        };
        if (matchIndex >= 0) nextAnalysis.events.splice(matchIndex, 1, preserved);
        else nextAnalysis.events.push(preserved);
        preservedCorrections.push(snapshotData(preserved));
      }
      state.analysis = global.VideoDigitizerStepCore.refreshAnalysis(nextAnalysis, analysisOptions());
      if (previousAnalysis.processing) {
        state.analysis.processing = {
          ...snapshotData(previousAnalysis.processing),
          time_basis_redetected_at: new Date().toISOString(),
        };
      }
      redetected = true;
    } else if (previousAnalysis) {
      for (const event of previousAnalysis.events || []) event.time_sec = captureTime(event.frame);
      state.analysis = global.VideoDigitizerStepCore.refreshAnalysis(previousAnalysis, analysisOptions());
      preservedCorrections.push(...correctedEvents.map(snapshotData));
    }
    state.cacheKey = "";
    state.resumedFromCache = false;
    recordAudit("change_time_basis", {
      from_capture_fps: previous.captureFps,
      to_capture_fps: state.captureFps,
      from_confirmed: previous.captureFpsConfirmed,
      to_confirmed: state.captureFpsConfirmed,
      time_basis: state.captureFpsConfirmed ? "confirmed_capture_fps" : "pts_or_container_fps",
      redetected_from_pose_frames: redetected,
      preserved_user_corrections: preservedCorrections,
      invalidated_user_corrections: invalidatedCorrections,
      redetection_skipped_reason: previousAnalysis && !canRedetect ? "pose_frames_unavailable_or_unanalyzable" : null,
    });
    markDirty();
    renderResults();
    renderFrame();
    if (previousAnalysis && !canRedetect) {
      setStatus("再検出に使える足部姿勢座標がないため、既存イベントを維持して時刻と時間指標のみ再計算しました");
    } else if (invalidatedCorrections.length) {
      setStatus(`時刻基準からイベントを再検出しました。対応しない手動修正 ${invalidatedCorrections.length}件は監査ログに残して無効化しました`);
    } else if (redetected) {
      const suffix = preservedCorrections.length ? `（手動修正 ${preservedCorrections.length}件を維持）` : "";
      setStatus(`時刻基準からイベントと時間指標を再計算しました${suffix}`);
    } else {
      setStatus("時刻基準を更新しました");
    }
  }

  function updateRunControls() {
    const locked = state.running;
    const videoAvailable = context().ready && !context().loading && !state.videoResetPending
      && state.preparation.phase !== "loading" && state.preparation.phase !== "error";
    const readiness = analysisReadiness();
    if (els.stepReadinessStatus) {
      els.stepReadinessStatus.textContent = readiness.message;
      els.stepReadinessStatus.dataset.phase = readiness.phase;
    }
    syncStatusVisibility();
    if (els.stepRunAnalysis) {
      els.stepRunAnalysis.disabled = !readiness.canAnalyze;
      els.stepRunAnalysis.title = readiness.message;
      els.stepRunAnalysis.textContent = locked ? "AI分析中…"
        : readiness.phase === "loading" ? "動画を準備中…"
        : state.poseFrames.length && !state.analysis ? "AI分析を再開"
        : global.VideoDigitizerNative?.isIOSApp ? "AIでステップを分析" : "AI分析を実行";
    }
    if (els.stepCancelAnalysis) els.stepCancelAnalysis.disabled = !locked;
    if (els.stepExportCsv) els.stepExportCsv.disabled = locked || !videoAvailable || !state.analysis;
    if (els.stepExportJson) els.stepExportJson.disabled = locked || !videoAvailable || !state.analysis;
    if (els.stepUseDigitizeRange) els.stepUseDigitizeRange.disabled = locked || Boolean(global.VideoDigitizerNative?.isIOSApp);
    if (els.stepRangeStart) els.stepRangeStart.disabled = locked || !videoAvailable || state.useDigitizeRange;
    if (els.stepRangeEnd) els.stepRangeEnd.disabled = locked || !videoAvailable || state.useDigitizeRange;
    if (els.stepTrimControls) els.stepTrimControls.hidden = !videoAvailable;
    for (const control of [els.stepTrimStartTime, els.stepTrimEndTime, els.stepTrimToCurrentStart,
      els.stepTrimToCurrentEnd, els.stepResetTimeTrim, els.stepSelectCrop, els.stepResetCrop]) {
      if (control) control.disabled = locked || !videoAvailable;
    }
    if (els.stepResetCrop) els.stepResetCrop.disabled = locked || !videoAvailable || !state.crop;
    for (const control of [
      els.stepCaptureFps, els.stepFpsConfirmed, els.stepDirection, els.stepBackend,
      els.stepSelectSubject, els.stepClearCache, els.stepAddLeftContact, els.stepAddRightContact,
    ]) {
      if (!control) continue;
      const needsVideo = [els.stepSelectSubject, els.stepAddLeftContact, els.stepAddRightContact].includes(control);
      control.disabled = locked || needsVideo && !videoAvailable;
    }
    for (const control of [els.stepPlay, els.stepPrevFrame, els.stepNextFrame, els.stepFrameSlider, els.stepFrameInput]) {
      if (control) control.disabled = locked || !videoAvailable;
    }
  }

  function formatMetric(value, digits = 3, suffix = "") {
    const number = finite(value);
    return number !== null ? `${number.toFixed(digits)}${suffix}` : "—";
  }

  function renderMetrics() {
    const metrics = state.analysis?.metrics || null;
    const status = metrics?.quality_status || "unusable";
    const statusLabels = { good: "良好", review: "要確認あり", unusable: "分析不可" };
    if (els.stepQualityBadge) {
      els.stepQualityBadge.textContent = metrics ? statusLabels[status] || status : "未分析";
      els.stepQualityBadge.className = `step-quality-badge ${metrics ? status : "idle"}`;
      els.stepQualityBadge.dataset.status = metrics ? status : "idle";
    }
    if (els.stepMetricCount) els.stepMetricCount.textContent = metrics ? String(metrics.step_count) : "—";
    if (els.stepMetricCadence) els.stepMetricCadence.textContent = formatMetric(metrics?.cadence_steps_min, 1);
    if (els.stepMetricStepTime) els.stepMetricStepTime.textContent = formatMetric(metrics?.step_time_s?.mean, 3);
    if (els.stepMetricStrideTime) els.stepMetricStrideTime.textContent = formatMetric(metrics?.stride_time_s?.mean, 3);
    renderMetricStatistics(metrics);
    if (els.stepQualityReasons) {
      const reasons = [...new Set(metrics?.quality_reasons || [])];
      els.stepQualityReasons.replaceChildren();
      if (!reasons.length) {
        const item = document.createElement("li");
        item.textContent = metrics ? "自動チェックで大きな問題は見つかりませんでした" : "分析を実行すると理由を表示します";
        els.stepQualityReasons.append(item);
      } else {
        for (const reason of reasons) {
          const item = document.createElement("li");
          item.textContent = global.VideoDigitizerStepCore.qualityLabel(reason);
          els.stepQualityReasons.append(item);
        }
      }
    }
  }

  function renderMetricStatistics(metrics) {
    if (!els.stepMetricStats) return;
    els.stepMetricStats.replaceChildren();
    for (const [label, key] of [["ステップ時間", "step_time_s"], ["ストライド時間", "stride_time_s"]]) {
      const overall = metrics?.[key] || {};
      const left = metrics?.by_side?.left?.[key] || {};
      const right = metrics?.by_side?.right?.[key] || {};
      const leftMean = finite(left.mean);
      const rightMean = finite(right.mean);
      const difference = leftMean !== null && rightMean !== null ? leftMean - rightMean : null;
      const row = document.createElement("tr");
      const values = [
        label,
        formatMetric(overall.mean, 3),
        formatMetric(overall.sd, 3),
        formatMetric(overall.cv_percent, 1),
        formatMetric(leftMean, 3),
        formatMetric(rightMean, 3),
        formatMetric(difference, 3),
      ];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      els.stepMetricStats.append(row);
    }
  }

  function sideLabel(side) {
    return side === "left" ? "左" : "右";
  }

  function updateEventFrame(event, nextFrame, source = "table") {
    if (!event || state.running || state.videoResetPending) return;
    const frame = clamp(Math.round(Number(nextFrame) || 0), state.rangeStart, state.rangeEnd);
    const previous = event.frame;
    if (frame === previous) return;
    event.correction_history = Array.isArray(event.correction_history) ? event.correction_history : [];
    event.correction_history.push({
      from_frame: previous,
      to_frame: frame,
      at: new Date().toISOString(),
      analyst: String(state.bridge?.getMetadata?.()?.analyst || ""),
      source,
    });
    event.frame = frame;
    event.time_sec = captureTime(frame);
    event.corrected_by_user = true;
    state.analysis = global.VideoDigitizerStepCore.refreshAnalysis(state.analysis, analysisOptions());
    recordAudit("correct_event", { id: event.id, from_frame: previous, to_frame: frame, source });
    markDirty();
    state.frame = frame;
    renderResults();
    renderFrame();
  }

  function removeEvent(id) {
    if (!state.analysis || state.running || state.videoResetPending) return;
    const index = state.analysis.events.findIndex((event) => event.id === id);
    if (index < 0) return;
    const [removed] = state.analysis.events.splice(index, 1);
    const removedSnapshot = snapshotData(removed);
    state.analysis = global.VideoDigitizerStepCore.refreshAnalysis(state.analysis, analysisOptions());
    recordAudit("remove_event", {
      id,
      frame: removed.frame,
      side: removed.side,
      removed_event: removedSnapshot,
    });
    markDirty();
    renderResults();
  }

  function addEvent(side) {
    if (!context().ready || state.videoResetPending || state.running) return;
    if (!state.analysis) {
      state.analysis = global.VideoDigitizerStepCore.analyzePoseSequence([], analysisOptions());
      state.analysis.events = [];
    }
    const id = global.crypto?.randomUUID?.() || `${side}-${Date.now()}-${Math.random()}`;
    state.analysis.events.push({
      id,
      type: "contact",
      side,
      frame: state.frame,
      original_frame: null,
      time_sec: captureTime(state.frame),
      contact_point: null,
      confidence: null,
      quality_reasons: [],
      corrected_by_user: true,
      correction_history: [{
        from_frame: null,
        to_frame: state.frame,
        at: new Date().toISOString(),
        analyst: String(state.bridge?.getMetadata?.()?.analyst || ""),
        source: "manual_add",
      }],
    });
    state.analysis = global.VideoDigitizerStepCore.refreshAnalysis(state.analysis, analysisOptions());
    recordAudit("add_event", { id, frame: state.frame, side });
    markDirty();
    renderResults();
  }

  function renderEvents() {
    if (!els.stepEventTableBody) return;
    els.stepEventTableBody.replaceChildren();
    for (const event of state.analysis?.events || []) {
      const row = document.createElement("tr");
      const stepIndex = document.createElement("td");
      stepIndex.textContent = String((state.analysis?.events || []).indexOf(event) + 1);
      const side = document.createElement("td");
      side.textContent = sideLabel(event.side);
      side.className = `step-side-${event.side}`;
      const type = document.createElement("td");
      type.textContent = "接地";
      const frameCell = document.createElement("td");
      const controls = document.createElement("div");
      controls.className = "step-event-edit";
      const decrement = document.createElement("button");
      decrement.type = "button";
      decrement.textContent = "−1";
      decrement.title = "1フレーム前へ";
      decrement.disabled = state.running;
      decrement.addEventListener("click", () => updateEventFrame(event, event.frame - 1));
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(state.rangeStart);
      input.max = String(state.rangeEnd);
      input.step = "1";
      input.value = String(event.frame);
      input.disabled = state.running;
      input.setAttribute("aria-label", `${sideLabel(event.side)}接地フレーム`);
      input.addEventListener("change", () => updateEventFrame(event, input.value));
      const increment = document.createElement("button");
      increment.type = "button";
      increment.textContent = "+1";
      increment.title = "1フレーム後へ";
      increment.disabled = state.running;
      increment.addEventListener("click", () => updateEventFrame(event, event.frame + 1));
      controls.append(decrement, input, increment);
      frameCell.append(controls);
      const time = document.createElement("td");
      time.textContent = formatMetric(event.time_sec, 4, " s");
      const quality = document.createElement("td");
      const reasons = event.quality_reasons || [];
      quality.textContent = reasons.length ? reasons.map(global.VideoDigitizerStepCore.qualityLabel).join("、") : "良好";
      const action = document.createElement("td");
      const jump = document.createElement("button");
      jump.type = "button";
      jump.textContent = "表示";
      jump.disabled = state.running;
      jump.addEventListener("click", () => setFrame(event.frame));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "削除";
      remove.disabled = state.running;
      remove.addEventListener("click", () => removeEvent(event.id));
      action.className = "step-event-actions";
      action.append(jump, remove);
      row.append(stepIndex, side, type, frameCell, time, quality, action);
      els.stepEventTableBody.append(row);
    }
  }

  function framePercent(frame) {
    return state.rangeEnd > state.rangeStart
      ? (frame - state.rangeStart) / (state.rangeEnd - state.rangeStart) * 100
      : 0;
  }

  function beginTimelineDrag(pointerEvent, event, marker) {
    if (state.running || state.videoResetPending) return;
    pointerEvent.preventDefault();
    const startFrame = event.frame;
    const move = (moveEvent) => {
      const rect = els.stepTimelineTrack.getBoundingClientRect();
      const ratio = clamp((moveEvent.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const frame = Math.round(state.rangeStart + ratio * (state.rangeEnd - state.rangeStart));
      event.frame = frame;
      event.time_sec = captureTime(frame);
      marker.style.left = `${framePercent(frame)}%`;
      state.frame = frame;
      writeControls();
      renderFrame();
    };
    const cleanup = () => {
      global.removeEventListener("pointermove", move);
      global.removeEventListener("pointerup", up);
      global.removeEventListener("pointercancel", cancel);
    };
    const up = () => {
      cleanup();
      const finalFrame = event.frame;
      event.frame = startFrame;
      event.time_sec = captureTime(startFrame);
      updateEventFrame(event, finalFrame, "timeline_drag");
    };
    const cancel = () => {
      cleanup();
      event.frame = startFrame;
      event.time_sec = captureTime(startFrame);
      renderResults();
      renderFrame();
    };
    global.addEventListener("pointermove", move);
    global.addEventListener("pointerup", up, { once: true });
    global.addEventListener("pointercancel", cancel, { once: true });
  }

  function renderTimeline() {
    if (!els.stepTimelineTrack) return;
    els.stepTimelineTrack.replaceChildren();
    for (const interval of state.analysis?.quality?.intervals || []) {
      const band = document.createElement("span");
      band.className = "step-timeline-quality-interval";
      const left = framePercent(interval.start_frame);
      const right = framePercent(interval.end_frame);
      band.style.left = `${left}%`;
      band.style.width = `${Math.max(0.5, right - left)}%`;
      band.title = `${global.VideoDigitizerStepCore.qualityLabel(interval.reason)}: ${interval.start_frame}-${interval.end_frame}F`;
      els.stepTimelineTrack.append(band);
    }
    for (const event of state.analysis?.events || []) {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.disabled = state.running;
      marker.className = `step-timeline-event ${event.side}`;
      marker.dataset.side = event.side;
      if (event.corrected_by_user) marker.classList.add("corrected");
      if (Number(event.frame) === state.frame) marker.classList.add("selected");
      const position = framePercent(event.frame);
      marker.style.left = global.VideoDigitizerNative?.isIOSApp
        ? `clamp(22px, ${position}%, calc(100% - 22px))`
        : `${position}%`;
      marker.title = `${sideLabel(event.side)}接地 ${event.frame}F（ドラッグで修正）`;
      marker.setAttribute("aria-label", marker.title);
      marker.addEventListener("click", () => setFrame(event.frame));
      marker.addEventListener("pointerdown", (pointerEvent) => beginTimelineDrag(pointerEvent, event, marker));
      els.stepTimelineTrack.append(marker);
    }
    const cursor = document.createElement("span");
    cursor.className = "step-timeline-cursor";
    cursor.style.left = `${framePercent(state.frame)}%`;
    els.stepTimelineTrack.append(cursor);
  }

  function renderResults() {
    writeControls();
    renderMetrics();
    renderEvents();
    renderTimeline();
    updateRunControls();
    drawOverlay();
  }

  function analysisOptions(extra = {}, run = null) {
    const video = run?.video || context();
    const config = run?.config || state;
    return {
      captureFps: config.captureFps,
      captureFpsConfirmed: config.captureFpsConfirmed,
      playbackFps: Number(video.playbackFps) || 30,
      width: Number(video.width) || 1,
      height: Number(video.height) || 1,
      rangeStart: config.rangeStart,
      rangeEnd: config.rangeEnd,
      backend: config.effectiveBackend || config.backend,
      resumedFromCache: state.resumedFromCache,
      ...extra,
    };
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  async function sha256(text) {
    if (!global.crypto?.subtle) return `plain:${text}`;
    const data = new TextEncoder().encode(text);
    const digest = await global.crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function mediaPipeCacheKey(run = null) {
    const video = run?.video || context();
    const config = run?.config || state;
    const payload = {
      schema: global.VideoDigitizerStepCore.SCHEMA,
      algorithm: "foot_multisignal_state_machine_v2",
      // Never reuse poses indexed with the older QuickTime composition-time
      // parser, even when an edited video's frame count happens to match.
      frame_timing: video.sourceMode === "browser" ? "container_pts_qt_signed_v2" : "server_decoder",
      video: {
        digest_algorithm: video.videoIdentity?.digest_algorithm || "",
        digest: video.videoIdentity?.digest || "",
        name: video.videoIdentity?.name || video.videoName || "",
        size: Number(video.videoIdentity?.size) || 0,
        last_modified: Number(video.videoIdentity?.last_modified) || 0,
      },
      range: [config.rangeStart, config.rangeEnd],
      capture_fps: config.captureFps,
      capture_fps_confirmed: config.captureFpsConfirmed,
      playback_fps: Number(video.playbackFps) || 0,
      subject: config.subject,
      crop: config.crop || null,
      direction: config.direction,
      model: MEDIAPIPE_MODEL,
    };
    return sha256(stableStringify(payload));
  }

  function connectCache() {
    if (!global.indexedDB) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = global.indexedDB.open(CACHE_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("解析キャッシュを開けませんでした"));
    });
  }

  function sweepExpiredCache(db, now = Date.now()) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CACHE_STORE, "readwrite");
      const store = transaction.objectStore(CACHE_STORE);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const updatedAt = Number(cursor.value?.updated_at);
        if (!Number.isFinite(updatedAt) || now - updatedAt > CACHE_TTL_MS) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || request.error || new Error("期限切れ解析キャッシュを削除できませんでした"));
      transaction.onabort = () => reject(transaction.error || new Error("期限切れ解析キャッシュの削除が中断されました"));
    });
  }

  async function openCache() {
    const db = await connectCache();
    if (!db) return null;
    try {
      await sweepExpiredCache(db);
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  async function cacheGet(key) {
    const db = await openCache();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CACHE_STORE, "readwrite");
      const store = transaction.objectStore(CACHE_STORE);
      const request = store.get(key);
      let value = null;
      request.onsuccess = () => {
        const candidate = request.result || null;
        if (candidate && Date.now() - Number(candidate.updated_at || 0) <= CACHE_TTL_MS) value = candidate;
        else if (candidate) store.delete(key);
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(value);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || request.error || new Error("解析キャッシュを読めませんでした"));
      };
    });
  }

  async function cachePut(run, key, source = {}) {
    if (!ownsRun(run) || run.cacheKey !== key || state.cacheKey !== key) return false;
    const payload = {
      key,
      updated_at: Date.now(),
      complete: source.complete === true,
      pose_frames: snapshotData(Array.isArray(source.poseFrames) ? source.poseFrames : []),
      analysis: source.complete === true ? snapshotData(source.analysis || null) : null,
      model: snapshotData(source.model || null),
    };
    const db = await openCache();
    if (!db) return false;
    if (!ownsRun(run) || run.cacheKey !== key || state.cacheKey !== key) {
      db.close();
      return false;
    }
    const written = await new Promise((resolve, reject) => {
      const transaction = db.transaction(CACHE_STORE, "readwrite");
      const request = transaction.objectStore(CACHE_STORE).put(payload);
      let stale = false;
      request.onsuccess = () => {
        if (!ownsRun(run) || run.cacheKey !== key || state.cacheKey !== key) {
          stale = true;
          try {
            transaction.abort();
          } catch (_error) {
            // The transaction may already have committed; payload is still an immutable run snapshot.
          }
        }
      };
      transaction.oncomplete = () => resolve(true);
      transaction.onabort = () => {
        if (stale) resolve(false);
        else reject(transaction.error || new Error("解析キャッシュの保存が中断されました"));
      };
      transaction.onerror = () => reject(transaction.error || new Error("解析キャッシュを保存できませんでした"));
    });
    db.close();
    return written;
  }

  async function clearBrowserCache() {
    if (state.running) throw new Error("分析中はキャッシュを削除できません。先に分析を中止してください");
    if (typeof global.confirm === "function" && !global.confirm([
      "ステップ分析キャッシュを削除しますか？",
      "保存済みの中間姿勢と完了結果が削除され、次回は最初から分析します。",
    ].join("\n\n"))) {
      setStatus("キャッシュ削除を取り消しました");
      return;
    }
    const db = await openCache();
    if (db) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(CACHE_STORE, "readwrite");
        transaction.objectStore(CACHE_STORE).clear();
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("解析キャッシュを削除できませんでした"));
      });
      db.close();
    }
    let serverError = null;
    if (context().sourceMode === "api") {
      try {
        const response = await fetch(state.bridge.apiUrl("step-analysis/cache"), { method: "DELETE", cache: "no-store" });
        if (!response.ok) {
          const detail = (await response.text()).trim();
          throw new Error(detail || `HTTP ${response.status}`);
        }
      } catch (error) {
        serverError = error;
      }
    }
    state.cacheKey = "";
    state.resumedFromCache = false;
    if (serverError) {
      throw new Error(`端末内キャッシュは削除しましたが、ローカルサーバー側を削除できませんでした: ${serverError.message}`);
    }
    setStatus("端末内のステップ分析キャッシュを削除しました");
  }

  async function refreshCapabilities() {
    const video = context();
    state.capabilities = {
      mmpose: {
        available: false,
        ready: false,
        reason: global.VideoDigitizerNative?.isIOSApp
          ? "iOS版では未対応（MediaPipeを使用）"
          : "ローカルアプリでのみ利用できます",
      },
      mediapipe: { available: Boolean(global.VideoDigitizerAI?.estimatePose), ready: Boolean(global.VideoDigitizerAI?.estimatePose) },
    };
    if (video.sourceMode === "api" && state.bridge?.apiUrl) {
      try {
        const response = await fetch(state.bridge.apiUrl("step-analysis/capabilities"), { cache: "no-store" });
        if (response.ok) state.capabilities = { ...state.capabilities, ...(await response.json()) };
      } catch (_error) {
        // MediaPipe remains available without the optional local backend.
      }
    }
    const mm = state.capabilities?.mmpose || {};
    const autoOption = els.stepBackend?.querySelector?.('option[value="auto"]');
    const mediaPipeOption = els.stepBackend?.querySelector?.('option[value="mediapipe"]');
    const mmOption = els.stepBackend?.querySelector?.('option[value="mmpose"]');
    if (global.VideoDigitizerNative?.isIOSApp) {
      if (autoOption) autoOption.textContent = "自動（MediaPipe）";
      if (mediaPipeOption) mediaPipeOption.textContent = "MediaPipe（端末内）";
    }
    if (mmOption) {
      mmOption.disabled = !mm.ready;
      if (global.VideoDigitizerNative?.isIOSApp) mmOption.textContent = "MMPose（iOS版は未対応）";
    }
    if (!mm.ready && state.backend === "mmpose") {
      state.backend = "auto";
      if (els.stepBackend) els.stepBackend.value = "auto";
    }
    if (els.stepBackendStatus) {
      els.stepBackendStatus.textContent = global.VideoDigitizerNative?.isIOSApp
        ? "端末内AI: MediaPipe Pose Landmarker Lite"
        : mm.ready
        ? `標準AI: ${mm.model_id || "RTMDet + RTMPose"} 利用可能`
        : `標準AI: 未準備（${mm.reason || "MMPoseまたは監査済みモデルが未設定"}）`;
    }
    updateRunControls();
    return state.capabilities;
  }

  function chooseBackend(run = null) {
    const requested = run?.config?.backend || state.backend;
    const crop = run?.config?.crop ?? state.crop;
    if (crop) {
      if (requested === "mmpose") throw new Error("画像範囲を指定した分析にはMediaPipeを選択してください");
      if (!global.VideoDigitizerAI?.estimatePose) throw new Error("画像範囲を分析する端末内AIを利用できません");
      return "mediapipe";
    }
    const mmReady = Boolean(state.capabilities?.mmpose?.ready);
    if (requested === "mmpose" && !mmReady) throw new Error("MMPose標準AIは未準備です。環境と監査済みモデルを設定してください");
    if (requested === "mmpose" || requested === "auto" && mmReady) return "mmpose";
    if (!global.VideoDigitizerAI?.estimatePose) throw new Error("利用できる姿勢推定バックエンドがありません");
    return "mediapipe";
  }

  async function runMediaPipe(run) {
    if (!ownsRun(run)) return;
    run.model = { ...MEDIAPIPE_MODEL };
    state.model = run.model;
    const key = await mediaPipeCacheKey(run);
    if (shouldStopRun(run)) return;
    const restoredPoseFrames = state.cacheKey === key ? state.poseFrames : [];
    run.cacheKey = key;
    state.cacheKey = key;
    let cached = null;
    try {
      cached = await cacheGet(key);
    } catch (error) {
      if (ownsRun(run)) setStatus(`キャッシュを利用せず続行します: ${error.message}`);
    }
    if (shouldStopRun(run)) return;
    if (cached?.complete && cached.analysis && Array.isArray(cached.pose_frames)) {
      state.poseFrames = cached.pose_frames;
      state.analysis = global.VideoDigitizerStepCore.refreshAnalysis(cached.analysis, analysisOptions({}, run));
      state.model = cached.model || state.model;
      state.resumedFromCache = true;
      const total = run.config.rangeEnd - run.config.rangeStart + 1;
      updateProgress(total, total);
      setStatus("同じ動画・モデル・設定のローカルキャッシュを再利用しました");
      recordAudit("cache_hit", { backend: "mediapipe", key });
      return;
    }

    const existing = new Map();
    for (const pose of [...restoredPoseFrames, ...(cached?.pose_frames || [])]) {
      if (pose && pose.frame >= run.config.rangeStart && pose.frame <= run.config.rangeEnd) existing.set(pose.frame, pose);
    }
    state.poseFrames = [...existing.values()].sort((a, b) => a.frame - b.frame);
    state.resumedFromCache = state.poseFrames.length > 0;
    let nextCheckpointSize = CACHE_CHUNK_FRAMES;
    while (nextCheckpointSize <= existing.size) nextCheckpointSize *= 2;
    const total = run.config.rangeEnd - run.config.rangeStart + 1;
    updateProgress(existing.size, total);
    const started = performance.now();
    const anchor = clamp(
      Math.round(Number(run.config.subject?.selected_frame) || run.config.rangeStart),
      run.config.rangeStart,
      run.config.rangeEnd,
    );
    const frameOrder = [
      anchor,
      ...Array.from({ length: run.config.rangeEnd - anchor }, (_unused, index) => anchor + index + 1),
      ...Array.from({ length: anchor - run.config.rangeStart }, (_unused, index) => anchor - index - 1),
    ];
    let previousPose = null;
    let previousFrame = null;
    for (const frame of frameOrder) {
      if (shouldStopRun(run)) break;
      if (existing.has(frame)) {
        previousPose = existing.get(frame);
        previousFrame = frame;
        continue;
      }
      const bitmap = await state.bridge.getFrameBitmap(frame, { crop: run.config.crop });
      if (shouldStopRun(run)) {
        bitmap?.close?.();
        break;
      }
      let result;
      try {
        result = await global.VideoDigitizerAI.estimatePose(bitmap, { maxPoses: 4 });
        result = uncropPoseResult(result, run.config.crop, run.video);
      } finally {
        bitmap?.close?.();
      }
      if (shouldStopRun(run)) break;
      const adjacentPose = previousPose && Math.abs(Number(previousFrame) - frame) === 1
        ? previousPose
        : existing.get(frame - 1) || existing.get(frame + 1) || null;
      const pose = choosePoseCandidate(frame, result, adjacentPose, run);
      existing.set(frame, pose);
      state.poseFrames.push(pose);
      previousPose = pose;
      previousFrame = frame;
      updateProgress(existing.size, total);
      if (frame === state.frame || existing.size % 5 === 0) {
        state.frame = frame;
        writeControls();
        await renderFrame();
      }
      if (shouldStopRun(run)) break;
      if (existing.size >= nextCheckpointSize) {
        await cachePut(run, key, {
          complete: false,
          poseFrames: state.poseFrames,
          model: run.model,
        });
        while (nextCheckpointSize <= existing.size) nextCheckpointSize *= 2;
      }
      if (shouldStopRun(run)) break;
      setStatus(`端末内AIで姿勢を推定中: ${existing.size} / ${total}F`);
    }
    if (!ownsRun(run)) return;
    if (run.cancelled) {
      state.poseFrames.sort((a, b) => a.frame - b.frame);
      await cachePut(run, key, {
        complete: false,
        poseFrames: state.poseFrames,
        model: run.model,
      });
      if (!ownsRun(run)) return;
      state.analysis = null;
      recordAudit("cancel", { backend: "mediapipe", completed_frames: state.poseFrames.length });
      setStatus(`分析を中止しました。${state.poseFrames.length}Fの中間結果から再開できます`);
      return;
    }
    state.poseFrames.sort((a, b) => a.frame - b.frame);
    state.analysis = global.VideoDigitizerStepCore.analyzePoseSequence(state.poseFrames, analysisOptions({}, run));
    state.analysis.processing = {
      backend: "mediapipe",
      elapsed_sec: (performance.now() - started) / 1000,
      frame_count: state.poseFrames.length,
      source_resolution: { width: run.video.width, height: run.video.height },
    };
    state.analysis.quality.status = state.analysis.metrics.quality_status;
    state.analysis.quality.reasons = state.analysis.metrics.quality_reasons;
    await cachePut(run, key, {
      complete: true,
      poseFrames: state.poseFrames,
      analysis: state.analysis,
      model: run.model,
    });
    if (!ownsRun(run)) return;
    recordAudit("complete", {
      backend: "mediapipe",
      frames: state.poseFrames.length,
      events: state.analysis.events.length,
      elapsed_sec: state.analysis.processing.elapsed_sec,
    });
    setStatus(`AI分析が完了しました: ${state.analysis.events.length}歩 / 要確認箇所を確認してください`);
  }

  async function pollMMPoseJob(id, run) {
    while (ownsRun(run) && !run.cancelled) {
      const response = await fetch(`${state.bridge.apiUrl("step-analysis/job")}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (shouldStopRun(run)) return null;
      if (!response.ok) throw new Error(await response.text());
      const job = await response.json();
      if (shouldStopRun(run)) return null;
      updateProgress(job.current, job.total);
      setStatus(job.message || `標準AIで解析中: ${job.current || 0} / ${job.total || 0}F`);
      if (job.status === "complete") return job.result;
      if (job.status === "failed") throw new Error(job.error || "標準AI分析に失敗しました");
      if (job.status === "cancelled") return null;
      await new Promise((resolve) => global.setTimeout(resolve, 350));
    }
    return null;
  }

  async function runMMPose(run) {
    if (!ownsRun(run)) return;
    const video = run.video;
    const config = run.config;
    const body = {
      start_frame: config.rangeStart,
      end_frame: config.rangeEnd,
      capture_fps: config.captureFps,
      capture_fps_confirmed: config.captureFpsConfirmed,
      playback_fps: Number(video.playbackFps) || 0,
      frame_timestamps: state.bridge.frameTimestamps?.(config.rangeStart, config.rangeEnd) || {},
      direction: config.direction,
      subject: config.subject,
      video_identity: video.videoIdentity,
    };
    const response = await fetch(state.bridge.apiUrl("step-analysis/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (shouldStopRun(run)) return;
    if (!response.ok) throw new Error(await response.text());
    const job = await response.json();
    if (shouldStopRun(run)) return;
    state.jobId = String(job.id || "");
    run.jobId = state.jobId;
    const result = await pollMMPoseJob(state.jobId, run);
    if (!ownsRun(run)) return;
    if (!result) {
      setStatus("標準AI分析を中止しました。保存済み区間から再開できます");
      return;
    }
    state.poseFrames = Array.isArray(result.pose_frames) ? result.pose_frames : [];
    state.analysis = result.analysis || global.VideoDigitizerStepCore.analyzePoseSequence(state.poseFrames, analysisOptions({}, run));
    state.model = result.model || state.capabilities?.mmpose?.model || { id: "rtmdet_rtmpose" };
    state.cacheKey = String(result.cache_key || "");
    state.resumedFromCache = Boolean(result.resumed_from_cache);
    state.analysis = global.VideoDigitizerStepCore.refreshAnalysis(state.analysis, analysisOptions({}, run));
    state.analysis.quality = state.analysis.quality || {};
    state.analysis.quality.status = state.analysis.metrics.quality_status;
    state.analysis.quality.reasons = state.analysis.metrics.quality_reasons;
    recordAudit("complete", { backend: "mmpose", frames: state.poseFrames.length, events: state.analysis.events.length });
    setStatus(`標準AI分析が完了しました: ${state.analysis.events.length}歩 / 要確認箇所を確認してください`);
  }

  async function runAnalysis() {
    if (state.running) return;
    readControls();
    const readiness = analysisReadiness();
    if (!readiness.canAnalyze) {
      updateRunControls();
      setStatus(readiness.message);
      return;
    }
    stopPlayback();
    cancelCropSelection();
    state.selectingSubject = false;
    els.stepOverlayCanvas?.classList.remove("selecting-subject");
    els.stepSelectSubject?.classList.remove("active");
    if (fpsMismatch() && !global.confirm([
      `撮影FPS (${state.captureFps}) と再生FPS (${Number(context().playbackFps).toFixed(3)}) が大きく異なります。`,
      "スーパースロー動画では正常な場合があります。撮影FPSを確認してから続行してください。",
      "この設定で分析を続けますか？",
    ].join("\n\n"))) return;
    const run = beginRun();
    global.VideoDigitizerNative?.setAnalysisRunning?.(true);
    setStatus(state.captureFpsConfirmed
      ? "AIを準備しています…初回は少し時間がかかります。"
      : "AIを準備しています…撮影FPS未確認のため、結果は「要確認」として出力します。");
    renderResults();
    try {
      await refreshCapabilities();
      if (shouldStopRun(run)) return;
      run.config.effectiveBackend = chooseBackend(run);
      state.effectiveBackend = run.config.effectiveBackend;
      state.analysis = null;
      updateProgress(0, run.config.rangeEnd - run.config.rangeStart + 1);
      renderResults();
      recordAudit("start", {
        backend: run.config.effectiveBackend,
        start_frame: run.config.rangeStart,
        end_frame: run.config.rangeEnd,
        capture_fps: run.config.captureFps,
        capture_fps_confirmed: run.config.captureFpsConfirmed,
        crop: run.config.crop,
      });
      if (run.config.effectiveBackend === "mmpose") await runMMPose(run);
      else await runMediaPipe(run);
      if (ownsRun(run)) markDirty();
    } catch (error) {
      if (ownsRun(run)) {
        recordAudit("failed", { backend: run.config.effectiveBackend || run.config.backend, error: String(error?.message || error) });
        setStatus(`AI分析に失敗しました: ${error.message}`);
      }
    } finally {
      if (ownsRun(run)) {
        state.activeRun = null;
        state.running = false;
        state.cancelRequested = false;
        state.jobId = "";
        updateRunControls();
        renderResults();
      }
      if (!state.activeRun) global.VideoDigitizerNative?.setAnalysisRunning?.(false);
      run.resolveCompletion?.();
      run.resolveCompletion = null;
    }
  }

  async function cancelAnalysis() {
    const run = state.activeRun;
    if (!state.running || !ownsRun(run)) return;
    run.cancelled = true;
    state.cancelRequested = true;
    setStatus("安全に中断し、中間結果を保存しています…");
    if (run.cacheKey && run.config?.effectiveBackend === "mediapipe" && state.poseFrames.length) {
      try {
        await cachePut(run, run.cacheKey, {
          complete: false,
          poseFrames: state.poseFrames,
          model: run.model || state.model,
        });
      } catch (_error) {
        // The running loop performs a second checkpoint before it exits.
      }
    }
    if (run.jobId && run.video.sourceMode === "api") {
      try {
        await fetch(state.bridge.apiUrl("step-analysis/cancel"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: run.jobId }),
          cache: "no-store",
        });
      } catch (_error) {
        // The polling loop will observe cancellation or a stopped server.
      }
    }
  }

  function safeBaseName(value) {
    return String(value || "video").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_") || "video";
  }

  function download(text, filename, type) {
    const nativeExport = global.VideoDigitizerNative?.exportText?.({ text, filename, mimeType: type });
    if (nativeExport) return Promise.resolve(nativeExport);
    const blob = new Blob([text], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return Promise.resolve(true);
  }

  async function exportCsv() {
    if (!state.analysis) return;
    const trial = String(state.bridge?.getMetadata?.()?.trial_name || safeBaseName(context().videoName));
    const exported = await download(
      global.VideoDigitizerStepCore.toStepCsv(state.analysis, trial),
      `${safeBaseName(context().videoName)}_steps.csv`,
      "text/csv",
    );
    if (!exported) {
      setStatus("CSVの書き出しをキャンセルしました");
      return;
    }
    recordAudit("export_csv", { steps: state.analysis.steps?.length || 0 });
    setStatus("ステップCSVを書き出しました");
  }

  async function exportJson() {
    if (!state.analysis) return;
    if (state.poseFrames.length === 0) {
      alert("復旧データに姿勢フレームが含まれていません。AI分析を再実行してからJSONを書き出してください。CSVの集計結果は引き続き書き出せます。");
      setStatus("JSON書き出しにはAI分析の再実行が必要です");
      return;
    }
    const exported = await download(
      JSON.stringify(serialize(), null, 2),
      `${safeBaseName(context().videoName)}_step_analysis.json`,
      "application/json",
    );
    if (!exported) {
      setStatus("JSONの書き出しをキャンセルしました");
      return;
    }
    recordAudit("export_json", { frames: state.poseFrames.length, steps: state.analysis.steps?.length || 0 });
    setStatus("ステップ分析JSONを書き出しました");
  }

  function serialize(options = {}) {
    const payload = {
      schema: global.VideoDigitizerStepCore?.SCHEMA || "video_digitizer_step_analysis_v1",
      version: 1,
      updated_at: new Date().toISOString(),
      video_identity: state.videoIdentity || context().videoIdentity || null,
      current_frame: state.frame,
      config: {
        range_start: state.rangeStart,
        range_end: state.rangeEnd,
        trim_start_time: state.trimStartTime,
        trim_end_time: state.trimEndTime,
        crop: state.crop ? { ...state.crop } : null,
        source_width: state.cropSourceSize?.width || Number(context().width) || 0,
        source_height: state.cropSourceSize?.height || Number(context().height) || 0,
        capture_fps: state.captureFps,
        capture_fps_confirmed: state.captureFpsConfirmed,
        playback_fps: Number(context().playbackFps) || 0,
        time_basis: state.captureFpsConfirmed ? "confirmed_capture_fps" : "pts_or_container_fps",
        direction: state.direction,
        requested_backend: state.backend,
        effective_backend: state.effectiveBackend,
        use_digitize_range: state.useDigitizeRange,
      },
      subject: state.subject,
      model: state.model,
      cache_key: state.cacheKey,
      resumed_from_cache: state.resumedFromCache,
      analysis: state.analysis,
      audit_log: state.audit,
    };
    if (!options.compact) payload.pose_frames = state.poseFrames;
    return payload;
  }

  function restore(payload) {
    if (!payload || typeof payload !== "object") {
      resetAnalysisForVideo(context(), false);
      return;
    }
    if (payload.schema && payload.schema !== "video_digitizer_step_analysis_v1") return;
    invalidateActiveRun();
    const config = payload.config || {};
    state.restoredIdentity = payload.video_identity || null;
    state.videoIdentity = payload.video_identity || null;
    state.frame = Math.max(0, Math.round(finite(payload.current_frame) ?? 0));
    state.rangeStart = Math.max(0, Math.round(finite(config.range_start) ?? 0));
    state.rangeEnd = Math.max(state.rangeStart, Math.round(finite(config.range_end) ?? state.rangeStart));
    state.trimStartTime = finite(config.trim_start_time);
    state.trimEndTime = finite(config.trim_end_time);
    // A project may be restored while a different movie is still open. Keep
    // the saved source space until its matching video is selected.
    const cropVideo = context().ready && identityMatches(payload.video_identity, context().videoIdentity)
      ? context() : { width: config.source_width, height: config.source_height };
    state.crop = normalizeCrop(config.crop, cropVideo);
    state.cropSourceSize = state.crop ? { width: Math.floor(Number(cropVideo.width)), height: Math.floor(Number(cropVideo.height)) } : null;
    cancelCropSelection();
    state.useDigitizeRange = !global.VideoDigitizerNative?.isIOSApp && config.use_digitize_range !== false;
    state.captureFps = Math.max(0.001, finite(config.capture_fps) ?? 30);
    state.captureFpsConfirmed = config.capture_fps_confirmed === true;
    state.direction = ["auto", "left_to_right", "right_to_left"].includes(config.direction) ? config.direction : "auto";
    state.backend = ["auto", "mmpose", "mediapipe"].includes(config.requested_backend) ? config.requested_backend : "auto";
    state.effectiveBackend = String(config.effective_backend || "");
    state.subject = payload.subject && finite(payload.subject.x) !== null && finite(payload.subject.y) !== null
      ? { ...payload.subject, x: Number(payload.subject.x), y: Number(payload.subject.y) }
      : null;
    state.model = payload.model && typeof payload.model === "object" ? payload.model : null;
    state.cacheKey = String(payload.cache_key || "");
    state.resumedFromCache = payload.resumed_from_cache === true;
    state.poseFrames = Array.isArray(payload.pose_frames)
      ? payload.pose_frames.slice(0, 2_000_000).map(global.VideoDigitizerStepCore.normalizePoseFrame).filter(Boolean)
      : [];
    state.analysis = payload.analysis && typeof payload.analysis === "object" ? payload.analysis : null;
    if (config.crop && stableStringify(config.crop) !== stableStringify(state.crop)) {
      state.poseFrames = [];
      state.analysis = null;
      state.cacheKey = "";
      state.subject = null;
    }
    state.audit = Array.isArray(payload.audit_log) ? payload.audit_log.slice(-20000) : [];
    normalizeRange();
    writeControls();
    renderResults();
    renderFrame();
  }

  function resetAnalysisForVideo(video, preserveRestored = false) {
    stopPlayback();
    cancelCropSelection();
    invalidateActiveRun();
    state.videoIdentity = video.videoIdentity || null;
    if (!preserveRestored) {
      const iosApp = Boolean(global.VideoDigitizerNative?.isIOSApp);
      if (iosApp) state.useDigitizeRange = false;
      state.frame = iosApp ? 0 : Number(video.trimStart) || 0;
      state.rangeStart = state.frame;
      state.rangeEnd = iosApp
        ? Math.max(0, Number(video.frameCount) - 1)
        : Number(video.trimEnd) || Math.max(0, Number(video.frameCount) - 1);
      state.trimStartTime = null;
      state.trimEndTime = null;
      state.crop = null;
      state.cropSourceSize = null;
      state.captureFps = Number(video.playbackFps) || 30;
      state.captureFpsConfirmed = false;
      state.subject = null;
      state.poseFrames = [];
      state.analysis = null;
      state.model = null;
      state.cacheKey = "";
      state.resumedFromCache = false;
      state.audit = [];
    } else if (stableStringify(state.crop) !== stableStringify(normalizeCrop(state.crop, video))) {
      state.crop = normalizeCrop(state.crop, video);
      state.poseFrames = [];
      state.analysis = null;
      state.cacheKey = "";
      state.subject = null;
    }
    state.cropSourceSize = state.crop ? { width: Number(video.width), height: Number(video.height) } : null;
    state.cancelRequested = false;
    normalizeRange();
    writeControls();
    updateProgress(0, 0);
    renderResults();
    renderFrame();
    refreshCapabilities();
  }

  function onVideoLoaded() {
    const video = context();
    state.videoResetPending = false;
    state.preparation = { phase: "idle", message: "" };
    const preserve = Boolean(state.restoredIdentity && identityMatches(state.restoredIdentity, video.videoIdentity));
    resetAnalysisForVideo(video, preserve);
    state.restoredIdentity = null;
    setStatus(analysisReadiness().message);
  }

  function onVideoReset() {
    stopPlayback();
    cancelCropSelection();
    state.renderSerial += 1;
    state.previewPending = null;
    setPreviewStatus("");
    state.videoResetPending = true;
    state.selectingSubject = false;
    els.stepOverlayCanvas?.classList.remove("selecting-subject");
    els.stepSelectSubject?.classList.remove("active");
    invalidateActiveRun();
    updateRunControls();
  }

  function onVideoPreparation(options = {}) {
    const phase = ["loading", "error"].includes(options.phase) ? options.phase : "idle";
    state.preparation = { phase, message: String(options.message || "") };
    if (phase === "loading") {
      stopPlayback();
      cancelCropSelection();
      invalidateActiveRun();
      state.renderSerial += 1;
      state.previewPending = null;
      setPreviewStatus("");
    } else {
      state.videoResetPending = false;
    }
    updateRunControls();
    setStatus(analysisReadiness().message);
  }

  function useDigitizeRange() {
    const video = context();
    const previous = { start: state.rangeStart, end: state.rangeEnd };
    state.rangeStart = Number(video.trimStart) || 0;
    state.rangeEnd = Number(video.trimEnd) || Math.max(0, Number(video.frameCount) - 1);
    state.trimStartTime = null;
    state.trimEndTime = null;
    state.frame = clamp(state.frame, state.rangeStart, state.rangeEnd);
    if (previous.start !== state.rangeStart || previous.end !== state.rangeEnd) {
      invalidateAnalysis("range_changed", {
        from_start_frame: previous.start,
        from_end_frame: previous.end,
        to_start_frame: state.rangeStart,
        to_end_frame: state.rangeEnd,
        source: "digitize_range",
      });
    } else {
      writeControls();
      renderTimeline();
      renderFrame();
      markDirty();
    }
    setStatus("デジタイズ画面の分析範囲をコピーしました");
  }

  function onDigitizeRangeChanged() {
    if (!global.VideoDigitizerNative?.isIOSApp && state.useDigitizeRange) useDigitizeRange();
  }

  function setActive(active) {
    state.active = Boolean(active);
    if (!state.active) stopPlayback();
    else {
      writeControls();
      renderResults();
      renderFrame();
    }
  }

  async function suspend() {
    stopPlayback();
    const run = state.activeRun;
    if (state.running && run) {
      let timeoutId = 0;
      const timeout = new Promise((resolve) => {
        timeoutId = global.setTimeout(() => resolve(false), 15_000);
      });
      const cancellation = (async () => {
        await cancelAnalysis();
        if (run.completion) await run.completion;
        return true;
      })().catch(() => false);
      const completed = await Promise.race([cancellation, timeout]);
      if (timeoutId) global.clearTimeout(timeoutId);
      return completed === true;
    }
    return true;
  }

  function resume() {
    if (!state.active) return;
    writeControls();
    renderResults();
    renderFrame();
  }

  function bindControls() {
    els.stepUseDigitizeRange?.addEventListener("change", () => {
      state.useDigitizeRange = !global.VideoDigitizerNative?.isIOSApp && els.stepUseDigitizeRange.checked;
      if (state.useDigitizeRange) useDigitizeRange();
      else {
        writeControls();
        markDirty();
        setStatus("ステップ分析専用の範囲を指定できます");
      }
    });
    for (const control of [els.stepRangeStart, els.stepRangeEnd]) {
      control?.addEventListener("change", () => {
        if (!canEditInput()) return;
        const previous = { start: state.rangeStart, end: state.rangeEnd };
        state.trimStartTime = null;
        state.trimEndTime = null;
        readControls();
        if (previous.start !== state.rangeStart || previous.end !== state.rangeEnd) {
          invalidateAnalysis("range_changed", {
            from_start_frame: previous.start,
            from_end_frame: previous.end,
            to_start_frame: state.rangeStart,
            to_end_frame: state.rangeEnd,
            source: "step_controls",
          });
        }
      });
    }
    els.stepCaptureFps?.addEventListener("change", () => {
      const previous = { captureFps: state.captureFps, captureFpsConfirmed: state.captureFpsConfirmed };
      readControls();
      if (previous.captureFps !== state.captureFps) applyTimeBasisChange(previous);
    });
    els.stepFpsConfirmed?.addEventListener("change", () => {
      const previous = { captureFps: state.captureFps, captureFpsConfirmed: state.captureFpsConfirmed };
      readControls();
      if (previous.captureFpsConfirmed !== state.captureFpsConfirmed) applyTimeBasisChange(previous);
      recordAudit("confirm_capture_fps", { fps: state.captureFps, confirmed: state.captureFpsConfirmed });
    });
    els.stepDirection?.addEventListener("change", () => {
      const previous = state.direction;
      readControls();
      if (previous !== state.direction) invalidateAnalysis("direction_changed", { from: previous, to: state.direction });
    });
    els.stepBackend?.addEventListener("change", () => {
      const previous = state.backend;
      readControls();
      if (previous !== state.backend) invalidateAnalysis("backend_changed", { from: previous, to: state.backend });
    });
    els.stepSelectSubject?.addEventListener("click", beginSubjectSelection);
    for (const control of [els.stepTrimStartTime, els.stepTrimEndTime]) {
      control?.addEventListener("focus", stopPlayback);
      control?.addEventListener("change", () => applyTimeTrim(els.stepTrimStartTime.value, els.stepTrimEndTime.value));
    }
    els.stepTrimToCurrentStart?.addEventListener("click", () => applyTimeTrim(playbackTime(state.frame), els.stepTrimEndTime.value));
    els.stepTrimToCurrentEnd?.addEventListener("click", () => applyTimeTrim(els.stepTrimStartTime.value, playbackTime(state.frame)));
    els.stepResetTimeTrim?.addEventListener("click", () => applyTimeTrim(0, playbackDuration()));
    els.stepSelectCrop?.addEventListener("click", beginCropSelection);
    els.stepResetCrop?.addEventListener("click", () => applyCrop(null));
    els.stepOverlayCanvas?.addEventListener("pointerdown", beginCropDrag);
    els.stepOverlayCanvas?.addEventListener("pointermove", moveCropDrag);
    els.stepOverlayCanvas?.addEventListener("pointerup", finishCropDrag);
    for (const type of ["pointercancel", "lostpointercapture"]) {
      els.stepOverlayCanvas?.addEventListener(type, () => {
        if (!state.cropDrag) return;
        cancelCropSelection();
        drawOverlay();
      });
    }
    els.stepOverlayCanvas?.addEventListener("click", selectSubjectFromPointer);
    els.stepRunAnalysis?.addEventListener("click", runAnalysis);
    els.stepCancelAnalysis?.addEventListener("click", cancelAnalysis);
    els.stepClearCache?.addEventListener("click", () => clearBrowserCache().catch((error) => setStatus(error.message)));
    els.stepExportCsv?.addEventListener("click", exportCsv);
    els.stepExportJson?.addEventListener("click", exportJson);
    els.stepPlay?.addEventListener("click", togglePlayback);
    els.stepPrevFrame?.addEventListener("click", () => setFrame(state.frame - 1));
    els.stepNextFrame?.addEventListener("click", () => setFrame(state.frame + 1));
    els.stepFrameSlider?.addEventListener("input", () => setFrame(els.stepFrameSlider.value, { quiet: true }));
    els.stepFrameInput?.addEventListener("change", () => setFrame(els.stepFrameInput.value));
    els.stepAddLeftContact?.addEventListener("click", () => addEvent("left"));
    els.stepAddRightContact?.addEventListener("click", () => addEvent("right"));
  }

  function init(bridge) {
    if (state.initialized) return api;
    if (!global.VideoDigitizerStepCore) throw new Error("ステップ分析コアを読み込めませんでした");
    state.bridge = bridge;
    for (const id of [
      "stepAnalysisView", "stepCanvasStack", "stepFrameCanvas", "stepOverlayCanvas", "stepFrameBadge",
      "stepUseDigitizeRange", "stepRangeStart", "stepRangeEnd", "stepCaptureFps", "stepFpsConfirmed",
      "stepDirection", "stepBackend", "stepBackendStatus", "stepSelectSubject", "stepRunAnalysis",
      "stepCancelAnalysis", "stepClearCache", "stepExportCsv", "stepExportJson", "stepProgress",
      "stepProgressText", "stepStatus", "stepReadinessStatus", "stepPreviewStatus", "stepQualityBadge", "stepQualityReasons", "stepMetricCount",
      "stepMetricCadence", "stepMetricStepTime", "stepMetricStrideTime", "stepMetricStats", "stepEventTableBody",
      "stepAddLeftContact", "stepAddRightContact", "stepPlay", "stepPrevFrame", "stepNextFrame",
      "stepFrameSlider", "stepFrameInput", "stepTimelineTrack",
      "stepTrimControls", "stepTrimStartTime", "stepTrimEndTime", "stepTrimToCurrentStart", "stepTrimToCurrentEnd",
      "stepResetTimeTrim", "stepSelectCrop", "stepResetCrop", "stepCropStatus", "stepTrimStatus",
    ]) els[id] = byId(id);
    bindControls();
    state.initialized = true;
    const video = context();
    state.useDigitizeRange = !global.VideoDigitizerNative?.isIOSApp;
    state.rangeEnd = Math.max(0, Number(video.frameCount || 1) - 1);
    state.captureFps = Number(video.playbackFps) || 30;
    writeControls();
    renderResults();
    refreshCapabilities();
    setStatus(analysisReadiness().message);
    return api;
  }

  const api = {
    init,
    onVideoLoaded,
    onVideoReset,
    onVideoPreparation,
    onDigitizeRangeChanged,
    refreshCapabilities,
    restore,
    serialize,
    setActive,
    setFrame,
    suspend,
    resume,
    get active() { return state.active; },
    get running() { return state.running; },
    get frame() { return state.frame; },
    get readiness() { return analysisReadiness(); },
  };

  global.VideoDigitizerStepAnalysis = api;
})(globalThis);
