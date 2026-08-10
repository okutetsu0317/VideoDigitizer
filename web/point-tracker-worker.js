const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function luminanceRegion(bitmap, left, top, right, bottom) {
  const x0 = clamp(Math.floor(left), 0, bitmap.width - 1);
  const y0 = clamp(Math.floor(top), 0, bitmap.height - 1);
  const x1 = clamp(Math.ceil(right), x0 + 1, bitmap.width);
  const y1 = clamp(Math.ceil(bottom), y0 + 1, bitmap.height);
  const width = x1 - x0;
  const height = y1 - y0;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, x0, y0, width, height, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const values = new Float32Array(width * height);
  for (let source = 0, target = 0; target < values.length; source += 4, target += 1) {
    values[target] = rgba[source] * 0.299 + rgba[source + 1] * 0.587 + rgba[source + 2] * 0.114;
  }
  return { values, width, height, x0, y0 };
}

function sample(region, x, y) {
  return region.values[(y - region.y0) * region.width + (x - region.x0)];
}

function patchStats(region, centerX, centerY, radius) {
  let sum = 0;
  let squareSum = 0;
  let count = 0;
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const value = sample(region, x, y);
      sum += value;
      squareSum += value * value;
      count += 1;
    }
  }
  const mean = sum / count;
  return { mean, energy: Math.max(0, squareSum - count * mean * mean), count };
}

function zncc(source, sourceX, sourceY, target, targetX, targetY, radius, sourceStats) {
  let targetSum = 0;
  let targetSquareSum = 0;
  let productSum = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const sourceValue = sample(source, sourceX + dx, sourceY + dy);
      const targetValue = sample(target, targetX + dx, targetY + dy);
      targetSum += targetValue;
      targetSquareSum += targetValue * targetValue;
      productSum += sourceValue * targetValue;
    }
  }
  const targetMean = targetSum / sourceStats.count;
  const targetEnergy = Math.max(0, targetSquareSum - sourceStats.count * targetMean * targetMean);
  if (sourceStats.energy < 1e-6 || targetEnergy < 1e-6) return -1;
  const numerator = productSum - sourceStats.count * sourceStats.mean * targetMean;
  return numerator / Math.sqrt(sourceStats.energy * targetEnergy);
}

function searchPatch(source, sourcePoint, target, targetOrigin, radius, rangeX, rangeY) {
  const sourceX = Math.round(sourcePoint.x);
  const sourceY = Math.round(sourcePoint.y);
  const originX = Math.round(targetOrigin.x);
  const originY = Math.round(targetOrigin.y);
  const sourceStats = patchStats(source, sourceX, sourceY, radius);
  if (sourceStats.energy / sourceStats.count < 4) {
    return { error: "特徴が少ない領域です", texture: sourceStats.energy / sourceStats.count };
  }

  let best = { score: -2, x: originX, y: originY };
  let secondScore = -2;
  const evaluate = (x, y) => {
    const score = zncc(source, sourceX, sourceY, target, x, y, radius, sourceStats);
    if (score > best.score) {
      if (Math.hypot(x - best.x, y - best.y) > 3) secondScore = Math.max(secondScore, best.score);
      best = { score, x, y };
    } else if (Math.hypot(x - best.x, y - best.y) > 3) {
      secondScore = Math.max(secondScore, score);
    }
    return score;
  };

  const minX = Math.max(originX - rangeX, target.x0 + radius + 1);
  const maxX = Math.min(originX + rangeX, target.x0 + target.width - radius - 2);
  const minY = Math.max(originY - rangeY, target.y0 + radius + 1);
  const maxY = Math.min(originY + rangeY, target.y0 + target.height - radius - 2);
  if (minX > maxX || minY > maxY) return { error: "追跡点が画像端に近すぎます" };
  const stride = Math.max(rangeX, rangeY) >= 18 ? 2 : 1;
  for (let y = minY; y <= maxY; y += stride) {
    for (let x = minX; x <= maxX; x += stride) evaluate(x, y);
  }
  if (stride > 1) {
    const coarse = { ...best };
    for (let y = Math.max(minY, coarse.y - 2); y <= Math.min(maxY, coarse.y + 2); y += 1) {
      for (let x = Math.max(minX, coarse.x - 2); x <= Math.min(maxX, coarse.x + 2); x += 1) evaluate(x, y);
    }
  }

  const centerScore = best.score;
  const left = zncc(source, sourceX, sourceY, target, best.x - 1, best.y, radius, sourceStats);
  const right = zncc(source, sourceX, sourceY, target, best.x + 1, best.y, radius, sourceStats);
  const top = zncc(source, sourceX, sourceY, target, best.x, best.y - 1, radius, sourceStats);
  const bottom = zncc(source, sourceX, sourceY, target, best.x, best.y + 1, radius, sourceStats);
  const parabolaOffset = (negative, center, positive) => {
    const denominator = negative - 2 * center + positive;
    if (Math.abs(denominator) < 1e-6) return 0;
    return clamp(0.5 * (negative - positive) / denominator, -0.75, 0.75);
  };
  return {
    x: best.x + parabolaOffset(left, centerScore, right),
    y: best.y + parabolaOffset(top, centerScore, bottom),
    score: best.score,
    secondScore,
    texture: sourceStats.energy / sourceStats.count,
  };
}

function trackPair(sourceBitmap, targetBitmap, point, options) {
  const started = performance.now();
  const maxRadiusAtPoint = Math.floor(Math.min(
    point.x,
    point.y,
    sourceBitmap.width - 1 - point.x,
    sourceBitmap.height - 1 - point.y,
  ));
  if (maxRadiusAtPoint < 3) throw new Error("追跡点が画像端に近すぎます");
  const patchRadius = clamp(Math.min(Math.round(Number(options.patchRadius) || 8), maxRadiusAtPoint), 3, 24);
  const searchRadius = clamp(Math.round(Number(options.searchRadius) || 50), 2, 250);
  const direction = ["horizontal", "vertical"].includes(options.direction) ? options.direction : "any";
  const rangeX = direction === "vertical" ? Math.min(8, searchRadius) : searchRadius;
  const rangeY = direction === "horizontal" ? Math.min(8, searchRadius) : searchRadius;
  const marginX = rangeX + patchRadius + 3;
  const marginY = rangeY + patchRadius + 3;
  const source = luminanceRegion(sourceBitmap, point.x - marginX, point.y - marginY, point.x + marginX + 1, point.y + marginY + 1);
  const target = luminanceRegion(targetBitmap, point.x - marginX, point.y - marginY, point.x + marginX + 1, point.y + marginY + 1);
  sourceBitmap.close();
  targetBitmap.close();

  const sourcePoint = { x: Math.round(point.x), y: Math.round(point.y) };
  const forward = searchPatch(source, sourcePoint, target, sourcePoint, patchRadius, rangeX, rangeY);
  if (forward.error) throw new Error(forward.error);
  const reverseSourcePoint = { x: Math.round(forward.x), y: Math.round(forward.y) };
  const reverse = searchPatch(target, reverseSourcePoint, source, sourcePoint, patchRadius, rangeX, rangeY);
  if (reverse.error) throw new Error(reverse.error);
  const backwardError = Math.hypot(reverse.x - point.x, reverse.y - point.y);
  const scoreConfidence = clamp((forward.score - 0.35) / 0.6, 0, 1);
  const backwardConfidence = Math.exp(-backwardError / 2.5);
  const uniqueness = clamp((forward.score - forward.secondScore) / 0.12, 0, 1);
  const confidence = clamp(scoreConfidence * (0.55 + 0.25 * backwardConfidence + 0.20 * uniqueness), 0, 1);
  return {
    x: forward.x,
    y: forward.y,
    confidence,
    score: forward.score,
    second_score: forward.secondScore,
    backward_error: backwardError,
    texture: forward.texture,
    patch_radius: patchRadius,
    search_radius_x: rangeX,
    search_radius_y: rangeY,
    elapsed_ms: performance.now() - started,
    method: "zncc_forward_backward_v1",
  };
}

self.addEventListener("message", (event) => {
  if (event.data.type !== "track") return;
  try {
    const result = trackPair(event.data.source, event.data.target, event.data.point, event.data.options || {});
    self.postMessage({ id: event.data.id, ok: true, result });
  } catch (error) {
    event.data.source?.close();
    event.data.target?.close();
    self.postMessage({ id: event.data.id, ok: false, error: error.message || String(error) });
  }
});
