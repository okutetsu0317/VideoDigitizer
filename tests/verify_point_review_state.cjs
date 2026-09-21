"use strict";

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const webRoot = existsSync(path.join(root, "web_viewer")) ? path.join(root, "web_viewer") : path.join(root, "web");
const fixture = existsSync(path.join(root, "artifacts", "frame_verification", "cfr_bframes.mp4"))
  ? path.join(root, "artifacts", "frame_verification", "cfr_bframes.mp4")
  : path.join(root, "tests", "fixtures", "cfr_bframes.mp4");
const chromeCandidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].filter(Boolean);

assert.ok(existsSync(fixture), `Missing fixture: ${fixture}`);
const server = spawn(process.env.PYTHON || "python3", ["-u", "-m", "http.server", "0", "--bind", "127.0.0.1"], {
  cwd: webRoot,
  env: { ...process.env, PYTHONUNBUFFERED: "1" },
});
let browser;

function serverUrl() {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Static server startup timed out")), 20_000);
    server.stdout.on("data", (chunk) => {
      output += String(chunk);
      const match = output.match(/port (\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(`http://127.0.0.1:${match[1]}/`);
    });
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error(`Static server exited early: ${code}`)));
  });
}

(async () => {
  const url = await serverUrl();
  const executablePath = chromeCandidates.find(existsSync);
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator("#videoFile").setInputFiles(fixture);
  await page.waitForFunction(() => state.ready && !state.videoLoading && !state.seeking, null, { timeout: 30_000 });

  const result = await page.evaluate(() => {
    const marker = state.markers[0];
    state.points = {};
    state.pointFlags = {};
    state.undo = [];
    state.redo = [];

    setPoint(0, marker, manualPointFrom({ x: 10.25, y: 20.5, quality: { confidence: 1 } }, "manual"));
    const manualDefault = pointReviewStatusAt(0, marker);

    setPoint(1, marker, copiedPointFrom(getPoint(0, marker), "copy_from_frame_0", 0));
    const copyDefault = pointReviewStatusAt(1, marker);
    const copySourceBeforeReview = getPoint(1, marker).src;

    state.frame = 1;
    state.selected = { frame: 1, marker };
    state.activeMarker = marker;
    els.pointReviewStatus.value = "confirmed";
    applySelectedPointReviewStatus();
    const confirmedReview = pointReviewStatusAt(1, marker);
    const copySourceAfterReview = getPoint(1, marker).src;

    els.pointStatus.value = "uncertain";
    applySelectedPointStatus();
    const independent = {
      status: pointStatusAt(1, marker),
      review: pointReviewStatusAt(1, marker),
      source: getPoint(1, marker).src,
    };
    undo();
    const afterUndo = { status: pointStatusAt(1, marker), review: pointReviewStatusAt(1, marker) };
    redo();
    const afterRedo = { status: pointStatusAt(1, marker), review: pointReviewStatusAt(1, marker) };

    setPoint(2, marker, trackPointFrom({ x: 11, y: 21 }, "template_zncc", 0.9));
    const legacyTrackDefault = pointReviewStatusAt(2, marker);
    setPointFlagValue(3, marker, { status: "occluded", confidence: 0.2, model_id: "tracker" });
    const automaticOcclusionDefault = pointReviewStatusAt(3, marker);
    const snapshot = digitizeSnapshot();
    const copyRecord = snapshot.coordinates.find((record) => record.frame === 1 && record.marker === marker);
    return {
      manualDefault,
      copyDefault,
      copySourceBeforeReview,
      confirmedReview,
      copySourceAfterReview,
      independent,
      afterUndo,
      afterRedo,
      legacyTrackDefault,
      automaticOcclusionDefault,
      copyRecord,
      explicitFlag: state.pointFlags["1"][marker],
    };
  });

  assert.equal(result.manualDefault, "confirmed");
  assert.equal(result.copyDefault, "unreviewed");
  assert.equal(result.copySourceBeforeReview, "copy");
  assert.equal(result.confirmedReview, "confirmed");
  assert.equal(result.copySourceAfterReview, "copy");
  assert.deepEqual(result.independent, { status: "uncertain", review: "confirmed", source: "copy" });
  assert.deepEqual(result.afterUndo, { status: "valid", review: "confirmed" });
  assert.deepEqual(result.afterRedo, { status: "uncertain", review: "confirmed" });
  assert.equal(result.legacyTrackDefault, "unreviewed");
  assert.equal(result.automaticOcclusionDefault, "unreviewed");
  assert.equal(result.copyRecord.src, "copy");
  assert.equal(result.copyRecord.status, "uncertain");
  assert.equal(result.copyRecord.review_status, "confirmed");
  assert.equal(result.explicitFlag.review_status, "confirmed");
  console.log("Point review state browser verification passed.");
})().finally(async () => {
  await browser?.close();
  server.kill("SIGTERM");
});
