"use strict";

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const webRoot = existsSync(path.join(root, "web_viewer"))
  ? path.join(root, "web_viewer")
  : path.join(root, "web");
const fixtureRoot = existsSync(path.join(root, "artifacts", "frame_verification"))
  ? path.join(root, "artifacts", "frame_verification")
  : path.join(root, "tests", "fixtures");
const fixtures = ["cfr_bframes.mp4", "edited_slow_motion.mp4"]
  .map((name) => path.join(fixtureRoot, name));
const cycles = Math.max(3, Number(process.env.LONG_SESSION_CYCLES) || 8);
const chromeCandidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].filter(Boolean);

for (const fixture of fixtures) assert.ok(existsSync(fixture), `Missing fixture: ${fixture}`);

const server = spawn(process.env.PYTHON || "python3", ["-u", "-m", "http.server", "0", "--bind", "127.0.0.1"], {
  cwd: webRoot,
  env: { ...process.env, PYTHONUNBUFFERED: "1" },
});
let browser;

async function serverUrl() {
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

async function waitForFrame(page, frame) {
  await page.waitForFunction((target) => (
    state.ready && !state.seeking && state.displayedFrame === target && state.frame === target
  ), frame, { timeout: 20_000 });
}

async function loadFixture(page, fixture) {
  await page.locator("#videoFile").setInputFiles(fixture);
  await page.waitForFunction((name) => (
    state.ready && !state.videoLoading && !state.seeking
      && state.displayedFrame === 0 && state.videoName === name
  ), path.basename(fixture), { timeout: 30_000 });
}

(async () => {
  const url = await serverUrl();
  const executablePath = chromeCandidates.find(existsSync);
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
    args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
  });
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const audit = {
      createdObjectUrls: 0,
      revokedObjectUrls: 0,
      activeObjectUrls: new Set(),
      createdWorkers: 0,
      activeWorkers: 0,
    };
    globalThis.__longSessionAudit = audit;
    const nativeCreateObjectUrl = URL.createObjectURL.bind(URL);
    const nativeRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value) => {
      const url = nativeCreateObjectUrl(value);
      audit.createdObjectUrls += 1;
      audit.activeObjectUrls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      if (audit.activeObjectUrls.delete(url)) audit.revokedObjectUrls += 1;
      nativeRevokeObjectUrl(url);
    };
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class TrackedWorker extends NativeWorker {
      constructor(...args) {
        super(...args);
        audit.createdWorkers += 1;
        audit.activeWorkers += 1;
        this.__auditActive = true;
      }

      terminate() {
        if (this.__auditActive) {
          this.__auditActive = false;
          audit.activeWorkers -= 1;
        }
        return super.terminate();
      }
    };
  });
  await page.goto(url, { waitUntil: "networkidle" });

  const samples = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const fixture = fixtures[cycle % fixtures.length];
    await loadFixture(page, fixture);
    const frameCount = await page.evaluate(() => state.frameCount);
    const targets = [Math.min(frameCount - 1, 2 + cycle), Math.floor((frameCount - 1) / 2), frameCount - 1];
    for (const target of targets) {
      await page.evaluate((frame) => seekFrame(frame), target);
      await waitForFrame(page, target);
    }

    await page.evaluate((index) => {
      els.zoomEnabled.checked = true;
      els.zoomScale.value = String([2, 3, 4, 6][index % 4]);
      updateZoomToggleButton();
      state.cursor = { x: state.videoWidth / 2, y: state.videoHeight / 2 };
      draw();
      state.points = {};
      const markerNames = state.markers.slice(0, 3);
      for (let frame = state.trimStart; frame <= state.trimEnd; frame += 1) {
        state.points[String(frame)] = {};
        markerNames.forEach((marker, markerIndex) => {
          state.points[String(frame)][marker] = {
            x: 10 + markerIndex * 8 + frame * 0.05,
            y: 20 + markerIndex * 4 + frame * 0.03,
            src: "manual",
          };
        });
      }
      touchPoints();
      setActiveView("analysis");
      projectJsonText();
    }, cycle);
    await page.waitForFunction(() => !state.analysisAggregatePendingKey, null, { timeout: 20_000 });
    await page.evaluate(() => setActiveView("digitize"));
    await page.waitForFunction(() => state.prefetchTimer === 0 && state.frameRequests.size === 0, null, { timeout: 20_000 });
    await page.evaluate(() => globalThis.gc?.());
    await page.waitForTimeout(50);

    const sample = await page.evaluate(() => ({
      heapBytes: performance.memory?.usedJSHeapSize || 0,
      cacheEntries: state.frameCache.size,
      cacheEntryLimit: clientFrameCacheLimit(),
      cacheBytes: clientFrameCacheBytes(),
      cacheByteLimit: clientFrameCacheByteLimit(),
      pendingFrameRequests: state.frameRequests.size,
      frameP95Ms: frameLatencyPercentile(0.95),
      displayFailures: state.framePerformance.displayFailures,
      analysisFailures: state.analysisAggregateFailures,
      activeObjectUrls: __longSessionAudit.activeObjectUrls.size,
      createdWorkers: __longSessionAudit.createdWorkers,
      activeWorkers: __longSessionAudit.activeWorkers,
    }));
    assert.ok(sample.cacheEntries <= sample.cacheEntryLimit, `Frame cache entry overflow at cycle ${cycle}`);
    assert.ok(sample.cacheBytes <= sample.cacheByteLimit, `Frame cache byte overflow at cycle ${cycle}`);
    assert.equal(sample.pendingFrameRequests, 0, `Pending frame request at cycle ${cycle}`);
    assert.equal(sample.displayFailures, 0, `Frame display failure at cycle ${cycle}`);
    assert.equal(sample.analysisFailures, 0, `Analysis worker failure at cycle ${cycle}`);
    assert.equal(sample.activeObjectUrls, 1, `Object URL leak at cycle ${cycle}`);
    assert.ok(sample.createdWorkers <= 1 && sample.activeWorkers <= 1, `Worker leak at cycle ${cycle}`);
    assert.ok(sample.frameP95Ms < 3_000, `Frame P95 exceeded 3 seconds at cycle ${cycle}`);
    samples.push(sample);
  }

  const measuredHeap = samples.map((sample) => sample.heapBytes).filter((value) => value > 0);
  if (measuredHeap.length >= 3) {
    const baseline = measuredHeap[Math.min(1, measuredHeap.length - 1)];
    const finalHeap = measuredHeap.at(-1);
    const allowedGrowth = Math.max(64 * 1024 * 1024, baseline * 1.5);
    assert.ok(finalHeap - baseline <= allowedGrowth, `Heap grew by ${finalHeap - baseline} bytes`);
  }

  const cleanup = await page.evaluate(() => {
    state.frameSource?.close?.();
    state.frameSource = null;
    resetFrameCache();
    state.analysisAggregateWorker?.terminate?.();
    state.analysisAggregateWorker = null;
    return {
      activeObjectUrls: __longSessionAudit.activeObjectUrls.size,
      activeWorkers: __longSessionAudit.activeWorkers,
      cacheEntries: state.frameCache.size,
    };
  });
  assert.deepEqual(cleanup, { activeObjectUrls: 0, activeWorkers: 0, cacheEntries: 0 });

  console.log(JSON.stringify({
    result: "PASS",
    cycles,
    maxFrameP95Ms: Math.max(...samples.map((sample) => sample.frameP95Ms)),
    maxCacheBytes: Math.max(...samples.map((sample) => sample.cacheBytes)),
    heapStartBytes: measuredHeap[0] || null,
    heapEndBytes: measuredHeap.at(-1) || null,
    workersCreated: samples.at(-1).createdWorkers,
    cleanup,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
  server.kill("SIGTERM");
});
