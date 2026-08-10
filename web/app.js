const $ = (id) => document.getElementById(id);

const DEFAULT_MARKERS = [
  "右手先",
  "右手",
  "右肘",
  "右肩",
  "左手先",
  "左手",
  "左肘",
  "左肩",
  "右つま先",
  "右足",
  "右踵",
  "右足首",
  "右膝",
  "右股関節",
  "左つま先",
  "左足",
  "左踵",
  "左足首",
  "左膝",
  "左股関節",
  "胸骨上縁",
  "耳珠点",
  "頭頂",
];

const VIDEO_HASH_CHUNK_SIZE = 1024 * 1024;
const PROJECT_SCHEMA = "fps_viewer_web_project_v1";
const AUTOSAVE_KEY = "video_digitizer_autosave_v1";
const PROTOCOL_KEY = "video_digitizer_analysis_protocol_v1";
const SUPPORTED_PROJECT_SCHEMAS = new Set([
  PROJECT_SCHEMA,
  "fps_viewer_web_project_v2",
]);
const METADATA_FIELDS = [
  ["subject_id", "metaSubject"],
  ["trial_name", "metaTrial"],
  ["analyst", "metaAnalyst"],
  ["camera", "metaCamera"],
  ["scale", "metaScale"],
  ["origin", "metaOrigin"],
  ["notes", "metaNotes"],
];
const DEFAULT_CALIBRATION_REAL_POINTS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
const ANGLE_TEMPLATES = {
  right_knee: ["右股関節", "右膝", "右足首"],
  left_knee: ["左股関節", "左膝", "左足首"],
  right_hip: ["右肩", "右股関節", "右膝"],
  left_hip: ["左肩", "左股関節", "左膝"],
  right_elbow: ["右肩", "右肘", "右手"],
  left_elbow: ["左肩", "左肘", "左手"],
  trunk: ["右股関節", "胸骨上縁", "耳珠点"],
};
const SKELETON_SEGMENTS = [
  ["右手先", "右手"], ["右手", "右肘"], ["右肘", "右肩"],
  ["左手先", "左手"], ["左手", "左肘"], ["左肘", "左肩"],
  ["右肩", "胸骨上縁"], ["左肩", "胸骨上縁"],
  ["右肩", "右股関節"], ["左肩", "左股関節"],
  ["右股関節", "左股関節"],
  ["右つま先", "右足"], ["右足", "右踵"], ["右踵", "右足首"], ["右足首", "右膝"], ["右膝", "右股関節"],
  ["左つま先", "左足"], ["左足", "左踵"], ["左踵", "左足首"], ["左足首", "左膝"], ["左膝", "左股関節"],
  ["胸骨上縁", "耳珠点"], ["耳珠点", "頭頂"],
];
const MARKER_TEMPLATES = {
  standard_23: DEFAULT_MARKERS,
  basic_lower: [
    "右つま先", "右足", "右踵", "右足首", "右膝", "右股関節",
    "左つま先", "左足", "左踵", "左足首", "左膝", "左股関節",
    "胸骨上縁",
  ],
  basic_upper: [
    "右手先", "右手", "右肘", "右肩",
    "左手先", "左手", "左肘", "左肩",
    "胸骨上縁", "耳珠点", "頭頂",
  ],
};
const CUSTOM_MARKER_TEMPLATE_KEY = "video_digitizer_custom_marker_template_v1";
const WORKSPACE_PRESET_KEY = "video_digitizer_workspace_preset_v1";
const APP_VERSION = "2.1.0";
const AI_SUGGESTION_VERSION = 1;
const HIGH_ACCURACY_AI_MODEL_ID = "google_deepmind_tapnextpp_512";
const POSE_AI_MODEL = {
  id: "mediapipe_pose_landmarker_lite",
  version: "sha256-59929e1d1ee95287",
  runtime: "mediapipe_tasks_vision_1.0.1",
};
const POSE_MARKER_MAP = {
  "右手先": 20,
  "右手": 16,
  "右肘": 14,
  "右肩": 12,
  "左手先": 19,
  "左手": 15,
  "左肘": 13,
  "左肩": 11,
  "右つま先": 32,
  "右踵": 30,
  "右足首": 28,
  "右膝": 26,
  "右股関節": 24,
  "左つま先": 31,
  "左踵": 29,
  "左足首": 27,
  "左膝": 25,
  "左股関節": 23,
};

function createSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createCloudProjectId() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

const els = {
  frameImage: $("frameImage"),
  openVideoButton: $("openVideoButton"),
  videoFile: $("videoFile"),
  projectFile: $("projectFile"),
  calibrationFile: $("calibrationFile"),
  timestampFile: $("timestampFile"),
  canvas: $("videoCanvas"),
  digitizeTab: $("digitizeTab"),
  analysisTab: $("analysisTab"),
  digitizeWorkspace: $("digitizeWorkspace"),
  digitizeTimeline: $("digitizeTimeline"),
  analysisView: $("analysisView"),
  analysisSummary: $("analysisSummary"),
  fpsInput: $("fpsInput"),
  autoAdvance: $("autoAdvance"),
  advanceMode: $("advanceMode"),
  stepInput: $("stepInput"),
  coordDecimals: $("coordDecimals"),
  zoomToggleButton: $("zoomToggleButton"),
  zoomEnabled: $("zoomEnabled"),
  zoomScale: $("zoomScale"),
  zoomLensSize: $("zoomLensSize"),
  frameQuality: $("frameQuality"),
  cursorGuideMode: $("cursorGuideMode"),
  trailInput: $("trailInput"),
  trailMode: $("trailMode"),
  skeletonEnabled: $("skeletonEnabled"),
  pointSize: $("pointSize"),
  lineWidth: $("lineWidth"),
  manualPointColor: $("manualPointColor"),
  trimStartInput: $("trimStartInput"),
  trimEndInput: $("trimEndInput"),
  setTrimStart: $("setTrimStart"),
  setTrimEnd: $("setTrimEnd"),
  frameSlider: $("frameSlider"),
  prevFrame: $("prevFrame"),
  nextFrame: $("nextFrame"),
  completionInfo: $("completionInfo"),
  prevMissingPoint: $("prevMissingPoint"),
  nextMissingPoint: $("nextMissingPoint"),
  nextActiveMissing: $("nextActiveMissing"),
  nextIncompleteFrame: $("nextIncompleteFrame"),
  videoName: $("videoName"),
  videoInfo: $("videoInfo"),
  resolutionInfo: $("resolutionInfo"),
  videoInfoPanel: $("videoInfoPanel"),
  dirtyMark: $("dirtyMark"),
  frameInfo: $("frameInfo"),
  markerInfo: $("markerInfo"),
  activeMarkerOverlay: $("activeMarkerOverlay"),
  statusText: $("statusText"),
  cursorInfo: $("cursorInfo"),
  pointInfo: $("pointInfo"),
  markerTemplate: $("markerTemplate"),
  applyMarkerTemplate: $("applyMarkerTemplate"),
  saveMarkerTemplate: $("saveMarkerTemplate"),
  markerText: $("markerText"),
  markerButtons: $("markerButtons"),
  markerVisibility: $("markerVisibility"),
  skeletonText: $("skeletonText"),
  applySkeleton: $("applySkeleton"),
  applyMarkers: $("applyMarkers"),
  showAllMarkers: $("showAllMarkers"),
  showActiveMarker: $("showActiveMarker"),
  showRightMarkers: $("showRightMarkers"),
  showLeftMarkers: $("showLeftMarkers"),
  showTrunkMarkers: $("showTrunkMarkers"),
  showUpperMarkers: $("showUpperMarkers"),
  showLowerMarkers: $("showLowerMarkers"),
  saveProject: $("saveProject"),
  saveProjectPackage: $("saveProjectPackage"),
  overwriteProject: $("overwriteProject"),
  exportCsv: $("exportCsv"),
  undoBtn: $("undoBtn"),
  redoBtn: $("redoBtn"),
  shutdownApp: $("shutdownApp"),
  copyPrevPoint: $("copyPrevPoint"),
  pointStatus: $("pointStatus"),
  applyPointStatus: $("applyPointStatus"),
  copyPrevFrame: $("copyPrevFrame"),
  predictPoint: $("predictPoint"),
  trackNextPoint: $("trackNextPoint"),
  trackMarkerRange: $("trackMarkerRange"),
  trackBetweenAnchors: $("trackBetweenAnchors"),
  trackAllBetweenAnchors: $("trackAllBetweenAnchors"),
  trackingEngine: $("trackingEngine"),
  aiTrackingResolution: $("aiTrackingResolution"),
  installAITrackingModel: $("installAITrackingModel"),
  refreshAITrackingStatus: $("refreshAITrackingStatus"),
  aiTrackingStatus: $("aiTrackingStatus"),
  runPoseAI: $("runPoseAI"),
  acceptAISuggestion: $("acceptAISuggestion"),
  acceptAIFrame: $("acceptAIFrame"),
  rejectAISuggestion: $("rejectAISuggestion"),
  nextAISuggestion: $("nextAISuggestion"),
  showAISuggestions: $("showAISuggestions"),
  aiStatus: $("aiStatus"),
  trackingMaxMove: $("trackingMaxMove"),
  trackingDirection: $("trackingDirection"),
  trackingPatchRadius: $("trackingPatchRadius"),
  trackingConfidence: $("trackingConfidence"),
  saveTrackingConstraint: $("saveTrackingConstraint"),
  nextReviewPoint: $("nextReviewPoint"),
  interpolationMethod: $("interpolationMethod"),
  previewInterpolation: $("previewInterpolation"),
  interpMarker: $("interpMarker"),
  interpAll: $("interpAll"),
  clearDerived: $("clearDerived"),
  jobStatus: $("jobStatus"),
  cancelJob: $("cancelJob"),
  table: $("pointTable"),
  calibEnabled: $("calibEnabled"),
  calibOverlayEnabled: $("calibOverlayEnabled"),
  calibUnit: $("calibUnit"),
  calibStatus: $("calibStatus"),
  calibCheckPixelX: $("calibCheckPixelX"),
  calibCheckPixelY: $("calibCheckPixelY"),
  calibCheckRealX: $("calibCheckRealX"),
  calibCheckRealY: $("calibCheckRealY"),
  validateCalibration: $("validateCalibration"),
  calibrationValidation: $("calibrationValidation"),
  lensEnabled: $("lensEnabled"),
  lensFx: $("lensFx"),
  lensFy: $("lensFy"),
  lensCx: $("lensCx"),
  lensCy: $("lensCy"),
  lensK1: $("lensK1"),
  lensK2: $("lensK2"),
  lensP1: $("lensP1"),
  lensP2: $("lensP2"),
  timingStatus: $("timingStatus"),
  axisOriginX: $("axisOriginX"),
  axisOriginY: $("axisOriginY"),
  axisXDirection: $("axisXDirection"),
  axisYDirection: $("axisYDirection"),
  eventName: $("eventName"),
  addEventMarker: $("addEventMarker"),
  exportAnalysisCsv: $("exportAnalysisCsv"),
  eventTableBody: $("eventTableBody"),
  eventIntervalTableBody: $("eventIntervalTableBody"),
  qualityTableBody: $("qualityTableBody"),
  runQualityGate: $("runQualityGate"),
  qualityGateResult: $("qualityGateResult"),
  missingHeatmap: $("missingHeatmap"),
  exportSummaryCsv: $("exportSummaryCsv"),
  exportRealCsv: $("exportRealCsv"),
  exportReportHtml: $("exportReportHtml"),
  saveProtocol: $("saveProtocol"),
  loadProtocol: $("loadProtocol"),
  restoreAutosave: $("restoreAutosave"),
  distanceMarkerA: $("distanceMarkerA"),
  distanceMarkerB: $("distanceMarkerB"),
  distanceResult: $("distanceResult"),
  angleMarkerA: $("angleMarkerA"),
  angleMarkerB: $("angleMarkerB"),
  angleMarkerC: $("angleMarkerC"),
  angleTemplate: $("angleTemplate"),
  angleResult: $("angleResult"),
  kinematicsMarker: $("kinematicsMarker"),
  kinematicsResult: $("kinematicsResult"),
  exportKinematicsCsv: $("exportKinematicsCsv"),
  smoothingMode: $("smoothingMode"),
  smoothingWindow: $("smoothingWindow"),
  analysisPrevFrame: $("analysisPrevFrame"),
  analysisNextFrame: $("analysisNextFrame"),
  analysisFrameSlider: $("analysisFrameSlider"),
  analysisFrameInput: $("analysisFrameInput"),
  analysisUseDigitizeFrame: $("analysisUseDigitizeFrame"),
  analysisStatus: $("analysisStatus"),
  comparisonVideoFile: $("comparisonVideoFile"),
  reliabilityProjectFile: $("reliabilityProjectFile"),
  addTrialSnapshot: $("addTrialSnapshot"),
  comparisonOffset: $("comparisonOffset"),
  comparisonPrimaryImage: $("comparisonPrimaryImage"),
  comparisonSecondaryImage: $("comparisonSecondaryImage"),
  comparisonCaption: $("comparisonCaption"),
  reliabilityResult: $("reliabilityResult"),
  trialList: $("trialList"),
  workspaceSideWidth: $("workspaceSideWidth"),
  workspaceDensity: $("workspaceDensity"),
  shortcutPrev: $("shortcutPrev"),
  shortcutNext: $("shortcutNext"),
  shortcutCopy: $("shortcutCopy"),
  shortcutPredict: $("shortcutPredict"),
  saveWorkspacePreset: $("saveWorkspacePreset"),
  loadWorkspacePreset: $("loadWorkspacePreset"),
  downloadDiagnostics: $("downloadDiagnostics"),
  checkUpdates: $("checkUpdates"),
  appVersion: $("appVersion"),
  appMode: $("appMode"),
  accountMenu: $("accountMenu"),
  accountSummary: $("accountSummary"),
  accountStatus: $("accountStatus"),
  googleSignIn: $("googleSignIn"),
  googleSignOut: $("googleSignOut"),
  restoreAccountCache: $("restoreAccountCache"),
  deleteAccountCache: $("deleteAccountCache"),
  cloudSyncField: $("cloudSyncField"),
  cloudSyncEnabled: $("cloudSyncEnabled"),
  restoreCloudProject: $("restoreCloudProject"),
  finalizeCloudProject: $("finalizeCloudProject"),
  deleteCloudProject: $("deleteCloudProject"),
};
for (const [, id] of METADATA_FIELDS) els[id] = $(id);
for (let index = 1; index <= 4; index += 1) {
  els[`calibRealX${index}`] = $(`calibRealX${index}`);
  els[`calibRealY${index}`] = $(`calibRealY${index}`);
}

const state = {
  videoName: "",
  videoUrl: "",
  fps: 30,
  frame: 0,
  frameCount: 0,
  trailLength: 30,
  trimStart: 0,
  trimEnd: 0,
  markers: DEFAULT_MARKERS.slice(),
  activeMarker: DEFAULT_MARKERS[0],
  hiddenMarkers: new Set(),
  points: {},
  pointFlags: {},
  aiSuggestions: {},
  undo: [],
  redo: [],
  audit: [],
  selected: { frame: null, marker: null },
  tableSelection: null,
  cursor: null,
  drawRect: { x: 0, y: 0, w: 1, h: 1, scale: 1 },
  zoomRect: null,
  dirty: false,
  ready: false,
  frameSource: null,
  sourceMode: new URLSearchParams(window.location.search).get("local") === "1" ? "api" : "browser",
  seeking: false,
  seekSerial: 0,
  frameCacheToken: 0,
  frameCache: new Map(),
  frameRequests: new Map(),
  videoWidth: 0,
  videoHeight: 0,
  pendingTrim: null,
  sessionId: createSessionId(),
  appToken: "",
  pointRevision: 0,
  aiSuggestionRevision: 0,
  aiRuntimeStatus: "未実行",
  aiTrackingCapabilities: null,
  tableSnapshot: "",
  progressSnapshot: "",
  projectFileHandle: null,
  projectFileName: "",
  videoIdentity: null,
  expectedVideoIdentity: null,
  activeView: "digitize",
  analysisFrame: 0,
  analysisEvents: [],
  frameTimestamps: {},
  lens: {
    enabled: false,
    fx: 0, fy: 0, cx: 0, cy: 0,
    k1: 0, k2: 0, p1: 0, p2: 0,
  },
  coordinateSystem: { originX: 0, originY: 0, xDirection: "right", yDirection: "down" },
  comparison: {
    ready: false, metadata: null, identity: null, lastKey: "", source: null,
    primaryObjectUrl: "", secondaryObjectUrl: "", renderSerial: 0,
  },
  studyTrials: [],
  backgroundJob: null,
  account: {
    configured: false,
    enabled: false,
    authenticated: false,
    profile: null,
    lastSavedAt: 0,
  },
  cloud: {
    projectId: createCloudProjectId(),
    generation: "",
    configured: false,
    syncing: false,
    dirty: true,
    lastSyncedAt: 0,
    conflict: false,
  },
  trackingConstraints: {},
  skeletonSegments: SKELETON_SEGMENTS.map((segment) => segment.slice()),
  calibration: {
    fileName: "",
    points: [],
    realPoints: DEFAULT_CALIBRATION_REAL_POINTS.map((point) => ({ ...point })),
    unit: "m",
    enabled: false,
  },
};

function updateZoomToggleButton() {
  const enabled = els.zoomEnabled.checked;
  els.zoomToggleButton.textContent = enabled ? "ズーム ON" : "ズーム OFF";
  els.zoomToggleButton.classList.toggle("active", enabled);
  els.zoomToggleButton.setAttribute("aria-pressed", String(enabled));
}

function zoomScale() {
  return Math.max(2, Math.min(8, Number(els.zoomScale.value) || 4));
}

function zoomLensSize() {
  return Math.max(120, Math.min(360, Math.round(Number(els.zoomLensSize?.value) || 220)));
}

function pointSize() {
  return Math.max(2, Math.min(16, Math.round(Number(els.pointSize?.value) || 6)));
}

function overlayLineWidth() {
  return Math.max(1, Math.min(8, Math.round(Number(els.lineWidth?.value) || 2)));
}

function manualPointColor() {
  return els.manualPointColor?.value || "#d9531e";
}

function frameQuality() {
  return els.frameQuality?.value === "png" ? "png" : "jpeg";
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function usesBrowserFrameSource() {
  return state.sourceMode === "browser";
}

function updateAppMode() {
  if (!els.appMode) return;
  els.appMode.textContent = usesBrowserFrameSource() ? "処理: ブラウザ内" : "処理: ローカルアプリ";
  els.shutdownApp.hidden = usesBrowserFrameSource();
}

function markDirty() {
  state.dirty = true;
  state.cloud.dirty = true;
  updateStatus();
}

function touchPoints() {
  state.pointRevision += 1;
  state.tableSnapshot = "";
  state.progressSnapshot = "";
  markDirty();
}

function touchAISuggestions() {
  state.aiSuggestionRevision += 1;
  markDirty();
}

function recordAudit(action, details = {}) {
  state.audit.push({
    at: new Date().toISOString(),
    action,
    analyst: String(els.metaAnalyst?.value || ""),
    ...details,
  });
  if (state.audit.length > 20000) state.audit.splice(0, state.audit.length - 20000);
}

function cleanDirty() {
  state.dirty = false;
  updateStatus();
}

function isEditableTarget(target) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target?.isContentEditable;
}

function hexFromBuffer(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fileReadHelp(file, label, error) {
  const reason = error?.message ? ` (${error.message})` : "";
  return `${label}を読み込めませんでした${reason}。iCloud Drive、Dropbox、Google Driveなどのクラウド上のファイルは、Finder上で雲アイコンをクリックしてローカルにダウンロードしてから、もう一度選択してください。`;
}

async function readFileBuffer(file, label) {
  try {
    return await file.arrayBuffer();
  } catch (error) {
    throw new Error(fileReadHelp(file, label, error));
  }
}

async function readFileText(file, label) {
  try {
    if (file.text) return await file.text();
    const buffer = await readFileBuffer(file, label);
    return new TextDecoder("utf-8").decode(buffer);
  } catch (error) {
    if (String(error?.message || "").includes("クラウド上のファイル")) throw error;
    throw new Error(fileReadHelp(file, label, error));
  }
}

async function digestVideoFile(file) {
  if (!globalThis.crypto?.subtle) return "";
  const chunks = [file.slice(0, VIDEO_HASH_CHUNK_SIZE)];
  if (file.size > VIDEO_HASH_CHUNK_SIZE) {
    chunks.push(file.slice(Math.max(0, file.size - VIDEO_HASH_CHUNK_SIZE)));
  }
  let buffer;
  try {
    buffer = await new Blob(chunks).arrayBuffer();
  } catch (error) {
    throw new Error(fileReadHelp(file, "動画ファイル", error));
  }
  return hexFromBuffer(await crypto.subtle.digest("SHA-256", buffer));
}

async function digestVideoBuffer(buffer) {
  if (!globalThis.crypto?.subtle || !buffer) return "";
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(await buffer.arrayBuffer());
  const parts = [bytes.slice(0, VIDEO_HASH_CHUNK_SIZE)];
  if (bytes.byteLength > VIDEO_HASH_CHUNK_SIZE) {
    parts.push(bytes.slice(Math.max(0, bytes.byteLength - VIDEO_HASH_CHUNK_SIZE)));
  }
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return hexFromBuffer(await crypto.subtle.digest("SHA-256", combined));
}

async function videoIdentityFromFile(file, metadata = {}) {
  const digest = await digestVideoFile(file);
  return {
    name: String(file.name || ""),
    size: Number(file.size) || 0,
    last_modified: Number(file.lastModified) || 0,
    digest_algorithm: digest ? "sha256:first-last-1mb" : "",
    digest,
    fps: Number(metadata.fps) || 0,
    frame_count: Number(metadata.frame_count) || 0,
    width: Number(metadata.width) || 0,
    height: Number(metadata.height) || 0,
    codec: String(metadata.codec || ""),
  };
}

function videoIdentityFromBuffer(file, buffer, metadata = {}) {
  return digestVideoBuffer(buffer).then((digest) => ({
    name: String(file.name || ""),
    size: Number(file.size) || Number(buffer?.byteLength) || 0,
    last_modified: Number(file.lastModified) || 0,
    digest_algorithm: digest ? "sha256:first-last-1mb" : "",
    digest,
    fps: Number(metadata.fps) || 0,
    frame_count: Number(metadata.frame_count) || 0,
    width: Number(metadata.width) || 0,
    height: Number(metadata.height) || 0,
    codec: String(metadata.codec || ""),
  }));
}

function videoIdentityFromProject(payload, digitize = {}) {
  const video = digitize.video && typeof digitize.video === "object" ? digitize.video : {};
  const identity = video.identity || payload.video_identity || payload.video_fingerprint || {};
  return {
    name: String(identity.name || video.name || payload.video_name || ""),
    size: Number(identity.size) || 0,
    last_modified: Number(identity.last_modified) || 0,
    digest_algorithm: String(identity.digest_algorithm || ""),
    digest: String(identity.digest || ""),
    legacy_digest_algorithm: String(identity.legacy_digest_algorithm || ""),
    legacy_digest: String(identity.legacy_digest || ""),
    fps: Number(identity.fps ?? video.fps ?? payload.fps) || 0,
    frame_count: Number(identity.frame_count ?? video.frame_count) || 0,
    width: Number(identity.width ?? video.width) || 0,
    height: Number(identity.height ?? video.height) || 0,
    codec: String(identity.codec || video.codec || ""),
  };
}

function fpsClose(a, b) {
  if (!a || !b) return true;
  return Math.abs(Number(a) - Number(b)) < 0.01;
}

function videoMismatchReasons(expected, actual) {
  if (!expected || !actual) return [];
  const reasons = [];
  const expectedAlgorithm = String(expected.digest_algorithm || "");
  let comparableActualDigest = "";
  if (expectedAlgorithm && expectedAlgorithm === actual.digest_algorithm) {
    comparableActualDigest = String(actual.digest || "");
  } else if (expectedAlgorithm && expectedAlgorithm === actual.legacy_digest_algorithm) {
    comparableActualDigest = String(actual.legacy_digest || "");
  }
  if (expected.digest && comparableActualDigest && expected.digest !== comparableActualDigest) {
    reasons.push("ファイル指紋");
  }
  if (expected.size && actual.size && expected.size !== actual.size) reasons.push("ファイルサイズ");
  if (expected.frame_count && actual.frame_count && expected.frame_count !== actual.frame_count) reasons.push("フレーム数");
  if (expected.width && actual.width && expected.width !== actual.width) reasons.push("横解像度");
  if (expected.height && actual.height && expected.height !== actual.height) reasons.push("縦解像度");
  if (!fpsClose(expected.fps, actual.fps)) reasons.push("FPS");
  if (!reasons.length && expected.name && actual.name && expected.name !== actual.name && !expected.digest) {
    reasons.push("動画名");
  }
  return reasons;
}

function confirmVideoMismatch(expected, actual, action) {
  const reasons = videoMismatchReasons(expected, actual);
  if (!reasons.length) return true;
  const expectedName = expected?.name || "保存時の動画";
  const actualName = actual?.name || "現在の動画";
  return confirm([
    `プロジェクト保存時の動画と${action}動画が一致しない可能性があります。`,
    "",
    `保存時: ${expectedName}`,
    `現在: ${actualName}`,
    `差分: ${reasons.join("、")}`,
    "",
    "このまま続けますか？",
  ].join("\n"));
}

async function shutdownApp() {
  if (!confirm("VideoDigitizerを終了しますか？\n終了後、このブラウザタブを自動で閉じます。")) return;
  setStatus("アプリを終了しています...");
  try {
    await fetch(`./api/shutdown?${sessionQuery()}`, { method: "POST" });
    state.ready = false;
    setStatus("アプリを終了しました。タブを閉じています...");
    window.setTimeout(() => {
      window.close();
      setStatus("アプリを終了しました。このタブは手動で閉じて大丈夫です。");
    }, 250);
  } catch (error) {
    setStatus(`終了できませんでした: ${error.message}`);
  }
}

function stepSize() {
  return Math.max(1, Math.round(Number(els.stepInput.value) || 1));
}

function coordinateDecimals() {
  return Math.max(0, Math.min(3, Math.round(Number(els.coordDecimals.value) || 0)));
}

function coordinateScale() {
  return 10 ** coordinateDecimals();
}

function normalizeCoordinate(value, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const clamped = Math.max(0, Math.min(max, numeric));
  const scale = coordinateScale();
  return Math.round(clamped * scale) / scale;
}

function formatCoord(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toFixed(coordinateDecimals());
}

function formatPoint(point) {
  return `(${formatCoord(point.x)},${formatCoord(point.y)})`;
}

function isMarkerVisible(marker) {
  return !state.hiddenMarkers.has(marker);
}

function visibleMarkerList() {
  return state.markers.filter((marker) => isMarkerVisible(marker));
}

function hiddenMarkerList() {
  return state.markers.filter((marker) => state.hiddenMarkers.has(marker));
}

function normalizeHiddenMarkers() {
  const markerSet = new Set(state.markers);
  state.hiddenMarkers = new Set([...state.hiddenMarkers].filter((marker) => markerSet.has(marker)));
}

function setMarkerVisible(marker, visible) {
  if (visible) {
    state.hiddenMarkers.delete(marker);
  } else {
    state.hiddenMarkers.add(marker);
  }
  normalizeHiddenMarkers();
  markDirty();
  renderMarkers();
  renderMarkerVisibility();
  draw();
}

function readMetadata() {
  const metadata = {};
  for (const [key, id] of METADATA_FIELDS) {
    metadata[key] = String(els[id]?.value ?? "");
  }
  return metadata;
}

function writeMetadata(metadata = {}) {
  for (const [key, id] of METADATA_FIELDS) {
    if (els[id]) els[id].value = String(metadata[key] ?? "");
  }
}

function metadataValues() {
  const metadata = readMetadata();
  return METADATA_FIELDS.map(([key]) => metadata[key]);
}

function calibrationPointCount() {
  return state.calibration.points.length;
}

function hasCalibrationPoints() {
  return calibrationPointCount() === 4;
}

function readCalibrationRealPoints() {
  const points = [];
  for (let index = 1; index <= 4; index += 1) {
    const x = Number(els[`calibRealX${index}`]?.value);
    const y = Number(els[`calibRealY${index}`]?.value);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    points.push({ x, y });
  }
  return points;
}

function writeCalibrationRealPoints(points = DEFAULT_CALIBRATION_REAL_POINTS) {
  const normalized = normalizeRealCalibrationPoints(points);
  for (let index = 1; index <= 4; index += 1) {
    const point = normalized[index - 1] || DEFAULT_CALIBRATION_REAL_POINTS[index - 1];
    if (els[`calibRealX${index}`]) els[`calibRealX${index}`].value = String(point.x);
    if (els[`calibRealY${index}`]) els[`calibRealY${index}`].value = String(point.y);
  }
}

function normalizeRealCalibrationPoints(points) {
  const source = Array.isArray(points) ? points : [];
  const normalized = [];
  for (let index = 0; index < 4; index += 1) {
    const point = source[index] || DEFAULT_CALIBRATION_REAL_POINTS[index];
    const x = Number(point?.x);
    const y = Number(point?.y);
    normalized.push({
      x: Number.isFinite(x) ? x : DEFAULT_CALIBRATION_REAL_POINTS[index].x,
      y: Number.isFinite(y) ? y : DEFAULT_CALIBRATION_REAL_POINTS[index].y,
    });
  }
  return normalized;
}

function readCalibrationSettings() {
  state.calibration.realPoints = readCalibrationRealPoints();
  state.calibration.unit = String(els.calibUnit?.value || "").trim() || "unit";
  state.calibration.enabled = Boolean(els.calibEnabled?.checked);
}

function writeCalibrationSettings(calibration = {}) {
  state.calibration.realPoints = normalizeRealCalibrationPoints(calibration.realPoints || calibration.real_points);
  state.calibration.unit = String(calibration.unit || "m");
  state.calibration.enabled = Boolean(calibration.enabled);
  if (els.calibEnabled) els.calibEnabled.checked = state.calibration.enabled;
  if (els.calibUnit) els.calibUnit.value = state.calibration.unit;
  writeCalibrationRealPoints(state.calibration.realPoints);
}

function readLensSettings() {
  state.lens = {
    enabled: Boolean(els.lensEnabled?.checked),
    fx: Number(els.lensFx?.value) || 0,
    fy: Number(els.lensFy?.value) || 0,
    cx: Number(els.lensCx?.value) || 0,
    cy: Number(els.lensCy?.value) || 0,
    k1: Number(els.lensK1?.value) || 0,
    k2: Number(els.lensK2?.value) || 0,
    p1: Number(els.lensP1?.value) || 0,
    p2: Number(els.lensP2?.value) || 0,
  };
}

function writeLensSettings(lens = {}) {
  state.lens = {
    enabled: Boolean(lens.enabled),
    fx: Number(lens.fx) || 0,
    fy: Number(lens.fy) || 0,
    cx: Number(lens.cx) || 0,
    cy: Number(lens.cy) || 0,
    k1: Number(lens.k1) || 0,
    k2: Number(lens.k2) || 0,
    p1: Number(lens.p1) || 0,
    p2: Number(lens.p2) || 0,
  };
  for (const [key, element] of [
    ["fx", els.lensFx], ["fy", els.lensFy], ["cx", els.lensCx], ["cy", els.lensCy],
    ["k1", els.lensK1], ["k2", els.lensK2], ["p1", els.lensP1], ["p2", els.lensP2],
  ]) if (element) element.value = String(state.lens[key]);
  if (els.lensEnabled) els.lensEnabled.checked = state.lens.enabled;
}

function lensCorrectPoint(point) {
  if (!point) return null;
  const lens = state.lens;
  if (!lens.enabled || lens.fx <= 0 || lens.fy <= 0) return { x: Number(point.x), y: Number(point.y) };
  const xd = (Number(point.x) - lens.cx) / lens.fx;
  const yd = (Number(point.y) - lens.cy) / lens.fy;
  let xu = xd;
  let yu = yd;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const r2 = xu * xu + yu * yu;
    const radial = 1 + lens.k1 * r2 + lens.k2 * r2 * r2;
    if (Math.abs(radial) < 1e-9) break;
    const deltaX = 2 * lens.p1 * xu * yu + lens.p2 * (r2 + 2 * xu * xu);
    const deltaY = lens.p1 * (r2 + 2 * yu * yu) + 2 * lens.p2 * xu * yu;
    xu = (xd - deltaX) / radial;
    yu = (yd - deltaY) / radial;
  }
  return { x: xu * lens.fx + lens.cx, y: yu * lens.fy + lens.cy };
}

function readCoordinateSystem() {
  state.coordinateSystem = {
    originX: Number(els.axisOriginX?.value) || 0,
    originY: Number(els.axisOriginY?.value) || 0,
    xDirection: els.axisXDirection?.value === "left" ? "left" : "right",
    yDirection: els.axisYDirection?.value === "up" ? "up" : "down",
  };
}

function coordinatePoint(point) {
  if (!point) return null;
  const corrected = lensCorrectPoint(point);
  return {
    x: (corrected.x - state.coordinateSystem.originX) * (state.coordinateSystem.xDirection === "left" ? -1 : 1),
    y: (corrected.y - state.coordinateSystem.originY) * (state.coordinateSystem.yDirection === "up" ? -1 : 1),
  };
}

function calibrationHeaders() {
  return ["calib_p1", "calib_p2", "calib_p3", "calib_p4"];
}

function calibrationCsvValues() {
  return calibrationHeaders().map((_, index) => {
    const point = state.calibration.points[index];
    return point ? `${formatCoord(point.x)},${formatCoord(point.y)}` : "";
  });
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, index) => [...row, vector[index]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    if (pivot !== col) [a[pivot], a[col]] = [a[col], a[pivot]];
    const divisor = a[col][col];
    for (let item = col; item <= n; item += 1) a[col][item] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let item = col; item <= n; item += 1) a[row][item] -= factor * a[col][item];
    }
  }
  return a.map((row) => row[n]);
}

function calibrationTransform() {
  readCalibrationSettings();
  readLensSettings();
  if (!state.calibration.enabled) return null;
  if (!hasCalibrationPoints() || state.calibration.realPoints.length !== 4) return null;
  const matrix = [];
  const vector = [];
  for (let index = 0; index < 4; index += 1) {
    const src = state.calibration.points[index];
    const dst = state.calibration.realPoints[index];
    if (!src || !Number.isFinite(dst?.x) || !Number.isFinite(dst?.y)) return null;
    const corrected = lensCorrectPoint(src);
    const x = Number(corrected.x);
    const y = Number(corrected.y);
    const u = Number(dst.x);
    const v = Number(dst.y);
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  }
  const h = solveLinearSystem(matrix, vector);
  if (!h) return null;
  return {
    unit: state.calibration.unit,
    h: [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1],
  };
}

function transformPoint(point, transform) {
  if (!point || !transform) return null;
  const [h0, h1, h2, h3, h4, h5, h6, h7] = transform.h;
  const corrected = lensCorrectPoint(point);
  const x = Number(corrected.x);
  const y = Number(corrected.y);
  const den = h6 * x + h7 * y + 1;
  if (!Number.isFinite(den) || Math.abs(den) < 1e-12) return null;
  return {
    x: (h0 * x + h1 * y + h2) / den,
    y: (h3 * x + h4 * y + h5) / den,
  };
}

function pointForMeasurement(frame, marker, transform = null) {
  const point = getPoint(frame, marker);
  if (!point) return null;
  return transformPoint(point, transform) || coordinatePoint(point);
}

function smoothingWindowSize() {
  const raw = Math.max(1, Math.min(21, Math.round(Number(els.smoothingWindow?.value) || 1)));
  return raw % 2 === 0 ? raw + 1 : raw;
}

function pointForAnalysis(frame, marker, transform = null) {
  if (els.smoothingMode?.value !== "moving") return pointForMeasurement(frame, marker, transform);
  const windowSize = smoothingWindowSize();
  const half = Math.floor(windowSize / 2);
  const samples = [];
  for (let f = Math.max(state.trimStart, frame - half); f <= Math.min(state.trimEnd, frame + half); f += 1) {
    const sample = pointForMeasurement(f, marker, transform);
    if (sample) samples.push(sample);
  }
  if (!samples.length) return null;
  return {
    x: samples.reduce((sum, sample) => sum + sample.x, 0) / samples.length,
    y: samples.reduce((sum, sample) => sum + sample.y, 0) / samples.length,
  };
}

function distanceBetweenPoints(a, b) {
  if (!a || !b) return null;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function velocityBetweenSamples(a, b) {
  if (!a || !b) return null;
  const dt = frameTimeDelta(a.frame, b.frame);
  if (dt <= 0) return null;
  const vx = (b.x - a.x) / dt;
  const vy = (b.y - a.y) / dt;
  return { vx, vy, speed: Math.hypot(vx, vy), dt };
}

function samplePoint(frame, marker, transform = null) {
  const point = pointForAnalysis(frame, marker, transform);
  return point ? { frame, ...point } : null;
}

function angleABC(a, b, c) {
  if (!a || !b || !c) return null;
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const ab = Math.hypot(abx, aby);
  const cb = Math.hypot(cbx, cby);
  if (ab <= 1e-9 || cb <= 1e-9) return null;
  const cos = Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / (ab * cb)));
  return Math.acos(cos) * 180 / Math.PI;
}

function hasCalibrationTransform() {
  return Boolean(calibrationTransform());
}

function setActiveView(view) {
  state.activeView = view === "analysis" ? "analysis" : "digitize";
  const analysis = state.activeView === "analysis";
  els.digitizeTab.classList.toggle("active", !analysis);
  els.analysisTab.classList.toggle("active", analysis);
  els.digitizeWorkspace.classList.toggle("hidden", analysis);
  els.digitizeTimeline.classList.toggle("hidden", analysis);
  els.analysisView.classList.toggle("hidden", !analysis);
  if (analysis) renderAnalysis();
  draw();
}

function updateStatus() {
  normalizeTrim();
  els.videoName.textContent = state.videoName || "未選択";
  els.dirtyMark.textContent = state.dirty ? " *" : "";
  els.frameInfo.textContent = `フレーム ${state.frame} / ${Math.max(0, state.frameCount - 1)}  範囲 ${state.trimStart}-${state.trimEnd}`;
  const calibrationText = hasCalibrationPoints() ? "4点法 4/4" : `4点法 ${calibrationPointCount()}/4`;
  els.markerInfo.textContent = `マーカー ${state.activeMarker} / ${calibrationText}`;
  if (els.calibStatus) {
    els.calibStatus.textContent = hasCalibrationTransform()
      ? `実長換算: 有効 (${state.calibration.unit})`
      : state.calibration.enabled ? "実長換算: 4点未設定" : "実長換算: 無効";
  }
  els.activeMarkerOverlay.textContent = state.activeMarker || "-";
  els.frameSlider.min = String(state.trimStart);
  els.frameSlider.max = String(state.trimEnd);
  els.frameSlider.value = String(state.frame);
  if (els.analysisFrameSlider) {
    els.analysisFrameSlider.min = String(state.trimStart);
    els.analysisFrameSlider.max = String(state.trimEnd);
    els.analysisFrameSlider.value = String(state.analysisFrame);
  }
  if (els.analysisFrameInput) {
    els.analysisFrameInput.min = String(state.trimStart);
    els.analysisFrameInput.max = String(state.trimEnd);
    els.analysisFrameInput.value = String(state.analysisFrame);
  }
  els.trimStartInput.max = String(Math.max(0, state.frameCount - 1));
  els.trimEndInput.max = String(Math.max(0, state.frameCount - 1));
  els.trimStartInput.value = String(state.trimStart);
  els.trimEndInput.value = String(state.trimEnd);
  els.canvas.classList.toggle("is-seeking", state.seeking);
  updateAIStatus();
  updateVideoInfo();
  updateCompletionInfo();
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function videoDurationText() {
  if (!state.frameCount || !state.fps) return "-";
  const seconds = Math.max(0, (state.frameCount - 1) / Math.max(0.001, state.fps));
  const min = Math.floor(seconds / 60);
  const sec = seconds - min * 60;
  return min > 0 ? `${min}:${sec.toFixed(1).padStart(4, "0")}` : `${sec.toFixed(2)} s`;
}

function videoInfoRows() {
  const identity = state.videoIdentity || {};
  const fingerprint = identity.digest
    ? `${identity.digest.slice(0, 12)}... (${identity.digest_algorithm || "SHA-256"})`
    : "-";
  return [
    ["動画名", state.videoName || "-"],
    ["解像度", state.videoWidth && state.videoHeight ? `${state.videoWidth} x ${state.videoHeight}` : "-"],
    ["FPS", state.fps ? Number(state.fps).toFixed(3) : "-"],
    ["フレーム数", state.frameCount ? `${state.frameCount} (${state.trimStart}-${state.trimEnd})` : "-"],
    ["時間", videoDurationText()],
    ["ファイルサイズ", formatBytes(identity.size)],
    ["コーデック", identity.codec || "-"],
    ["動画指紋", fingerprint],
    ["表示品質", frameQuality() === "png" ? "PNG 高画質" : "JPEG 高速"],
    ["処理方式", usesBrowserFrameSource() ? "ブラウザ内（動画送信なし）" : "ローカルアプリ（AVFoundation）"],
  ];
}

function updateVideoInfo() {
  if (els.videoInfo) {
    els.videoInfo.textContent = state.ready
      ? `動画情報: ${state.videoWidth} x ${state.videoHeight} / ${Number(state.fps || 0).toFixed(3)} fps / ${state.frameCount}F`
      : "動画情報: 未選択";
  }
  if (els.resolutionInfo) {
    els.resolutionInfo.textContent = state.ready
      ? `座標: 元動画解像度基準 (${state.videoWidth} x ${state.videoHeight}) / 表示は画面に合わせて拡大縮小`
      : "座標: 元動画解像度基準";
  }
  if (els.videoInfoPanel) {
    els.videoInfoPanel.replaceChildren();
    for (const [label, value] of videoInfoRows()) {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      els.videoInfoPanel.append(dt, dd);
    }
  }
}

function maxFrameIndex() {
  return Math.max(0, state.frameCount - 1);
}

function normalizeTrim() {
  if (state.frameCount <= 0) {
    state.trimStart = Math.max(0, Math.round(Number(state.trimStart) || 0));
    state.trimEnd = Math.max(state.trimStart, Math.round(Number(state.trimEnd) || state.trimStart));
    state.frame = Math.max(state.trimStart, Math.round(Number(state.frame) || state.trimStart));
    state.analysisFrame = Math.max(state.trimStart, Math.round(Number(state.analysisFrame) || state.trimStart));
    return;
  }
  const maxFrame = maxFrameIndex();
  state.trimStart = Math.max(0, Math.min(maxFrame, Math.round(Number(state.trimStart) || 0)));
  state.trimEnd = Math.max(0, Math.min(maxFrame, Math.round(Number(state.trimEnd) || maxFrame)));
  if (state.trimEnd < state.trimStart) state.trimEnd = state.trimStart;
  state.frame = clampFrame(state.frame);
  state.analysisFrame = clampFrame(state.analysisFrame);
}

function clampFrame(frame) {
  return Math.max(state.trimStart, Math.min(state.trimEnd, Math.round(Number(frame) || 0)));
}

function analysisFrame() {
  normalizeTrim();
  return state.analysisFrame;
}

function setAnalysisFrame(frame, options = {}) {
  state.analysisFrame = clampFrame(frame);
  renderAnalysis();
  if (options.status !== false) setStatus(`分析フレームを ${state.analysisFrame}F にしました`);
}

function frameByStep(frame, direction, size = stepSize()) {
  normalizeTrim();
  const current = clampFrame(frame);
  const step = Math.max(1, Math.round(Number(size) || 1));
  if (direction > 0) {
    const target = current + step;
    if (current < state.trimEnd && target > state.trimEnd) return state.trimEnd;
    return clampFrame(target);
  }
  const target = current - step;
  if (current > state.trimStart && target < state.trimStart) return state.trimStart;
  return clampFrame(target);
}

function setTrim(start, end) {
  state.trimStart = start;
  state.trimEnd = end;
  normalizeTrim();
  state.progressSnapshot = "";
  markDirty();
  seekFrame(state.frame);
  setStatus(`デジタイズ範囲を ${state.trimStart}-${state.trimEnd} にしました`);
}

function trimFrameCount() {
  if (state.frameCount <= 0) return 0;
  return Math.max(0, state.trimEnd - state.trimStart + 1);
}

function isFrameComplete(frame) {
  return state.markers.every((marker) => getPoint(frame, marker) || isResolvedPointStatus(pointStatusAt(frame, marker)));
}

function updateCompletionInfo() {
  if (!els.completionInfo) return;
  const frameTotal = trimFrameCount();
  const markerTotal = state.markers.length;
  const total = frameTotal * markerTotal;
  const key = [
    state.ready,
    state.trimStart,
    state.trimEnd,
    state.pointRevision,
    state.markers.join("\u001f"),
  ].join("\u001e");
  if (state.progressSnapshot === key) return;

  if (!state.ready || total === 0) {
    els.completionInfo.textContent = "入力 0 / 0";
    state.progressSnapshot = key;
    return;
  }

  let filled = 0;
  let completeFrames = 0;
  for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
    let frameFilled = 0;
    for (const marker of state.markers) {
      if (getPoint(frame, marker) || isResolvedPointStatus(pointStatusAt(frame, marker))) frameFilled += 1;
    }
    filled += frameFilled;
    if (frameFilled === markerTotal) completeFrames += 1;
  }

  const percent = Math.round((filled / total) * 100);
  els.completionInfo.textContent = `入力 ${filled} / ${total} (${percent}%) 完了F ${completeFrames}/${frameTotal}`;
  state.progressSnapshot = key;
}

function sourceTag(src, quality = {}) {
  if (src === "manual") return "M";
  if (src === "interp") return "I";
  if (src === "ai") return "A";
  if (src === "track") {
    if (String(quality.note || "").startsWith("tapnextpp")) return "AI-T";
    if (String(quality.note || "").startsWith("anchor_bidirectional")) return "TB";
    if (String(quality.note || "").startsWith("template")) return "T*";
    if (String(quality.note || "").startsWith("hold")) return "T!";
    return "T";
  }
  return "";
}

const POINT_STATUS_LABELS = {
  valid: "通常",
  uncertain: "要確認",
  occluded: "遮蔽",
  out_of_frame: "画面外",
  unidentifiable: "判別不能",
  excluded: "解析除外",
};

function pointStatusAt(frame, marker) {
  return state.pointFlags[String(frame)]?.[marker]?.status || "valid";
}

function pointFlagAt(frame, marker) {
  return state.pointFlags[String(frame)]?.[marker] || null;
}

function isResolvedPointStatus(status) {
  return ["occluded", "out_of_frame", "unidentifiable", "excluded"].includes(status);
}

function setPointFlagValue(frame, marker, value) {
  const key = String(frame);
  if (!value || value.status === "valid") {
    if (state.pointFlags[key]) {
      delete state.pointFlags[key][marker];
      if (Object.keys(state.pointFlags[key]).length === 0) delete state.pointFlags[key];
    }
    return;
  }
  if (!state.pointFlags[key]) state.pointFlags[key] = {};
  state.pointFlags[key][marker] = structuredClone(value);
}

function applySelectedPointStatus() {
  const frame = state.selected.frame ?? state.frame;
  const marker = state.selected.marker ?? state.activeMarker;
  const status = els.pointStatus.value || "valid";
  const prev = pointFlagAt(frame, marker) ? structuredClone(pointFlagAt(frame, marker)) : null;
  const prevPoint = getPoint(frame, marker) ? structuredClone(getPoint(frame, marker)) : null;
  const next = status === "valid" ? null : { status, updated_at: new Date().toISOString() };
  if (isResolvedPointStatus(status) && getPoint(frame, marker)) {
    const key = String(frame);
    delete state.points[key][marker];
    if (Object.keys(state.points[key]).length === 0) delete state.points[key];
  }
  setPointFlagValue(frame, marker, next);
  state.undo.push({
    kind: "compound",
    items: [{
      frame,
      marker,
      prevFlag: prev,
      nextFlag: next,
      prevPoint,
      nextPoint: getPoint(frame, marker) ? structuredClone(getPoint(frame, marker)) : null,
    }],
  });
  state.redo = [];
  recordAudit("set_point_status", { frame, marker, status });
  touchPoints();
  renderAll();
  setStatus(`${frame}F ${marker}: ${POINT_STATUS_LABELS[status] || status}`);
}

function markerColor(point = {}) {
  if (point.src === "ai") return "#087f8c";
  if (point.src === "track" && String(point.quality?.note || "").startsWith("tapnextpp")) return "#006d77";
  if (point.src === "track") return "#22863a";
  if (point.src === "interp") return "#8d4bd6";
  return manualPointColor();
}

function ensureFrame(frame) {
  const key = String(frame);
  if (!state.points[key]) state.points[key] = {};
  return state.points[key];
}

function getPoint(frame, marker) {
  return state.points[String(frame)]?.[marker] ?? null;
}

function getAISuggestion(frame, marker) {
  return state.aiSuggestions[String(frame)]?.[marker] ?? null;
}

function setAISuggestionValue(frame, marker, value) {
  const key = String(frame);
  if (!value) {
    if (!state.aiSuggestions[key]) return;
    delete state.aiSuggestions[key][marker];
    if (Object.keys(state.aiSuggestions[key]).length === 0) delete state.aiSuggestions[key];
    return;
  }
  if (!state.aiSuggestions[key]) state.aiSuggestions[key] = {};
  state.aiSuggestions[key][marker] = structuredClone(value);
}

function pendingAISuggestion(frame, marker) {
  const suggestion = getAISuggestion(frame, marker);
  return suggestion?.status === "pending" ? suggestion : null;
}

function aiSuggestionCounts() {
  const counts = { pending: 0, accepted: 0, rejected: 0 };
  for (const row of Object.values(state.aiSuggestions)) {
    for (const suggestion of Object.values(row || {})) {
      if (suggestion && Object.hasOwn(counts, suggestion.status)) counts[suggestion.status] += 1;
    }
  }
  return counts;
}

function updateAIStatus() {
  if (!els.aiStatus) return;
  const counts = aiSuggestionCounts();
  const current = Object.values(state.aiSuggestions[String(state.frame)] || {})
    .filter((suggestion) => suggestion?.status === "pending").length;
  els.aiStatus.textContent = `AI: ${state.aiRuntimeStatus} / 候補 ${counts.pending} (現在F ${current})`;
  if (els.acceptAISuggestion) els.acceptAISuggestion.disabled = !pendingAISuggestion(state.frame, state.activeMarker);
  if (els.acceptAIFrame) els.acceptAIFrame.disabled = current === 0;
  if (els.rejectAISuggestion) els.rejectAISuggestion.disabled = !pendingAISuggestion(state.frame, state.activeMarker);
  if (els.nextAISuggestion) els.nextAISuggestion.disabled = counts.pending === 0;
}

function setPoint(frame, marker, point, recordUndo = true) {
  const row = ensureFrame(frame);
  const prev = row[marker] ? structuredClone(row[marker]) : null;
  const prevFlag = pointFlagAt(frame, marker) ? structuredClone(pointFlagAt(frame, marker)) : null;
  const next = structuredClone(point);
  if (recordUndo) {
    state.undo.push(prevFlag
      ? {
          kind: "compound",
          items: [{ frame, marker, prevPoint: prev, nextPoint: next, prevFlag, nextFlag: null }],
        }
      : { kind: "points", items: [{ frame, marker, prev, next }] });
    state.redo = [];
  }
  row[marker] = point;
  if (pointStatusAt(frame, marker) !== "valid") setPointFlagValue(frame, marker, null);
  if (recordUndo) recordAudit("set_point", { frame, marker, source: point.src || "" });
  touchPoints();
}

function setPointsBatch(entries) {
  const undoItems = [];
  let hasFlags = false;
  for (const { frame, marker, point, flag = null } of entries) {
    const row = ensureFrame(frame);
    const prev = row[marker] ? structuredClone(row[marker]) : null;
    const prevFlag = pointFlagAt(frame, marker) ? structuredClone(pointFlagAt(frame, marker)) : null;
    const nextFlag = flag ? structuredClone(flag) : null;
    if (prevFlag || nextFlag) hasFlags = true;
    undoItems.push({
      frame,
      marker,
      prev,
      next: structuredClone(point),
      prevPoint: prev,
      nextPoint: structuredClone(point),
      prevFlag,
      nextFlag,
    });
    row[marker] = point;
    setPointFlagValue(frame, marker, nextFlag);
  }
  if (undoItems.length > 0) {
    state.undo.push({ kind: hasFlags ? "compound" : "points", items: undoItems });
    state.redo = [];
    recordAudit("set_points_batch", { count: undoItems.length });
    touchPoints();
  }
}

function deletePoint(frame, marker, recordUndo = true) {
  const key = String(frame);
  const prev = state.points[key]?.[marker] ? structuredClone(state.points[key][marker]) : null;
  if (!prev) return false;
  if (recordUndo) {
    state.undo.push({ kind: "points", items: [{ frame, marker, prev, next: null }] });
    state.redo = [];
  }
  delete state.points[key][marker];
  if (Object.keys(state.points[key]).length === 0) delete state.points[key];
  touchPoints();
  if (recordUndo) recordAudit("delete_point", { frame, marker });
  return true;
}

function applyHistoryItems(item, field) {
  for (const change of item.items || []) {
    if (item.kind === "suggestions") {
      setAISuggestionValue(change.frame, change.marker, change[field]);
      continue;
    }
    if (item.kind === "compound") {
      const suggestionField = `${field}Suggestion`;
      if (Object.hasOwn(change, suggestionField)) {
        setAISuggestionValue(change.frame, change.marker, change[suggestionField]);
      }
      setPointFlagValue(change.frame, change.marker, change[`${field}Flag`]);
      const point = change[`${field}Point`];
      if (point) {
        ensureFrame(change.frame)[change.marker] = structuredClone(point);
      } else {
        const key = String(change.frame);
        if (state.points[key]) {
          delete state.points[key][change.marker];
          if (Object.keys(state.points[key]).length === 0) delete state.points[key];
        }
      }
      continue;
    }
    if (item.kind === "flags") {
      setPointFlagValue(change.frame, change.marker, change[field]);
      continue;
    }
    const value = change[field];
    if (value) {
      ensureFrame(change.frame)[change.marker] = structuredClone(value);
    } else {
      const key = String(change.frame);
      if (!state.points[key]) continue;
      delete state.points[key][change.marker];
      if (Object.keys(state.points[key]).length === 0) delete state.points[key];
    }
  }
}

function undo() {
  const item = state.undo.pop();
  if (!item) {
    setStatus("元に戻す操作はありません");
    return;
  }
  applyHistoryItems(item, "prev");
  state.redo.push(item);
  recordAudit("undo", { kind: item.kind, count: item.items?.length || 0 });
  touchPoints();
  if (item.kind === "suggestions" || item.items?.some((change) => Object.hasOwn(change, "prevSuggestion"))) {
    state.aiSuggestionRevision += 1;
  }
  setStatus("元に戻しました");
  renderAll();
}

function redo() {
  const item = state.redo.pop();
  if (!item) {
    setStatus("やり直す操作はありません");
    return;
  }
  applyHistoryItems(item, "next");
  state.undo.push(item);
  recordAudit("redo", { kind: item.kind, count: item.items?.length || 0 });
  touchPoints();
  if (item.kind === "suggestions" || item.items?.some((change) => Object.hasOwn(change, "nextSuggestion"))) {
    state.aiSuggestionRevision += 1;
  }
  setStatus("やり直しました");
  renderAll();
}

function parseMarkers() {
  const markers = els.markerText.value
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
  if (markers.length === 0) return;
  state.markers = [...new Set(markers)];
  normalizeHiddenMarkers();
  if (!state.markers.includes(state.activeMarker)) state.activeMarker = state.markers[0];
  state.tableSnapshot = "";
  state.progressSnapshot = "";
  markDirty();
  renderMarkers();
  renderMarkerVisibility();
  renderTable();
}

function setMarkerTextAndApply(markers) {
  const unique = [...new Set((markers || []).map((marker) => String(marker).trim()).filter(Boolean))];
  if (unique.length === 0) return;
  els.markerText.value = unique.join("\n");
  parseMarkers();
}

function markerTemplateList(name) {
  if (name === "custom") {
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOM_MARKER_TEMPLATE_KEY) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch (_error) {
      return [];
    }
  }
  return MARKER_TEMPLATES[name] || [];
}

function applyMarkerTemplate() {
  const value = els.markerTemplate.value;
  const markers = markerTemplateList(value);
  if (markers.length === 0) {
    setStatus("読み込むマーカーテンプレートを選んでください");
    return;
  }
  setMarkerTextAndApply(markers);
  setStatus("マーカーテンプレートを読み込みました");
}

function saveCurrentMarkerTemplate() {
  localStorage.setItem(CUSTOM_MARKER_TEMPLATE_KEY, JSON.stringify(state.markers));
  if (![...els.markerTemplate.options].some((option) => option.value === "custom")) {
    const option = document.createElement("option");
    option.value = "custom";
    option.textContent = "保存済み";
    els.markerTemplate.append(option);
  }
  els.markerTemplate.value = "custom";
  setStatus("現在のマーカーセットを保存しました");
}

function skeletonTextFromSegments(segments = state.skeletonSegments) {
  return segments.map(([a, b]) => `${a} -> ${b}`).join("\n");
}

function applySkeletonDefinition() {
  const segments = String(els.skeletonText.value || "")
    .split(/\r?\n/)
    .map((line) => line.split(/\s*(?:->|,|\t)\s*/).map((value) => value.trim()))
    .filter((pair) => pair.length >= 2 && state.markers.includes(pair[0]) && state.markers.includes(pair[1]))
    .map((pair) => pair.slice(0, 2));
  if (!segments.length) {
    setStatus("有効な骨格接続がありません");
    return;
  }
  state.skeletonSegments = segments;
  markDirty();
  draw();
  setStatus(`骨格接続を反映しました: ${segments.length}本`);
}

function workspaceSettings() {
  return {
    side_width: Math.max(280, Math.min(620, Number(els.workspaceSideWidth.value) || 360)),
    density: els.workspaceDensity.value === "compact" ? "compact" : "normal",
    shortcuts: {
      previous: els.shortcutPrev.value || "ArrowLeft",
      next: els.shortcutNext.value || "ArrowRight",
      copy: els.shortcutCopy.value || "c",
      predict: els.shortcutPredict.value || "t",
    },
  };
}

function applyWorkspaceSettings(settings = {}) {
  const shortcuts = settings.shortcuts || {};
  els.workspaceSideWidth.value = String(Math.max(280, Math.min(620, Number(settings.side_width) || 360)));
  els.workspaceDensity.value = settings.density === "compact" ? "compact" : "normal";
  els.shortcutPrev.value = shortcuts.previous || "ArrowLeft";
  els.shortcutNext.value = shortcuts.next || "ArrowRight";
  els.shortcutCopy.value = shortcuts.copy || "c";
  els.shortcutPredict.value = shortcuts.predict || "t";
  document.documentElement.style.setProperty("--side-width", `${els.workspaceSideWidth.value}px`);
  document.body.classList.toggle("compact-ui", els.workspaceDensity.value === "compact");
}

function saveWorkspacePreset() {
  localStorage.setItem(WORKSPACE_PRESET_KEY, JSON.stringify(workspaceSettings()));
  setStatus("操作配置を保存しました");
}

function loadWorkspacePreset() {
  try {
    applyWorkspaceSettings(JSON.parse(localStorage.getItem(WORKSPACE_PRESET_KEY) || "{}"));
    setStatus("操作配置を復元しました");
  } catch (_error) {
    setStatus("保存済みの操作配置を読み込めませんでした");
  }
}

function shortcutMatches(event, configured) {
  const expected = String(configured || "");
  if (!expected) return false;
  return expected.length === 1
    ? event.key.toLowerCase() === expected.toLowerCase()
    : event.key === expected;
}

function markerGroup(marker) {
  const text = String(marker || "");
  const side = text.startsWith("右") ? "right" : text.startsWith("左") ? "left" : "center";
  const upper = /手|肘|肩/.test(text);
  const lower = /つま先|足|踵|足首|膝|股関節/.test(text);
  const trunk = /胸骨|耳珠|頭頂|体幹|骨盤/.test(text);
  return { side, upper, lower, trunk };
}

function showMarkerGroup(predicate, label) {
  state.hiddenMarkers = new Set(state.markers.filter((marker) => !predicate(markerGroup(marker), marker)));
  normalizeHiddenMarkers();
  markDirty();
  renderMarkers();
  renderMarkerVisibility();
  draw();
  setStatus(`${label}のマーカーを表示しました`);
}

function markerIndex(marker = state.activeMarker) {
  const index = state.markers.indexOf(marker);
  return index >= 0 ? index : 0;
}

function selectMarkerAt(index) {
  if (state.markers.length === 0) return;
  const wrapped = (index + state.markers.length) % state.markers.length;
  state.activeMarker = state.markers[wrapped];
  state.selected = { frame: state.frame, marker: state.activeMarker };
}

function moveToMarkerFrame(frame, marker, message) {
  state.activeMarker = marker;
  state.selected = { frame, marker };
  if (frame !== state.frame) {
    seekFrame(frame);
  } else {
    renderAll();
  }
  if (message) setStatus(message);
}

function advanceAfterPoint(recordedFrame, recordedMarker) {
  if (!els.autoAdvance.checked) {
    renderAll();
    return;
  }

  const mode = els.advanceMode.value;
  const index = markerIndex(recordedMarker);
  if (mode === "frame") {
    const nextFrame = frameByStep(recordedFrame, 1);
    if (recordedFrame >= state.trimEnd) {
      state.activeMarker = state.markers[(index + 1) % state.markers.length] || recordedMarker;
      state.selected = { frame: state.trimStart, marker: state.activeMarker };
      seekFrame(state.trimStart);
      renderMarkers();
      setStatus(`${recordedMarker} の最終フレームまで記録しました。${state.activeMarker} の開始フレームへ移動しました`);
      return;
    }
    state.selected = { frame: nextFrame, marker: recordedMarker };
    seekFrame(nextFrame);
    renderMarkers();
    return;
  }

  if (mode === "marker") {
    selectMarkerAt(index + 1);
    renderAll();
    return;
  }

  if (index < state.markers.length - 1) {
    selectMarkerAt(index + 1);
    renderAll();
    return;
  }

  state.activeMarker = state.markers[0] || recordedMarker;
  const nextFrame = frameByStep(recordedFrame, 1);
  state.selected = { frame: nextFrame, marker: state.activeMarker };
  seekFrame(nextFrame);
  renderMarkers();
}

function recordPointAt(pos, options = {}) {
  if (!state.ready || !pos) return;
  if (state.seeking) {
    setStatus("フレーム移動中です");
    return;
  }
  const recordedFrame = state.frame;
  const recordedMarker = state.activeMarker;
  setPoint(recordedFrame, recordedMarker, manualPointFrom({
    ...pos,
    quality: { confidence: 1 },
  }, options.note || "manual"));
  state.selected = { frame: recordedFrame, marker: recordedMarker };
  state.cursor = pos;
  setStatus(`${recordedMarker} を記録しました`);
  if (options.keepFrame) {
    renderAll();
    return;
  }
  advanceAfterPoint(recordedFrame, recordedMarker);
}

function manualPointFrom(point, note) {
  return {
    x: normalizeCoordinate(point.x, state.videoWidth - 1),
    y: normalizeCoordinate(point.y, state.videoHeight - 1),
    src: "manual",
    quality: { ...(point.quality || {}), note },
  };
}

function trackPointFrom(point, note, confidence = 0.6) {
  return {
    x: normalizeCoordinate(point.x, state.videoWidth - 1),
    y: normalizeCoordinate(point.y, state.videoHeight - 1),
    src: "track",
    quality: { ...(point.quality || {}), confidence, note },
  };
}

function findPreviousPoint(marker) {
  for (let frame = state.frame - stepSize(); frame >= state.trimStart; frame -= 1) {
    const point = getPoint(frame, marker);
    if (point) return { frame, point };
  }
  return null;
}

function copyPreviousPoint() {
  if (!state.ready) return;
  const source = findPreviousPoint(state.activeMarker);
  if (!source) {
    setStatus(`${state.activeMarker} の前点が見つかりません`);
    return;
  }
  setPoint(state.frame, state.activeMarker, manualPointFrom(source.point, `copy_from_frame_${source.frame}`));
  state.selected = { frame: state.frame, marker: state.activeMarker };
  setStatus(`${state.activeMarker} を ${source.frame}F からコピーしました`);
  renderAll();
}

function findPreviousFrameWithPoints() {
  for (let frame = state.frame - stepSize(); frame >= state.trimStart; frame -= 1) {
    const row = state.points[String(frame)];
    if (row && state.markers.some((marker) => row[marker])) return frame;
  }
  return null;
}

function copyPreviousFramePoints() {
  if (!state.ready) return;
  const sourceFrame = findPreviousFrameWithPoints();
  if (sourceFrame === null) {
    setStatus("コピーできる前フレームが見つかりません");
    return;
  }
  const entries = [];
  for (const marker of state.markers) {
    const point = getPoint(sourceFrame, marker);
    if (point) {
      entries.push({
        frame: state.frame,
        marker,
        point: manualPointFrom(point, `copy_from_frame_${sourceFrame}`),
      });
    }
  }
  setPointsBatch(entries);
  state.selected = { frame: state.frame, marker: state.activeMarker };
  setStatus(`${entries.length}点を ${sourceFrame}F からコピーしました`);
  renderAll();
}

function previousMarkerSamples(marker, lookback = 10) {
  const samples = [];
  for (let frame = state.frame - 1; frame >= state.trimStart && samples.length < lookback; frame -= 1) {
    const point = getPoint(frame, marker);
    if (point) samples.push({ frame, point });
  }
  return samples.reverse();
}

function linearPredict(samples, frame) {
  if (samples.length === 0) return null;
  if (samples.length === 1) {
    return { x: samples[0].point.x, y: samples[0].point.y, confidence: 0.35, note: `hold_prev_${samples.length}f` };
  }

  const n = samples.length;
  const meanFrame = samples.reduce((sum, sample) => sum + sample.frame, 0) / n;
  const meanX = samples.reduce((sum, sample) => sum + sample.point.x, 0) / n;
  const meanY = samples.reduce((sum, sample) => sum + sample.point.y, 0) / n;
  let den = 0;
  let numX = 0;
  let numY = 0;
  for (const sample of samples) {
    const df = sample.frame - meanFrame;
    den += df * df;
    numX += df * (sample.point.x - meanX);
    numY += df * (sample.point.y - meanY);
  }
  if (den <= 1e-9) return { x: meanX, y: meanY, confidence: 0.4, note: `hold_prev_${n}f` };
  const slopeX = numX / den;
  const slopeY = numY / den;
  const x = meanX + slopeX * (frame - meanFrame);
  const y = meanY + slopeY * (frame - meanFrame);
  return {
    x,
    y,
    confidence: Math.min(0.85, 0.45 + n * 0.04),
    note: `predict_prev_${n}f`,
  };
}

function trackingConstraint(marker = state.activeMarker) {
  const saved = state.trackingConstraints[marker] || {};
  const useCurrent = marker === state.activeMarker;
  return {
    maxMove: Math.max(1, Number(saved.maxMove) || (useCurrent ? Number(els.trackingMaxMove?.value) : 0) || 50),
    direction: ["horizontal", "vertical"].includes(saved.direction)
      ? saved.direction
      : useCurrent && ["horizontal", "vertical"].includes(els.trackingDirection?.value)
        ? els.trackingDirection.value
        : "any",
    patchRadius: Math.max(3, Math.min(24, Math.round(Number(saved.patchRadius) || (useCurrent ? Number(els.trackingPatchRadius?.value) : 0) || 8))),
    confidence: Math.max(0.2, Math.min(0.95, Number(saved.confidence) || (useCurrent ? Number(els.trackingConfidence?.value) : 0) || 0.55)),
  };
}

function saveTrackingConstraint() {
  state.trackingConstraints[state.activeMarker] = {
    maxMove: Math.max(1, Number(els.trackingMaxMove.value) || 50),
    direction: ["horizontal", "vertical"].includes(els.trackingDirection.value) ? els.trackingDirection.value : "any",
    patchRadius: Math.max(3, Math.min(24, Math.round(Number(els.trackingPatchRadius.value) || 8))),
    confidence: Math.max(0.2, Math.min(0.95, Number(els.trackingConfidence.value) || 0.55)),
  };
  markDirty();
  setStatus(`${state.activeMarker} の追跡制約を保存しました`);
}

function currentTrackingOptions(frameDelta = 1) {
  return trackingOptionsForMarker(state.activeMarker, frameDelta);
}

function trackingOptionsForMarker(marker, frameDelta = 1) {
  const constraint = trackingConstraint(marker);
  return {
    ...constraint,
    searchRadius: Math.min(250, Math.ceil(constraint.maxMove * Math.max(1, frameDelta))),
  };
}

function loadProcessingImage(frame) {
  return fetchFrameBlobUrl(frame, state.frameCacheToken).then((url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`${frame}F の画像を読み込めませんでした`));
    image.src = url;
  }));
}

async function trackPointBetweenFrames(sourceFrame, targetFrame, point) {
  if (!globalThis.VideoDigitizerPointTracker?.track) {
    throw new Error("画像追跡モジュールを読み込めませんでした");
  }
  const [sourceImage, targetImage] = await Promise.all([
    loadProcessingImage(sourceFrame),
    loadProcessingImage(targetFrame),
  ]);
  const options = currentTrackingOptions(Math.abs(targetFrame - sourceFrame));
  const result = await globalThis.VideoDigitizerPointTracker.track(sourceImage, targetImage, point, options);
  const move = Math.hypot(result.x - point.x, result.y - point.y);
  const maxMove = options.maxMove * Math.max(1, Math.abs(targetFrame - sourceFrame));
  return { ...result, move, maxMove, threshold: options.confidence };
}

async function trackPointsBetweenFrames(sourceFrame, targetFrame, items) {
  if (!globalThis.VideoDigitizerPointTracker?.trackMany) {
    throw new Error("複数点画像追跡モジュールを読み込めませんでした");
  }
  const [sourceImage, targetImage] = await Promise.all([
    loadProcessingImage(sourceFrame),
    loadProcessingImage(targetFrame),
  ]);
  const frameDelta = Math.abs(targetFrame - sourceFrame);
  const requests = items.map((item) => ({
    point: item.point,
    options: trackingOptionsForMarker(item.marker, frameDelta),
  }));
  const responses = await globalThis.VideoDigitizerPointTracker.trackMany(sourceImage, targetImage, requests);
  return responses.map((response, index) => {
    const item = items[index];
    const options = requests[index].options;
    if (!response?.ok) return { marker: item.marker, ok: false, error: response?.error || "画像追跡に失敗しました" };
    const result = response.result;
    return {
      marker: item.marker,
      ok: true,
      result: {
        ...result,
        move: Math.hypot(result.x - item.point.x, result.y - item.point.y),
        maxMove: options.maxMove * Math.max(1, frameDelta),
        threshold: options.confidence,
      },
    };
  });
}

function trackedPointFromResult(result, sourceFrame) {
  return trackPointFrom({
    x: result.x,
    y: result.y,
    quality: {
      confidence: result.confidence,
      note: "template_zncc_forward_backward",
      track_score: result.score,
      track_error: result.backward_error,
      match_margin: result.score - result.second_score,
      source_frame: sourceFrame,
      patch_radius: result.patch_radius,
      search_radius_x: result.search_radius_x,
      search_radius_y: result.search_radius_y,
      elapsed_ms: result.elapsed_ms,
      method: result.method,
    },
  }, "template_zncc_forward_backward", result.confidence);
}

function trackingFailureReason(result) {
  if (result.move > result.maxMove + 1e-6) return `移動量 ${result.move.toFixed(1)}px が上限を超えました`;
  if (result.backward_error > 4) return `往復誤差 ${result.backward_error.toFixed(2)}px が大きすぎます`;
  if (result.confidence < result.threshold) return `信頼度 ${result.confidence.toFixed(2)} が基準未満です`;
  return "";
}

function trackedPointFlag(result) {
  return result.confidence < Math.max(0.7, result.threshold + 0.1)
    ? { status: "uncertain", updated_at: new Date().toISOString() }
    : null;
}

function findNextManualTrackingAnchor(marker, startFrame) {
  for (let frame = startFrame + 1; frame <= state.trimEnd; frame += 1) {
    const point = getPoint(frame, marker);
    if (point?.src === "manual") return { frame, point };
  }
  return null;
}

function trackingFramesBetween(startFrame, endFrame) {
  const frames = [startFrame];
  const size = stepSize();
  while (frames[frames.length - 1] < endFrame) {
    frames.push(Math.min(endFrame, frames[frames.length - 1] + size));
  }
  return frames;
}

function anchorTrackingFatalReason(result) {
  if (result.move > result.maxMove + 1e-6) return `移動量 ${result.move.toFixed(1)}px が上限を超えました`;
  if (result.backward_error > 8) return `往復誤差 ${result.backward_error.toFixed(2)}px が大きすぎます`;
  if (result.confidence < 0.2) return `信頼度 ${result.confidence.toFixed(2)} が低すぎます`;
  return "";
}

function fuseAnchorTrackingPoint(forward, backward, index, lastIndex, startFrame, endFrame, options = currentTrackingOptions()) {
  const progress = index / lastIndex;
  const forwardWeight = Math.max(0.05, 1 - progress) * Math.max(0.05, forward.confidence);
  const backwardWeight = Math.max(0.05, progress) * Math.max(0.05, backward.confidence);
  const weightTotal = forwardWeight + backwardWeight;
  const disagreement = Math.hypot(forward.x - backward.x, forward.y - backward.y);
  const tolerance = Math.max(2, options.patchRadius * 0.5);
  const agreementConfidence = Math.exp(-disagreement / Math.max(1, tolerance));
  const confidence = Math.max(0, Math.min(1,
    Math.sqrt(forward.confidence * backward.confidence) * (0.55 + 0.45 * agreementConfidence),
  ));
  return trackPointFrom({
    x: (forward.x * forwardWeight + backward.x * backwardWeight) / weightTotal,
    y: (forward.y * forwardWeight + backward.y * backwardWeight) / weightTotal,
    quality: {
      confidence,
      note: "anchor_bidirectional_zncc",
      track_score: Math.min(forward.score, backward.score),
      track_error: Math.max(forward.backward_error, backward.backward_error),
      track_disagreement: disagreement,
      forward_confidence: forward.confidence,
      backward_confidence: backward.confidence,
      start_anchor_frame: startFrame,
      end_anchor_frame: endFrame,
      method: "anchor_bidirectional_zncc_v1",
    },
  }, "anchor_bidirectional_zncc", confidence);
}

function batchAnchorCandidates(startFrame) {
  const candidates = [];
  for (const marker of state.markers) {
    const startPoint = getPoint(startFrame, marker);
    if (startPoint?.src !== "manual") continue;
    const endAnchor = findNextManualTrackingAnchor(marker, startFrame);
    if (!endAnchor || trackingFramesBetween(startFrame, endAnchor.frame).length <= 2) continue;
    candidates.push({ marker, startPoint, endAnchor });
  }
  return candidates;
}

async function trackAnchorCandidateGroup(candidates, startFrame, job, groupIndex, groupTotal) {
  const endFrame = candidates[0].endAnchor.frame;
  const frames = trackingFramesBetween(startFrame, endFrame);
  const candidateByMarker = new Map(candidates.map((candidate) => [candidate.marker, candidate]));
  const forward = new Map(candidates.map((candidate) => [
    candidate.marker,
    new Map([[startFrame, { x: candidate.startPoint.x, y: candidate.startPoint.y, confidence: 1 }]]),
  ]));
  const backward = new Map(candidates.map((candidate) => [
    candidate.marker,
    new Map([[endFrame, { x: candidate.endAnchor.point.x, y: candidate.endAnchor.point.y, confidence: 1 }]]),
  ]));
  const failures = new Map();
  let activeMarkers = new Set(candidates.map((candidate) => candidate.marker));

  for (let index = 1; index < frames.length && activeMarkers.size && !job.cancelled; index += 1) {
    els.jobStatus.textContent = `処理: ${groupIndex}/${groupTotal}区間 順方向 ${index}/${frames.length - 1} / ${activeMarkers.size}点`;
    const items = [...activeMarkers].map((marker) => ({
      marker,
      point: forward.get(marker).get(frames[index - 1]),
    }));
    const outcomes = await trackPointsBetweenFrames(frames[index - 1], frames[index], items);
    for (const outcome of outcomes) {
      if (!outcome.ok) {
        failures.set(outcome.marker, outcome.error);
        activeMarkers.delete(outcome.marker);
        continue;
      }
      const failure = anchorTrackingFatalReason(outcome.result);
      if (failure) {
        failures.set(outcome.marker, failure);
        activeMarkers.delete(outcome.marker);
        continue;
      }
      forward.get(outcome.marker).set(frames[index], outcome.result);
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  activeMarkers = new Set([...activeMarkers].filter((marker) => forward.get(marker).has(endFrame)));
  for (let index = frames.length - 2; index >= 0 && activeMarkers.size && !job.cancelled; index -= 1) {
    els.jobStatus.textContent = `処理: ${groupIndex}/${groupTotal}区間 逆方向 ${frames.length - 1 - index}/${frames.length - 1} / ${activeMarkers.size}点`;
    const items = [...activeMarkers].map((marker) => ({
      marker,
      point: backward.get(marker).get(frames[index + 1]),
    }));
    const outcomes = await trackPointsBetweenFrames(frames[index + 1], frames[index], items);
    for (const outcome of outcomes) {
      if (!outcome.ok) {
        failures.set(outcome.marker, outcome.error);
        activeMarkers.delete(outcome.marker);
        continue;
      }
      const failure = anchorTrackingFatalReason(outcome.result);
      if (failure) {
        failures.set(outcome.marker, failure);
        activeMarkers.delete(outcome.marker);
        continue;
      }
      backward.get(outcome.marker).set(frames[index], outcome.result);
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  const entries = [];
  const completedMarkers = [];
  let uncertainCount = 0;
  for (const marker of activeMarkers) {
    if (!backward.get(marker).has(startFrame)) continue;
    completedMarkers.push(marker);
    const options = trackingOptionsForMarker(marker);
    for (let index = 1; index < frames.length - 1; index += 1) {
      const frame = frames[index];
      if (getPoint(frame, marker)) continue;
      const tracked = fuseAnchorTrackingPoint(
        forward.get(marker).get(frame), backward.get(marker).get(frame),
        index, frames.length - 1, startFrame, endFrame, options,
      );
      const uncertain = tracked.quality.track_disagreement > Math.max(3, options.patchRadius * 0.75)
        || tracked.quality.confidence < Math.max(0.7, options.confidence + 0.1);
      if (uncertain) uncertainCount += 1;
      entries.push({
        frame,
        marker,
        point: tracked,
        flag: uncertain ? { status: "uncertain", updated_at: new Date().toISOString() } : null,
      });
    }
  }
  for (const marker of candidateByMarker.keys()) {
    if (!completedMarkers.includes(marker) && !failures.has(marker)) failures.set(marker, "追跡区間を完走できませんでした");
  }
  return { entries, completedMarkers, failures, uncertainCount, endFrame };
}

async function trackAllMarkersBetweenManualAnchors() {
  if (!state.ready || state.seeking) {
    setStatus(state.seeking ? "フレーム移動が終わってから追跡してください" : "先に動画を開いてください");
    return;
  }
  const startFrame = state.frame;
  const candidates = batchAnchorCandidates(startFrame);
  if (!candidates.length) {
    setStatus(`${startFrame}F と後方フレームに対応する手入力アンカーがありません`);
    return;
  }
  const groups = new Map();
  for (const candidate of candidates) {
    const key = candidate.endAnchor.frame;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  const job = beginBackgroundJob(`${candidates.length}点を両方向追跡`);
  if (!job) {
    setStatus("別の処理が実行中です");
    return;
  }
  const entries = [];
  const completedMarkers = [];
  const failures = new Map();
  let uncertainCount = 0;
  let applied = false;
  try {
    let groupIndex = 0;
    for (const group of groups.values()) {
      if (job.cancelled) break;
      groupIndex += 1;
      const result = await trackAnchorCandidateGroup(group, startFrame, job, groupIndex, groups.size);
      entries.push(...result.entries);
      completedMarkers.push(...result.completedMarkers);
      uncertainCount += result.uncertainCount;
      for (const [marker, reason] of result.failures) failures.set(marker, reason);
    }
    if (entries.length) {
      setPointsBatch(entries);
      applied = true;
    }
    recordAudit("track_all_between_manual_anchors", {
      start_frame: startFrame,
      candidate_count: candidates.length,
      completed_markers: completedMarkers,
      generated_count: entries.length,
      uncertain_count: uncertainCount,
      failures: Object.fromEntries(failures),
      cancelled: job.cancelled,
      method: "anchor_bidirectional_zncc_batch_v1",
    });
    if (entries.length) {
      const first = entries[0];
      state.activeMarker = first.marker;
      state.selected = { frame: first.frame, marker: first.marker };
      seekFrame(first.frame);
      renderAll();
    }
    const message = job.cancelled
      ? `全点追跡を中止しました / 完了 ${completedMarkers.length}点 / 生成 ${entries.length}点`
      : `全点追跡完了 ${completedMarkers.length}/${candidates.length}点 / 生成 ${entries.length}点 / 要確認 ${uncertainCount}点 / 失敗 ${failures.size}点`;
    finishBackgroundJob(job, message);
  } catch (error) {
    if (entries.length && !applied) setPointsBatch(entries);
    finishBackgroundJob(job, `全点追跡に失敗しました: ${error.message} / ${entries.length}点を保持`);
  }
}

async function trackActiveMarkerBetweenManualAnchors() {
  if (!state.ready || state.seeking) {
    setStatus(state.seeking ? "フレーム移動が終わってから追跡してください" : "先に動画を開いてください");
    return;
  }
  const marker = state.activeMarker;
  const startFrame = state.frame;
  const startPoint = getPoint(startFrame, marker);
  if (startPoint?.src !== "manual") {
    setStatus(`${startFrame}F の ${marker} に手入力点が必要です`);
    return;
  }
  const endAnchor = findNextManualTrackingAnchor(marker, startFrame);
  if (!endAnchor) {
    setStatus(`${marker} の後方に手入力点がありません`);
    return;
  }
  const frames = trackingFramesBetween(startFrame, endAnchor.frame);
  if (frames.length <= 2) {
    setStatus("2つの手入力点の間に追跡対象フレームがありません");
    return;
  }
  const job = beginBackgroundJob(`${marker} を両方向追跡`);
  if (!job) {
    setStatus("別の処理が実行中です");
    return;
  }

  const forward = new Map([[startFrame, { x: startPoint.x, y: startPoint.y, confidence: 1 }]]);
  const backward = new Map([[endAnchor.frame, { x: endAnchor.point.x, y: endAnchor.point.y, confidence: 1 }]]);
  let failure = "";
  try {
    let point = startPoint;
    for (let index = 1; index < frames.length && !job.cancelled; index += 1) {
      els.jobStatus.textContent = `処理: 順方向 ${index}/${frames.length - 1}`;
      const result = await trackPointBetweenFrames(frames[index - 1], frames[index], point);
      failure = anchorTrackingFatalReason(result);
      if (failure) break;
      forward.set(frames[index], result);
      point = result;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    point = endAnchor.point;
    for (let index = frames.length - 2; index >= 0 && !job.cancelled && !failure; index -= 1) {
      els.jobStatus.textContent = `処理: 逆方向 ${frames.length - 1 - index}/${frames.length - 1}`;
      const result = await trackPointBetweenFrames(frames[index + 1], frames[index], point);
      failure = anchorTrackingFatalReason(result);
      if (failure) break;
      backward.set(frames[index], result);
      point = result;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    if (job.cancelled || failure) {
      finishBackgroundJob(job, job.cancelled ? "両方向追跡を中止しました" : `両方向追跡を採用しませんでした: ${failure}`);
      return;
    }

    const entries = [];
    let uncertainCount = 0;
    const options = currentTrackingOptions();
    for (let index = 1; index < frames.length - 1; index += 1) {
      const frame = frames[index];
      if (getPoint(frame, marker)) continue;
      const tracked = fuseAnchorTrackingPoint(
        forward.get(frame), backward.get(frame), index, frames.length - 1, startFrame, endAnchor.frame,
      );
      const disagreement = tracked.quality.track_disagreement;
      const uncertain = disagreement > Math.max(3, options.patchRadius * 0.75)
        || tracked.quality.confidence < Math.max(0.7, options.confidence + 0.1);
      if (uncertain) uncertainCount += 1;
      entries.push({
        frame,
        marker,
        point: tracked,
        flag: uncertain ? { status: "uncertain", updated_at: new Date().toISOString() } : null,
      });
    }
    if (!entries.length) {
      finishBackgroundJob(job, "手入力点の間は既に入力済みです");
      return;
    }
    setPointsBatch(entries);
    recordAudit("track_between_manual_anchors", {
      marker,
      start_frame: startFrame,
      end_frame: endAnchor.frame,
      count: entries.length,
      uncertain_count: uncertainCount,
      method: "anchor_bidirectional_zncc_v1",
    });
    const targetFrame = entries[0].frame;
    state.selected = { frame: targetFrame, marker };
    seekFrame(targetFrame);
    renderAll();
    finishBackgroundJob(job, `${marker} を ${startFrame}F-${endAnchor.frame}F で両方向追跡しました / 要確認 ${uncertainCount}点`);
  } catch (error) {
    finishBackgroundJob(job, `両方向追跡に失敗しました: ${error.message}`);
  }
}

async function trackActivePointToNextFrame() {
  if (!state.ready || state.seeking) {
    setStatus(state.seeking ? "フレーム移動が終わってから追跡してください" : "先に動画を開いてください");
    return;
  }
  const sourceFrame = state.frame;
  const targetFrame = frameByStep(sourceFrame, 1);
  if (targetFrame <= sourceFrame) {
    setStatus("デジタイズ範囲の最終フレームです");
    return;
  }
  const marker = state.activeMarker;
  const point = getPoint(sourceFrame, marker);
  if (!point) {
    setStatus(`${sourceFrame}F の ${marker} を先に入力してください`);
    return;
  }
  if (getPoint(targetFrame, marker)) {
    moveToMarkerFrame(targetFrame, marker, `${targetFrame}F には既に点があります`);
    return;
  }
  const job = beginBackgroundJob(`${marker} ${sourceFrame}F→${targetFrame}F`);
  if (!job) {
    setStatus("別の処理が実行中です");
    return;
  }
  try {
    const result = await trackPointBetweenFrames(sourceFrame, targetFrame, point);
    const failure = trackingFailureReason(result);
    if (failure) {
      finishBackgroundJob(job, `画像追跡を採用しませんでした: ${failure}`);
      return;
    }
    setPointsBatch([{ frame: targetFrame, marker, point: trackedPointFromResult(result, sourceFrame), flag: trackedPointFlag(result) }]);
    recordAudit("track_point_image", { source_frame: sourceFrame, target_frame: targetFrame, marker, ...result });
    state.activeMarker = marker;
    state.selected = { frame: targetFrame, marker };
    seekFrame(targetFrame);
    renderAll();
    finishBackgroundJob(job, `${marker} を ${targetFrame}F へ追跡しました / 信頼度 ${result.confidence.toFixed(2)}`);
  } catch (error) {
    finishBackgroundJob(job, `画像追跡に失敗しました: ${error.message}`);
  }
}

async function trackActiveMarkerToRangeEnd() {
  if (!state.ready || state.seeking) {
    setStatus(state.seeking ? "フレーム移動が終わってから追跡してください" : "先に動画を開いてください");
    return;
  }
  const marker = state.activeMarker;
  let sourceFrame = state.frame;
  let sourcePoint = getPoint(sourceFrame, marker);
  if (!sourcePoint) {
    setStatus(`${sourceFrame}F の ${marker} を先に入力してください`);
    return;
  }
  const job = beginBackgroundJob(`${marker} を範囲追跡`);
  if (!job) {
    setStatus("別の処理が実行中です");
    return;
  }
  const entries = [];
  let lastFrame = sourceFrame;
  let stoppedReason = "";
  try {
    while (!job.cancelled && sourceFrame < state.trimEnd) {
      const targetFrame = frameByStep(sourceFrame, 1);
      if (targetFrame <= sourceFrame) break;
      const anchor = getPoint(targetFrame, marker);
      if (anchor) {
        sourceFrame = targetFrame;
        sourcePoint = anchor;
        lastFrame = targetFrame;
        continue;
      }
      els.jobStatus.textContent = `処理: ${marker} ${sourceFrame}F→${targetFrame}F / ${entries.length}点`;
      const result = await trackPointBetweenFrames(sourceFrame, targetFrame, sourcePoint);
      stoppedReason = trackingFailureReason(result);
      if (stoppedReason) break;
      const point = trackedPointFromResult(result, sourceFrame);
      entries.push({ frame: targetFrame, marker, point, flag: trackedPointFlag(result) });
      sourceFrame = targetFrame;
      sourcePoint = point;
      lastFrame = targetFrame;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (entries.length) {
      setPointsBatch(entries);
      recordAudit("track_marker_range_image", {
        marker,
        start_frame: state.frame,
        end_frame: lastFrame,
        count: entries.length,
        cancelled: job.cancelled,
        stopped_reason: stoppedReason,
      });
      state.selected = { frame: lastFrame, marker };
      seekFrame(lastFrame);
      renderAll();
    }
    const message = job.cancelled
      ? `画像追跡を中止しました: ${entries.length}点`
      : stoppedReason
        ? `画像追跡は ${lastFrame}F で停止: ${stoppedReason} / ${entries.length}点を保持`
        : `${marker} を ${lastFrame}F まで画像追跡しました: ${entries.length}点`;
    finishBackgroundJob(job, message);
  } catch (error) {
    if (entries.length) {
      setPointsBatch(entries);
      state.selected = { frame: lastFrame, marker };
      seekFrame(lastFrame);
      renderAll();
    }
    finishBackgroundJob(job, `画像追跡は ${lastFrame}F で停止しました: ${error.message} / ${entries.length}点を保持`);
  }
}

function predictCurrentPointFromPreviousFrames() {
  if (!state.ready) return;
  const samples = previousMarkerSamples(state.activeMarker, 10);
  if (samples.length === 0) {
    setStatus(`${state.activeMarker} の線形予測に使える前フレーム点がありません`);
    return;
  }
  const predicted = linearPredict(samples, state.frame);
  if (!predicted) {
    setStatus(`${state.activeMarker} を線形予測できませんでした`);
    return;
  }
  const last = samples[samples.length - 1];
  const constraint = trackingConstraint(state.activeMarker);
  if (constraint.direction === "horizontal") predicted.y = last.point.y;
  if (constraint.direction === "vertical") predicted.x = last.point.x;
  const perFrameMove = Math.hypot(predicted.x - last.point.x, predicted.y - last.point.y)
    / Math.max(1, state.frame - last.frame);
  const maxMove = constraint.maxMove;
  setPoint(state.frame, state.activeMarker, trackPointFrom(predicted, predicted.note, predicted.confidence));
  if (perFrameMove > maxMove) {
    setPointFlagValue(state.frame, state.activeMarker, { status: "uncertain", updated_at: new Date().toISOString() });
    recordAudit("tracking_constraint_warning", { frame: state.frame, marker: state.activeMarker, per_frame_move: perFrameMove, max_move: maxMove });
  }
  state.selected = { frame: state.frame, marker: state.activeMarker };
  setStatus(perFrameMove > maxMove
    ? `${state.activeMarker} の線形予測移動量が上限を超えたため要確認にしました`
    : `${state.activeMarker} を前${samples.length}点から線形予測しました。必要なら矢印キーで微修正できます`);
  renderAll();
}

function aiPointFromSuggestion(suggestion) {
  return {
    x: normalizeCoordinate(suggestion.x, state.videoWidth - 1),
    y: normalizeCoordinate(suggestion.y, state.videoHeight - 1),
    src: "ai",
    quality: {
      confidence: Number(suggestion.confidence) || 0,
      note: "ai_accepted",
      model_id: suggestion.model_id,
      model_version: suggestion.model_version,
      runtime: suggestion.runtime,
      suggestion_id: suggestion.id,
      landmark_index: suggestion.landmark_index,
      generated_at: suggestion.generated_at,
      accepted_at: new Date().toISOString(),
    },
  };
}

function acceptAISuggestions(entries, label) {
  const changes = [];
  let lowConfidence = 0;
  for (const { frame, marker, suggestion } of entries) {
    if (!suggestion || suggestion.status !== "pending") continue;
    const prevPoint = getPoint(frame, marker) ? structuredClone(getPoint(frame, marker)) : null;
    const prevFlag = pointFlagAt(frame, marker) ? structuredClone(pointFlagAt(frame, marker)) : null;
    const prevSuggestion = structuredClone(suggestion);
    const nextPoint = aiPointFromSuggestion(suggestion);
    const nextSuggestion = {
      ...suggestion,
      status: "accepted",
      accepted_at: nextPoint.quality.accepted_at,
    };
    const nextFlag = nextPoint.quality.confidence < 0.65
      ? { status: "uncertain", updated_at: new Date().toISOString() }
      : null;
    if (nextFlag) lowConfidence += 1;
    ensureFrame(frame)[marker] = nextPoint;
    setPointFlagValue(frame, marker, nextFlag);
    setAISuggestionValue(frame, marker, nextSuggestion);
    changes.push({
      frame,
      marker,
      prevPoint,
      nextPoint,
      prevFlag,
      nextFlag,
      prevSuggestion,
      nextSuggestion,
    });
  }
  if (changes.length === 0) {
    setStatus("採用できるAI候補がありません");
    return 0;
  }
  state.undo.push({ kind: "compound", items: changes });
  state.redo = [];
  state.aiSuggestionRevision += 1;
  recordAudit("accept_ai_suggestions", {
    count: changes.length,
    low_confidence: lowConfidence,
    model_id: POSE_AI_MODEL.id,
  });
  touchPoints();
  state.selected = { frame: changes[0].frame, marker: changes[0].marker };
  setStatus(`${label}: ${changes.length}点を採用${lowConfidence ? ` / 要確認 ${lowConfidence}点` : ""}`);
  renderAll();
  return changes.length;
}

function acceptCurrentAISuggestion() {
  const suggestion = pendingAISuggestion(state.frame, state.activeMarker);
  acceptAISuggestions([{ frame: state.frame, marker: state.activeMarker, suggestion }], `${state.activeMarker}`);
}

function acceptCurrentFrameAISuggestions() {
  const entries = state.markers.map((marker) => ({
    frame: state.frame,
    marker,
    suggestion: pendingAISuggestion(state.frame, marker),
  }));
  acceptAISuggestions(entries, `${state.frame}F`);
}

function rejectCurrentAISuggestion() {
  const suggestion = pendingAISuggestion(state.frame, state.activeMarker);
  if (!suggestion) {
    setStatus(`${state.activeMarker} に未確定のAI候補はありません`);
    return;
  }
  const next = { ...suggestion, status: "rejected", rejected_at: new Date().toISOString() };
  state.undo.push({
    kind: "suggestions",
    items: [{ frame: state.frame, marker: state.activeMarker, prev: suggestion, next }],
  });
  state.redo = [];
  setAISuggestionValue(state.frame, state.activeMarker, next);
  recordAudit("reject_ai_suggestion", {
    frame: state.frame,
    marker: state.activeMarker,
    suggestion_id: suggestion.id,
  });
  touchAISuggestions();
  setStatus(`${state.activeMarker} のAI候補を却下しました`);
  renderAll();
}

function pendingAISuggestionLocations() {
  const locations = [];
  for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
    for (let markerIndexValue = 0; markerIndexValue < state.markers.length; markerIndexValue += 1) {
      const marker = state.markers[markerIndexValue];
      if (pendingAISuggestion(frame, marker)) locations.push({ frame, marker, markerIndexValue });
    }
  }
  return locations;
}

function jumpToNextAISuggestion() {
  const locations = pendingAISuggestionLocations();
  if (locations.length === 0) {
    setStatus("未確認のAI候補はありません");
    return;
  }
  const activeIndex = Math.max(0, markerIndex(state.activeMarker));
  const next = locations.find((item) => item.frame > state.frame
    || (item.frame === state.frame && item.markerIndexValue > activeIndex)) || locations[0];
  state.activeMarker = next.marker;
  state.selected = { frame: next.frame, marker: next.marker };
  seekFrame(next.frame);
  renderAll();
  setStatus(`${next.frame}F ${next.marker}: AI候補を表示しました`);
}

function createPoseAISuggestion(frame, marker, landmarkIndex, landmark) {
  const visibility = Number.isFinite(Number(landmark.visibility)) ? Number(landmark.visibility) : 1;
  const presence = Number.isFinite(Number(landmark.presence)) ? Number(landmark.presence) : 1;
  return {
    schema_version: AI_SUGGESTION_VERSION,
    id: createSessionId(),
    frame,
    marker,
    x: normalizeCoordinate(Number(landmark.x) * (state.videoWidth - 1), state.videoWidth - 1),
    y: normalizeCoordinate(Number(landmark.y) * (state.videoHeight - 1), state.videoHeight - 1),
    confidence: Math.max(0, Math.min(1, Math.min(visibility, presence))),
    visibility,
    presence,
    status: "pending",
    model_id: POSE_AI_MODEL.id,
    model_version: POSE_AI_MODEL.version,
    runtime: POSE_AI_MODEL.runtime,
    landmark_index: landmarkIndex,
    generated_at: new Date().toISOString(),
  };
}

async function runPoseAIForCurrentFrame() {
  if (!state.ready || state.seeking) {
    setStatus(state.seeking ? "フレーム移動が終わってからAIを実行してください" : "先に動画を開いてください");
    return;
  }
  if (!globalThis.VideoDigitizerAI?.estimatePose) {
    setStatus("AI実行モジュールを読み込めませんでした");
    return;
  }
  els.runPoseAI.disabled = true;
  state.aiRuntimeStatus = "モデル準備中";
  updateAIStatus();
  setStatus("端末内でAI姿勢候補を計算しています");
  try {
    const result = await globalThis.VideoDigitizerAI.estimatePose(els.frameImage);
    const landmarks = Array.isArray(result.landmarks) ? result.landmarks : [];
    let count = 0;
    for (const [marker, landmarkIndex] of Object.entries(POSE_MARKER_MAP)) {
      if (!state.markers.includes(marker) || getPoint(state.frame, marker)) continue;
      const landmark = landmarks[landmarkIndex];
      if (!landmark || !Number.isFinite(Number(landmark.x)) || !Number.isFinite(Number(landmark.y))) continue;
      const suggestion = createPoseAISuggestion(state.frame, marker, landmarkIndex, landmark);
      if (suggestion.confidence < 0.35) continue;
      setAISuggestionValue(state.frame, marker, suggestion);
      count += 1;
    }
    state.aiRuntimeStatus = `完了 ${Math.round(Number(result.inference_ms) || 0)}ms`;
    recordAudit("generate_pose_ai_suggestions", {
      frame: state.frame,
      count,
      model_id: POSE_AI_MODEL.id,
      inference_ms: Number(result.inference_ms) || 0,
    });
    touchAISuggestions();
    setStatus(count
      ? `${state.frame}F にAI候補を ${count}点生成しました`
      : "人物または対応する未入力マーカーを検出できませんでした");
  } catch (error) {
    state.aiRuntimeStatus = "エラー";
    setStatus(`AI候補を生成できませんでした: ${error.message}`);
  } finally {
    els.runPoseAI.disabled = false;
    renderAll();
  }
}

function aiTrackingApiUrl(path, params = {}) {
  const query = new URLSearchParams(sessionQuery());
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  return `./api/ai-tracking/${path}?${query.toString()}`;
}

async function apiErrorMessage(response) {
  const text = (await response.text()).trim();
  const match = text.match(/<p>Message: ([^<]+)<\/p>/i);
  return match?.[1] || text || `HTTP ${response.status}`;
}

function updateAITrackingControls() {
  const capabilities = state.aiTrackingCapabilities;
  const localApp = state.sourceMode === "api";
  const runtimeAvailable = Boolean(capabilities?.runtime_available);
  const model = capabilities?.model;
  const modelReady = Boolean(runtimeAvailable && model?.valid);
  if (!localApp) {
    els.aiTrackingStatus.textContent = "高精度AI: Macアプリ版で利用できます";
  } else if (!capabilities) {
    els.aiTrackingStatus.textContent = "高精度AI: 状態を確認できません";
  } else if (!runtimeAvailable) {
    els.aiTrackingStatus.textContent = "高精度AI: このアプリにはAI実行環境が含まれていません";
  } else if (!modelReady) {
    const downloaded = Number(model?.size || 0) / (1024 ** 3);
    els.aiTrackingStatus.textContent = downloaded > 0
      ? `高精度AI: モデル未完了 ${downloaded.toFixed(2)} / 2.36GB`
      : "高精度AI: モデル未導入 (初回のみ約2.53GBをダウンロード)";
  } else {
    els.aiTrackingStatus.textContent = `高精度AI: 利用可能 / ${capabilities.engine?.name || "TAPNext++"} / 遮蔽・再検出対応`;
  }
  els.installAITrackingModel.disabled = !localApp || !runtimeAvailable || modelReady;
  els.refreshAITrackingStatus.disabled = !localApp;
  els.aiTrackingResolution.disabled = !modelReady;
  const highAccuracy = els.trackingEngine.value === "tapnextpp";
  els.trackMarkerRange.textContent = highAccuracy ? "範囲を高精度AI追跡" : "範囲を画像追跡";
  els.trackBetweenAnchors.textContent = highAccuracy ? "次の手入力点まで高精度AI追跡" : "次の手入力点まで両方向追跡";
  els.trackAllBetweenAnchors.textContent = highAccuracy ? "現在Fの全点を高精度AI追跡" : "現在Fの全点を両方向追跡";
  const highAccuracyUnavailable = highAccuracy && !modelReady;
  els.trackMarkerRange.disabled = highAccuracyUnavailable;
  els.trackBetweenAnchors.disabled = highAccuracyUnavailable;
  els.trackAllBetweenAnchors.disabled = highAccuracyUnavailable;
}

async function refreshAITrackingCapabilities() {
  if (state.sourceMode !== "api") {
    state.aiTrackingCapabilities = null;
    updateAITrackingControls();
    return null;
  }
  try {
    const response = await fetch(aiTrackingApiUrl("capabilities"), { cache: "no-store" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    state.aiTrackingCapabilities = await response.json();
  } catch (_error) {
    state.aiTrackingCapabilities = null;
  }
  updateAITrackingControls();
  return state.aiTrackingCapabilities;
}

async function cancelServerAIJob(jobId) {
  if (!jobId) return;
  await fetch(aiTrackingApiUrl("cancel"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: jobId }),
  }).catch(() => {});
}

async function waitForServerAIJob(job, jobId) {
  let cancellationSent = false;
  while (true) {
    if (job.cancelled && !cancellationSent) {
      cancellationSent = true;
      await cancelServerAIJob(jobId);
    }
    const response = await fetch(aiTrackingApiUrl("job", { id: jobId }), { cache: "no-store" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    const status = await response.json();
    if (["complete", "failed", "cancelled"].includes(status.status)) return status;
    if (status.kind === "model_download") {
      const percent = status.total > 0 ? Math.floor(status.current / status.total * 100) : 0;
      els.jobStatus.textContent = status.phase === "verify"
        ? "処理: AIモデルを検証中"
        : `処理: AIモデル導入 ${percent}%`;
    } else if (status.phase === "loading") {
      els.jobStatus.textContent = "処理: 高精度AIモデルを読み込み中";
    } else {
      const phase = String(status.phase || "tracking").startsWith("backward") ? "逆方向" : "順方向";
      els.jobStatus.textContent = `処理: 高精度AI ${phase} ${status.current || 0}/${status.total || 0}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

async function installAITrackingModel() {
  const capabilities = await refreshAITrackingCapabilities();
  if (!capabilities?.runtime_available) {
    setStatus("このアプリでは高精度AI実行環境を利用できません");
    return;
  }
  if (capabilities.model?.valid) {
    setStatus("高精度AIモデルは導入済みです");
    return;
  }
  if (!confirm([
    "高精度AI追跡モデルを端末へ導入します。",
    "",
    "ダウンロード: 約2.53GB",
    "保存先: このMac内のVideoDigitizer用モデル領域",
    "通常の動画や座標データは外部へ送信しません。",
    "",
    "続けますか？",
  ].join("\n"))) return;
  const job = beginBackgroundJob("AIモデル導入");
  if (!job) {
    setStatus("別の処理が実行中です");
    return;
  }
  try {
    const response = await fetch(aiTrackingApiUrl("model/download"), { method: "POST" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    const started = await response.json();
    job.serverJobId = started.id;
    const completed = await waitForServerAIJob(job, started.id);
    await refreshAITrackingCapabilities();
    if (completed.status === "failed") throw new Error(completed.error || "モデルを導入できませんでした");
    finishBackgroundJob(job, completed.status === "cancelled" ? "AIモデル導入を中止しました" : "高精度AIモデルを導入しました");
  } catch (error) {
    finishBackgroundJob(job, `高精度AIモデルを導入できませんでした: ${error.message}`);
  }
}

function highAccuracyTrackingRequest(mode) {
  const startFrame = state.frame;
  const queries = [];
  let endFrame = state.trimEnd;
  if (mode === "all_anchors") {
    const candidates = batchAnchorCandidates(startFrame);
    for (const candidate of candidates) {
      queries.push({
        marker: candidate.marker,
        x: candidate.startPoint.x,
        y: candidate.startPoint.y,
        end_anchor: {
          frame: candidate.endAnchor.frame,
          x: candidate.endAnchor.point.x,
          y: candidate.endAnchor.point.y,
        },
      });
    }
    endFrame = queries.length ? Math.max(...queries.map((item) => item.end_anchor.frame)) : startFrame;
  } else {
    const point = getPoint(startFrame, state.activeMarker);
    if (!point) return { error: `${startFrame}F の ${state.activeMarker} に開始点が必要です` };
    const query = { marker: state.activeMarker, x: point.x, y: point.y };
    if (mode === "single_anchor") {
      if (point.src !== "manual") return { error: `${startFrame}F の ${state.activeMarker} に手入力点が必要です` };
      const anchor = findNextManualTrackingAnchor(state.activeMarker, startFrame);
      if (!anchor) return { error: `${state.activeMarker} の後方に手入力点がありません` };
      query.end_anchor = { frame: anchor.frame, x: anchor.point.x, y: anchor.point.y };
      endFrame = anchor.frame;
    }
    queries.push(query);
  }
  if (!queries.length) return { error: "現在フレームと後方フレームに対応する手入力アンカーがありません" };
  if (endFrame <= startFrame) return { error: "追跡できる後方フレームがありません" };
  return {
    start_frame: startFrame,
    end_frame: endFrame,
    step: stepSize(),
    input_resolution: Number(els.aiTrackingResolution.value) === 512 ? 512 : 256,
    support_points: queries.length > 12 ? 64 : 32,
    confidence_threshold: Math.max(0.2, Math.min(0.95, Number(els.trackingConfidence.value) || 0.55)),
    disagreement_threshold: Math.max(6, Number(els.trackingPatchRadius.value) * 1.5),
    queries,
  };
}

function applyHighAccuracyTrackingResults(payload) {
  const sorted = (payload.results || []).slice().sort((a, b) => a.frame - b.frame || markerIndex(a.marker) - markerIndex(b.marker));
  const undoItems = [];
  const lastOccluded = new Map();
  let applied = 0;
  let occluded = 0;
  let uncertain = 0;
  for (const result of sorted) {
    const frame = clampFrame(Number(result.frame));
    const marker = String(result.marker || "");
    if (!state.markers.includes(marker) || getPoint(frame, marker)?.src === "manual") continue;
    const prevPoint = getPoint(frame, marker) ? structuredClone(getPoint(frame, marker)) : null;
    const prevFlag = pointFlagAt(frame, marker) ? structuredClone(pointFlagAt(frame, marker)) : null;
    const wasOccluded = lastOccluded.get(marker) === true;
    const isOccluded = Boolean(result.occluded);
    lastOccluded.set(marker, isOccluded);
    let nextPoint = null;
    let nextFlag = null;
    if (isOccluded) {
      occluded += 1;
      nextFlag = {
        status: "occluded",
        confidence: Number(result.confidence) || 0,
        model_id: payload.model_id,
        model_version: payload.model_version,
        updated_at: new Date().toISOString(),
      };
    } else {
      const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
      const disagreement = Number.isFinite(Number(result.disagreement)) ? Number(result.disagreement) : null;
      nextPoint = {
        x: normalizeCoordinate(Number(result.x), state.videoWidth - 1),
        y: normalizeCoordinate(Number(result.y), state.videoHeight - 1),
        src: "track",
        quality: {
          confidence,
          note: payload.method,
          method: payload.method,
          model_id: payload.model_id,
          model_version: payload.model_version,
          device: payload.device,
          input_resolution: payload.input_resolution,
          visible: true,
          redetected: wasOccluded,
          track_disagreement: disagreement,
          forward_confidence: Number(result.forward_confidence ?? confidence),
          backward_confidence: Number(result.backward_confidence ?? confidence),
        },
      };
      if (result.uncertain) {
        uncertain += 1;
        nextFlag = {
          status: "uncertain",
          model_id: payload.model_id,
          model_version: payload.model_version,
          updated_at: new Date().toISOString(),
        };
      }
    }
    undoItems.push({ frame, marker, prevPoint, nextPoint, prevFlag, nextFlag });
    if (nextPoint) ensureFrame(frame)[marker] = nextPoint;
    else if (state.points[String(frame)]) {
      delete state.points[String(frame)][marker];
      if (Object.keys(state.points[String(frame)]).length === 0) delete state.points[String(frame)];
    }
    setPointFlagValue(frame, marker, nextFlag);
    applied += 1;
  }
  if (undoItems.length) {
    state.undo.push({ kind: "compound", items: undoItems });
    state.redo = [];
    touchPoints();
  }
  return { applied, occluded, uncertain };
}

async function runHighAccuracyTracking(mode) {
  if (!state.ready || state.seeking) {
    setStatus(state.seeking ? "フレーム移動が終わってからAI追跡してください" : "先に動画を開いてください");
    return;
  }
  const capabilities = await refreshAITrackingCapabilities();
  if (!capabilities?.runtime_available) {
    setStatus("高精度AI追跡はMacアプリ版で利用できます");
    return;
  }
  if (!capabilities.model?.valid) {
    setStatus("先に「AIモデルを導入」を実行してください");
    return;
  }
  const request = highAccuracyTrackingRequest(mode);
  if (request.error) {
    setStatus(request.error);
    return;
  }
  if (request.input_resolution === 512 && !confirm("精細512pxは高精度ですが、標準256pxより時間とメモリを多く使います。続けますか？")) return;
  const job = beginBackgroundJob(`高精度AI追跡 ${request.queries.length}点`);
  if (!job) {
    setStatus("別の処理が実行中です");
    return;
  }
  try {
    const response = await fetch(aiTrackingApiUrl("start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    const started = await response.json();
    job.serverJobId = started.id;
    const completed = await waitForServerAIJob(job, started.id);
    if (completed.status === "cancelled") {
      finishBackgroundJob(job, "高精度AI追跡を中止しました");
      return;
    }
    if (completed.status !== "complete") throw new Error(completed.error || "高精度AI追跡に失敗しました");
    const summary = applyHighAccuracyTrackingResults(completed.result);
    recordAudit("tapnextpp_tracking", {
      mode,
      start_frame: request.start_frame,
      end_frame: request.end_frame,
      marker_count: request.queries.length,
      applied_count: summary.applied,
      uncertain_count: summary.uncertain,
      occluded_count: summary.occluded,
      model_id: completed.result.model_id,
      model_version: completed.result.model_version,
      input_resolution: completed.result.input_resolution,
      device: completed.result.device,
    });
    renderAll();
    finishBackgroundJob(job, `高精度AI追跡完了: ${summary.applied}件 / 要確認 ${summary.uncertain}件 / 遮蔽 ${summary.occluded}件`);
  } catch (error) {
    finishBackgroundJob(job, `高精度AI追跡に失敗しました: ${error.message}`);
  }
}

function runMarkerRangeTracking() {
  if (els.trackingEngine.value === "tapnextpp") runHighAccuracyTracking("single_range");
  else trackActiveMarkerToRangeEnd();
}

function runBetweenAnchorTracking() {
  if (els.trackingEngine.value === "tapnextpp") runHighAccuracyTracking("single_anchor");
  else trackActiveMarkerBetweenManualAnchors();
}

function runAllBetweenAnchorTracking() {
  if (els.trackingEngine.value === "tapnextpp") runHighAccuracyTracking("all_anchors");
  else trackAllMarkersBetweenManualAnchors();
}

function nudgeActivePoint(dx, dy) {
  if (!state.ready) return false;
  const point = getPoint(state.frame, state.activeMarker);
  if (!point) {
    setStatus(`${state.activeMarker} は現在フレームにありません`);
    return false;
  }
  const next = manualPointFrom({
    ...point,
    x: point.x + dx,
    y: point.y + dy,
  }, "manual_nudge");
  if (next.x === point.x && next.y === point.y) return true;
  setPoint(state.frame, state.activeMarker, next);
  state.selected = { frame: state.frame, marker: state.activeMarker };
  setStatus(`${state.activeMarker} を ${formatPoint(next)} に移動しました`);
  renderAll();
  return true;
}

function findMissingPoint(direction) {
  const frameTotal = trimFrameCount();
  const markerTotal = state.markers.length;
  const total = frameTotal * markerTotal;
  if (!state.ready || total === 0) return null;

  const selectedFrame = state.selected.frame ?? state.frame;
  const frameOffset = Math.max(0, Math.min(frameTotal - 1, selectedFrame - state.trimStart));
  const start = frameOffset * markerTotal + markerIndex(state.selected.marker ?? state.activeMarker);

  for (let offset = 1; offset <= total; offset += 1) {
    const raw = (start + direction * offset + total) % total;
    const frame = state.trimStart + Math.floor(raw / markerTotal);
    const marker = state.markers[raw % markerTotal];
    if (!getPoint(frame, marker)) return { frame, marker };
  }
  return null;
}

function jumpToMissingPoint(direction) {
  const target = findMissingPoint(direction);
  if (!target) {
    setStatus("欠測点はありません");
    return;
  }
  moveToMarkerFrame(target.frame, target.marker, `${target.frame}F ${target.marker} の欠測へ移動しました`);
}

function jumpToActiveMarkerMissing() {
  if (!state.ready) return;
  const marker = state.activeMarker;
  const frameTotal = trimFrameCount();
  const start = Math.max(0, Math.min(frameTotal - 1, state.frame - state.trimStart));
  for (let offset = 1; offset <= frameTotal; offset += 1) {
    const frame = state.trimStart + ((start + offset) % frameTotal);
    if (!getPoint(frame, marker)) {
      moveToMarkerFrame(frame, marker, `${frame}F ${marker} の欠測へ移動しました`);
      return;
    }
  }
  setStatus(`${marker} の欠測はありません`);
}

function findIncompleteFrame(direction) {
  const frameTotal = trimFrameCount();
  if (!state.ready || frameTotal === 0) return null;
  const start = Math.max(0, Math.min(frameTotal - 1, state.frame - state.trimStart));
  for (let offset = 1; offset <= frameTotal; offset += 1) {
    const frame = state.trimStart + ((start + direction * offset + frameTotal) % frameTotal);
    if (!isFrameComplete(frame)) return frame;
  }
  return null;
}

function jumpToIncompleteFrame() {
  const frame = findIncompleteFrame(1);
  if (frame === null) {
    setStatus("未完了フレームはありません");
    return;
  }
  const marker = state.markers.find((item) => !getPoint(frame, item)) || state.activeMarker;
  moveToMarkerFrame(frame, marker, `${frame}F の未完了点へ移動しました`);
}

function renderMarkers() {
  els.markerButtons.replaceChildren();
  normalizeHiddenMarkers();
  for (const marker of state.markers) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = marker;
    btn.className = [
      marker === state.activeMarker ? "active" : "",
      isMarkerVisible(marker) ? "" : "is-hidden",
    ].filter(Boolean).join(" ");
    btn.addEventListener("click", () => {
      state.activeMarker = marker;
      updateStatus();
      renderMarkers();
      renderMarkerVisibility();
      draw();
    });
    els.markerButtons.append(btn);
  }
}

function renderMarkerVisibility() {
  els.markerVisibility.replaceChildren();
  normalizeHiddenMarkers();
  for (const marker of state.markers) {
    const label = document.createElement("label");
    label.className = "visibility-chip";
    if (marker === state.activeMarker) label.classList.add("active");

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = isMarkerVisible(marker);
    input.addEventListener("change", () => {
      setMarkerVisible(marker, input.checked);
      setStatus(input.checked ? `${marker} を表示しました` : `${marker} を非表示にしました`);
    });

    const text = document.createElement("span");
    text.textContent = marker;
    label.append(input, text);
    els.markerVisibility.append(label);
  }
}

function selectValueOrFallback(select, preferred, fallback) {
  if (!select) return;
  const values = [...select.options].map((option) => option.value);
  select.value = values.includes(preferred) ? preferred : fallback || values[0] || "";
}

function renderAnalysisControls() {
  const selects = [
    els.distanceMarkerA,
    els.distanceMarkerB,
    els.angleMarkerA,
    els.angleMarkerB,
    els.angleMarkerC,
    els.kinematicsMarker,
  ];
  const previous = new Map(selects.map((select) => [select, select?.value || ""]));
  for (const select of selects) {
    if (!select) continue;
    select.replaceChildren();
    for (const marker of state.markers) {
      const option = document.createElement("option");
      option.value = marker;
      option.textContent = marker;
      select.append(option);
    }
  }
  selectValueOrFallback(els.distanceMarkerA, previous.get(els.distanceMarkerA), state.markers[0]);
  selectValueOrFallback(els.distanceMarkerB, previous.get(els.distanceMarkerB), state.markers[1] || state.markers[0]);
  selectValueOrFallback(els.angleMarkerA, previous.get(els.angleMarkerA), state.markers[12] || state.markers[0]);
  selectValueOrFallback(els.angleMarkerB, previous.get(els.angleMarkerB), state.markers[13] || state.markers[1] || state.markers[0]);
  selectValueOrFallback(els.angleMarkerC, previous.get(els.angleMarkerC), state.markers[14] || state.markers[2] || state.markers[0]);
  selectValueOrFallback(els.kinematicsMarker, previous.get(els.kinematicsMarker), state.activeMarker || state.markers[0]);
}

function addCurrentFrameEvent() {
  normalizeTrim();
  const name = String(els.eventName.value || "").trim() || "イベント";
  const frame = analysisFrame();
  const event = {
    id: createSessionId(),
    name,
    frame,
    time_sec: Number(frameToTime(frame).toFixed(6)),
  };
  state.analysisEvents.push(event);
  state.analysisEvents.sort((a, b) => a.frame - b.frame || a.name.localeCompare(b.name));
  markDirty();
  renderAnalysis();
  setStatus(`${name} を分析 ${frame}F に追加しました`);
}

function removeAnalysisEvent(id) {
  const before = state.analysisEvents.length;
  state.analysisEvents = state.analysisEvents.filter((event) => event.id !== id);
  if (state.analysisEvents.length !== before) {
    markDirty();
    renderAnalysis();
  }
}

function renderAnalysisEvents() {
  if (!els.eventTableBody) return;
  els.eventTableBody.replaceChildren();
  const events = analysisEventsWithTiming();
  for (const event of events) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = event.name;
    const frame = document.createElement("td");
    frame.textContent = String(event.frame);
    const time = document.createElement("td");
    time.textContent = Number(event.time_sec ?? frameToTime(event.frame)).toFixed(3);
    const delta = document.createElement("td");
    delta.textContent = event.delta_time_sec === null ? "-" : event.delta_time_sec.toFixed(3);
    const actions = document.createElement("td");
    const jump = document.createElement("button");
    jump.type = "button";
    jump.textContent = "移動";
    jump.addEventListener("click", () => setAnalysisFrame(event.frame));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "削除";
    remove.addEventListener("click", () => removeAnalysisEvent(event.id));
    actions.append(jump, remove);
    tr.append(name, frame, time, delta, actions);
    els.eventTableBody.append(tr);
  }
}

function analysisIntervals() {
  const events = analysisEventsWithTiming();
  const intervals = [];
  for (let index = 1; index < events.length; index += 1) {
    const start = events[index - 1];
    const end = events[index];
    intervals.push({
      name: `${start.name}->${end.name}`,
      start,
      end,
      delta_frame: end.frame - start.frame,
      delta_time_sec: end.time_sec - start.time_sec,
    });
  }
  return intervals;
}

function renderEventIntervals() {
  if (!els.eventIntervalTableBody) return;
  els.eventIntervalTableBody.replaceChildren();
  for (const interval of analysisIntervals()) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = interval.name;
    const frames = document.createElement("td");
    frames.textContent = `${interval.start.frame}-${interval.end.frame} (${interval.delta_frame})`;
    const time = document.createElement("td");
    time.textContent = interval.delta_time_sec.toFixed(3);
    tr.append(name, frames, time);
    els.eventIntervalTableBody.append(tr);
  }
}

function renderAnalysisMetrics() {
  const transform = calibrationTransform();
  const unit = transform ? transform.unit : "px";
  const frame = analysisFrame();
  const a = pointForAnalysis(frame, els.distanceMarkerA.value, transform);
  const b = pointForAnalysis(frame, els.distanceMarkerB.value, transform);
  const distance = distanceBetweenPoints(a, b);
  els.distanceResult.textContent = distance === null ? "距離: -" : `距離: ${distance.toFixed(6)} ${unit}`;

  const angleA = pointForAnalysis(frame, els.angleMarkerA.value, transform);
  const angleB = pointForAnalysis(frame, els.angleMarkerB.value, transform);
  const angleC = pointForAnalysis(frame, els.angleMarkerC.value, transform);
  const angle = angleABC(angleA, angleB, angleC);
  els.angleResult.textContent = angle === null ? "角度: -" : `角度: ${angle.toFixed(2)} deg`;
  els.analysisStatus.textContent = transform
    ? `分析Frame ${frame} / 4点法実長換算: 有効 (${transform.unit})`
    : `分析Frame ${frame} / 4点法実長換算: 無効または未設定`;
  renderKinematicsMetrics();
}

function kinematicsSamples(marker, transform = null) {
  normalizeTrim();
  const samples = [];
  for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
    const sample = samplePoint(frame, marker, transform);
    if (sample) samples.push(sample);
  }
  return samples;
}

function kinematicsAtFrame(marker, frame, transform = null) {
  const previous = (() => {
    for (let f = frame - 1; f >= state.trimStart; f -= 1) {
      const sample = samplePoint(f, marker, transform);
      if (sample) return sample;
    }
    return null;
  })();
  const current = samplePoint(frame, marker, transform);
  const next = (() => {
    for (let f = frame + 1; f <= state.trimEnd; f += 1) {
      const sample = samplePoint(f, marker, transform);
      if (sample) return sample;
    }
    return null;
  })();
  const velocity = previous && next
    ? velocityBetweenSamples(previous, next)
    : velocityBetweenSamples(previous, current) || velocityBetweenSamples(current, next);
  const prevVelocity = previous && current ? velocityBetweenSamples(previous, current) : null;
  const nextVelocity = current && next ? velocityBetweenSamples(current, next) : null;
  let acceleration = null;
  if (prevVelocity && nextVelocity && previous && next) {
    const dt = frameTimeDelta(previous.frame, next.frame);
    if (dt > 0) {
      const ax = (nextVelocity.vx - prevVelocity.vx) / dt;
      const ay = (nextVelocity.vy - prevVelocity.vy) / dt;
      acceleration = { ax, ay, accel: Math.hypot(ax, ay) };
    }
  }
  return { current, previous, next, velocity, acceleration };
}

function pathStats(marker, transform = null) {
  const samples = kinematicsSamples(marker, transform);
  let path = 0;
  let maxSpeed = null;
  for (let index = 1; index < samples.length; index += 1) {
    path += distanceBetweenPoints(samples[index - 1], samples[index]) || 0;
    const velocity = velocityBetweenSamples(samples[index - 1], samples[index]);
    if (velocity) maxSpeed = Math.max(maxSpeed ?? 0, velocity.speed);
  }
  return { sampleCount: samples.length, path, maxSpeed };
}

function renderKinematicsMetrics() {
  if (!els.kinematicsMarker || !els.kinematicsResult) return;
  const marker = els.kinematicsMarker.value || state.activeMarker;
  const transform = calibrationTransform();
  const unit = transform ? transform.unit : "px";
  const frame = analysisFrame();
  const current = kinematicsAtFrame(marker, frame, transform);
  const stats = pathStats(marker, transform);
  const speedText = current.velocity ? `${current.velocity.speed.toFixed(6)} ${unit}/s` : "-";
  const accelText = current.acceleration ? `${current.acceleration.accel.toFixed(6)} ${unit}/s^2` : "-";
  const pathText = stats.sampleCount > 1 ? `${stats.path.toFixed(6)} ${unit}` : "-";
  const maxSpeedText = stats.maxSpeed !== null ? `${stats.maxSpeed.toFixed(6)} ${unit}/s` : "-";
  els.kinematicsResult.textContent = `${marker}: 速度 ${speedText} / 加速度 ${accelText} / 移動距離 ${pathText} / 最大速度 ${maxSpeedText}`;
}

function renderAnalysisSummary() {
  if (!els.analysisSummary) return;
  const stats = digitizeStats();
  const expected = Math.max(1, stats.frame_count_in_range * stats.marker_count);
  const completion = stats.range_points / expected * 100;
  const sourceCounts = stats.source_counts || {};
  const derived = Object.entries(sourceCounts)
    .filter(([source]) => source !== "manual")
    .reduce((sum, [, count]) => sum + Number(count || 0), 0);
  const rows = [
    ["対象フレーム", `${state.trimStart}-${state.trimEnd} (${stats.frame_count_in_range}F)`],
    ["デジタイズFrame", String(state.frame)],
    ["分析Frame", String(state.analysisFrame)],
    ["入力率", `${completion.toFixed(1)}%`],
    ["入力点", `${stats.range_points} / ${expected}`],
    ["欠測点", String(stats.missing_range_points)],
    ["完了フレーム", `${stats.complete_frames} / ${stats.frame_count_in_range}`],
    ["手入力点", String(sourceCounts.manual || 0)],
    ["補間/コピー等", String(derived)],
    ["イベント数", String(state.analysisEvents.length)],
  ];
  els.analysisSummary.replaceChildren();
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    els.analysisSummary.append(dt, dd);
  }
}

function missingRunsForMarker(marker) {
  const runs = [];
  let start = null;
  for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
    if (!getPoint(frame, marker) && !isResolvedPointStatus(pointStatusAt(frame, marker))) {
      if (start === null) start = frame;
    } else if (start !== null) {
      runs.push({ start, end: frame - 1, count: frame - start });
      start = null;
    }
  }
  if (start !== null) runs.push({ start, end: state.trimEnd, count: state.trimEnd - start + 1 });
  return runs;
}

function qualityGateIssues() {
  normalizeTrim();
  const issues = [];
  let unresolved = 0;
  let uncertain = 0;
  let excluded = 0;
  for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
    for (const marker of state.markers) {
      const point = getPoint(frame, marker);
      const status = pointStatusAt(frame, marker);
      if (!point && !isResolvedPointStatus(status)) unresolved += 1;
      if (status === "uncertain") uncertain += 1;
      if (status === "excluded") excluded += 1;
    }
  }
  if (!state.ready) issues.push({ severity: "error", text: "動画が開かれていません" });
  if (!state.videoIdentity?.digest || state.videoIdentity.digest_algorithm !== "sha256") {
    issues.push({ severity: "warning", text: "動画全体のSHA-256が保存されていません" });
  }
  if (unresolved > 0) issues.push({ severity: "error", text: `理由未設定の欠測が ${unresolved} 点あります` });
  if (uncertain > 0) issues.push({ severity: "warning", text: `要確認の点が ${uncertain} 点あります` });
  if (excluded > 0) issues.push({ severity: "info", text: `解析除外が ${excluded} 点あります` });
  const pendingAI = aiSuggestionCounts().pending;
  if (pendingAI > 0) issues.push({ severity: "info", text: `未確認のAI候補が ${pendingAI} 点あります` });
  if (state.calibration.enabled && !calibrationTransform()) {
    issues.push({ severity: "error", text: "4点法が有効ですが変換を計算できません" });
  }
  const jumps = suspiciousJumps();
  if (jumps.length > 0) issues.push({ severity: "warning", text: `急な座標移動の候補が ${jumps.length} 点あります` });
  return issues;
}

function runQualityGate() {
  const issues = qualityGateIssues();
  els.qualityGateResult.className = `quality-gate-result ${issues.length ? "warn" : "pass"}`;
  els.qualityGateResult.textContent = issues.length
    ? issues.map((issue) => `${issue.severity === "error" ? "要修正" : issue.severity === "warning" ? "確認" : "情報"}: ${issue.text}`).join("\n")
    : "合格: 出力前チェックで問題は見つかりませんでした";
  return issues;
}

function renderQualityTable() {
  if (!els.qualityTableBody) return;
  normalizeTrim();
  const stats = digitizeStats();
  const missingByMarker = state.markers
    .map((marker) => ({ marker, runs: missingRunsForMarker(marker) }))
    .map((item) => ({ ...item, missing: item.runs.reduce((sum, run) => sum + run.count, 0) }))
    .filter((item) => item.missing > 0)
    .sort((a, b) => b.missing - a.missing);
  const longestRun = missingByMarker
    .flatMap((item) => item.runs.map((run) => ({ marker: item.marker, ...run })))
    .sort((a, b) => b.count - a.count)[0];
  const derived = Object.entries(stats.source_counts || {})
    .filter(([source]) => source !== "manual")
    .reduce((sum, [, count]) => sum + Number(count || 0), 0);
  const jumps = suspiciousJumps().slice(0, 3);
  const sideIssues = sideCrossingIssues().slice(0, 3);
  const rows = [
    ["欠測が多いマーカー", missingByMarker.slice(0, 3).map((item) => `${item.marker}:${item.missing}`).join(" / ") || "なし"],
    ["最長連続欠測", longestRun ? `${longestRun.marker} ${longestRun.start}-${longestRun.end} (${longestRun.count}F)` : "なし"],
    ["急な移動", jumps.length ? jumps.map((item) => `${item.frame}F ${item.marker} ${item.distance.toFixed(1)}px`).join(" / ") : "なし"],
    ["左右入れ違い候補", sideIssues.length ? sideIssues.map((item) => `${item.frame}F ${item.right}/${item.left}`).join(" / ") : "なし"],
    ["補間/コピー等", `${derived}点`],
  ];
  els.qualityTableBody.replaceChildren();
  for (const [label, value] of rows) {
    const tr = document.createElement("tr");
    const th = document.createElement("td");
    th.textContent = label;
    const td = document.createElement("td");
    td.textContent = value;
    tr.append(th, td);
    els.qualityTableBody.append(tr);
  }
}

function suspiciousJumps() {
  const issues = [];
  const threshold = Math.max(35, Math.min(state.videoWidth || 1920, state.videoHeight || 1080) * 0.06);
  for (const marker of state.markers) {
    let prev = null;
    for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
      const point = getPoint(frame, marker);
      if (!point) continue;
      if (prev) {
        const dt = Math.max(1, frame - prev.frame);
        const distance = distanceBetweenPoints(point, prev.point) / dt;
        if (distance > threshold) issues.push({ frame, marker, distance, previous_frame: prev.frame });
      }
      prev = { frame, point };
    }
  }
  return issues.sort((a, b) => b.distance - a.distance);
}

function sideCrossingIssues() {
  const pairs = [
    ["右肩", "左肩"],
    ["右肘", "左肘"],
    ["右手", "左手"],
    ["右股関節", "左股関節"],
    ["右膝", "左膝"],
    ["右足首", "左足首"],
    ["右足", "左足"],
  ];
  const issues = [];
  for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
    for (const [right, left] of pairs) {
      const rp = getPoint(frame, right);
      const lp = getPoint(frame, left);
      if (!rp || !lp) continue;
      if (rp.x > lp.x) issues.push({ frame, right, left });
    }
  }
  return issues;
}

function renderMissingHeatmap() {
  if (!els.missingHeatmap) return;
  els.missingHeatmap.replaceChildren();
  normalizeTrim();
  if (!state.ready || trimFrameCount() <= 0) {
    els.missingHeatmap.textContent = "動画を開くと欠測マップを表示します";
    return;
  }
  const frameTotal = trimFrameCount();
  const cols = Math.min(80, frameTotal);
  els.missingHeatmap.style.setProperty("--heatmap-cols", String(cols));
  const shownMarkers = state.markers.slice(0, 28);
  for (const marker of shownMarkers) {
    const row = document.createElement("div");
    row.className = "missing-heatmap-row";
    const label = document.createElement("div");
    label.className = "missing-heatmap-label";
    label.textContent = marker;
    const cells = document.createElement("div");
    cells.className = "missing-heatmap-cells";
    for (let col = 0; col < cols; col += 1) {
      const start = state.trimStart + Math.floor((col / cols) * frameTotal);
      const end = state.trimStart + Math.floor(((col + 1) / cols) * frameTotal) - 1;
      const safeEnd = Math.max(start, Math.min(state.trimEnd, end));
      let missing = 0;
      let total = 0;
      for (let frame = start; frame <= safeEnd; frame += 1) {
        total += 1;
        if (!getPoint(frame, marker)) missing += 1;
      }
      const cell = document.createElement("span");
      cell.className = "missing-heatmap-cell";
      if (missing === total) cell.classList.add("missing");
      else if (missing > 0) cell.classList.add("partial");
      cell.title = `${marker}: ${start}-${safeEnd} / 欠測 ${missing}/${total}`;
      cells.append(cell);
    }
    row.append(label, cells);
    els.missingHeatmap.append(row);
  }
}

function renderAnalysisFrameControls() {
  normalizeTrim();
  if (els.analysisFrameSlider) {
    els.analysisFrameSlider.min = String(state.trimStart);
    els.analysisFrameSlider.max = String(state.trimEnd);
    els.analysisFrameSlider.value = String(state.analysisFrame);
  }
  if (els.analysisFrameInput) {
    els.analysisFrameInput.min = String(state.trimStart);
    els.analysisFrameInput.max = String(state.trimEnd);
    els.analysisFrameInput.value = String(state.analysisFrame);
  }
}

function renderAnalysis() {
  renderAnalysisFrameControls();
  renderAnalysisSummary();
  renderQualityTable();
  renderMissingHeatmap();
  renderAnalysisControls();
  renderAnalysisEvents();
  renderEventIntervals();
  renderAnalysisMetrics();
  renderComparison();
  renderTrialList();
}

function comparisonSessionId() {
  return `${state.sessionId}_compare`;
}

function comparisonFrameUrl(frame) {
  const params = new URLSearchParams({
    session: comparisonSessionId(),
    index: String(frame),
    format: frameQuality(),
  });
  if (state.appToken) params.set("token", state.appToken);
  return `./api/frame?${params.toString()}`;
}

function replaceComparisonObjectUrl(key, url) {
  const previous = state.comparison[key];
  if (previous) URL.revokeObjectURL(previous);
  state.comparison[key] = url;
}

function loadComparisonFrame(image, source, frame, key, serial, timeSec) {
  if (!source) {
    image.removeAttribute("src");
    return;
  }
  source.getFrameBlob(frame, frameQuality(), timeSec).then((blob) => {
    if (serial !== state.comparison.renderSerial) return;
    const url = URL.createObjectURL(blob);
    replaceComparisonObjectUrl(key, url);
    image.src = url;
  }).catch(() => {
    if (serial === state.comparison.renderSerial) image.removeAttribute("src");
  });
}

function renderComparison() {
  if (!els.comparisonPrimaryImage) return;
  const primaryFrame = state.ready ? clampFrame(state.analysisFrame) : 0;
  const offset = Math.round(Number(els.comparisonOffset?.value) || 0);
  const maxComparison = Math.max(0, Number(state.comparison.metadata?.frame_count || 1) - 1);
  const secondaryFrame = Math.max(0, Math.min(maxComparison, primaryFrame + offset));
  const key = `${primaryFrame}:${secondaryFrame}:${state.ready}:${state.comparison.ready}:${frameQuality()}`;
  if (key === state.comparison.lastKey) return;
  state.comparison.lastKey = key;
  const serial = ++state.comparison.renderSerial;
  if (state.ready) {
    loadComparisonFrame(
      els.comparisonPrimaryImage,
      state.frameSource,
      primaryFrame,
      "primaryObjectUrl",
      serial,
      frameToTime(primaryFrame),
    );
  } else els.comparisonPrimaryImage.removeAttribute("src");
  if (state.comparison.ready) {
    loadComparisonFrame(
      els.comparisonSecondaryImage,
      state.comparison.source,
      secondaryFrame,
      "secondaryObjectUrl",
      serial,
    );
    els.comparisonCaption.textContent = `${state.comparison.metadata.name} / ${secondaryFrame}F`;
  } else {
    els.comparisonSecondaryImage.removeAttribute("src");
    els.comparisonCaption.textContent = "比較動画未選択";
  }
}

async function loadComparisonVideo(file) {
  if (!file) return;
  state.comparison.source?.close?.();
  if (usesBrowserFrameSource()) {
    const opened = await VideoDigitizerFrames.BrowserFrameSource.open(file, state.fps);
    const identity = await videoIdentityFromFile(file, opened.metadata);
    state.comparison = {
      ready: true,
      metadata: opened.metadata,
      identity,
      lastKey: "",
      source: opened.source,
      primaryObjectUrl: "",
      secondaryObjectUrl: "",
      renderSerial: 0,
    };
    recordAudit("load_comparison_video", { name: file.name, identity: identity.digest || "", mode: "browser" });
    markDirty();
    renderComparison();
    setStatus(`比較動画をブラウザ内で開きました: ${file.name}`);
    return;
  }
  const params = new URLSearchParams({ session: comparisonSessionId() });
  if (state.appToken) params.set("token", state.appToken);
  const response = await fetch(`./api/video?${params.toString()}`, {
    method: "POST",
    headers: {
      "X-File-Name": encodeURIComponent(file.name),
      "X-File-Last-Modified": String(Number(file.lastModified) || 0),
    },
    body: file,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
  const metadata = await response.json();
  state.comparison = {
    ready: true,
    metadata,
    identity: metadata.identity || null,
    lastKey: "",
    source: new VideoDigitizerFrames.ApiFrameSource((frame) => comparisonFrameUrl(frame)),
    primaryObjectUrl: "",
    secondaryObjectUrl: "",
    renderSerial: 0,
  };
  recordAudit("load_comparison_video", { name: metadata.name, identity: metadata.identity?.digest || "" });
  markDirty();
  renderComparison();
  setStatus(`比較動画を開きました: ${metadata.name}`);
}

function coordinatePairsFromProject(payload) {
  const digitize = payload.digitize && typeof payload.digitize === "object" ? payload.digitize : {};
  const points = digitize.points || payload.points || pointsFromCoordinateRecords(digitize.coordinates || payload.coordinates) || {};
  const pairs = [];
  for (const marker of state.markers) {
    for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
      const current = getPoint(frame, marker);
      const other = points[String(frame)]?.[marker];
      if (!current || !other) continue;
      pairs.push({ frame, marker, a: current, b: other, distance: Math.hypot(current.x - other.x, current.y - other.y) });
    }
  }
  return pairs;
}

function icc31(pairs) {
  const values = pairs.flatMap((pair) => [[Number(pair.a.x), Number(pair.b.x)], [Number(pair.a.y), Number(pair.b.y)]])
    .filter((row) => row.every(Number.isFinite));
  const n = values.length;
  if (n < 2) return null;
  const k = 2;
  const grand = values.flat().reduce((sum, value) => sum + value, 0) / (n * k);
  const subjectMeans = values.map((row) => (row[0] + row[1]) / k);
  const raterMeans = [0, 1].map((rater) => values.reduce((sum, row) => sum + row[rater], 0) / n);
  const ssr = k * subjectMeans.reduce((sum, value) => sum + (value - grand) ** 2, 0);
  let sse = 0;
  for (let subject = 0; subject < n; subject += 1) {
    for (let rater = 0; rater < k; rater += 1) {
      sse += (values[subject][rater] - subjectMeans[subject] - raterMeans[rater] + grand) ** 2;
    }
  }
  const msr = ssr / (n - 1);
  const mse = sse / ((n - 1) * (k - 1));
  const denominator = msr + (k - 1) * mse;
  return Math.abs(denominator) < 1e-12 ? null : (msr - mse) / denominator;
}

function compareReliabilityProject(file) {
  readFileText(file, "再測定プロジェクト").then((text) => {
    const payload = JSON.parse(text);
    if (!SUPPORTED_PROJECT_SCHEMAS.has(payload.schema)) throw new Error("対応していないプロジェクト形式です");
    const pairs = coordinatePairsFromProject(payload);
    if (!pairs.length) throw new Error("比較できる同一フレーム・同一マーカーがありません");
    const mean = pairs.reduce((sum, pair) => sum + pair.distance, 0) / pairs.length;
    const rmse = Math.sqrt(pairs.reduce((sum, pair) => sum + pair.distance ** 2, 0) / pairs.length);
    const tem = Math.sqrt(pairs.reduce((sum, pair) => sum + pair.distance ** 2, 0) / (2 * pairs.length));
    const maximum = Math.max(...pairs.map((pair) => pair.distance));
    const icc = icc31(pairs);
    els.reliabilityResult.className = "quality-gate-result pass";
    els.reliabilityResult.textContent = `比較 ${pairs.length}点 / 平均差 ${mean.toFixed(3)}px / RMSE ${rmse.toFixed(3)}px / TEM ${tem.toFixed(3)}px / 最大 ${maximum.toFixed(3)}px / ICC(3,1) ${icc === null ? "-" : icc.toFixed(4)}`;
    recordAudit("reliability_check", { file: file.name, count: pairs.length, mean, rmse, tem, icc });
  }).catch((error) => {
    els.reliabilityResult.className = "quality-gate-result warn";
    els.reliabilityResult.textContent = `比較失敗: ${error.message}`;
  }).finally(() => { els.reliabilityProjectFile.value = ""; });
}

function addTrialSnapshot() {
  const metadata = readMetadata();
  const stats = digitizeStats();
  state.studyTrials.push({
    id: createSessionId(),
    added_at: new Date().toISOString(),
    subject_id: metadata.subject_id || "未設定",
    trial_name: metadata.trial_name || state.videoName || "未設定",
    video_digest: state.videoIdentity?.digest || "",
    completion: `${stats.range_points}/${stats.frame_count_in_range * stats.marker_count}`,
  });
  recordAudit("add_trial_snapshot", { trial_name: metadata.trial_name || state.videoName || "" });
  markDirty();
  renderTrialList();
}

function renderTrialList() {
  if (!els.trialList) return;
  els.trialList.replaceChildren();
  if (!state.studyTrials.length) {
    els.trialList.textContent = "登録された試技はありません";
    return;
  }
  for (const trial of state.studyTrials) {
    const row = document.createElement("div");
    row.className = "trial-item";
    const text = document.createElement("span");
    text.textContent = `${trial.subject_id} / ${trial.trial_name} / ${trial.completion}`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "削除";
    button.addEventListener("click", () => {
      state.studyTrials = state.studyTrials.filter((item) => item.id !== trial.id);
      markDirty();
      renderTrialList();
    });
    row.append(text, button);
    els.trialList.append(row);
  }
}

function analysisEventsWithTiming() {
  return state.analysisEvents
    .map((event) => ({
      ...event,
      time_sec: Number(event.time_sec ?? frameToTime(event.frame)) || 0,
    }))
    .sort((a, b) => a.frame - b.frame || a.name.localeCompare(b.name))
    .map((event, index, events) => {
      const previous = events[index - 1] || null;
      return {
        ...event,
        delta_frame: previous ? event.frame - previous.frame : null,
        delta_time_sec: previous ? event.time_sec - previous.time_sec : null,
      };
    });
}

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  if (els.canvas.width !== w || els.canvas.height !== h) {
    els.canvas.width = w;
    els.canvas.height = h;
  }
}

function drawEmpty(ctx) {
  ctx.fillStyle = "#eef1f4";
  ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
  ctx.fillStyle = "#5d6675";
  ctx.font = "18px sans-serif";
  ctx.fillText("動画を開いてください", 24, 40);
  state.drawRect = { x: 0, y: 0, w: els.canvas.width, h: els.canvas.height, scale: 1 };
  state.zoomRect = null;
}

function drawPoint(ctx, point, marker) {
  const { x, y } = sourceToCanvas(point);
  const size = pointSize();
  ctx.lineWidth = overlayLineWidth();
  ctx.strokeStyle = "#111827";
  ctx.fillStyle = markerColor(point);
  if (point.src === "track") {
    ctx.strokeRect(x - size, y - size, size * 2, size * 2);
    ctx.fillRect(x - size + 1, y - size + 1, Math.max(2, size * 2 - 2), Math.max(2, size * 2 - 2));
  } else if (point.src === "interp") {
    ctx.beginPath();
    ctx.moveTo(x, y - size - 2);
    ctx.lineTo(x + size + 2, y);
    ctx.lineTo(x, y + size + 2);
    ctx.lineTo(x - size - 2, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (pointStatusAt(state.frame, marker) === "uncertain") {
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(x, y, size + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.font = "14px sans-serif";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(marker, x + 9, y - 9);
  ctx.fillStyle = "#111827";
  ctx.fillText(marker, x + 9, y - 9);
}

function drawAISuggestion(ctx, suggestion, marker) {
  const { x, y } = sourceToCanvas(suggestion);
  const size = pointSize() + (marker === state.activeMarker ? 4 : 2);
  ctx.save();
  ctx.strokeStyle = "#087f8c";
  ctx.fillStyle = "rgba(230, 247, 248, 0.72)";
  ctx.lineWidth = marker === state.activeMarker ? 3 : 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(x, y, size + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x - size, y);
  ctx.lineTo(x + size, y);
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y + size);
  ctx.stroke();
  if (marker === state.activeMarker) {
    const confidence = Math.round((Number(suggestion.confidence) || 0) * 100);
    ctx.font = "700 13px sans-serif";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(`AI ${confidence}%`, x + size + 7, y - size - 5);
    ctx.fillStyle = "#075d66";
    ctx.fillText(`AI ${confidence}%`, x + size + 7, y - size - 5);
  }
  ctx.restore();
}

function drawAISuggestions(ctx) {
  if (!els.showAISuggestions?.checked) return;
  const suggestions = state.aiSuggestions[String(state.frame)] || {};
  for (const [marker, suggestion] of Object.entries(suggestions)) {
    if (suggestion?.status !== "pending" || !isMarkerVisible(marker)) continue;
    drawAISuggestion(ctx, suggestion, marker);
  }
}

function sourceToCanvas(point) {
  const r = state.drawRect;
  return {
    x: r.x + point.x * r.scale,
    y: r.y + point.y * r.scale,
  };
}

function trailGroupFor(marker) {
  if (marker.startsWith("右")) return "right";
  if (marker.startsWith("左")) return "left";
  return "center";
}

function trailMarkers() {
  const mode = els.trailMode.value;
  if (mode === "off") return [];
  const markers = visibleMarkerList();
  if (mode === "all") return markers;
  if (mode === "side") {
    const group = trailGroupFor(state.activeMarker);
    return markers.filter((marker) => trailGroupFor(marker) === group);
  }
  return state.activeMarker && isMarkerVisible(state.activeMarker) ? [state.activeMarker] : [];
}

function markerTrailColor(marker, alpha) {
  const index = markerIndex(marker);
  const hue = (index * 137) % 360;
  return `hsla(${hue}, 68%, 42%, ${alpha.toFixed(3)})`;
}

function drawMarkerTrail(ctx, marker, trailLength, subdued) {
  if (trailLength <= 0 || !marker) return;

  const start = Math.max(state.trimStart, state.frame - trailLength);
  const samples = [];
  for (let frame = start; frame <= state.frame; frame += 1) {
    const point = getPoint(frame, marker);
    if (point) samples.push({ frame, point, pos: sourceToCanvas(point) });
  }
  if (samples.length < 2) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = marker === state.activeMarker ? overlayLineWidth() + 1 : overlayLineWidth();

  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const current = samples[i];
    const base = subdued ? 0.22 : 0.5;
    const alpha = 0.12 + base * (i / (samples.length - 1));
    ctx.strokeStyle = markerTrailColor(marker, alpha);
    ctx.beginPath();
    ctx.moveTo(prev.pos.x, prev.pos.y);
    ctx.lineTo(current.pos.x, current.pos.y);
    ctx.stroke();
  }

  for (let i = 0; i < samples.length - 1; i += 1) {
    const sample = samples[i];
    const alpha = (subdued ? 0.14 : 0.28) + 0.22 * ((i + 1) / samples.length);
    ctx.fillStyle = markerTrailColor(marker, alpha);
    ctx.beginPath();
    ctx.arc(sample.pos.x, sample.pos.y, marker === state.activeMarker ? Math.max(3, pointSize() * 0.55) : Math.max(2, pointSize() * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawTrail(ctx) {
  const trailLength = Math.max(0, Math.round(Number(els.trailInput.value) || 0));
  state.trailLength = trailLength;
  if (trailLength <= 0) return;

  const markers = trailMarkers();
  const subdued = markers.length > 1;
  for (const marker of markers) {
    drawMarkerTrail(ctx, marker, trailLength, subdued);
  }
}

function drawSkeleton(ctx) {
  if (!els.skeletonEnabled?.checked) return;
  const row = state.points[String(state.frame)] || {};
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = overlayLineWidth() + 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [a, b] of state.skeletonSegments) {
    const pa = row[a];
    const pb = row[b];
    if (!pa || !pb || !isMarkerVisible(a) || !isMarkerVisible(b)) continue;
    const ca = sourceToCanvas(pa);
    const cb = sourceToCanvas(pb);
    ctx.beginPath();
    ctx.moveTo(ca.x, ca.y);
    ctx.lineTo(cb.x, cb.y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(17, 24, 39, 0.82)";
  ctx.lineWidth = overlayLineWidth();
  for (const [a, b] of state.skeletonSegments) {
    const pa = row[a];
    const pb = row[b];
    if (!pa || !pb || !isMarkerVisible(a) || !isMarkerVisible(b)) continue;
    const ca = sourceToCanvas(pa);
    const cb = sourceToCanvas(pb);
    ctx.beginPath();
    ctx.moveTo(ca.x, ca.y);
    ctx.lineTo(cb.x, cb.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCalibrationOverlay(ctx) {
  if (!els.calibOverlayEnabled?.checked || !hasCalibrationPoints()) return;
  ctx.save();
  ctx.font = "700 13px sans-serif";
  ctx.textBaseline = "middle";
  for (let index = 0; index < state.calibration.points.length; index += 1) {
    const point = state.calibration.points[index];
    const pos = sourceToCanvas(point);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#2364aa";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pointSize() + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`P${index + 1}`, pos.x + pointSize() + 7, pos.y);
  }
  ctx.restore();
}

function drawCursorGuide(ctx) {
  if (!state.cursor || !state.ready) return;
  const mode = els.cursorGuideMode?.value || "cross";
  if (mode === "off") return;
  const p = sourceToCanvas(state.cursor);
  const r = state.drawRect;
  if (p.x < r.x || p.y < r.y || p.x > r.x + r.w || p.y > r.y + r.h) return;

  ctx.save();
  ctx.strokeStyle = "rgba(17, 24, 39, 0.72)";
  ctx.lineWidth = 1;
  if (mode === "cross") {
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(r.x, p.y);
    ctx.lineTo(r.x + r.w, p.y);
    ctx.moveTo(p.x, r.y);
    ctx.lineTo(p.x, r.y + r.h);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = overlayLineWidth();
  ctx.beginPath();
  ctx.arc(p.x, p.y, pointSize() + 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function draw() {
  resizeCanvas();
  const ctx = els.canvas.getContext("2d");
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  if (!state.ready || !state.videoWidth || !state.videoHeight) {
    drawEmpty(ctx);
    return;
  }

  const cw = els.canvas.width;
  const ch = els.canvas.height;
  const vw = state.videoWidth;
  const vh = state.videoHeight;
  const scale = Math.min(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  state.drawRect = { x: dx, y: dy, w: dw, h: dh, scale };

  drawTrail(ctx);
  drawSkeleton(ctx);
  drawCalibrationOverlay(ctx);
  drawAISuggestions(ctx);

  const points = state.points[String(state.frame)] || {};
  for (const [marker, point] of Object.entries(points)) {
    if (!isMarkerVisible(marker)) continue;
    drawPoint(ctx, point, marker);
  }
  drawCursorGuide(ctx);
  drawCanvasMagnifier(ctx);
}

function drawCanvasMagnifier(ctx) {
  state.zoomRect = null;
  if (!els.zoomEnabled.checked) return;
  if (!state.ready || !state.videoWidth || !state.videoHeight) return;
  if (!state.cursor) return;
  const point = getPoint(state.frame, state.activeMarker);
  const center = state.cursor;
  const canvasCenter = sourceToCanvas(center);
  const r = state.drawRect;
  if (canvasCenter.x < r.x || canvasCenter.y < r.y || canvasCenter.x > r.x + r.w || canvasCenter.y > r.y + r.h) return;

  const lensSize = Math.min(zoomLensSize(), Math.max(120, Math.min(r.w, r.h) * 0.55));
  const lensHalf = lensSize / 2;
  const sourceSize = Math.max(10, lensSize / (zoomScale() * Math.max(r.scale, 0.001)));
  const sourceHalf = sourceSize / 2;
  const sx = Math.max(0, Math.min(Math.max(0, state.videoWidth - sourceSize), center.x - sourceHalf));
  const sy = Math.max(0, Math.min(Math.max(0, state.videoHeight - sourceSize), center.y - sourceHalf));
  const sw = Math.min(sourceSize, state.videoWidth - sx);
  const sh = Math.min(sourceSize, state.videoHeight - sy);
  const dx = canvasCenter.x - lensHalf;
  const dy = canvasCenter.y - lensHalf;
  state.zoomRect = { sx, sy, sw, sh };

  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, lensSize, lensSize);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(els.frameImage, sx, sy, sw, sh, dx, dy, lensSize, lensSize);

  if (point) {
    const px = dx + ((point.x - sx) / sw) * lensSize;
    const py = dy + ((point.y - sy) / sh) * lensSize;
    if (px >= dx && py >= dy && px <= dx + lensSize && py <= dy + lensSize) {
      ctx.fillStyle = "rgba(217, 83, 30, 0.9)";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.98)";
  ctx.lineWidth = 2;
  ctx.strokeRect(dx, dy, lensSize, lensSize);
  ctx.strokeStyle = "rgba(17, 24, 39, 0.88)";
  ctx.lineWidth = 1;
  ctx.strokeRect(dx + 2, dy + 2, lensSize - 4, lensSize - 4);
  ctx.restore();
}

function canvasToSource(event) {
  const rect = els.canvas.getBoundingClientRect();
  const cx = (event.clientX - rect.left) * (els.canvas.width / rect.width);
  const cy = (event.clientY - rect.top) * (els.canvas.height / rect.height);
  const r = state.drawRect;
  if (cx < r.x || cy < r.y || cx > r.x + r.w || cy > r.y + r.h) return null;
  return {
    x: normalizeCoordinate((cx - r.x) / r.scale, state.videoWidth - 1),
    y: normalizeCoordinate((cy - r.y) / r.scale, state.videoHeight - 1),
  };
}

function frameToTime(frame) {
  const stored = Number(state.frameTimestamps[String(Math.round(Number(frame) || 0))]);
  if (Number.isFinite(stored)) return stored;
  return frame / Math.max(0.001, state.fps);
}

function localFrameToTime(localFrame) {
  return frameToTime(state.trimStart + localFrame) - frameToTime(state.trimStart);
}

function frameTimeDelta(startFrame, endFrame) {
  return frameToTime(endFrame) - frameToTime(startFrame);
}

function sessionQuery() {
  const params = new URLSearchParams({ session: state.sessionId });
  if (state.appToken) params.set("token", state.appToken);
  return params.toString();
}

function frameUrl(frame) {
  const params = new URLSearchParams(sessionQuery());
  params.set("index", String(frame));
  params.set("format", frameQuality());
  const storedTime = Number(state.frameTimestamps[String(Math.round(Number(frame) || 0))]);
  if (Number.isFinite(storedTime)) params.set("time_sec", String(storedTime));
  return `./api/frame?${params.toString()}`;
}

function resetFrameCache() {
  state.frameCacheToken += 1;
  for (const item of state.frameCache.values()) URL.revokeObjectURL(item.url);
  state.frameCache.clear();
  state.frameRequests.clear();
}

function clientFrameCacheLimit() {
  const pixels = Math.max(1, state.videoWidth * state.videoHeight);
  let limit = pixels >= 3840 * 2160 ? 12 : pixels >= 1920 * 1080 ? 24 : 48;
  const memory = Number(navigator.deviceMemory) || 8;
  if (memory <= 4) limit = Math.max(8, Math.floor(limit / 2));
  return limit;
}

function clientPrefetchRadius() {
  const pixels = Math.max(1, state.videoWidth * state.videoHeight);
  return pixels >= 1920 * 1080 || (Number(navigator.deviceMemory) || 8) <= 4 ? 1 : 2;
}

function trimFrameCache() {
  while (state.frameCache.size > clientFrameCacheLimit()) {
    const first = state.frameCache.entries().next().value;
    if (!first) return;
    const [frame, item] = first;
    if (frame === state.frame && state.frameCache.size > 1) {
      state.frameCache.delete(frame);
      state.frameCache.set(frame, item);
      continue;
    }
    URL.revokeObjectURL(item.url);
    state.frameCache.delete(frame);
  }
}

async function fetchFrameBlobUrl(frame, token = state.frameCacheToken) {
  const cached = state.frameCache.get(frame);
  if (cached) {
    state.frameCache.delete(frame);
    state.frameCache.set(frame, cached);
    return cached.url;
  }

  const pending = state.frameRequests.get(frame);
  if (pending) return pending;

  const storedTime = Number(state.frameTimestamps[String(Math.round(Number(frame) || 0))]);
  const frameBlob = state.frameSource
    ? state.frameSource.getFrameBlob(frame, frameQuality(), Number.isFinite(storedTime) ? storedTime : undefined)
    : fetch(frameUrl(frame), { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      });

  const request = frameBlob
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      if (token !== state.frameCacheToken) {
        URL.revokeObjectURL(url);
        throw new Error("stale frame");
      }
      state.frameCache.set(frame, { url });
      trimFrameCache();
      return url;
    })
    .finally(() => {
      if (state.frameRequests.get(frame) === request) state.frameRequests.delete(frame);
    });

  state.frameRequests.set(frame, request);
  return request;
}

function decodeFrameUrl(url) {
  const image = new Image();
  if (image.decode) {
    image.src = url;
    return image.decode().then(() => url);
  }
  return new Promise((resolve, reject) => {
    image.onload = () => resolve(url);
    image.onerror = () => reject(new Error("image decode failed"));
    image.src = url;
  });
}

function loadFrameForDisplay(frame, token) {
  return fetchFrameBlobUrl(frame, token).then(decodeFrameUrl);
}

function prefetchAdjacentFrames(frame, token) {
  if (!state.ready || token !== state.frameCacheToken) return;
  for (let offset = 1; offset <= clientPrefetchRadius(); offset += 1) {
    for (const direction of [1, -1]) {
      const target = frame + offset * direction;
      if (target < state.trimStart || target > state.trimEnd) continue;
      if (state.frameCache.has(target) || state.frameRequests.has(target)) continue;
      fetchFrameBlobUrl(target, token).catch(() => {});
    }
  }
}

function finishSeek(serial) {
  if (serial !== state.seekSerial) return;
  state.seeking = false;
  updateStatus();
  draw();
}

function seekFrame(frame) {
  if (!state.ready) return;
  normalizeTrim();
  state.frame = clampFrame(frame);
  const serial = ++state.seekSerial;
  const token = state.frameCacheToken;

  state.seeking = true;
  updateStatus();
  renderTable();

  loadFrameForDisplay(state.frame, token).then((url) => {
    if (serial !== state.seekSerial || token !== state.frameCacheToken) return;
    els.frameImage.src = url;
    finishSeek(serial);
    prefetchAdjacentFrames(state.frame, token);
  }).catch(() => {
    if (serial !== state.seekSerial || token !== state.frameCacheToken) return;
    state.seeking = false;
    updateStatus();
    setStatus("フレーム画像の取得に失敗しました");
  });
}

function updateFrameModel() {
  const previousMax = maxFrameIndex();
  const wasFullRange = state.trimEnd === previousMax;
  state.fps = Number(els.fpsInput.value) || 30;
  if (state.frameSource?.kind === "browser") {
    state.frameCount = state.frameSource.setFps(state.fps);
    state.trimEnd = wasFullRange ? maxFrameIndex() : Math.min(state.trimEnd, maxFrameIndex());
    resetFrameCache();
  }
  normalizeTrim();
  updateStatus();
  renderTable();
}

function renderTable() {
  const visibleRows = 18;
  normalizeTrim();
  const maxStart = Math.max(state.trimStart, state.trimEnd - visibleRows + 1);
  const start = Math.max(state.trimStart, Math.min(maxStart, state.frame - 4));
  const table = els.table;
  const markerKey = state.markers.join("\u001f");
  const selectedKey = `${state.selected.frame ?? ""}\u001f${state.selected.marker ?? ""}`;
  const tableSelectionKey = tableSelectionSnapshotKey();
  const transform = calibrationTransform();
  const calibrationKey = state.calibration.points
    .map((point) => `${point.label}:${point.x},${point.y}`)
    .join("\u001f");
  const realCalibrationKey = [
    state.calibration.enabled ? "1" : "0",
    state.calibration.unit,
    ...state.calibration.realPoints.map((point) => `${point.x},${point.y}`),
  ].join("\u001f");
  const snapshot = [
    start,
    state.trimStart,
    state.trimEnd,
    state.pointRevision,
    coordinateDecimals(),
    markerKey,
    selectedKey,
    tableSelectionKey,
    calibrationKey,
    realCalibrationKey,
  ].join("\u001e");

  if (state.tableSnapshot === snapshot && table.tBodies.length > 0) {
    updateCurrentTableRow();
    return;
  }

  const fragment = document.createDocumentFragment();
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const calibrationLabels = state.calibration.points.map((point, index) => point.label || `calib_p${index + 1}`);
  for (const label of ["Idx", "t(s)", ...state.markers, ...calibrationLabels]) {
    const th = document.createElement("th");
    th.textContent = label;
    th.style.width = label === "Idx" ? "64px" : label === "t(s)" ? "82px" : "170px";
    if (calibrationLabels.includes(label)) th.classList.add("calibration-col");
    headRow.append(th);
  }
  thead.append(headRow);
  fragment.append(thead);

  const tbody = document.createElement("tbody");
  for (let row = 0; row < visibleRows; row += 1) {
    const frame = start + row;
    if (frame > state.trimEnd) break;
    const tr = document.createElement("tr");
    tr.dataset.frame = String(frame);
    if (frame === state.frame) tr.className = "current";

    const idx = document.createElement("td");
    idx.textContent = String(frame);
    tr.append(idx);

    const time = document.createElement("td");
    time.textContent = frameToTime(frame).toFixed(3);
    tr.append(time);

    for (const marker of state.markers) {
      const td = document.createElement("td");
      const point = getPoint(frame, marker);
      const status = pointStatusAt(frame, marker);
      if (point) {
        const real = transformPoint(point, transform);
        td.textContent = real
          ? `${formatPoint(point)} -> ${real.x.toFixed(4)},${real.y.toFixed(4)}${transform.unit} ${sourceTag(point.src, point.quality)}`
          : `${formatPoint(point)} ${sourceTag(point.src, point.quality)}`;
        if (status !== "valid") {
          td.textContent += ` [${POINT_STATUS_LABELS[status] || status}]`;
          td.classList.add("point-uncertain");
        }
      } else {
        td.classList.add("missing");
        if (status !== "valid") {
          td.textContent = `[${POINT_STATUS_LABELS[status] || status}]`;
          td.classList.add("flagged-missing");
        }
      }
      if (state.selected.frame === frame && state.selected.marker === marker) {
        td.classList.add("selected");
      }
      if (isCellInTableSelection(frame, marker)) td.classList.add("range-selected");
      if (isTableSelectionFocus(frame, marker)) td.classList.add("active-cell");
      td.tabIndex = 0;
      td.dataset.frame = String(frame);
      td.dataset.marker = marker;
      td.dataset.markerIndex = String(markerIndex(marker));
      td.addEventListener("mousedown", (event) => {
        handleTableCellPointer(event, frame, marker);
      });
      td.addEventListener("mouseenter", (event) => {
        if (event.buttons !== 1 || !state.tableSelection?.dragging) return;
        extendTableSelection(frame, marker);
      });
      td.addEventListener("click", (event) => {
        const wasDragging = Boolean(state.tableSelection?.dragging);
        if (state.tableSelection) state.tableSelection.dragging = false;
        if (event.shiftKey) {
          extendTableSelection(frame, marker);
        } else if (!wasDragging) {
          setTableSelection(frame, marker);
        }
        state.selected = { frame, marker };
        state.activeMarker = marker;
        seekFrame(frame);
        renderMarkers();
        renderTable();
      });
      tr.append(td);
    }
    for (const point of state.calibration.points) {
      const td = document.createElement("td");
      td.className = "calibration-cell";
      td.textContent = `${formatCoord(point.x)},${formatCoord(point.y)}`;
      tr.append(td);
    }
    tbody.append(tr);
  }
  fragment.append(tbody);
  table.replaceChildren(fragment);
  state.tableSnapshot = snapshot;
}

function tableSelectionSnapshotKey() {
  const selection = state.tableSelection;
  if (!selection) return "";
  return [
    selection.anchor.frame,
    selection.anchor.markerIndex,
    selection.focus.frame,
    selection.focus.markerIndex,
  ].join("\u001f");
}

function tableSelectionRange() {
  const selection = state.tableSelection;
  if (!selection) return null;
  const startFrame = Math.min(selection.anchor.frame, selection.focus.frame);
  const endFrame = Math.max(selection.anchor.frame, selection.focus.frame);
  const startMarkerIndex = Math.min(selection.anchor.markerIndex, selection.focus.markerIndex);
  const endMarkerIndex = Math.max(selection.anchor.markerIndex, selection.focus.markerIndex);
  return { startFrame, endFrame, startMarkerIndex, endMarkerIndex };
}

function isCellInTableSelection(frame, marker) {
  const range = tableSelectionRange();
  if (!range) return false;
  const index = markerIndex(marker);
  return frame >= range.startFrame
    && frame <= range.endFrame
    && index >= range.startMarkerIndex
    && index <= range.endMarkerIndex;
}

function isTableSelectionFocus(frame, marker) {
  const selection = state.tableSelection;
  return Boolean(selection
    && selection.focus.frame === frame
    && selection.focus.markerIndex === markerIndex(marker));
}

function setTableSelection(frame, marker) {
  const markerIndexValue = markerIndex(marker);
  state.tableSelection = {
    anchor: { frame, markerIndex: markerIndexValue },
    focus: { frame, markerIndex: markerIndexValue },
    dragging: false,
  };
}

function extendTableSelection(frame, marker) {
  if (!state.tableSelection) {
    setTableSelection(frame, marker);
  } else {
    state.tableSelection.focus = { frame, markerIndex: markerIndex(marker) };
  }
  state.tableSnapshot = "";
  renderTable();
}

function handleTableCellPointer(event, frame, marker) {
  if (event.button !== 0) return;
  event.preventDefault();
  if (event.shiftKey && state.tableSelection) {
    extendTableSelection(frame, marker);
  } else {
    setTableSelection(frame, marker);
  }
  state.tableSelection.dragging = true;
  state.selected = { frame, marker };
  state.activeMarker = marker;
}

function selectedTableCellText(frame, marker) {
  const point = getPoint(frame, marker);
  return point ? `${formatCoord(point.x)},${formatCoord(point.y)}` : "";
}

function selectedTableRowsForClipboard() {
  const range = tableSelectionRange();
  if (!range) return [];
  const rows = [];
  for (let frame = range.startFrame; frame <= range.endFrame; frame += 1) {
    const row = [];
    for (let markerIndexValue = range.startMarkerIndex; markerIndexValue <= range.endMarkerIndex; markerIndexValue += 1) {
      row.push(selectedTableCellText(frame, state.markers[markerIndexValue]));
    }
    rows.push(row);
  }
  return rows;
}

function hasTableSelection() {
  return Boolean(tableSelectionRange());
}

function copySelectedTableCells(event = null) {
  const rows = selectedTableRowsForClipboard();
  if (rows.length === 0) return false;
  const text = toTsv(rows);
  if (event?.clipboardData) {
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    setStatus("選択セルをコピーしました");
    return true;
  }
  navigator.clipboard.writeText(text)
    .then(() => setStatus("選択セルをコピーしました"))
    .catch(() => {
      downloadText(text, `digitize_cells_${baseName(state.videoName) || "video"}.tsv`, "text/tab-separated-values");
      setStatus("ブラウザ権限でコピーできなかったため選択セルをTSVで書き出しました");
    });
  return true;
}

function parsePointCell(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const matches = text.match(/-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 2) return null;
  return { x: Number(matches[0]), y: Number(matches[1]) };
}

function parseTableCellRows(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return [];
  if (!normalized.includes("\t") && !normalized.includes("\n") && (normalized.match(/-?\d+(?:\.\d+)?/g) || []).length === 2) {
    return [[normalized]];
  }
  return parseDelimitedRows(normalized);
}

function pasteTableCellsText(text) {
  const range = tableSelectionRange();
  if (!range) return false;
  const rows = parseTableCellRows(text);
  if (rows.length === 0) {
    setStatus("貼り付ける表データがありません");
    return true;
  }
  const entries = [];
  const numericPairRows = rows.every((row) => row.length >= 2
    && row.length % 2 === 0
    && row.every((cell) => isNumericCell(cell)));
  if (numericPairRows) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const frame = range.startFrame + rowIndex;
      if (frame > state.trimEnd) break;
      for (let colIndex = 0; colIndex < rows[rowIndex].length; colIndex += 2) {
        const markerIndexValue = range.startMarkerIndex + colIndex / 2;
        if (markerIndexValue >= state.markers.length) break;
        entries.push({
          frame,
          marker: state.markers[markerIndexValue],
          point: manualPointFrom({
            x: Number(rows[rowIndex][colIndex]),
            y: Number(rows[rowIndex][colIndex + 1]),
            quality: {},
          }, "paste_cell"),
        });
      }
    }
  } else {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const frame = range.startFrame + rowIndex;
      if (frame > state.trimEnd) break;
      for (let colIndex = 0; colIndex < rows[rowIndex].length; colIndex += 1) {
        const markerIndexValue = range.startMarkerIndex + colIndex;
        if (markerIndexValue >= state.markers.length) break;
        const parsed = parsePointCell(rows[rowIndex][colIndex]);
        if (!parsed) continue;
        entries.push({
          frame,
          marker: state.markers[markerIndexValue],
          point: manualPointFrom({ ...parsed, quality: {} }, "paste_cell"),
        });
      }
    }
  }
  if (entries.length === 0) {
    setStatus("貼り付け可能なセル座標が見つかりません");
    return true;
  }
  setPointsBatch(entries);
  const first = entries[0];
  state.frame = clampFrame(first.frame);
  state.activeMarker = first.marker;
  state.selected = { frame: first.frame, marker: first.marker };
  setTableSelection(first.frame, first.marker);
  setStatus(`選択セルへ ${entries.length} 点を貼り付けました`);
  renderAll();
  return true;
}

function clearSelectedTableCells() {
  const range = tableSelectionRange();
  if (!range) return false;
  let count = 0;
  for (let frame = range.startFrame; frame <= range.endFrame; frame += 1) {
    for (let markerIndexValue = range.startMarkerIndex; markerIndexValue <= range.endMarkerIndex; markerIndexValue += 1) {
      if (deletePoint(frame, state.markers[markerIndexValue])) count += 1;
    }
  }
  if (count > 0) {
    setStatus(`選択セルから ${count} 点を削除しました`);
    renderAll();
  }
  return count > 0;
}

function updateCurrentTableRow() {
  for (const row of els.table.querySelectorAll("tbody tr")) {
    row.classList.toggle("current", Number(row.dataset.frame) === state.frame);
  }
}

function renderAll() {
  const selectedFrame = state.selected.frame ?? state.frame;
  const selectedMarker = state.selected.marker ?? state.activeMarker;
  if (els.pointStatus) els.pointStatus.value = pointStatusAt(selectedFrame, selectedMarker);
  const constraint = trackingConstraint(state.activeMarker);
  if (els.trackingMaxMove) els.trackingMaxMove.value = String(constraint.maxMove);
  if (els.trackingDirection) els.trackingDirection.value = constraint.direction;
  if (els.trackingPatchRadius) els.trackingPatchRadius.value = String(constraint.patchRadius);
  if (els.trackingConfidence) els.trackingConfidence.value = String(constraint.confidence);
  updateAIStatus();
  updateAITrackingControls();
  updateStatus();
  renderMarkers();
  renderMarkerVisibility();
  renderTable();
  renderAnalysis();
  draw();
}

function fillInterpolatedMarker(marker) {
  normalizeTrim();
  const frames = Object.keys(state.points)
    .map(Number)
    .filter((frame) => frame >= state.trimStart && frame <= state.trimEnd && getPoint(frame, marker))
    .sort((a, b) => a - b);
  let filled = 0;
  for (let i = 0; i < frames.length - 1; i += 1) {
    const a = frames[i];
    const b = frames[i + 1];
    if (b <= a + 1) continue;
    const p1 = getPoint(a, marker);
    const p2 = getPoint(b, marker);
    const span = b - a;
    const method = els.interpolationMethod?.value || "linear";
    for (let f = Math.max(a + 1, state.trimStart); f <= Math.min(b - 1, state.trimEnd); f += 1) {
      if (getPoint(f, marker)) continue;
      if (pointStatusAt(f, marker) !== "valid") continue;
      const t = (f - a) / span;
      let x = p1.x * (1 - t) + p2.x * t;
      let y = p1.y * (1 - t) + p2.y * t;
      let note = "linear_interp";
      if (method === "hold") {
        x = p1.x;
        y = p1.y;
        note = "hold_interp";
      } else if (method === "nearest") {
        const source = t <= 0.5 ? p1 : p2;
        x = source.x;
        y = source.y;
        note = "nearest_interp";
      }
      ensureFrame(f)[marker] = {
        x: normalizeCoordinate(x, state.videoWidth - 1),
        y: normalizeCoordinate(y, state.videoHeight - 1),
        src: "interp",
        quality: { note, method, alpha: Number(t.toFixed(6)), anchor_start: a, anchor_end: b },
      };
      filled += 1;
    }
  }
  return filled;
}

function interpolationPreview(marker = state.activeMarker) {
  normalizeTrim();
  const frames = Object.keys(state.points)
    .map(Number)
    .filter((frame) => frame >= state.trimStart && frame <= state.trimEnd && getPoint(frame, marker))
    .sort((a, b) => a - b);
  const ranges = [];
  let total = 0;
  for (let i = 0; i < frames.length - 1; i += 1) {
    const a = frames[i];
    const b = frames[i + 1];
    let count = 0;
    for (let f = a + 1; f <= b - 1; f += 1) {
      if (f >= state.trimStart && f <= state.trimEnd && !getPoint(f, marker) && pointStatusAt(f, marker) === "valid") count += 1;
    }
    if (count > 0) {
      total += count;
      ranges.push(`${a + 1}-${b - 1}: ${count}点`);
    }
  }
  return { marker, total, ranges };
}

function previewInterpolation() {
  const preview = interpolationPreview();
  const method = els.interpolationMethod?.selectedOptions?.[0]?.textContent || "線形";
  alert([
    `対象: ${preview.marker}`,
    `方法: ${method}`,
    `追加予定: ${preview.total}点`,
    "",
    ...(preview.ranges.length ? preview.ranges.slice(0, 20) : ["補間できる欠測区間はありません"]),
  ].join("\n"));
}

function reviewCandidates() {
  const candidates = [];
  for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
    for (const marker of state.markers) {
      const point = getPoint(frame, marker);
      const status = pointStatusAt(frame, marker);
      if (status === "uncertain" || (["track", "ai"].includes(point?.src) && Number(point.quality?.confidence || 0) < 0.6)) {
        candidates.push({ frame, marker, reason: status === "uncertain" ? "要確認" : "低信頼候補" });
      }
    }
  }
  const seen = new Set(candidates.map((item) => `${item.frame}:${item.marker}`));
  for (const jump of suspiciousJumps()) {
    const key = `${jump.frame}:${jump.marker}`;
    if (!seen.has(key)) candidates.push({ frame: jump.frame, marker: jump.marker, reason: "急な移動" });
  }
  return candidates.sort((a, b) => a.frame - b.frame || markerIndex(a.marker) - markerIndex(b.marker));
}

function jumpToNextReviewPoint() {
  const candidates = reviewCandidates();
  if (!candidates.length) {
    setStatus("要確認の点はありません");
    return;
  }
  const currentMarkerIndex = markerIndex(state.activeMarker);
  const target = candidates.find((item) => item.frame > state.frame
    || (item.frame === state.frame && markerIndex(item.marker) > currentMarkerIndex)) || candidates[0];
  moveToMarkerFrame(target.frame, target.marker, `${target.reason}: ${target.frame}F ${target.marker}`);
}

function beginBackgroundJob(name) {
  if (state.backgroundJob) return null;
  const job = { id: createSessionId(), name, cancelled: false };
  state.backgroundJob = job;
  els.cancelJob.disabled = false;
  els.jobStatus.textContent = `処理: ${name}`;
  return job;
}

function finishBackgroundJob(job, message) {
  if (state.backgroundJob?.id !== job.id) return;
  state.backgroundJob = null;
  els.cancelJob.disabled = true;
  els.jobStatus.textContent = "処理: 待機中";
  setStatus(message);
}

async function interpolateAllBackground() {
  const job = beginBackgroundJob("全マーカー補間");
  if (!job) {
    setStatus("別の処理が実行中です");
    return;
  }
  let total = 0;
  for (let index = 0; index < state.markers.length; index += 1) {
    if (job.cancelled) break;
    total += fillInterpolatedMarker(state.markers[index]);
    els.jobStatus.textContent = `処理: 全マーカー補間 ${index + 1}/${state.markers.length}`;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  if (total > 0) {
    recordAudit("interpolate_all", { count: total, cancelled: job.cancelled });
    touchPoints();
  }
  renderAll();
  finishBackgroundJob(job, job.cancelled ? `補間を中止しました: ${total}点まで処理` : `全マーカーを補間しました: ${total}点`);
}

function interpolateMarker(marker) {
  const filled = fillInterpolatedMarker(marker);
  if (filled > 0) touchPoints();
  setStatus(`${marker} を補間しました: ${filled}点`);
  renderAll();
}

function clearDerived() {
  let removed = 0;
  const removedCells = new Set();
  for (const [frame, row] of Object.entries(state.points)) {
    for (const [marker, point] of Object.entries(row)) {
      if (point.src !== "manual") {
        delete row[marker];
        setPointFlagValue(Number(frame), marker, null);
        removedCells.add(`${frame}\u0000${marker}`);
        removed += 1;
      }
    }
    if (Object.keys(row).length === 0) delete state.points[frame];
  }
  for (const [frame, row] of Object.entries(state.pointFlags)) {
    for (const [marker, flag] of Object.entries(row || {})) {
      if (flag?.model_id === HIGH_ACCURACY_AI_MODEL_ID && !removedCells.has(`${frame}\u0000${marker}`)) {
        setPointFlagValue(Number(frame), marker, null);
        removed += 1;
      }
    }
  }
  if (removed > 0) touchPoints();
  setStatus(`派生点を削除しました: ${removed}点`);
  renderAll();
}

function exportCheckSummary() {
  normalizeTrim();
  const transform = calibrationTransform();
  const markerTotal = state.markers.length;
  const frameTotal = trimFrameCount();
  const totalCells = markerTotal * frameTotal;
  let filled = 0;
  let manual = 0;
  let derived = 0;
  let missingFrames = 0;
  const missingMarkers = new Map(state.markers.map((marker) => [marker, 0]));

  for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
    let frameFilled = 0;
    for (const marker of state.markers) {
      const point = getPoint(frame, marker);
      if (point) {
        filled += 1;
        frameFilled += 1;
        if (point.src === "manual") manual += 1;
        else derived += 1;
      } else {
        missingMarkers.set(marker, (missingMarkers.get(marker) || 0) + 1);
      }
    }
    if (frameFilled < markerTotal) missingFrames += 1;
  }

  const missing = totalCells - filled;
  const topMissing = [...missingMarkers.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([marker, count]) => `${marker}:${count}`)
    .join("、") || "なし";

  const gateIssues = qualityGateIssues();
  return [
    "CSVを書き出します。内容を確認してください。",
    "",
    `動画: ${state.videoName || "未選択"}`,
    `範囲: ${state.trimStart}-${state.trimEnd} (${frameTotal}F)`,
    `解像度: ${state.videoWidth || "-"} x ${state.videoHeight || "-"}`,
    `FPS: ${Number(state.fps || 0).toFixed(3)}`,
    `入力済み: ${filled}/${totalCells}`,
    `欠測点: ${missing}`,
    `欠測を含むフレーム: ${missingFrames}/${frameTotal}`,
    `手入力点: ${manual}`,
    `補間/コピー等: ${derived}`,
    `欠測が多いマーカー: ${topMissing}`,
    `4点法: ${hasCalibrationPoints() ? "あり" : "なし"}`,
    `実長換算: ${transform ? `あり (${transform.unit})` : "なし"}`,
    `品質チェック: ${gateIssues.length ? gateIssues.map((issue) => issue.text).join(" / ") : "問題なし"}`,
    "",
    "このままCSVを出力しますか？",
  ].join("\n");
}

function exportCsv() {
  if (!state.ready) {
    setStatus("動画を開いてからCSV出力してください");
    return;
  }
  if (!confirm(exportCheckSummary())) {
    setStatus("CSV出力をキャンセルしました");
    return;
  }
  const metadataHeaders = METADATA_FIELDS.map(([key]) => `meta_${key}`);
  const metadata = metadataValues();
  const calibrationValues = calibrationCsvValues();
  const transform = calibrationTransform();
  const headers = ["global_frame", "time_sec", "local_frame", "local_time_sec", ...metadataHeaders];
  for (const marker of state.markers) {
    headers.push(
      `${marker}_x`, `${marker}_y`, `${marker}_src`, `${marker}_quality_note`, `${marker}_confidence`,
      `${marker}_track_score`, `${marker}_track_error`, `${marker}_track_disagreement`, `${marker}_status`, `${marker}_analysis_x`, `${marker}_analysis_y`,
    );
    if (transform) headers.push(`${marker}_real_x`, `${marker}_real_y`);
  }
  if (transform) headers.push("real_unit");
  headers.push(...calibrationHeaders());
  normalizeTrim();
  const rows = [headers];
  for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
    const localFrame = frame - state.trimStart;
    const row = [frame, frameToTime(frame).toFixed(6), localFrame, localFrameToTime(localFrame).toFixed(6), ...metadata];
    for (const marker of state.markers) {
      const p = getPoint(frame, marker);
      const analysisPoint = coordinatePoint(p);
      row.push(
        p ? formatCoord(p.x) : "", p ? formatCoord(p.y) : "", p?.src ?? "", p?.quality?.note ?? "",
        Number.isFinite(Number(p?.quality?.confidence)) ? Number(p.quality.confidence).toFixed(4) : "",
        Number.isFinite(Number(p?.quality?.track_score)) ? Number(p.quality.track_score).toFixed(6) : "",
        Number.isFinite(Number(p?.quality?.track_error)) ? Number(p.quality.track_error).toFixed(4) : "",
        Number.isFinite(Number(p?.quality?.track_disagreement)) ? Number(p.quality.track_disagreement).toFixed(4) : "",
        pointStatusAt(frame, marker), analysisPoint ? formatCoord(analysisPoint.x) : "", analysisPoint ? formatCoord(analysisPoint.y) : "",
      );
      if (transform) {
        const real = transformPoint(p, transform);
        row.push(real ? real.x.toFixed(6) : "", real ? real.y.toFixed(6) : "");
      }
    }
    if (transform) row.push(transform.unit);
    row.push(...calibrationValues);
    rows.push(row);
  }
  const csv = csvRowsText(rows);
  downloadText(csv, `digitize_${baseName(state.videoName) || "video"}.csv`, "text/csv");
  setStatus(transform ? "CSVを書き出しました（実長換算列あり）" : "CSVを書き出しました");
}

function csvRowsText(rows) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}

function exportAnalysisCsv() {
  if (!state.ready) {
    setStatus("動画を開いてから分析CSVを出力してください");
    return;
  }
  const transform = calibrationTransform();
  const unit = transform ? transform.unit : "px";
  const currentAnalysisFrame = analysisFrame();
  const metadataHeaders = METADATA_FIELDS.map(([key]) => `meta_${key}`);
  const metadata = metadataValues();
  const headers = [
    "type",
    "name",
    "global_frame",
    "time_sec",
    "delta_frame",
    "delta_time_sec",
    ...metadataHeaders,
    "distance_marker_a",
    "distance_marker_b",
    "distance",
    "distance_unit",
    "angle_marker_a",
    "angle_marker_b",
    "angle_marker_c",
    "angle_deg",
  ];
  const rows = [headers];
  for (const event of analysisEventsWithTiming()) {
    const distanceA = pointForAnalysis(event.frame, els.distanceMarkerA.value, transform);
    const distanceB = pointForAnalysis(event.frame, els.distanceMarkerB.value, transform);
    const distance = distanceBetweenPoints(distanceA, distanceB);
    const angleA = pointForAnalysis(event.frame, els.angleMarkerA.value, transform);
    const angleB = pointForAnalysis(event.frame, els.angleMarkerB.value, transform);
    const angleC = pointForAnalysis(event.frame, els.angleMarkerC.value, transform);
    const angle = angleABC(angleA, angleB, angleC);
    rows.push([
      "event",
      event.name,
      event.frame,
      event.time_sec.toFixed(6),
      event.delta_frame ?? "",
      event.delta_time_sec === null ? "" : event.delta_time_sec.toFixed(6),
      ...metadata,
      els.distanceMarkerA.value,
      els.distanceMarkerB.value,
      distance === null ? "" : distance.toFixed(6),
      unit,
      els.angleMarkerA.value,
      els.angleMarkerB.value,
      els.angleMarkerC.value,
      angle === null ? "" : angle.toFixed(6),
    ]);
  }

  rows.push([
    "analysis_frame",
    "分析フレーム",
    currentAnalysisFrame,
    frameToTime(currentAnalysisFrame).toFixed(6),
    "",
    "",
    ...metadata,
    els.distanceMarkerA.value,
    els.distanceMarkerB.value,
    distanceBetweenPoints(
      pointForAnalysis(currentAnalysisFrame, els.distanceMarkerA.value, transform),
      pointForAnalysis(currentAnalysisFrame, els.distanceMarkerB.value, transform),
    )?.toFixed(6) ?? "",
    unit,
    els.angleMarkerA.value,
    els.angleMarkerB.value,
    els.angleMarkerC.value,
    angleABC(
      pointForAnalysis(currentAnalysisFrame, els.angleMarkerA.value, transform),
      pointForAnalysis(currentAnalysisFrame, els.angleMarkerB.value, transform),
      pointForAnalysis(currentAnalysisFrame, els.angleMarkerC.value, transform),
    )?.toFixed(6) ?? "",
  ]);

  downloadText(csvRowsText(rows), `analysis_${baseName(state.videoName) || "video"}.csv`, "text/csv");
  setStatus("分析CSVを書き出しました");
}

function exportKinematicsCsv() {
  if (!state.ready) {
    setStatus("動画を開いてからキネマティクスCSVを出力してください");
    return;
  }
  const marker = els.kinematicsMarker.value || state.activeMarker;
  const transform = calibrationTransform();
  const unit = transform ? transform.unit : "px";
  const metadataHeaders = METADATA_FIELDS.map(([key]) => `meta_${key}`);
  const metadata = metadataValues();
  const headers = [
    "global_frame",
    "time_sec",
    "marker",
    "x",
    "y",
    "unit",
    "vx",
    "vy",
    "speed",
    "ax",
    "ay",
    "acceleration",
    ...metadataHeaders,
  ];
  const rows = [headers];
  for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
    const sample = samplePoint(frame, marker, transform);
    const metrics = kinematicsAtFrame(marker, frame, transform);
    rows.push([
      frame,
      frameToTime(frame).toFixed(6),
      marker,
      sample ? sample.x.toFixed(6) : "",
      sample ? sample.y.toFixed(6) : "",
      unit,
      metrics.velocity ? metrics.velocity.vx.toFixed(6) : "",
      metrics.velocity ? metrics.velocity.vy.toFixed(6) : "",
      metrics.velocity ? metrics.velocity.speed.toFixed(6) : "",
      metrics.acceleration ? metrics.acceleration.ax.toFixed(6) : "",
      metrics.acceleration ? metrics.acceleration.ay.toFixed(6) : "",
      metrics.acceleration ? metrics.acceleration.accel.toFixed(6) : "",
      ...metadata,
    ]);
  }
  downloadText(csvRowsText(rows), `kinematics_${baseName(state.videoName) || "video"}_${baseName(marker)}.csv`, "text/csv");
  setStatus(`${marker} のキネマティクスCSVを書き出しました`);
}

function exportSummaryCsv() {
  if (!state.ready) {
    setStatus("動画を開いてからサマリーCSVを出力してください");
    return;
  }
  const transform = calibrationTransform();
  const unit = transform ? transform.unit : "px";
  const stats = digitizeStats();
  const marker = els.kinematicsMarker.value || state.activeMarker;
  const path = pathStats(marker, transform);
  const frame = analysisFrame();
  const distance = distanceBetweenPoints(
    pointForAnalysis(frame, els.distanceMarkerA.value, transform),
    pointForAnalysis(frame, els.distanceMarkerB.value, transform),
  );
  const angle = angleABC(
    pointForAnalysis(frame, els.angleMarkerA.value, transform),
    pointForAnalysis(frame, els.angleMarkerB.value, transform),
    pointForAnalysis(frame, els.angleMarkerC.value, transform),
  );
  const intervalMap = new Map(analysisIntervals().map((interval) => [interval.name, interval.delta_time_sec.toFixed(6)]));
  const intervalHeaders = [...intervalMap.keys()].map((name) => `interval_${name}_sec`);
  const metadataHeaders = METADATA_FIELDS.map(([key]) => `meta_${key}`);
  const headers = [
    ...metadataHeaders,
    "video_name",
    "fps",
    "trim_start",
    "trim_end",
    "marker_count",
    "range_points",
    "missing_points",
    "complete_frames",
    "analysis_frame",
    "distance",
    "distance_unit",
    "angle_deg",
    "kinematics_marker",
    "path_distance",
    "max_speed",
    ...intervalHeaders,
  ];
  const row = [
    ...metadataValues(),
    state.videoName,
    Number(state.fps || 0).toFixed(6),
    state.trimStart,
    state.trimEnd,
    stats.marker_count,
    stats.range_points,
    stats.missing_range_points,
    stats.complete_frames,
    frame,
    distance === null ? "" : distance.toFixed(6),
    unit,
    angle === null ? "" : angle.toFixed(6),
    marker,
    path.sampleCount > 1 ? path.path.toFixed(6) : "",
    path.maxSpeed === null ? "" : path.maxSpeed.toFixed(6),
    ...[...intervalMap.values()],
  ];
  downloadText(csvRowsText([headers, row]), `summary_${baseName(state.videoName) || "video"}.csv`, "text/csv");
  setStatus("サマリーCSVを書き出しました");
}

function exportRealCsv() {
  if (!state.ready) {
    setStatus("動画を開いてから実長CSVを出力してください");
    return;
  }
  const transform = calibrationTransform();
  if (!transform) {
    setStatus("4点法実長換算を有効にしてから実長CSVを出力してください");
    return;
  }
  const headers = ["global_frame", "time_sec", "local_frame", "local_time_sec"];
  for (const marker of state.markers) headers.push(`${marker}_real_x`, `${marker}_real_y`, `${marker}_status`);
  headers.push("unit");
  const rows = [headers];
  for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
    const localFrame = frame - state.trimStart;
    const row = [frame, frameToTime(frame).toFixed(6), localFrame, localFrameToTime(localFrame).toFixed(6)];
    for (const marker of state.markers) {
      const real = transformPoint(getPoint(frame, marker), transform);
      row.push(real ? real.x.toFixed(6) : "", real ? real.y.toFixed(6) : "", pointStatusAt(frame, marker));
    }
    row.push(transform.unit);
    rows.push(row);
  }
  downloadText(csvRowsText(rows), `real_coordinates_${baseName(state.videoName) || "video"}.csv`, "text/csv");
  setStatus("実長換算CSVを書き出しました");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function exportReportHtml() {
  if (!state.ready) {
    setStatus("動画を開いてからレポートを出力してください");
    return;
  }
  const stats = digitizeStats();
  const metadataRows = METADATA_FIELDS.map(([key]) => [key, readMetadata()[key] || ""]);
  const qualityRows = [
    ["欠測点", stats.missing_range_points],
    ["完了フレーム", `${stats.complete_frames}/${stats.frame_count_in_range}`],
    ["急な移動候補", suspiciousJumps().slice(0, 10).map((item) => `${item.frame}F ${item.marker} ${item.distance.toFixed(1)}px`).join("<br>") || "なし"],
    ["左右入れ違い候補", sideCrossingIssues().slice(0, 10).map((item) => `${item.frame}F ${item.right}/${item.left}`).join("<br>") || "なし"],
  ];
  const eventRows = analysisEventsWithTiming().map((event) => [
    event.name,
    event.frame,
    event.time_sec.toFixed(6),
    event.delta_time_sec === null ? "" : event.delta_time_sec.toFixed(6),
  ]);
  const table = (headers, rows) => `
    <table>
      <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`;
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>VideoDigitizer Report</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",Meiryo,sans-serif;margin:24px;color:#1c2430}table{border-collapse:collapse;margin:12px 0 24px;width:100%}th,td{border:1px solid #d6dbe1;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f5f6f7}h1{font-size:22px}h2{font-size:16px;margin-top:24px}</style>
</head><body>
<h1>VideoDigitizer 解析レポート</h1>
<h2>動画</h2>
${table(["項目", "値"], videoInfoRows())}
<h2>メタデータ</h2>
${table(["項目", "値"], metadataRows)}
<h2>品質チェック</h2>
${table(["項目", "値"], qualityRows)}
<h2>イベント</h2>
${table(["名前", "Frame", "Time(s)", "前との差(s)"], eventRows.length ? eventRows : [["-", "-", "-", "-"]])}
</body></html>`;
  downloadText(html, `report_${baseName(state.videoName) || "video"}.html`, "text/html");
  setStatus("HTMLレポートを書き出しました");
}

function analysisProtocol() {
  return {
    distance_marker_a: els.distanceMarkerA.value,
    distance_marker_b: els.distanceMarkerB.value,
    angle_marker_a: els.angleMarkerA.value,
    angle_marker_b: els.angleMarkerB.value,
    angle_marker_c: els.angleMarkerC.value,
    angle_template: els.angleTemplate.value,
    kinematics_marker: els.kinematicsMarker.value,
    smoothing_mode: els.smoothingMode.value,
    smoothing_window: smoothingWindowSize(),
    event_name: els.eventName.value,
  };
}

function applyAnalysisProtocol(protocol = {}) {
  selectValueOrFallback(els.distanceMarkerA, protocol.distance_marker_a, state.markers[0]);
  selectValueOrFallback(els.distanceMarkerB, protocol.distance_marker_b, state.markers[1] || state.markers[0]);
  selectValueOrFallback(els.angleMarkerA, protocol.angle_marker_a, state.markers[0]);
  selectValueOrFallback(els.angleMarkerB, protocol.angle_marker_b, state.markers[1] || state.markers[0]);
  selectValueOrFallback(els.angleMarkerC, protocol.angle_marker_c, state.markers[2] || state.markers[0]);
  selectValueOrFallback(els.kinematicsMarker, protocol.kinematics_marker, state.activeMarker || state.markers[0]);
  if (els.angleTemplate) els.angleTemplate.value = protocol.angle_template || "";
  if (els.smoothingMode) els.smoothingMode.value = protocol.smoothing_mode || "none";
  if (els.smoothingWindow) els.smoothingWindow.value = String(Math.max(1, Math.min(21, Number(protocol.smoothing_window) || 5)));
  if (els.eventName && protocol.event_name !== undefined) els.eventName.value = String(protocol.event_name);
  renderAnalysisMetrics();
}

function saveAnalysisProtocol() {
  localStorage.setItem(PROTOCOL_KEY, JSON.stringify(analysisProtocol()));
  setStatus("解析設定を保存しました");
}

function loadAnalysisProtocol() {
  const raw = localStorage.getItem(PROTOCOL_KEY);
  if (!raw) {
    setStatus("保存済み解析設定がありません");
    return;
  }
  applyAnalysisProtocol(JSON.parse(raw));
  setStatus("解析設定を読み込みました");
}

function applyAngleTemplate() {
  const markers = ANGLE_TEMPLATES[els.angleTemplate.value];
  if (!markers) return;
  const [a, b, c] = markers;
  selectValueOrFallback(els.angleMarkerA, a, els.angleMarkerA.value);
  selectValueOrFallback(els.angleMarkerB, b, els.angleMarkerB.value);
  selectValueOrFallback(els.angleMarkerC, c, els.angleMarkerC.value);
  renderAnalysisMetrics();
  setStatus("角度テンプレートを適用しました");
}

function tableHeaders() {
  const headers = ["frame", "time_sec"];
  for (const marker of state.markers) headers.push(`${marker}_x`, `${marker}_y`);
  return headers;
}

function tableRowsForClipboard() {
  normalizeTrim();
  const rows = [tableHeaders()];
  for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
    const row = [frame, frameToTime(frame).toFixed(6)];
    for (const marker of state.markers) {
      const point = getPoint(frame, marker);
      row.push(point ? formatCoord(point.x) : "", point ? formatCoord(point.y) : "");
    }
    rows.push(row);
  }
  return rows;
}

function toTsv(rows) {
  return rows
    .map((row) => row.map((cell) => String(cell).replaceAll("\t", " ").replaceAll(/\r?\n/g, " ")).join("\t"))
    .join("\n");
}

function tableTsvText() {
  return toTsv(tableRowsForClipboard());
}

function copyTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.setAttribute("readonly", "");
  document.body.append(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  return ok;
}

async function copyTableToClipboard(event = null) {
  if (!state.ready) {
    setStatus("動画を開いてから表コピーできます");
    return;
  }
  const text = tableTsvText();
  if (event?.clipboardData) {
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    setStatus("表をコピーしました");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setStatus("表をコピーしました");
  } catch (_error) {
    if (copyTextFallback(text)) {
      setStatus("表をコピーしました");
    } else {
      downloadText(text, `digitize_table_${baseName(state.videoName) || "video"}.tsv`, "text/tab-separated-values");
      setStatus("ブラウザ権限でコピーできなかったためTSVを書き出しました");
    }
  }
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function parseDelimitedRows(text) {
  const lines = String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];
  if (!lines.some((line) => line.includes("\t") || line.includes(","))) {
    return lines.map((line) => line.trim().split(/\s+/));
  }
  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : ",";
  return lines.map((line) => parseDelimitedLine(line, delimiter).map((cell) => cell.trim()));
}

function isNumericCell(value) {
  return value !== "" && Number.isFinite(Number(value));
}

function looksLikeTableHeader(row) {
  const lower = row.map((cell) => cell.toLowerCase());
  if (lower.includes("frame") || lower.includes("global_frame") || lower.includes("local_frame")) return true;
  return state.markers.some((marker) => lower.includes(`${marker}_x`.toLowerCase()));
}

function markerColumnMapFromHeader(header) {
  const lower = header.map((cell) => cell.toLowerCase());
  const map = new Map();
  for (const marker of state.markers) {
    const x = lower.indexOf(`${marker}_x`.toLowerCase());
    const y = lower.indexOf(`${marker}_y`.toLowerCase());
    if (x >= 0 && y >= 0) map.set(marker, { x, y });
  }
  return map;
}

function rowFrameFromColumns(row, rowIndex, frameColumn, localFrameColumn, baseFrame) {
  if (frameColumn >= 0 && isNumericCell(row[frameColumn])) return Math.round(Number(row[frameColumn]));
  if (localFrameColumn >= 0 && isNumericCell(row[localFrameColumn])) return state.trimStart + Math.round(Number(row[localFrameColumn]));
  return baseFrame + rowIndex;
}

function entriesFromPastedRows(rows) {
  if (state.frameCount <= 0) return [];
  normalizeTrim();

  let dataRows = rows;
  let baseFrame = state.frame;
  let startColumn = 0;
  let markerColumns = null;
  let frameColumn = -1;
  let localFrameColumn = -1;
  const first = rows[0] || [];
  if (looksLikeTableHeader(first)) {
    const lower = first.map((cell) => cell.toLowerCase());
    frameColumn = lower.indexOf("global_frame");
    if (frameColumn < 0) frameColumn = lower.indexOf("frame");
    localFrameColumn = lower.indexOf("local_frame");
    markerColumns = markerColumnMapFromHeader(first);
    dataRows = rows.slice(1);
  } else if (
    first.length >= state.markers.length * 2 + 2
    && isNumericCell(first[0])
    && Number(first[0]) >= state.trimStart
    && Number(first[0]) <= state.trimEnd
  ) {
    frameColumn = 0;
    startColumn = 2;
  } else if (
    first.length >= state.markers.length * 2 + 1
    && isNumericCell(first[0])
    && Number(first[0]) >= state.trimStart
    && Number(first[0]) <= state.trimEnd
  ) {
    frameColumn = 0;
    startColumn = 1;
  }

  const entries = [];
  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
    const row = dataRows[rowIndex];
    const frame = rowFrameFromColumns(row, rowIndex, frameColumn, localFrameColumn, baseFrame);
    if (frame < state.trimStart || frame > state.trimEnd) continue;

    for (let markerIndexValue = 0; markerIndexValue < state.markers.length; markerIndexValue += 1) {
      const marker = state.markers[markerIndexValue];
      const columns = markerColumns?.get(marker) || {
        x: startColumn + markerIndexValue * 2,
        y: startColumn + markerIndexValue * 2 + 1,
      };
      const x = row[columns.x];
      const y = row[columns.y];
      if (!isNumericCell(x) || !isNumericCell(y)) continue;
      entries.push({
        frame,
        marker,
        point: manualPointFrom({ x: Number(x), y: Number(y), quality: {} }, "paste_table"),
      });
    }
  }
  return entries;
}

function pasteTableText(text) {
  const rows = parseDelimitedRows(text);
  if (rows.length === 0) {
    setStatus("貼り付ける表データがありません");
    return;
  }
  const entries = entriesFromPastedRows(rows);
  if (entries.length === 0) {
    setStatus("貼り付け可能な座標が見つかりません");
    return;
  }
  setPointsBatch(entries);
  const first = entries[0];
  state.frame = clampFrame(first.frame);
  state.activeMarker = first.marker;
  state.selected = { frame: first.frame, marker: first.marker };
  setStatus(`表から ${entries.length} 点を貼り付けました`);
  renderAll();
}

async function pasteTableFromClipboard(event = null) {
  if (event?.clipboardData) {
    const text = event.clipboardData.getData("text/plain");
    if (!text.trim()) return;
    event.preventDefault();
    if (hasTableSelection() && pasteTableCellsText(text)) return;
    pasteTableText(text);
    return;
  }
  try {
    const text = await navigator.clipboard.readText();
    if (text.trim()) {
      if (hasTableSelection() && pasteTableCellsText(text)) return;
      pasteTableText(text);
      return;
    }
    setStatus("貼り付ける表データがありません");
  } catch (_error) {
    setStatus("ブラウザ権限でクリップボードを読めませんでした");
  }
}

function digitizeStats() {
  normalizeTrim();
  const sourceCounts = {};
  let totalPoints = 0;
  let rangePoints = 0;
  let completeFrames = 0;
  const statusCounts = {};

  for (const row of Object.values(state.points)) {
    for (const point of Object.values(row || {})) {
      if (!point) continue;
      totalPoints += 1;
      sourceCounts[point.src || "unknown"] = (sourceCounts[point.src || "unknown"] || 0) + 1;
    }
  }

  for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
    for (const marker of state.markers) {
      if (getPoint(frame, marker)) rangePoints += 1;
      const status = pointStatusAt(frame, marker);
      if (status !== "valid") statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    if (isFrameComplete(frame)) completeFrames += 1;
  }

  const frameTotal = trimFrameCount();
  const expectedRangePoints = frameTotal * state.markers.length;
  return {
    total_points: totalPoints,
    range_points: rangePoints,
    missing_range_points: Math.max(0, expectedRangePoints - rangePoints),
    complete_frames: completeFrames,
    frame_count_in_range: frameTotal,
    marker_count: state.markers.length,
    source_counts: sourceCounts,
    status_counts: statusCounts,
  };
}

function digitizeCoordinates(transform = null) {
  normalizeTrim();
  const records = [];
  const frames = Object.keys(state.points)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  for (const frame of frames) {
    const row = state.points[String(frame)] || {};
    for (const marker of state.markers) {
      const point = row[marker];
      if (!point) continue;
      const record = {
        frame,
        local_frame: frame - state.trimStart,
        time_sec: Number(frameToTime(frame).toFixed(6)),
        marker,
        x: Number(formatCoord(point.x)),
        y: Number(formatCoord(point.y)),
        src: point.src || "",
        quality_note: point.quality?.note || "",
        quality: point.quality || {},
        status: pointStatusAt(frame, marker),
      };
      const analysisPoint = coordinatePoint(point);
      if (analysisPoint) {
        record.analysis_x = Number(analysisPoint.x.toFixed(6));
        record.analysis_y = Number(analysisPoint.y.toFixed(6));
      }
      const real = transformPoint(point, transform);
      if (real) {
        record.real_x = Number(real.x.toFixed(6));
        record.real_y = Number(real.y.toFixed(6));
        record.real_unit = transform.unit;
      }
      records.push(record);
    }
  }
  return records;
}

function digitizeSnapshot() {
  normalizeTrim();
  readCalibrationSettings();
  readCoordinateSystem();
  const transform = calibrationTransform();
  const coordinates = digitizeCoordinates(transform);
  return {
    version: 4,
    video: {
      name: state.videoName,
      fps: state.fps,
      frame_count: state.frameCount,
      width: state.videoWidth,
      height: state.videoHeight,
      identity: state.videoIdentity,
    },
    current_frame: state.frame,
    frame_range: {
      start: state.trimStart,
      end: state.trimEnd,
      count: trimFrameCount(),
    },
    coordinate_decimals: coordinateDecimals(),
    markers: state.markers,
    visible_markers: visibleMarkerList(),
    hidden_markers: hiddenMarkerList(),
    active_marker: state.activeMarker,
    cloud_sync: {
      project_id: state.cloud.projectId,
      generation: state.cloud.generation,
      last_synced_at: state.cloud.lastSyncedAt,
      enabled: state.cloud.enabled,
    },
    skeleton_segments: state.skeletonSegments,
    tracking_constraints: state.trackingConstraints,
    calibration: {
      method: "four_point",
      file_name: state.calibration.fileName,
      points: state.calibration.points,
      real_points: state.calibration.realPoints,
      unit: state.calibration.unit,
      enabled: state.calibration.enabled,
      transform: transform ? { h: transform.h, unit: transform.unit } : null,
      lens: state.lens,
      validation_point: {
        pixel_x: Number(els.calibCheckPixelX?.value),
        pixel_y: Number(els.calibCheckPixelY?.value),
        real_x: Number(els.calibCheckRealX?.value),
        real_y: Number(els.calibCheckRealY?.value),
      },
    },
    timing: {
      mode: Object.keys(state.frameTimestamps).length ? "per_frame" : "constant_fps",
      frame_timestamps: state.frameTimestamps,
    },
    coordinate_system: state.coordinateSystem,
    analysis: {
      frame: state.analysisFrame,
      events: state.analysisEvents.map((event) => ({ ...event })),
      protocol: analysisProtocol(),
    },
    study_trials: state.studyTrials,
    comparison: {
      identity: state.comparison.identity,
      metadata: state.comparison.metadata,
      offset: Math.round(Number(els.comparisonOffset?.value) || 0),
    },
    stats: digitizeStats(),
    coordinates,
    points: state.points,
    point_flags: state.pointFlags,
    ai_suggestions: state.aiSuggestions,
    audit_log: state.audit,
  };
}

function projectPayload() {
  const digitize = digitizeSnapshot();
  return {
    schema: PROJECT_SCHEMA,
    project_version: 6,
    saved_at: new Date().toISOString(),
    video_name: state.videoName,
    video_identity: state.videoIdentity,
    fps: state.fps,
    frame: state.frame,
    trim_start: state.trimStart,
    trim_end: state.trimEnd,
    markers: state.markers,
    active_marker: state.activeMarker,
    metadata: readMetadata(),
    calibration: {
      method: "four_point",
      file_name: state.calibration.fileName,
      points: state.calibration.points,
      real_points: state.calibration.realPoints,
      unit: state.calibration.unit,
      enabled: state.calibration.enabled,
      lens: state.lens,
      validation_point: digitize.calibration.validation_point,
    },
    timing: digitize.timing,
    coordinate_system: digitize.coordinate_system,
    analysis: {
      frame: state.analysisFrame,
      events: state.analysisEvents.map((event) => ({ ...event })),
      protocol: analysisProtocol(),
    },
    study_trials: state.studyTrials,
    comparison: digitize.comparison,
    ui_settings: {
      auto_advance: els.autoAdvance.checked,
      advance_mode: els.advanceMode.value,
      step: stepSize(),
      coordinate_decimals: coordinateDecimals(),
      zoom_enabled: els.zoomEnabled.checked,
      zoom_scale: zoomScale(),
      zoom_lens_size: zoomLensSize(),
      frame_quality: frameQuality(),
      cursor_guide_mode: els.cursorGuideMode.value,
      point_size: pointSize(),
      line_width: overlayLineWidth(),
      manual_point_color: manualPointColor(),
      interpolation_method: els.interpolationMethod.value,
      calibration_overlay_enabled: els.calibOverlayEnabled.checked,
      skeleton_enabled: els.skeletonEnabled.checked,
      hidden_markers: hiddenMarkerList(),
      trail_length: Math.max(0, Math.round(Number(els.trailInput.value) || 0)),
      trail_mode: els.trailMode.value,
      tracking_max_move: Math.max(1, Number(els.trackingMaxMove?.value) || 50),
      tracking_patch_radius: Math.max(3, Math.min(24, Math.round(Number(els.trackingPatchRadius?.value) || 8))),
      tracking_confidence: Math.max(0.2, Math.min(0.95, Number(els.trackingConfidence?.value) || 0.55)),
      tracking_engine: els.trackingEngine?.value === "tapnextpp" ? "tapnextpp" : "lightweight",
      ai_tracking_resolution: Number(els.aiTrackingResolution?.value) === 512 ? 512 : 256,
      show_ai_suggestions: els.showAISuggestions.checked,
      workspace: workspaceSettings(),
    },
    digitize,
    // A flat coordinate list makes the saved project easy to inspect and parse.
    coordinates: digitize.coordinates,
    // Keep this root field so older project files/tools can still find coordinates.
    points: state.points,
    point_flags: state.pointFlags,
    ai_suggestions: state.aiSuggestions,
    audit_log: state.audit,
  };
}

function projectJsonText() {
  return JSON.stringify(projectPayload(), null, 2);
}

function autosavePayload() {
  const payload = projectPayload();
  payload.storage_format = "compact_autosave_v1";

  // Autosave only needs the canonical point store. The portable project keeps
  // the duplicated, human-readable coordinate records for external tools.
  delete payload.coordinates;
  delete payload.points;
  delete payload.point_flags;
  delete payload.ai_suggestions;
  delete payload.audit_log;
  delete payload.digitize.coordinates;
  delete payload.digitize.stats;

  // These sections already exist at the project root.
  delete payload.digitize.calibration;
  delete payload.digitize.timing;
  delete payload.digitize.coordinate_system;
  delete payload.digitize.analysis;
  delete payload.digitize.study_trials;
  delete payload.digitize.comparison;
  return payload;
}

function autosaveJsonText() {
  return JSON.stringify(autosavePayload());
}

const CLOUD_POINT_QUALITY_FIELDS = [
  "confidence", "note", "track_score", "track_error", "track_disagreement", "match_margin",
  "source_frame", "patch_radius", "search_radius_x", "search_radius_y", "elapsed_ms", "method",
  "forward_confidence", "backward_confidence", "start_anchor_frame", "end_anchor_frame", "alpha",
  "anchor_start", "anchor_end", "model_id", "model_version", "runtime", "suggestion_id",
  "landmark_index", "generated_at", "accepted_at", "device", "input_resolution", "visible", "redetected",
];

function cloudScalarFields(source, fields) {
  const output = {};
  if (!source || typeof source !== "object" || Array.isArray(source)) return output;
  for (const field of fields) {
    const value = source[field];
    if (value === null || ["string", "boolean"].includes(typeof value)) output[field] = value;
    else if (typeof value === "number" && Number.isFinite(value)) output[field] = value;
  }
  return output;
}

function cloudPointStore() {
  const output = {};
  for (const [frameKey, row] of Object.entries(state.points)) {
    const frame = Number(frameKey);
    if (!Number.isInteger(frame) || frame < state.trimStart || frame > state.trimEnd || !row || typeof row !== "object") continue;
    const cleanRow = {};
    for (const marker of state.markers) {
      const point = row[marker];
      if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) continue;
      cleanRow[marker] = {
        x: Number(point.x),
        y: Number(point.y),
        src: ["manual", "interp", "ai", "track"].includes(point.src) ? point.src : "",
        quality: cloudScalarFields(point.quality, CLOUD_POINT_QUALITY_FIELDS),
      };
    }
    if (Object.keys(cleanRow).length) output[String(frame)] = cleanRow;
  }
  return output;
}

function cloudPointFlagStore() {
  const output = {};
  for (const [frameKey, row] of Object.entries(state.pointFlags)) {
    const frame = Number(frameKey);
    if (!Number.isInteger(frame) || frame < state.trimStart || frame > state.trimEnd || !row || typeof row !== "object") continue;
    const cleanRow = {};
    for (const marker of state.markers) {
      const flag = row[marker];
      if (!flag || !POINT_STATUS_LABELS[String(flag.status)]) continue;
      cleanRow[marker] = {
        status: String(flag.status),
        ...cloudScalarFields(flag, ["updated_at", "confidence", "model_id", "model_version"]),
      };
    }
    if (Object.keys(cleanRow).length) output[String(frame)] = cleanRow;
  }
  return output;
}

function cloudDigitizePayload() {
  normalizeTrim();
  readCalibrationSettings();
  readCoordinateSystem();
  const identity = state.videoIdentity || {};
  return {
    schema: "video_digitizer_cloud_data_v1",
    version: 1,
    saved_at: new Date().toISOString(),
    source_signature: {
      digest_algorithm: String(identity.digest_algorithm || ""),
      digest: String(identity.digest || ""),
      fps: state.fps,
      frame_count: state.frameCount,
      width: state.videoWidth,
      height: state.videoHeight,
    },
    frame_range: { start: state.trimStart, end: state.trimEnd },
    markers: [...state.markers],
    skeleton_segments: state.skeletonSegments.map((segment) => [...segment]),
    tracking_constraints: Object.fromEntries(state.markers.map((marker) => [
      marker,
      cloudScalarFields(state.trackingConstraints[marker], ["maxMove", "direction", "patchRadius", "confidence"]),
    ]).filter(([, value]) => Object.keys(value).length)),
    calibration: {
      method: "four_point",
      points: state.calibration.points.slice(0, 4).map((point, index) => ({
        label: `calib_p${index + 1}`,
        x: Number(point.x),
        y: Number(point.y),
      })),
      real_points: state.calibration.realPoints.slice(0, 4).map((point) => ({ x: Number(point.x), y: Number(point.y) })),
      unit: state.calibration.unit,
      enabled: state.calibration.enabled,
      lens: structuredClone(state.lens),
    },
    timing: {
      mode: Object.keys(state.frameTimestamps).length ? "per_frame" : "constant_fps",
      frame_timestamps: Object.fromEntries(Object.entries(state.frameTimestamps).filter(([frame, value]) => (
        Number(frame) >= state.trimStart && Number(frame) <= state.trimEnd && Number.isFinite(Number(value))
      )).map(([frame, value]) => [String(Number(frame)), Number(value)])),
    },
    coordinate_system: structuredClone(state.coordinateSystem),
    points: cloudPointStore(),
    point_flags: cloudPointFlagStore(),
  };
}

function saveProjectPackage() {
  const payload = projectPayload();
  payload.package = {
    format: "video_digitizer_portable_project_v1",
    app_version: APP_VERSION,
    video_embedded: false,
    video_reference: state.videoIdentity,
  };
  downloadText(
    JSON.stringify(payload, null, 2),
    `digitize_${baseName(state.videoName) || "project"}.vdproj`,
    "application/json",
  );
  recordAudit("save_project_package", { video_digest: state.videoIdentity?.digest || "" });
  setStatus("軽量プロジェクトパッケージを書き出しました");
}

function diagnosticPayload() {
  const stats = digitizeStats();
  return {
    generated_at: new Date().toISOString(),
    app_version: APP_VERSION,
    browser: navigator.userAgent,
    platform: navigator.platform,
    device_memory_gb: Number(navigator.deviceMemory) || null,
    video: {
      name: state.videoName,
      identity: state.videoIdentity,
      width: state.videoWidth,
      height: state.videoHeight,
      fps: state.fps,
      frame_count: state.frameCount,
    },
    project: {
      dirty: state.dirty,
      stats,
      audit_event_count: state.audit.length,
      point_revision: state.pointRevision,
    },
    performance: {
      client_cache_limit: clientFrameCacheLimit(),
      client_cache_entries: state.frameCache.size,
      pending_frame_requests: state.frameRequests.size,
      prefetch_radius: clientPrefetchRadius(),
    },
  };
}

function downloadDiagnostics() {
  downloadText(JSON.stringify(diagnosticPayload(), null, 2), `video_digitizer_diagnostics_${Date.now()}.json`, "application/json");
  setStatus("動画本体と座標を含まない診断情報を書き出しました");
}

async function checkUpdates() {
  try {
    const response = await fetch("./version.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    els.appVersion.textContent = `Version ${APP_VERSION} / 配布版 ${manifest.version || "-"}`;
    setStatus(manifest.version === APP_VERSION ? "現在の配布版です" : `配布版 ${manifest.version} を確認してください`);
  } catch (error) {
    setStatus(`更新情報を確認できませんでした: ${error.message}`);
  }
}

function localApiUrl(path) {
  return `./api/${path}?${sessionQuery()}`;
}

function updateAccountUI() {
  const account = state.account;
  const localApp = state.sourceMode === "api";
  els.accountMenu.hidden = !localApp;
  const label = account.profile?.name || account.profile?.email || "Googleアカウント";
  els.accountSummary.textContent = account.authenticated ? label : "ログイン";
  els.googleSignIn.hidden = account.authenticated;
  els.googleSignIn.disabled = !localApp || !account.configured;
  els.googleSignOut.hidden = !account.authenticated;
  els.googleSignOut.disabled = !account.authenticated;
  els.restoreAccountCache.disabled = !account.authenticated;
  els.deleteAccountCache.disabled = !account.authenticated;
  const cloudAvailable = localApp && account.authenticated && state.cloud.configured;
  els.cloudSyncField.hidden = !cloudAvailable;
  els.cloudSyncEnabled.checked = state.cloud.enabled;
  els.cloudSyncEnabled.disabled = !cloudAvailable;
  els.restoreCloudProject.hidden = !cloudAvailable;
  els.finalizeCloudProject.hidden = !cloudAvailable;
  els.finalizeCloudProject.disabled = !state.cloud.enabled || !state.cloud.generation || state.cloud.conflict;
  els.deleteCloudProject.hidden = !cloudAvailable;
  els.deleteCloudProject.disabled = !state.cloud.generation;
  if (!localApp) {
    els.accountStatus.textContent = "Googleログインとアカウント別保存はMacアプリ版で利用できます。";
  } else if (account.authenticated) {
    const saved = account.lastSavedAt ? ` / 自動保存 ${new Date(account.lastSavedAt).toLocaleTimeString()}` : "";
    const cloud = state.cloud.configured
      ? !state.cloud.enabled ? " / クラウドOFF"
        : state.cloud.conflict ? " / クラウド競合"
          : state.cloud.lastSyncedAt ? ` / クラウド ${new Date(state.cloud.lastSyncedAt).toLocaleTimeString()}`
            : " / クラウド待機"
      : "";
    els.accountStatus.textContent = `${label}でログイン中${saved}${cloud}`;
  } else if (!account.configured) {
    els.accountStatus.textContent = "GoogleログインはOAuthクライアント設定後に利用できます。";
  } else {
    els.accountStatus.textContent = "ログインすると、このMac内の自動保存をアカウント別に分けられます。";
  }
}

async function refreshCloudStatus() {
  if (state.sourceMode !== "api" || !state.account.authenticated) {
    state.cloud.configured = false;
    updateAccountUI();
    return state.cloud;
  }
  try {
    const response = await fetch(localApiUrl("cloud/status"), { cache: "no-store" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    const status = await response.json();
    state.cloud.configured = Boolean(status.configured);
  } catch (_error) {
    state.cloud.configured = false;
  }
  updateAccountUI();
  return state.cloud;
}

async function syncCloudDigitize(options = {}) {
  if (
    state.sourceMode !== "api"
    || !state.account.authenticated
    || !state.cloud.configured
    || !state.cloud.enabled
    || state.cloud.syncing
    || Object.keys(state.points).length === 0
    || (!options.force && !state.cloud.dirty)
  ) return null;

  state.cloud.syncing = true;
  try {
    const response = await fetch(localApiUrl(options.finalize ? "cloud/finalize" : "cloud/sync"), {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: state.cloud.projectId,
        generation: state.cloud.generation,
        payload: cloudDigitizePayload(),
      }),
    });
    if (!response.ok) {
      if (response.status === 409) {
        state.cloud.conflict = true;
        updateAccountUI();
        setStatus("クラウド版が別の端末で更新されています。自動上書きを停止しました");
        return null;
      }
      throw new Error(await apiErrorMessage(response));
    }
    const result = await response.json();
    if (result.generation) state.cloud.generation = String(result.generation);
    state.cloud.lastSyncedAt = Date.now();
    state.cloud.dirty = false;
    state.cloud.conflict = false;
    updateAccountUI();
    return result;
  } catch (error) {
    setStatus(`クラウド同期を保留しました: ${error.message}`);
    return null;
  } finally {
    state.cloud.syncing = false;
  }
}

async function refreshAccountStatus() {
  if (state.sourceMode !== "api") {
    updateAccountUI();
    return state.account;
  }
  try {
    const response = await fetch(localApiUrl("auth/status"), { cache: "no-store" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    const status = await response.json();
    state.account.configured = Boolean(status.configured);
    state.account.authenticated = Boolean(status.authenticated);
    state.account.profile = status.profile || null;
  } catch (_error) {
    state.account.configured = false;
    state.account.authenticated = false;
    state.account.profile = null;
  }
  updateAccountUI();
  return state.account;
}

async function startGoogleSignIn() {
  const authWindow = window.open("about:blank", "videodigitizer-google-login", "width=620,height=760");
  try {
    const response = await fetch(localApiUrl("auth/google/start"), { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    const payload = await response.json();
    if (!authWindow) throw new Error("ログイン画面のポップアップがブロックされました");
    authWindow.opener = null;
    authWindow.location.replace(payload.authorization_url);
    setStatus("Googleログインの完了を待っています");
    const deadline = Date.now() + Math.min(10 * 60_000, Number(payload.expires_in || 600) * 1000);
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      await refreshAccountStatus();
      if (state.account.authenticated) {
        await refreshCloudStatus();
        setStatus("Googleログインが完了しました");
        return;
      }
    }
    throw new Error("Googleログインが時間切れになりました");
  } catch (error) {
    authWindow?.close();
    setStatus(`Googleログインを開始できませんでした: ${error.message}`);
  }
}

async function signOutGoogle() {
  try {
    const response = await fetch(localApiUrl("auth/signout"), { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    state.account.authenticated = false;
    state.account.profile = null;
    state.account.lastSavedAt = 0;
    updateAccountUI();
    setStatus("Googleアカウントからログアウトしました");
  } catch (error) {
    setStatus(`ログアウトできませんでした: ${error.message}`);
  }
}

async function deleteAccountAutosave() {
  if (!confirm("このGoogleアカウントに紐づく、このMac内の自動保存を削除しますか？")) return;
  try {
    const response = await fetch(localApiUrl("account-cache/delete"), { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    state.account.lastSavedAt = 0;
    updateAccountUI();
    setStatus("アカウント別の自動保存を削除しました");
  } catch (error) {
    setStatus(`自動保存を削除できませんでした: ${error.message}`);
  }
}

async function deleteCloudProject() {
  if (!state.cloud.generation) return;
  if (!confirm("現在のプロジェクトのクラウド保存を削除しますか？\nMac内の動画とプロジェクトは削除されません。")) return;
  try {
    const response = await fetch(localApiUrl("cloud/delete"), {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: state.cloud.projectId }),
    });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    state.cloud.enabled = false;
    state.cloud.generation = "";
    state.cloud.lastSyncedAt = 0;
    state.cloud.dirty = false;
    state.cloud.conflict = false;
    markDirty();
    state.cloud.dirty = false;
    updateAccountUI();
    setStatus("クラウド上のデジタイズデータを削除しました");
  } catch (error) {
    setStatus(`クラウド保存を削除できませんでした: ${error.message}`);
  }
}

function portableProjectFromCloud(cloudPayload, projectId, generation) {
  const signature = cloudPayload.source_signature || {};
  const range = cloudPayload.frame_range || {};
  return {
    schema: PROJECT_SCHEMA,
    project_version: 6,
    saved_at: cloudPayload.saved_at,
    video_identity: { ...signature },
    fps: Number(signature.fps) || 30,
    trim_start: Number(range.start) || 0,
    trim_end: Number(range.end) || 0,
    markers: cloudPayload.markers,
    calibration: cloudPayload.calibration,
    timing: cloudPayload.timing,
    coordinate_system: cloudPayload.coordinate_system,
    points: cloudPayload.points,
    point_flags: cloudPayload.point_flags,
    cloud_sync: {
      project_id: projectId,
      generation,
      last_synced_at: Date.now(),
      enabled: true,
    },
    digitize: {
      frame_range: range,
      markers: cloudPayload.markers,
      skeleton_segments: cloudPayload.skeleton_segments,
      tracking_constraints: cloudPayload.tracking_constraints,
      calibration: cloudPayload.calibration,
      timing: cloudPayload.timing,
      coordinate_system: cloudPayload.coordinate_system,
      points: cloudPayload.points,
      point_flags: cloudPayload.point_flags,
    },
  };
}

async function restoreLatestCloudProject() {
  if (!confirm("最新のクラウド保存を読み込みますか？\n現在の未保存座標は上書きされ、動画はMac内のものを使います。")) return;
  try {
    const listResponse = await fetch(localApiUrl("cloud/projects"), { cache: "no-store" });
    if (!listResponse.ok) throw new Error(await apiErrorMessage(listResponse));
    const projects = (await listResponse.json()).projects || [];
    if (!projects.length) throw new Error("クラウド保存がありません");
    const latest = projects[0];
    const response = await fetch(`${localApiUrl("cloud/project")}&project_id=${encodeURIComponent(latest.project_id)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    const result = await response.json();
    const portable = portableProjectFromCloud(result.payload, latest.project_id, result.generation);
    loadProject(new File([JSON.stringify(portable)], "cloud_project.json", { type: "application/json" }));
  } catch (error) {
    setStatus(`クラウド保存を復元できませんでした: ${error.message}`);
  }
}

async function finalizeCloudProject() {
  if (!confirm("現在のクラウド座標を分析用データとして確定しますか？")) return;
  const synced = await syncCloudDigitize({ force: true });
  if (!synced || state.cloud.conflict) return;
  const result = await syncCloudDigitize({ force: true, finalize: true });
  if (result) setStatus(`クラウド座標を確定しました: ${Number(result.rows) || 0}点`);
}

async function writeAccountAutosave(text) {
  if (state.sourceMode !== "api" || !state.account.authenticated) return;
  try {
    const response = await fetch(localApiUrl("account-cache"), {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: text,
    });
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    const result = await response.json();
    state.account.lastSavedAt = Number(result.saved_at || 0) * 1000;
    updateAccountUI();
  } catch (_error) {
    // Browser IndexedDB remains the fallback if the account cache is unavailable.
  }
}

function writeAutosave() {
  if (!state.dirty && !state.ready && Object.keys(state.points).length === 0) return;
  const text = autosaveJsonText();
  globalThis.VideoDigitizerStorage?.set(AUTOSAVE_KEY, text).catch(() => {});
  writeAccountAutosave(text);
}

async function accountAutosaveText() {
  if (state.sourceMode !== "api" || !state.account.authenticated) return null;
  const response = await fetch(localApiUrl("account-cache"), { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await apiErrorMessage(response));
  return response.text();
}

async function restoreAutosave(options = {}) {
  let raw = null;
  if (!options.localOnly) {
    try {
      raw = await accountAutosaveText();
    } catch (_error) {
      raw = null;
    }
  }
  if (!raw && !options.accountOnly) {
    try {
      raw = await globalThis.VideoDigitizerStorage?.get(AUTOSAVE_KEY);
    } catch (_error) {
      // Continue to the one-time localStorage migration.
    }
  }
  if (!raw && !options.accountOnly) {
    try {
      raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        globalThis.VideoDigitizerStorage?.set(AUTOSAVE_KEY, raw).catch(() => {});
        localStorage.removeItem(AUTOSAVE_KEY);
      }
    } catch (_error) {
      raw = null;
    }
  }
  if (!raw) {
    setStatus("復元できる自動保存がありません");
    return;
  }
  if (!confirm("自動保存されたプロジェクトを読み込みますか？\n現在の未保存内容は上書きされます。")) return;
  const file = new File([raw], "autosave_project.json", { type: "application/json" });
  loadProject(file);
}

function restoreAccountAutosave() {
  restoreAutosave({ accountOnly: true });
}

function defaultProjectFilename() {
  return state.projectFileName || `digitize_project_${baseName(state.videoName) || "video"}.json`;
}

function supportsFileSystemAccess() {
  return typeof window.showSaveFilePicker === "function";
}

async function writeProjectHandle(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function saveProjectAs() {
  const text = projectJsonText();
  const payload = JSON.parse(text);
  if (supportsFileSystemAccess()) {
    const handle = await window.showSaveFilePicker({
      suggestedName: defaultProjectFilename(),
      types: [{
        description: "Digitize project JSON",
        accept: { "application/json": [".json"] },
      }],
    });
    await writeProjectHandle(handle, text);
    state.projectFileHandle = handle;
    state.projectFileName = handle.name || defaultProjectFilename();
    cleanDirty();
    setStatus(`プロジェクトを保存しました: ${state.projectFileName} (${payload.digitize.stats.total_points}点)`);
    syncCloudDigitize({ force: true });
    return;
  }
  downloadText(text, defaultProjectFilename(), "application/json");
  cleanDirty();
  setStatus(`プロジェクトを書き出しました: ${payload.digitize.stats.total_points}点`);
  syncCloudDigitize({ force: true });
}

async function saveProject() {
  try {
    await saveProjectAs();
  } catch (error) {
    if (error?.name === "AbortError") {
      setStatus("保存をキャンセルしました");
    } else {
      setStatus(`保存に失敗しました: ${error.message}`);
    }
  }
}

async function overwriteProject() {
  try {
    if (!state.projectFileHandle) {
      if (!supportsFileSystemAccess()) {
        await saveProjectAs();
        return;
      }
      setStatus("上書き先を選んでください");
      await saveProjectAs();
      return;
    }
    const text = projectJsonText();
    const payload = JSON.parse(text);
    await writeProjectHandle(state.projectFileHandle, text);
    cleanDirty();
    setStatus(`上書き保存しました: ${state.projectFileName || state.projectFileHandle.name} (${payload.digitize.stats.total_points}点)`);
    syncCloudDigitize({ force: true });
  } catch (error) {
    if (error?.name === "AbortError") {
      setStatus("保存をキャンセルしました");
    } else {
      state.projectFileHandle = null;
      setStatus(`上書き保存に失敗しました: ${error.message}`);
    }
  }
}

function pointsFromCoordinateRecords(records) {
  if (!Array.isArray(records)) return {};
  const points = {};
  for (const record of records) {
    const frame = Math.round(Number(record?.frame));
    const marker = String(record?.marker || "");
    const x = Number(record?.x);
    const y = Number(record?.y);
    if (!Number.isFinite(frame) || !marker || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!points[String(frame)]) points[String(frame)] = {};
    points[String(frame)][marker] = {
      x,
      y,
      src: String(record.src || "manual"),
      quality: record.quality && typeof record.quality === "object"
        ? record.quality
        : { note: String(record.quality_note || "project_coordinates") },
    };
  }
  return points;
}

function normalizeAISuggestionStore(store) {
  if (!store || typeof store !== "object" || Array.isArray(store)) return {};
  const normalized = {};
  for (const [frameKey, row] of Object.entries(store)) {
    const frame = Math.round(Number(frameKey));
    if (!Number.isFinite(frame) || !row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const [marker, value] of Object.entries(row)) {
      const x = Number(value?.x);
      const y = Number(value?.y);
      if (!marker || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const status = ["pending", "accepted", "rejected"].includes(value.status) ? value.status : "pending";
      if (!normalized[String(frame)]) normalized[String(frame)] = {};
      normalized[String(frame)][marker] = {
        ...value,
        schema_version: Number(value.schema_version) || AI_SUGGESTION_VERSION,
        frame,
        marker,
        x,
        y,
        confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
        status,
      };
    }
  }
  return normalized;
}

function normalizeCalibrationPoints(points, fileName = "") {
  if (!Array.isArray(points)) return [];
  const normalized = [];
  const seen = new Set();
  for (const item of points) {
    const x = Number(item?.x);
    const y = Number(item?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const key = `${x}\u001f${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      label: String(item.label || item.marker || `calib_p${normalized.length + 1}`),
      x: Math.round(x * coordinateScale()) / coordinateScale(),
      y: Math.round(y * coordinateScale()) / coordinateScale(),
      frame: Number.isFinite(Number(item.frame)) ? Math.round(Number(item.frame)) : null,
      source_file: fileName,
    });
    if (normalized.length === 4) break;
  }
  return normalized;
}

function coordinateRecordsFromProjectPayload(payload) {
  const digitize = payload?.digitize && typeof payload.digitize === "object" ? payload.digitize : {};
  const records = digitize.coordinates || payload?.coordinates;
  if (Array.isArray(records)) return records;
  const points = digitize.points || payload?.points;
  if (!points || typeof points !== "object" || Array.isArray(points)) return [];

  const result = [];
  for (const frame of Object.keys(points).sort((a, b) => Number(a) - Number(b))) {
    const row = points[frame] || {};
    for (const [marker, point] of Object.entries(row)) {
      result.push({
        frame: Number(frame),
        marker,
        x: point?.x,
        y: point?.y,
      });
    }
  }
  return result;
}

function calibrationPointsFromProjectPayload(payload, fileName) {
  const saved = payload?.calibration?.points || payload?.digitize?.calibration?.points;
  if (Array.isArray(saved) && saved.length >= 4) return normalizeCalibrationPoints(saved, fileName);
  return normalizeCalibrationPoints(coordinateRecordsFromProjectPayload(payload), fileName);
}

function calibrationPointsFromHeaderRows(rows, fileName) {
  if (rows.length < 2) return [];
  const header = rows[0] || [];
  if (!looksLikeTableHeader(header)) return [];
  const columns = markerColumnMapFromHeader(header);
  const points = [];
  for (const marker of state.markers) {
    const pair = columns.get(marker);
    if (!pair) continue;
    for (const row of rows.slice(1)) {
      const x = row[pair.x];
      const y = row[pair.y];
      if (!isNumericCell(x) || !isNumericCell(y)) continue;
      points.push({ marker, x: Number(x), y: Number(y), source_file: fileName });
      break;
    }
    if (points.length === 4) break;
  }
  return normalizeCalibrationPoints(points, fileName);
}

function calibrationPointsFromNumericRows(rows, fileName) {
  if (rows.length === 0) return [];
  const twoColumnRows = rows.filter((row) => row.length >= 2 && isNumericCell(row[0]) && isNumericCell(row[1]));
  if (twoColumnRows.length >= 4) {
    return normalizeCalibrationPoints(twoColumnRows.slice(0, 4).map((row, index) => ({
      label: `calib_p${index + 1}`,
      x: Number(row[0]),
      y: Number(row[1]),
      source_file: fileName,
    })), fileName);
  }
  const source = rows.find((row) => row.length >= 8 && row.slice(0, 8).every(isNumericCell));
  if (!source) return [];
  const points = [];
  for (let index = 0; index < 8; index += 2) {
    points.push({
      label: `calib_p${points.length + 1}`,
      x: Number(source[index]),
      y: Number(source[index + 1]),
      source_file: fileName,
    });
  }
  return normalizeCalibrationPoints(points, fileName);
}

function calibrationPointsFromText(text, fileName) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{")) {
    return calibrationPointsFromProjectPayload(JSON.parse(trimmed), fileName);
  }
  const rows = parseDelimitedRows(trimmed);
  const headerPoints = calibrationPointsFromHeaderRows(rows, fileName);
  return headerPoints.length === 4 ? headerPoints : calibrationPointsFromNumericRows(rows, fileName);
}

function importCalibrationFile(file) {
  readFileText(file, "4点法ファイル").then((text) => {
    try {
      const points = calibrationPointsFromText(String(text || ""), file.name);
      if (points.length !== 4) throw new Error("4点を取得できませんでした");
      readCalibrationSettings();
      state.calibration = {
        ...state.calibration,
        fileName: file.name,
        points,
        enabled: true,
      };
      writeCalibrationSettings(state.calibration);
      state.tableSnapshot = "";
      markDirty();
      renderTable();
      updateStatus();
      setStatus(`4点法データを読み込みました: ${file.name}`);
    } catch (error) {
      setStatus(`4点法読込に失敗しました: ${error.message}`);
    } finally {
      els.calibrationFile.value = "";
    }
  }).catch((error) => {
    setStatus(`4点法読込に失敗しました: ${error.message}`);
    els.calibrationFile.value = "";
  });
}

function validateCalibrationPoint() {
  const transform = calibrationTransform();
  if (!transform) {
    els.calibrationValidation.textContent = "検証不可: 4点法の設定を確認してください";
    return null;
  }
  const pixel = { x: Number(els.calibCheckPixelX.value), y: Number(els.calibCheckPixelY.value) };
  const expected = { x: Number(els.calibCheckRealX.value), y: Number(els.calibCheckRealY.value) };
  if (![pixel.x, pixel.y, expected.x, expected.y].every(Number.isFinite)) {
    els.calibrationValidation.textContent = "検証点: 画像座標と実長座標を入力してください";
    return null;
  }
  const actual = transformPoint(pixel, transform);
  const error = actual ? Math.hypot(actual.x - expected.x, actual.y - expected.y) : null;
  els.calibrationValidation.textContent = error === null
    ? "検証不可: 座標変換に失敗しました"
    : `換算結果 ${actual.x.toFixed(6)}, ${actual.y.toFixed(6)} ${transform.unit} / 誤差 ${error.toFixed(6)} ${transform.unit}`;
  if (error !== null) recordAudit("validate_calibration", { error, unit: transform.unit });
  return error;
}

function importTimestampFile(file) {
  readFileText(file, "時刻CSV").then((text) => {
    const rows = parseDelimitedRows(text);
    const timestamps = {};
    let previous = -Infinity;
    for (const row of rows) {
      if (row.length < 2 || !isNumericCell(row[0]) || !isNumericCell(row[1])) continue;
      const frame = Math.round(Number(row[0]));
      const time = Number(row[1]);
      if (frame < 0 || time < previous) throw new Error("フレーム時刻が単調増加ではありません");
      timestamps[String(frame)] = time;
      previous = time;
    }
    if (Object.keys(timestamps).length < 2) throw new Error("frame,time_sec の2列を読み取れませんでした");
    state.frameTimestamps = timestamps;
    resetFrameCache();
    els.timingStatus.textContent = `時刻: CSV実測値 ${Object.keys(timestamps).length}F`;
    recordAudit("import_timestamps", { file: file.name, count: Object.keys(timestamps).length });
    markDirty();
    renderAll();
    setStatus(`フレーム時刻を読み込みました: ${file.name}`);
  }).catch((error) => setStatus(`時刻CSV読込に失敗しました: ${error.message}`)).finally(() => {
    els.timestampFile.value = "";
  });
}

function loadProject(file) {
  state.projectFileHandle = null;
  state.projectFileName = file?.name || "";
  readFileText(file, "プロジェクトファイル").then((text) => {
    try {
      const payload = JSON.parse(String(text));
      if (!SUPPORTED_PROJECT_SCHEMAS.has(payload.schema)) throw new Error("unsupported schema");
      const digitize = payload.digitize && typeof payload.digitize === "object" ? payload.digitize : {};
      const video = digitize.video && typeof digitize.video === "object" ? digitize.video : {};
      const expectedVideoIdentity = videoIdentityFromProject(payload, digitize);
      const hasExpectedVideoIdentity = Boolean(expectedVideoIdentity.digest || expectedVideoIdentity.frame_count || expectedVideoIdentity.name);
      if (state.ready && state.videoIdentity && hasExpectedVideoIdentity) {
        if (!confirmVideoMismatch(expectedVideoIdentity, state.videoIdentity, "現在開いている")) {
          setStatus("プロジェクト読込をキャンセルしました");
          return;
        }
      }
      const range = digitize.frame_range && typeof digitize.frame_range === "object" ? digitize.frame_range : {};
      const hasTrim = range.start !== undefined && range.end !== undefined
        ? true
        : payload.trim_start !== undefined && payload.trim_end !== undefined;
      const trimStart = Number(range.start ?? payload.trim_start);
      const trimEnd = Number(range.end ?? payload.trim_end);
      state.videoName = String(video.name || payload.video_name || state.videoName || "");
      state.expectedVideoIdentity = expectedVideoIdentity;
      state.fps = Number(video.fps ?? payload.fps) || 30;
      state.frame = Number(digitize.current_frame ?? payload.frame) || 0;
      state.trimStart = hasTrim && Number.isFinite(trimStart) ? trimStart : 0;
      state.trimEnd = hasTrim && Number.isFinite(trimEnd) ? trimEnd : maxFrameIndex();
      state.pendingTrim = hasTrim ? {
        start: state.trimStart,
        end: state.trimEnd,
        frame: state.frame,
        analysisFrame: Number((payload.analysis || digitize.analysis || {}).frame ?? state.frame) || state.frame,
      } : null;
      const savedMarkers = Array.isArray(digitize.markers) ? digitize.markers : payload.markers;
      state.markers = Array.isArray(savedMarkers) ? savedMarkers.map(String) : state.markers;
      state.activeMarker = String(digitize.active_marker || payload.active_marker || state.markers[0]);
      const savedCloud = payload.cloud_sync && typeof payload.cloud_sync === "object" ? payload.cloud_sync : {};
      if (/^[a-f0-9]{32}$/.test(String(savedCloud.project_id || ""))) {
        state.cloud.projectId = String(savedCloud.project_id);
      }
      state.cloud.generation = String(savedCloud.generation || "");
      state.cloud.lastSyncedAt = Number(savedCloud.last_synced_at || 0);
      state.cloud.enabled = savedCloud.enabled === true;
      state.cloud.conflict = false;
      state.trackingConstraints = digitize.tracking_constraints && typeof digitize.tracking_constraints === "object"
        ? digitize.tracking_constraints
        : {};
      const savedSkeleton = digitize.skeleton_segments || payload.skeleton_segments;
      state.skeletonSegments = Array.isArray(savedSkeleton)
        ? savedSkeleton.filter((segment) => Array.isArray(segment) && segment.length >= 2).map((segment) => segment.slice(0, 2).map(String))
        : SKELETON_SEGMENTS.map((segment) => segment.slice());
      els.skeletonText.value = skeletonTextFromSegments();
      const savedHiddenMarkers = Array.isArray(payload.ui_settings?.hidden_markers)
        ? payload.ui_settings.hidden_markers
        : digitize.hidden_markers;
      if (Array.isArray(savedHiddenMarkers)) {
        state.hiddenMarkers = new Set(savedHiddenMarkers.map(String));
      } else if (Array.isArray(digitize.visible_markers)) {
        const visible = new Set(digitize.visible_markers.map(String));
        state.hiddenMarkers = new Set(state.markers.filter((marker) => !visible.has(marker)));
      } else {
        state.hiddenMarkers = new Set();
      }
      normalizeHiddenMarkers();
      const savedPoints = digitize.points
        || payload.points
        || pointsFromCoordinateRecords(digitize.coordinates || payload.coordinates)
        || {};
      state.points = savedPoints && typeof savedPoints === "object" && !Array.isArray(savedPoints) ? savedPoints : {};
      const savedPointFlags = digitize.point_flags || payload.point_flags || {};
      state.pointFlags = savedPointFlags && typeof savedPointFlags === "object" && !Array.isArray(savedPointFlags)
        ? savedPointFlags
        : {};
      state.aiSuggestions = normalizeAISuggestionStore(digitize.ai_suggestions || payload.ai_suggestions || {});
      state.aiRuntimeStatus = Object.keys(state.aiSuggestions).length ? "保存データ読込" : "未実行";
      const savedAudit = digitize.audit_log || payload.audit_log || [];
      state.audit = Array.isArray(savedAudit) ? savedAudit.slice(-20000) : [];
      state.undo = [];
      state.redo = [];
      state.pointRevision += 1;
      state.aiSuggestionRevision += 1;
      state.tableSnapshot = "";
      state.progressSnapshot = "";
      writeMetadata(payload.metadata || {});
      const savedAnalysis = payload.analysis || digitize.analysis || {};
      state.analysisFrame = Number(savedAnalysis.frame ?? state.frame) || state.frame;
      state.analysisEvents = Array.isArray(savedAnalysis.events)
        ? savedAnalysis.events.map((event) => ({
            id: String(event.id || createSessionId()),
            name: String(event.name || "イベント"),
            frame: clampFrame(Number(event.frame) || 0),
            time_sec: Number(event.time_sec ?? frameToTime(Number(event.frame) || 0)) || 0,
          }))
        : [];
      state.studyTrials = Array.isArray(payload.study_trials || digitize.study_trials)
        ? (payload.study_trials || digitize.study_trials)
        : [];
      const savedComparison = payload.comparison || digitize.comparison || {};
      state.comparison.source?.close?.();
      if (state.comparison.primaryObjectUrl) URL.revokeObjectURL(state.comparison.primaryObjectUrl);
      if (state.comparison.secondaryObjectUrl) URL.revokeObjectURL(state.comparison.secondaryObjectUrl);
      state.comparison = {
        ready: false,
        metadata: savedComparison.metadata || null,
        identity: savedComparison.identity || null,
        lastKey: "",
        source: null,
        primaryObjectUrl: "",
        secondaryObjectUrl: "",
        renderSerial: 0,
      };
      els.comparisonOffset.value = String(Math.round(Number(savedComparison.offset) || 0));
      const savedCalibration = payload.calibration || digitize.calibration || {};
      state.calibration = {
        fileName: String(savedCalibration.file_name || ""),
        points: normalizeCalibrationPoints(savedCalibration.points || [], savedCalibration.file_name || ""),
        realPoints: normalizeRealCalibrationPoints(savedCalibration.real_points || savedCalibration.realPoints),
        unit: String(savedCalibration.unit || "m"),
        enabled: Boolean(savedCalibration.enabled),
      };
      writeCalibrationSettings(state.calibration);
      writeLensSettings(savedCalibration.lens || {});
      const validationPoint = savedCalibration.validation_point || {};
      for (const [key, element] of [
        ["pixel_x", els.calibCheckPixelX], ["pixel_y", els.calibCheckPixelY],
        ["real_x", els.calibCheckRealX], ["real_y", els.calibCheckRealY],
      ]) element.value = Number.isFinite(Number(validationPoint[key])) ? String(validationPoint[key]) : "";
      const savedTiming = payload.timing || digitize.timing || {};
      state.frameTimestamps = savedTiming.frame_timestamps && typeof savedTiming.frame_timestamps === "object"
        ? savedTiming.frame_timestamps
        : {};
      resetFrameCache();
      els.timingStatus.textContent = Object.keys(state.frameTimestamps).length
        ? `時刻: CSV実測値 ${Object.keys(state.frameTimestamps).length}F`
        : "時刻: 固定FPSとして計算";
      const coordinateSystem = payload.coordinate_system || digitize.coordinate_system || {};
      els.axisOriginX.value = String(Number(coordinateSystem.originX) || 0);
      els.axisOriginY.value = String(Number(coordinateSystem.originY) || 0);
      els.axisXDirection.value = coordinateSystem.xDirection === "left" ? "left" : "right";
      els.axisYDirection.value = coordinateSystem.yDirection === "up" ? "up" : "down";
      readCoordinateSystem();
      if (payload.ui_settings) {
        els.autoAdvance.checked = payload.ui_settings.auto_advance !== false;
        els.advanceMode.value = payload.ui_settings.advance_mode || "frame";
        els.stepInput.value = String(Math.max(1, Math.round(Number(payload.ui_settings.step) || 1)));
        els.coordDecimals.value = String(Math.max(0, Math.min(3, Math.round(Number(payload.ui_settings.coordinate_decimals ?? digitize.coordinate_decimals ?? 1)))));
        els.zoomEnabled.checked = payload.ui_settings.zoom_enabled !== false;
        els.zoomScale.value = String(Math.max(2, Math.min(8, Number(payload.ui_settings.zoom_scale) || 4)));
        els.zoomLensSize.value = String(Math.max(120, Math.min(360, Math.round(Number(payload.ui_settings.zoom_lens_size) || 220))));
        els.frameQuality.value = payload.ui_settings.frame_quality === "png" ? "png" : "jpeg";
        els.cursorGuideMode.value = payload.ui_settings.cursor_guide_mode || "cross";
        els.pointSize.value = String(Math.max(2, Math.min(16, Math.round(Number(payload.ui_settings.point_size) || 6))));
        els.lineWidth.value = String(Math.max(1, Math.min(8, Math.round(Number(payload.ui_settings.line_width) || 2))));
        els.manualPointColor.value = payload.ui_settings.manual_point_color || "#d9531e";
        els.interpolationMethod.value = payload.ui_settings.interpolation_method || "linear";
        els.calibOverlayEnabled.checked = payload.ui_settings.calibration_overlay_enabled !== false;
        els.skeletonEnabled.checked = payload.ui_settings.skeleton_enabled !== false;
        els.trailInput.value = String(Math.max(0, Math.round(Number(payload.ui_settings.trail_length) || 0)));
        els.trailMode.value = payload.ui_settings.trail_mode || "active";
        els.trackingMaxMove.value = String(Math.max(1, Number(payload.ui_settings.tracking_max_move) || 50));
        els.trackingPatchRadius.value = String(Math.max(3, Math.min(24, Math.round(Number(payload.ui_settings.tracking_patch_radius) || 8))));
        els.trackingConfidence.value = String(Math.max(0.2, Math.min(0.95, Number(payload.ui_settings.tracking_confidence) || 0.55)));
        els.trackingEngine.value = payload.ui_settings.tracking_engine === "tapnextpp" ? "tapnextpp" : "lightweight";
        els.aiTrackingResolution.value = Number(payload.ui_settings.ai_tracking_resolution) === 512 ? "512" : "256";
        els.showAISuggestions.checked = payload.ui_settings.show_ai_suggestions !== false;
        applyWorkspaceSettings(payload.ui_settings.workspace || {});
      }
      updateZoomToggleButton();
      els.fpsInput.value = String(state.fps);
      els.markerText.value = state.markers.join("\n");
      cleanDirty();
      updateFrameModel();
      if (savedAnalysis.protocol) applyAnalysisProtocol(savedAnalysis.protocol);
      renderAll();
      const matchText = state.ready ? "現在の動画と照合しました" : "動画は別途開いてください";
      setStatus(`プロジェクトを読み込みました。${matchText}`);
    } catch (error) {
      setStatus(`読込に失敗しました: ${error.message}`);
    }
  }).catch((error) => {
    setStatus(`読込に失敗しました: ${error.message}`);
  });
}

function downloadText(text, filename, type) {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function baseName(name) {
  return String(name || "").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_");
}

async function postVideoFile(file, body) {
  return fetch(`./api/video?${sessionQuery()}`, {
    method: "POST",
    headers: {
      "X-File-Name": encodeURIComponent(file.name),
      "X-File-Last-Modified": String(Number(file.lastModified) || 0),
    },
    body,
    cache: "no-store",
  });
}

async function uploadVideoFile(file) {
  let firstError = null;
  try {
    setStatus("動画をローカルサーバーに読み込んでいます");
    const response = await postVideoFile(file, file);
    if (response.ok) return response.json();
    firstError = new Error(await response.text());
  } catch (error) {
    firstError = error;
  }

  setStatus("通常の読み込みに失敗しました。ファイル実体を読み込んで再試行しています");
  const buffer = await readFileBuffer(file, "動画ファイル");
  if (!buffer || buffer.byteLength <= 0) {
    throw new Error(fileReadHelp(file, "動画ファイル", firstError || new Error("ファイルサイズが0です")));
  }
  const response = await postVideoFile(file, new Blob([buffer], { type: file.type || "application/octet-stream" }));
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || firstError?.message || "動画を読み込めませんでした");
  }
  const metadata = await response.json();
  return { metadata, buffer };
}

function resetVideoForLoad() {
  const pendingTrim = state.pendingTrim;
  state.frameSource?.close?.();
  state.frameSource = null;
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  resetFrameCache();
  const previousVideoName = state.videoName;
  state.videoUrl = "";
  state.ready = false;
  state.frame = 0;
  state.analysisFrame = 0;
  state.frameCount = 0;
  state.trimStart = 0;
  state.trimEnd = 0;
  state.videoWidth = 0;
  state.videoHeight = 0;
  state.videoIdentity = null;
  els.frameImage.removeAttribute("src");
  updateStatus();
  draw();
  return { pendingTrim, previousVideoName };
}

function applyLoadedVideo(metadata, videoIdentity, pendingTrim) {
  state.videoIdentity = videoIdentity;
  state.videoName = String(metadata.name || videoIdentity.name || "video");
  state.fps = Number(metadata.fps) || state.fps;
  state.frameCount = Math.max(1, Number(metadata.frame_count) || 1);
  state.trimStart = pendingTrim ? pendingTrim.start : 0;
  state.trimEnd = pendingTrim ? pendingTrim.end : maxFrameIndex();
  state.frame = pendingTrim ? pendingTrim.frame : 0;
  state.analysisFrame = pendingTrim ? (pendingTrim.analysisFrame ?? pendingTrim.frame) : 0;
  state.pendingTrim = null;
  normalizeTrim();
  state.videoWidth = Math.max(1, Number(metadata.width) || 1);
  state.videoHeight = Math.max(1, Number(metadata.height) || 1);
  els.fpsInput.value = String(Number(state.fps.toFixed(6)));
  state.ready = true;
  seekFrame(state.frame);
}

async function setVideoSource(file) {
  if (!file) throw new Error("動画ファイルが選択されていません");
  if (usesBrowserFrameSource()) return setVideoSourceInBrowser(file);
  const { pendingTrim, previousVideoName } = resetVideoForLoad();
  setStatus("動画の指紋を確認しています");
  let fileIdentity = null;
  try {
    fileIdentity = await videoIdentityFromFile(file);
  } catch (error) {
    setStatus("ファイル指紋の取得に失敗しました。読み込みを優先します");
  }

  const uploadResult = await uploadVideoFile(file);
  const metadata = uploadResult.metadata || uploadResult;
  if (!fileIdentity) {
    fileIdentity = uploadResult.buffer
      ? await videoIdentityFromBuffer(file, uploadResult.buffer, metadata)
      : {
          name: String(file.name || ""),
          size: Number(file.size) || 0,
          last_modified: Number(file.lastModified) || 0,
          digest_algorithm: "",
          digest: "",
          fps: 0,
          frame_count: 0,
          width: 0,
          height: 0,
          codec: String(metadata.codec || ""),
        };
  }
  const serverIdentity = metadata.identity && typeof metadata.identity === "object" ? metadata.identity : {};
  const videoIdentity = {
    ...fileIdentity,
    ...serverIdentity,
    name: String(file.name || serverIdentity.name || fileIdentity.name || ""),
    size: Number(serverIdentity.size) || Number(file.size) || fileIdentity.size,
    last_modified: Number(file.lastModified) || Number(serverIdentity.last_modified) || fileIdentity.last_modified,
    fps: Number(metadata.fps) || fileIdentity.fps,
    frame_count: Number(metadata.frame_count) || fileIdentity.frame_count,
    width: Number(metadata.width) || fileIdentity.width,
    height: Number(metadata.height) || fileIdentity.height,
    codec: String(metadata.codec || fileIdentity.codec || ""),
  };
  if (state.expectedVideoIdentity && !confirmVideoMismatch(state.expectedVideoIdentity, videoIdentity, "開こうとしている")) {
    state.videoName = previousVideoName;
    state.videoIdentity = null;
    updateStatus();
    draw();
    setStatus("動画の読み込みをキャンセルしました");
    return;
  }
  state.frameSource = new VideoDigitizerFrames.ApiFrameSource((frame) => frameUrl(frame));
  applyLoadedVideo({ ...metadata, name: file.name }, videoIdentity, pendingTrim);
  setStatus("動画を開きました");
}

async function setVideoSourceInBrowser(file) {
  const { pendingTrim, previousVideoName } = resetVideoForLoad();
  setStatus("動画をブラウザ内で開いています");
  globalThis.VideoDigitizerStorage?.requestPersistence?.().catch(() => {});
  const opened = await VideoDigitizerFrames.BrowserFrameSource.open(file, Number(els.fpsInput.value) || state.fps);
  const metadata = opened.metadata;
  const videoIdentity = await videoIdentityFromFile(file, metadata);
  if (state.expectedVideoIdentity && !confirmVideoMismatch(state.expectedVideoIdentity, videoIdentity, "開こうとしている")) {
    opened.source.close();
    state.videoName = previousVideoName;
    state.videoIdentity = null;
    updateStatus();
    draw();
    setStatus("動画の読み込みをキャンセルしました");
    return;
  }
  state.frameSource = opened.source;
  applyLoadedVideo({ ...metadata, name: file.name }, videoIdentity, pendingTrim);
  recordAudit("load_browser_video", { name: file.name, size: file.size, digest: videoIdentity.digest || "" });
  setStatus("動画をブラウザ内で開きました。動画は外部へ送信されません");
}

async function setVideoSourceFromNativePicker() {
  const { pendingTrim, previousVideoName } = resetVideoForLoad();
  setStatus("動画を選択してください。クラウド上の動画はダウンロードを試します");
  const response = await fetch(`./api/select-video?${sessionQuery()}`, {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());

  const metadata = await response.json();
  const identity = metadata.identity || {};
  const videoIdentity = {
    name: String(identity.name || metadata.name || ""),
    size: Number(identity.size) || 0,
    last_modified: Number(identity.last_modified) || 0,
    digest_algorithm: String(identity.digest_algorithm || ""),
    digest: String(identity.digest || ""),
    fps: Number(identity.fps ?? metadata.fps) || 0,
    frame_count: Number(identity.frame_count ?? metadata.frame_count) || 0,
    width: Number(identity.width ?? metadata.width) || 0,
    height: Number(identity.height ?? metadata.height) || 0,
    codec: String(identity.codec || metadata.codec || ""),
  };
  if (state.expectedVideoIdentity && !confirmVideoMismatch(state.expectedVideoIdentity, videoIdentity, "開こうとしている")) {
    state.videoName = previousVideoName;
    state.videoIdentity = null;
    updateStatus();
    draw();
    setStatus("動画の読み込みをキャンセルしました");
    return;
  }
  state.frameSource = new VideoDigitizerFrames.ApiFrameSource((frame) => frameUrl(frame));
  applyLoadedVideo(metadata, videoIdentity, pendingTrim);
  setStatus("動画を開きました");
}

async function restoreRecentLocalVideo() {
  if (state.sourceMode !== "api" || !state.account.authenticated || state.ready) return;
  let response;
  try {
    response = await fetch(localApiUrl("recent-video"), { cache: "no-store" });
  } catch (_error) {
    return;
  }
  if (response.status === 401 || response.status === 404) return;
  if (!response.ok) {
    setStatus("前回の動画を再接続できませんでした。動画を選び直してください");
    return;
  }

  const metadata = await response.json();
  const identity = metadata.identity || {};
  const videoIdentity = {
    name: String(identity.name || metadata.name || ""),
    size: Number(identity.size) || 0,
    last_modified: Number(identity.last_modified) || 0,
    digest_algorithm: String(identity.digest_algorithm || ""),
    digest: String(identity.digest || ""),
    fps: Number(identity.fps ?? metadata.fps) || 0,
    frame_count: Number(identity.frame_count ?? metadata.frame_count) || 0,
    width: Number(identity.width ?? metadata.width) || 0,
    height: Number(identity.height ?? metadata.height) || 0,
    codec: String(identity.codec || metadata.codec || ""),
  };
  const { pendingTrim } = resetVideoForLoad();
  state.frameSource = new VideoDigitizerFrames.ApiFrameSource((frame) => frameUrl(frame));
  applyLoadedVideo(metadata, videoIdentity, pendingTrim);
  setStatus("前回の動画をこのMacから再読込しました");
}

function openVideoWithFallback() {
  if (usesBrowserFrameSource()) {
    els.videoFile.click();
    return;
  }
  setVideoSourceFromNativePicker().catch((error) => {
    const message = String(error?.message || "");
    if (message.includes("キャンセル")) {
      setStatus("動画選択をキャンセルしました");
      return;
    }
    setStatus("Mac側の選択で開けませんでした。ブラウザ選択に切り替えます");
    els.videoFile.click();
  });
}

els.openVideoButton.addEventListener("click", openVideoWithFallback);
els.digitizeTab.addEventListener("click", () => setActiveView("digitize"));
els.analysisTab.addEventListener("click", () => setActiveView("analysis"));

els.videoFile.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  setVideoSource(file).catch((error) => {
    state.ready = false;
    setStatus(`動画を開けませんでした: ${error.message}`);
    draw();
  });
});

els.canvas.addEventListener("mousemove", (event) => {
  const pos = canvasToSource(event);
  state.cursor = pos;
  els.cursorInfo.textContent = pos ? `カーソル: ${formatPoint(pos)}` : "カーソル: -";
  const point = getPoint(state.frame, state.activeMarker);
  const transform = calibrationTransform();
  const real = transformPoint(point, transform);
  els.pointInfo.textContent = point
    ? `${state.activeMarker}: ${formatPoint(point)}${real ? ` / ${real.x.toFixed(4)},${real.y.toFixed(4)}${transform.unit}` : ""} ${sourceTag(point.src, point.quality)}`
    : `${state.activeMarker}: なし`;
  draw();
});

els.canvas.addEventListener("mouseleave", () => {
  state.cursor = null;
  els.cursorInfo.textContent = "カーソル: -";
  draw();
});

els.canvas.addEventListener("click", (event) => {
  if (!state.ready) return;
  const pos = canvasToSource(event);
  recordPointAt(pos, {
    keepFrame: event.shiftKey,
    note: event.shiftKey ? "manual_shift_click" : "manual",
  });
});

els.canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (!state.ready) return;
  if (deletePoint(state.frame, state.activeMarker)) {
    setStatus(`${state.activeMarker} を削除しました`);
    renderAll();
  }
});

els.fpsInput.addEventListener("change", () => {
  updateFrameModel();
  markDirty();
});
els.advanceMode.addEventListener("change", markDirty);
els.stepInput.addEventListener("change", markDirty);
els.coordDecimals.addEventListener("change", () => {
  markDirty();
  renderTable();
  draw();
});
els.zoomToggleButton.addEventListener("click", () => {
  els.zoomEnabled.checked = !els.zoomEnabled.checked;
  updateZoomToggleButton();
  markDirty();
  draw();
});
els.zoomScale.addEventListener("change", () => {
  markDirty();
  draw();
});
els.zoomLensSize.addEventListener("change", () => {
  markDirty();
  draw();
});
els.frameQuality.addEventListener("change", () => {
  resetFrameCache();
  markDirty();
  updateStatus();
  if (state.ready) seekFrame(state.frame);
});
els.cursorGuideMode.addEventListener("change", () => {
  markDirty();
  draw();
});
els.trailInput.addEventListener("change", draw);
els.trailInput.addEventListener("input", draw);
els.trailMode.addEventListener("change", () => {
  markDirty();
  draw();
});
els.skeletonEnabled.addEventListener("change", () => {
  markDirty();
  draw();
});
els.calibOverlayEnabled.addEventListener("change", () => {
  markDirty();
  draw();
});
for (const control of [els.pointSize, els.lineWidth, els.manualPointColor]) {
  control.addEventListener("change", () => {
    markDirty();
    draw();
  });
  control.addEventListener("input", draw);
}
els.trimStartInput.addEventListener("change", () => setTrim(Number(els.trimStartInput.value), state.trimEnd));
els.trimEndInput.addEventListener("change", () => setTrim(state.trimStart, Number(els.trimEndInput.value)));
els.setTrimStart.addEventListener("click", () => setTrim(state.frame, state.trimEnd));
els.setTrimEnd.addEventListener("click", () => setTrim(state.trimStart, state.frame));
els.frameSlider.addEventListener("input", () => seekFrame(Number(els.frameSlider.value)));
els.prevFrame.addEventListener("click", () => seekFrame(frameByStep(state.frame, -1)));
els.nextFrame.addEventListener("click", () => seekFrame(frameByStep(state.frame, 1)));
els.analysisFrameSlider.addEventListener("input", () => setAnalysisFrame(Number(els.analysisFrameSlider.value), { status: false }));
els.analysisFrameInput.addEventListener("change", () => setAnalysisFrame(Number(els.analysisFrameInput.value)));
els.analysisPrevFrame.addEventListener("click", () => setAnalysisFrame(frameByStep(state.analysisFrame, -1)));
els.analysisNextFrame.addEventListener("click", () => setAnalysisFrame(frameByStep(state.analysisFrame, 1)));
els.analysisUseDigitizeFrame.addEventListener("click", () => setAnalysisFrame(state.frame));
els.prevMissingPoint.addEventListener("click", () => jumpToMissingPoint(-1));
els.nextMissingPoint.addEventListener("click", () => jumpToMissingPoint(1));
els.nextActiveMissing.addEventListener("click", jumpToActiveMarkerMissing);
els.nextIncompleteFrame.addEventListener("click", jumpToIncompleteFrame);
els.applyMarkers.addEventListener("click", parseMarkers);
els.applyMarkerTemplate.addEventListener("click", applyMarkerTemplate);
els.saveMarkerTemplate.addEventListener("click", saveCurrentMarkerTemplate);
els.applySkeleton.addEventListener("click", applySkeletonDefinition);
els.showAllMarkers.addEventListener("click", () => {
  state.hiddenMarkers.clear();
  markDirty();
  renderMarkers();
  renderMarkerVisibility();
  draw();
  setStatus("全マーカーを表示しました");
});
els.showActiveMarker.addEventListener("click", () => {
  state.hiddenMarkers = new Set(state.markers.filter((marker) => marker !== state.activeMarker));
  markDirty();
  renderMarkers();
  renderMarkerVisibility();
  draw();
  setStatus(`${state.activeMarker} のみ表示しました`);
});
els.showRightMarkers.addEventListener("click", () => showMarkerGroup((group) => group.side === "right" || group.trunk, "右側"));
els.showLeftMarkers.addEventListener("click", () => showMarkerGroup((group) => group.side === "left" || group.trunk, "左側"));
els.showTrunkMarkers.addEventListener("click", () => showMarkerGroup((group) => group.trunk, "体幹"));
els.showUpperMarkers.addEventListener("click", () => showMarkerGroup((group) => group.upper || group.trunk, "上肢"));
els.showLowerMarkers.addEventListener("click", () => showMarkerGroup((group) => group.lower || group.trunk, "下肢"));
els.saveProject.addEventListener("click", saveProject);
els.saveProjectPackage.addEventListener("click", saveProjectPackage);
els.overwriteProject.addEventListener("click", overwriteProject);
els.exportCsv.addEventListener("click", exportCsv);
els.undoBtn.addEventListener("click", undo);
els.redoBtn.addEventListener("click", redo);
els.applyPointStatus.addEventListener("click", applySelectedPointStatus);
els.runQualityGate.addEventListener("click", runQualityGate);
els.shutdownApp.addEventListener("click", shutdownApp);
els.copyPrevPoint.addEventListener("click", copyPreviousPoint);
els.copyPrevFrame.addEventListener("click", copyPreviousFramePoints);
els.predictPoint.addEventListener("click", predictCurrentPointFromPreviousFrames);
els.trackNextPoint.addEventListener("click", trackActivePointToNextFrame);
els.trackMarkerRange.addEventListener("click", runMarkerRangeTracking);
els.trackBetweenAnchors.addEventListener("click", runBetweenAnchorTracking);
els.trackAllBetweenAnchors.addEventListener("click", runAllBetweenAnchorTracking);
els.trackingEngine.addEventListener("change", () => {
  updateAITrackingControls();
  markDirty();
});
els.aiTrackingResolution.addEventListener("change", markDirty);
els.installAITrackingModel.addEventListener("click", installAITrackingModel);
els.refreshAITrackingStatus.addEventListener("click", refreshAITrackingCapabilities);
els.runPoseAI.addEventListener("click", runPoseAIForCurrentFrame);
els.acceptAISuggestion.addEventListener("click", acceptCurrentAISuggestion);
els.acceptAIFrame.addEventListener("click", acceptCurrentFrameAISuggestions);
els.rejectAISuggestion.addEventListener("click", rejectCurrentAISuggestion);
els.nextAISuggestion.addEventListener("click", jumpToNextAISuggestion);
els.showAISuggestions.addEventListener("change", () => {
  markDirty();
  draw();
});
els.nextReviewPoint.addEventListener("click", jumpToNextReviewPoint);
els.saveTrackingConstraint.addEventListener("click", saveTrackingConstraint);
els.cancelJob.addEventListener("click", () => {
  if (state.backgroundJob) {
    state.backgroundJob.cancelled = true;
    if (state.backgroundJob.serverJobId) cancelServerAIJob(state.backgroundJob.serverJobId);
  }
});
els.previewInterpolation.addEventListener("click", previewInterpolation);
els.interpolationMethod.addEventListener("change", markDirty);
els.addEventMarker.addEventListener("click", addCurrentFrameEvent);
els.exportAnalysisCsv.addEventListener("click", exportAnalysisCsv);
els.exportKinematicsCsv.addEventListener("click", exportKinematicsCsv);
els.exportSummaryCsv.addEventListener("click", exportSummaryCsv);
els.exportRealCsv.addEventListener("click", exportRealCsv);
els.exportReportHtml.addEventListener("click", exportReportHtml);
els.saveProtocol.addEventListener("click", saveAnalysisProtocol);
els.loadProtocol.addEventListener("click", loadAnalysisProtocol);
els.restoreAutosave.addEventListener("click", restoreAutosave);
els.comparisonVideoFile.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  loadComparisonVideo(file).catch((error) => setStatus(`比較動画を開けませんでした: ${error.message}`)).finally(() => {
    els.comparisonVideoFile.value = "";
  });
});
els.reliabilityProjectFile.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) compareReliabilityProject(file);
});
els.addTrialSnapshot.addEventListener("click", addTrialSnapshot);
els.comparisonOffset.addEventListener("change", () => {
  state.comparison.lastKey = "";
  markDirty();
  renderComparison();
});
els.saveWorkspacePreset.addEventListener("click", saveWorkspacePreset);
els.loadWorkspacePreset.addEventListener("click", loadWorkspacePreset);
els.downloadDiagnostics.addEventListener("click", downloadDiagnostics);
els.checkUpdates.addEventListener("click", checkUpdates);
els.googleSignIn.addEventListener("click", startGoogleSignIn);
els.googleSignOut.addEventListener("click", signOutGoogle);
els.restoreAccountCache.addEventListener("click", restoreAccountAutosave);
els.deleteAccountCache.addEventListener("click", deleteAccountAutosave);
els.cloudSyncEnabled.addEventListener("change", () => {
  state.cloud.enabled = els.cloudSyncEnabled.checked;
  markDirty();
  updateAccountUI();
  if (state.cloud.enabled) syncCloudDigitize({ force: true });
});
els.restoreCloudProject.addEventListener("click", restoreLatestCloudProject);
els.finalizeCloudProject.addEventListener("click", finalizeCloudProject);
els.deleteCloudProject.addEventListener("click", deleteCloudProject);
for (const element of [
  els.workspaceSideWidth, els.workspaceDensity, els.shortcutPrev, els.shortcutNext, els.shortcutCopy, els.shortcutPredict,
]) {
  element.addEventListener("change", () => {
    applyWorkspaceSettings(workspaceSettings());
    markDirty();
  });
}
els.angleTemplate.addEventListener("change", applyAngleTemplate);
els.smoothingMode.addEventListener("change", renderAnalysisMetrics);
els.smoothingWindow.addEventListener("change", renderAnalysisMetrics);
for (const select of [els.distanceMarkerA, els.distanceMarkerB, els.angleMarkerA, els.angleMarkerB, els.angleMarkerC, els.kinematicsMarker]) {
  select.addEventListener("change", renderAnalysisMetrics);
}
for (const [, id] of METADATA_FIELDS) {
  els[id].addEventListener("change", markDirty);
  els[id].addEventListener("input", markDirty);
}
for (let index = 1; index <= 4; index += 1) {
  for (const axis of ["X", "Y"]) {
    els[`calibReal${axis}${index}`].addEventListener("change", () => {
      readCalibrationSettings();
      state.tableSnapshot = "";
      markDirty();
      updateStatus();
      renderTable();
      draw();
    });
    els[`calibReal${axis}${index}`].addEventListener("input", () => {
      readCalibrationSettings();
      updateStatus();
      renderTable();
      draw();
    });
  }
}
els.calibEnabled.addEventListener("change", () => {
  readCalibrationSettings();
  state.tableSnapshot = "";
  markDirty();
  updateStatus();
  renderTable();
  draw();
});
els.calibUnit.addEventListener("change", () => {
  readCalibrationSettings();
  state.tableSnapshot = "";
  markDirty();
  updateStatus();
  renderTable();
  draw();
});
els.calibUnit.addEventListener("input", () => {
  readCalibrationSettings();
  updateStatus();
  renderTable();
  draw();
});
els.projectFile.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) loadProject(file);
});
els.calibrationFile.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importCalibrationFile(file);
});
els.timestampFile.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importTimestampFile(file);
});
els.validateCalibration.addEventListener("click", validateCalibrationPoint);
for (const element of [
  els.lensEnabled, els.lensFx, els.lensFy, els.lensCx, els.lensCy,
  els.lensK1, els.lensK2, els.lensP1, els.lensP2,
]) {
  element.addEventListener("change", () => {
    readLensSettings();
    state.tableSnapshot = "";
    markDirty();
    renderAll();
  });
}
for (const element of [els.calibCheckPixelX, els.calibCheckPixelY, els.calibCheckRealX, els.calibCheckRealY]) {
  element.addEventListener("change", markDirty);
}
for (const element of [els.axisOriginX, els.axisOriginY, els.axisXDirection, els.axisYDirection]) {
  element.addEventListener("change", () => {
    readCoordinateSystem();
    state.tableSnapshot = "";
    markDirty();
    renderAll();
  });
}
els.interpMarker.addEventListener("click", () => interpolateMarker(state.activeMarker));
els.interpAll.addEventListener("click", interpolateAllBackground);
els.clearDerived.addEventListener("click", clearDerived);

window.addEventListener("resize", draw);
window.setInterval(writeAutosave, 60_000);
window.setInterval(syncCloudDigitize, 5 * 60_000);
window.addEventListener("beforeunload", writeAutosave);
window.addEventListener("copy", (event) => {
  if (isEditableTarget(event.target) || !state.ready) return;
  if (String(window.getSelection?.() || "").trim()) return;
  if (hasTableSelection() && copySelectedTableCells(event)) return;
  copyTableToClipboard(event);
});
window.addEventListener("paste", (event) => {
  if (isEditableTarget(event.target)) return;
  pasteTableFromClipboard(event);
});
window.addEventListener("mouseup", () => {
  if (state.tableSelection) state.tableSelection.dragging = false;
});
window.addEventListener("keydown", (event) => {
  if (isEditableTarget(event.target)) return;
  if (event.metaKey || event.ctrlKey) {
    if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
    return;
  }

  const nudgeDeltas = {
    ArrowRight: [1, 0],
    ArrowLeft: [-1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  if ((event.shiftKey || event.altKey) && nudgeDeltas[event.key]) {
    event.preventDefault();
    const amount = event.shiftKey && event.altKey ? 1 / coordinateScale() : event.altKey ? 5 : 1;
    const [dx, dy] = nudgeDeltas[event.key];
    nudgeActivePoint(dx * amount, dy * amount);
    return;
  }

  if (shortcutMatches(event, els.shortcutNext.value)) {
    event.preventDefault();
    if (state.activeView === "analysis") setAnalysisFrame(frameByStep(state.analysisFrame, 1));
    else seekFrame(frameByStep(state.frame, 1));
  }
  if (shortcutMatches(event, els.shortcutPrev.value)) {
    event.preventDefault();
    if (state.activeView === "analysis") setAnalysisFrame(frameByStep(state.analysisFrame, -1));
    else seekFrame(frameByStep(state.frame, -1));
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    if (state.activeView === "analysis") setAnalysisFrame(state.analysisFrame + 10);
    else seekFrame(state.frame + 10);
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (state.activeView === "analysis") setAnalysisFrame(state.analysisFrame - 10);
    else seekFrame(state.frame - 10);
  }
  if (shortcutMatches(event, els.shortcutCopy.value)) {
    event.preventDefault();
    copyPreviousPoint();
  }
  if (event.key.toLowerCase() === "v") {
    event.preventDefault();
    copyPreviousFramePoints();
  }
  if (shortcutMatches(event, els.shortcutPredict.value)) {
    event.preventDefault();
    predictCurrentPointFromPreviousFrames();
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    if (clearSelectedTableCells()) return;
    if (deletePoint(state.selected.frame ?? state.frame, state.selected.marker ?? state.activeMarker)) renderAll();
  }
  if (event.key >= "1" && event.key <= "9") {
    const idx = Number(event.key) - 1;
    if (state.markers[idx]) {
      state.activeMarker = state.markers[idx];
      renderAll();
    }
  }
  if (event.key === "." || event.key === ">") {
    const idx = state.markers.indexOf(state.activeMarker);
    state.activeMarker = state.markers[(idx + 1) % state.markers.length];
    renderAll();
  }
  if (event.key === "," || event.key === "<") {
    const idx = state.markers.indexOf(state.activeMarker);
    state.activeMarker = state.markers[(idx - 1 + state.markers.length) % state.markers.length];
    renderAll();
  }
});

updateZoomToggleButton();
updateAppMode();
els.skeletonText.value = skeletonTextFromSegments();
els.appVersion.textContent = `Version ${APP_VERSION}`;
try {
  applyWorkspaceSettings(JSON.parse(localStorage.getItem(WORKSPACE_PRESET_KEY) || "{}"));
} catch (_error) {
  applyWorkspaceSettings({});
}
renderAll();
refreshAITrackingCapabilities();
refreshAccountStatus()
  .then(refreshCloudStatus)
  .then(restoreRecentLocalVideo)
  .catch(() => {});
