"use strict";

const RESOLVED_STATUSES = new Set(["occluded", "out_of_frame", "unidentifiable", "excluded"]);
const SIDE_PAIRS = [
  ["右肩", "左肩"], ["右肘", "左肘"], ["右手", "左手"],
  ["右股関節", "左股関節"], ["右膝", "左膝"],
  ["右足首", "左足首"], ["右足", "左足"],
];

function aggregate(payload) {
  const { trimStart, trimEnd, markers, frames, videoWidth, videoHeight } = payload;
  const markerCount = markers.length;
  const frameCount = Math.max(0, trimEnd - trimStart + 1);
  const pointMaps = Array.from({ length: markerCount }, () => new Map());
  const statusMaps = Array.from({ length: markerCount }, () => new Map());
  const sourceCounts = {};
  let rangePoints = 0;

  for (const item of frames) {
    for (const [markerIndex, x, y, source] of item.points) {
      if (!pointMaps[markerIndex]) continue;
      pointMaps[markerIndex].set(item.frame, { x, y });
      const key = String(source || "manual");
      sourceCounts[key] = (sourceCounts[key] || 0) + 1;
      rangePoints += 1;
    }
    for (const [markerIndex, status] of item.flags) {
      if (statusMaps[markerIndex]) statusMaps[markerIndex].set(item.frame, status);
    }
  }

  let missingRangePoints = 0;
  let completeFrames = 0;
  const missingByMarker = [];
  for (let markerIndex = 0; markerIndex < markerCount; markerIndex += 1) {
    const points = pointMaps[markerIndex];
    const statuses = statusMaps[markerIndex];
    const runs = [];
    let runStart = null;
    let missing = 0;
    for (let frame = trimStart; frame <= trimEnd; frame += 1) {
      const absent = !points.has(frame) && !RESOLVED_STATUSES.has(statuses.get(frame));
      if (absent) {
        missing += 1;
        missingRangePoints += 1;
        if (runStart === null) runStart = frame;
      } else if (runStart !== null) {
        runs.push({ start: runStart, end: frame - 1, count: frame - runStart });
        runStart = null;
      }
    }
    if (runStart !== null) runs.push({ start: runStart, end: trimEnd, count: trimEnd - runStart + 1 });
    if (missing) missingByMarker.push({ marker: markers[markerIndex], missing, runs });
  }
  for (let frame = trimStart; frame <= trimEnd; frame += 1) {
    let complete = true;
    for (let markerIndex = 0; markerIndex < markerCount; markerIndex += 1) {
      if (!pointMaps[markerIndex].has(frame) && !RESOLVED_STATUSES.has(statusMaps[markerIndex].get(frame))) {
        complete = false;
        break;
      }
    }
    if (complete) completeFrames += 1;
  }
  missingByMarker.sort((a, b) => b.missing - a.missing);
  const longestRun = missingByMarker
    .flatMap(item => item.runs.map(run => ({ marker: item.marker, ...run })))
    .sort((a, b) => b.count - a.count)[0] || null;

  const threshold = Math.max(35, Math.min(videoWidth || 1920, videoHeight || 1080) * 0.06);
  const jumps = [];
  for (let markerIndex = 0; markerIndex < markerCount; markerIndex += 1) {
    let previous = null;
    for (const [frame, point] of [...pointMaps[markerIndex]].sort((a, b) => a[0] - b[0])) {
      if (previous) {
        const distance = Math.hypot(point.x - previous.point.x, point.y - previous.point.y)
          / Math.max(1, frame - previous.frame);
        if (distance > threshold) jumps.push({ frame, marker: markers[markerIndex], distance, previous_frame: previous.frame });
      }
      previous = { frame, point };
    }
  }
  jumps.sort((a, b) => b.distance - a.distance);

  const markerIndexByName = new Map(markers.map((marker, index) => [marker, index]));
  const sideIssues = [];
  for (const [right, left] of SIDE_PAIRS) {
    const rightPoints = pointMaps[markerIndexByName.get(right)];
    const leftPoints = pointMaps[markerIndexByName.get(left)];
    if (!rightPoints || !leftPoints) continue;
    for (let frame = trimStart; frame <= trimEnd; frame += 1) {
      const rp = rightPoints.get(frame);
      const lp = leftPoints.get(frame);
      if (rp && lp && rp.x > lp.x) sideIssues.push({ frame, right, left });
    }
  }

  const cols = Math.min(80, frameCount);
  const heatmap = markers.slice(0, 28).map((marker, markerIndex) => ({
    marker,
    cells: Array.from({ length: cols }, (_, col) => {
      const start = trimStart + Math.floor((col / cols) * frameCount);
      const end = trimStart + Math.floor(((col + 1) / cols) * frameCount) - 1;
      const safeEnd = Math.max(start, Math.min(trimEnd, end));
      let missing = 0;
      for (let frame = start; frame <= safeEnd; frame += 1) {
        if (!pointMaps[markerIndex].has(frame)) missing += 1;
      }
      return { start, end: safeEnd, missing, total: safeEnd - start + 1 };
    }),
  }));

  return {
    stats: { frameCount, markerCount, rangePoints, missingRangePoints, completeFrames, sourceCounts },
    missingByMarker,
    longestRun,
    jumps: jumps.slice(0, 3),
    sideIssues: sideIssues.slice(0, 3),
    heatmap,
    cols,
  };
}

self.onmessage = ({ data }) => {
  const { id, key, payload } = data || {};
  try {
    self.postMessage({ id, key, result: aggregate(payload) });
  } catch (error) {
    self.postMessage({ id, key, error: String(error?.message || error) });
  }
};
