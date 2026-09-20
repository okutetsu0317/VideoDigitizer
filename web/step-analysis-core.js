(function initStepAnalysisCore(global) {
  "use strict";

  const SCHEMA = "video_digitizer_step_analysis_v1";
  const VERSION = 1;
  const MEDIAPIPE_INDEX = Object.freeze({
    nose: 0,
    left_shoulder: 11,
    right_shoulder: 12,
    left_hip: 23,
    right_hip: 24,
    left_knee: 25,
    right_knee: 26,
    left_ankle: 27,
    right_ankle: 28,
    left_heel: 29,
    right_heel: 30,
    left_toe: 31,
    right_toe: 32,
  });
  const SKELETON = Object.freeze([
    ["left_shoulder", "right_shoulder"],
    ["left_shoulder", "left_hip"],
    ["right_shoulder", "right_hip"],
    ["left_hip", "right_hip"],
    ["left_hip", "left_knee"],
    ["left_knee", "left_ankle"],
    ["left_ankle", "left_heel"],
    ["left_heel", "left_toe"],
    ["left_ankle", "left_toe"],
    ["right_hip", "right_knee"],
    ["right_knee", "right_ankle"],
    ["right_ankle", "right_heel"],
    ["right_heel", "right_toe"],
    ["right_ankle", "right_toe"],
  ]);
  const QUALITY_LABELS = Object.freeze({
    fps_unconfirmed: "撮影FPS未確認",
    playback_fps_mismatch: "撮影FPSと再生FPSの差",
    low_foot_confidence: "足部の信頼度不足",
    subject_lost: "対象者を見失った区間",
    foot_triplet_unusable: "片足の足部3点が欠損または使用不能",
    foot_out_of_frame: "足部が画面外",
    possible_id_switch: "対象者ID切替の可能性",
    possible_side_swap: "左右反転の可能性",
    bone_length_jump: "骨長の急変",
    implausible_event_interval: "イベント間隔が不自然",
    simultaneous_boundary_contacts: "分析範囲開始時の両足同時接地（歩数から除外）",
    range_boundary: "分析範囲端のイベント",
    insufficient_events: "イベント不足",
    insufficient_pose_data: "姿勢データ不足",
    fallback_single_person: "軽量代替AIを使用（対象保持は要確認）",
    multiple_subjects_unselected: "複数人物の対象選択が未確認",
    resumed_partial_cache: "中間キャッシュから再開",
  });

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function mean(values) {
    const clean = values.filter(Number.isFinite);
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
  }

  function median(values) {
    const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!clean.length) return null;
    const middle = Math.floor(clean.length / 2);
    return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
  }

  function percentile(values, ratio) {
    const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!clean.length) return null;
    const index = clamp(ratio, 0, 1) * (clean.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return clean[lower] * (1 - weight) + clean[upper] * weight;
  }

  function statistics(values) {
    const clean = values.filter(Number.isFinite);
    if (!clean.length) return { count: 0, mean: null, sd: null, cv_percent: null };
    const average = mean(clean);
    const variance = clean.reduce((sum, value) => sum + ((value - average) ** 2), 0) / clean.length;
    const sd = Math.sqrt(variance);
    return {
      count: clean.length,
      mean: average,
      sd,
      cv_percent: Math.abs(average) > 1e-12 ? sd / Math.abs(average) * 100 : null,
    };
  }

  function normalizePoint(point) {
    if (!point || finite(point.x) === null || finite(point.y) === null) return null;
    return {
      x: Number(point.x),
      y: Number(point.y),
      score: clamp(finite(point.score ?? point.confidence ?? point.visibility) ?? 0, 0, 1),
    };
  }

  function normalizePoseFrame(item) {
    if (!item || !Number.isInteger(Number(item.frame)) || Number(item.frame) < 0) return null;
    const keypoints = {};
    for (const [name, point] of Object.entries(item.keypoints || {})) {
      const normalized = normalizePoint(point);
      if (normalized) keypoints[name] = normalized;
    }
    const bbox = item.bbox && [item.bbox.x, item.bbox.y, item.bbox.width, item.bbox.height].every((value) => finite(value) !== null)
      ? {
          x: Number(item.bbox.x),
          y: Number(item.bbox.y),
          width: Math.max(0, Number(item.bbox.width)),
          height: Math.max(0, Number(item.bbox.height)),
          score: clamp(finite(item.bbox.score) ?? 0, 0, 1),
          track_id: item.bbox.track_id ?? null,
        }
      : null;
    return {
      frame: Math.round(Number(item.frame)),
      time_sec: finite(item.time_sec),
      keypoints,
      bbox,
      inference_ms: finite(item.inference_ms),
      selection: item.selection && typeof item.selection === "object"
        ? {
            candidate_count: Math.max(0, Math.round(finite(item.selection.candidate_count) ?? 0)),
            method: String(item.selection.method || ""),
          }
        : null,
    };
  }

  function landmarksToPoseFrame(frame, result, width, height, timeSec = null) {
    const landmarks = Array.isArray(result?.landmarks) ? result.landmarks : [];
    const keypoints = {};
    for (const [name, index] of Object.entries(MEDIAPIPE_INDEX)) {
      const point = landmarks[index];
      if (!point || finite(point.x) === null || finite(point.y) === null) continue;
      const visibility = finite(point.visibility) ?? 1;
      const presence = finite(point.presence) ?? 1;
      keypoints[name] = {
        x: clamp(Number(point.x), 0, 1) * Math.max(0, width - 1),
        y: clamp(Number(point.y), 0, 1) * Math.max(0, height - 1),
        score: clamp(Math.min(visibility, presence), 0, 1),
      };
    }
    return normalizePoseFrame({
      frame: Math.round(Number(frame) || 0),
      time_sec: finite(timeSec),
      keypoints,
      inference_ms: finite(result?.inference_ms),
    });
  }

  function midpoint(points) {
    const clean = points.filter(Boolean);
    if (!clean.length) return null;
    return {
      x: mean(clean.map((point) => point.x)),
      y: mean(clean.map((point) => point.y)),
      score: Math.min(...clean.map((point) => point.score)),
    };
  }

  function distance(a, b) {
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
  }

  function bodyHeight(frame) {
    if (frame.bbox?.height > 1) return frame.bbox.height;
    const points = Object.values(frame.keypoints || {}).filter((point) => point.score >= 0.2);
    if (points.length < 2) return null;
    const ys = points.map((point) => point.y);
    const extent = Math.max(...ys) - Math.min(...ys);
    return extent > 1 ? extent * 1.08 : null;
  }

  function footFeature(frame, side) {
    const points = ["ankle", "heel", "toe"]
      .map((part) => frame.keypoints[`${side}_${part}`])
      .filter(Boolean);
    if (!points.length) return null;
    const trusted = points.filter((point) => point.score >= 0.2);
    const source = trusted.length ? trusted : points;
    return {
      x: mean(source.map((point) => point.x)),
      y: Math.max(...source.map((point) => point.y)),
      center_y: mean(source.map((point) => point.y)),
      score: mean(points.map((point) => point.score)),
      minimum_score: Math.min(...points.map((point) => point.score)),
      count: points.length,
      trusted_count: trusted.length,
    };
  }

  function footIsUsable(foot, options) {
    return Boolean(
      foot
      && foot.trusted_count >= 2
      && Number.isFinite(foot.score)
      && foot.score >= options.minimumDetectionConfidence,
    );
  }

  function legLengths(frame, side) {
    const hip = frame.keypoints[`${side}_hip`];
    const knee = frame.keypoints[`${side}_knee`];
    const ankle = frame.keypoints[`${side}_ankle`];
    return [distance(hip, knee), distance(knee, ankle)].filter(Number.isFinite);
  }

  function frameTime(frame, options) {
    if (options.captureFpsConfirmed && options.captureFps > 0) return frame.frame / options.captureFps;
    if (Number.isFinite(frame.time_sec)) return frame.time_sec;
    return frame.frame / Math.max(0.001, options.playbackFps || options.captureFps || 30);
  }

  function intervalize(entries) {
    const grouped = [];
    const groups = new Map();
    for (const entry of entries) {
      const side = entry.side === "left" || entry.side === "right" ? entry.side : "";
      const key = `${entry.reason}\u0000${side}`;
      if (!groups.has(key)) groups.set(key, { reason: entry.reason, side, frames: [] });
      groups.get(key).frames.push(entry.frame);
    }
    const orderedGroups = [...groups.values()].sort((a, b) => (
      String(a.reason).localeCompare(String(b.reason)) || String(a.side).localeCompare(String(b.side))
    ));
    for (const group of orderedGroups) {
      let current = null;
      const frames = [...new Set(group.frames)].sort((a, b) => a - b);
      for (const frame of frames) {
        if (current && frame <= current.end_frame + 1) {
          current.end_frame = Math.max(current.end_frame, frame);
          current.count += 1;
        } else {
          current = { reason: group.reason, start_frame: frame, end_frame: frame, count: 1 };
          if (group.side) current.side = group.side;
          grouped.push(current);
        }
      }
    }
    return grouped.sort((a, b) => (
      a.start_frame - b.start_frame
      || a.reason.localeCompare(b.reason)
      || String(a.side || "").localeCompare(String(b.side || ""))
    ));
  }

  function qualityAnalysis(frames, options, globalHeight) {
    const flags = [];
    let previous = null;
    const legSamples = { left: [[], []], right: [[], []] };
    for (const frame of frames) {
      for (const side of ["left", "right"]) {
        const lengths = legLengths(frame, side);
        lengths.forEach((value, index) => legSamples[side][index].push(value));
      }
    }
    const medians = {
      left: legSamples.left.map(median),
      right: legSamples.right.map(median),
    };

    for (const frame of frames) {
      if ((frame.selection?.candidate_count || 0) > 1 && frame.selection?.method === "model_primary") {
        flags.push({ frame: frame.frame, reason: "multiple_subjects_unselected" });
      }
      const left = footFeature(frame, "left");
      const right = footFeature(frame, "right");
      if (!left && !right) flags.push({ frame: frame.frame, reason: "subject_lost" });
      for (const [side, foot] of [["left", left], ["right", right]]) {
        if (!footIsUsable(foot, options)) {
          flags.push({ frame: frame.frame, reason: "foot_triplet_unusable", side });
        }
        if (foot && (foot.trusted_count < 2 || foot.score < options.lowConfidenceThreshold)) {
          flags.push({ frame: frame.frame, reason: "low_foot_confidence" });
        }
        if (!foot) continue;
        if (foot.x <= options.width * 0.005 || foot.x >= options.width * 0.995
          || foot.y <= options.height * 0.005 || foot.y >= options.height * 0.995) {
          flags.push({ frame: frame.frame, reason: "foot_out_of_frame" });
        }
      }

      for (const side of ["left", "right"]) {
        legLengths(frame, side).forEach((value, index) => {
          const baseline = medians[side][index];
          if (baseline && Math.abs(value - baseline) / baseline > options.boneLengthTolerance) {
            flags.push({ frame: frame.frame, reason: "bone_length_jump" });
          }
        });
      }

      if (previous) {
        const currentCenter = frame.bbox
          ? { x: frame.bbox.x + frame.bbox.width / 2, y: frame.bbox.y + frame.bbox.height / 2 }
          : midpoint([frame.keypoints.left_hip, frame.keypoints.right_hip]);
        const previousCenter = previous.bbox
          ? { x: previous.bbox.x + previous.bbox.width / 2, y: previous.bbox.y + previous.bbox.height / 2 }
          : midpoint([previous.keypoints.left_hip, previous.keypoints.right_hip]);
        if (currentCenter && previousCenter && distance(currentCenter, previousCenter) > globalHeight * options.idJumpTolerance) {
          flags.push({ frame: frame.frame, reason: "possible_id_switch" });
        }

        const currentLeft = frame.keypoints.left_ankle;
        const currentRight = frame.keypoints.right_ankle;
        const previousLeft = previous.keypoints.left_ankle;
        const previousRight = previous.keypoints.right_ankle;
        if (currentLeft && currentRight && previousLeft && previousRight) {
          const sameCost = distance(currentLeft, previousLeft) + distance(currentRight, previousRight);
          const swapCost = distance(currentLeft, previousRight) + distance(currentRight, previousLeft);
          if (swapCost + globalHeight * 0.04 < sameCost && sameCost > globalHeight * 0.16) {
            flags.push({ frame: frame.frame, reason: "possible_side_swap" });
          }
        }
      }
      previous = frame;
    }
    return { flags, intervals: intervalize(flags) };
  }

  function contactCandidates(frames, options, globalHeight, groundY) {
    const result = { left: [], right: [] };
    const previous = { left: null, right: null };
    for (const frame of frames) {
      const time = frameTime(frame, options);
      for (const side of ["left", "right"]) {
        const foot = footFeature(frame, side);
        let speed = null;
        if (foot && previous[side]) {
          const dt = time - previous[side].time;
          if (dt > 0) speed = Math.hypot(foot.x - previous[side].foot.x, foot.center_y - previous[side].foot.center_y) / dt / globalHeight;
        }
        const groundDistance = foot ? Math.max(0, groundY - foot.y) / globalHeight : null;
        const candidate = Boolean(
          foot
          && footIsUsable(foot, options)
          && groundDistance <= options.groundTolerance
          && (speed === null || speed <= options.contactSpeedThreshold),
        );
        result[side].push({ frame: frame.frame, time, foot, speed, ground_distance: groundDistance, candidate });
        if (foot) previous[side] = { foot, time };
      }
    }
    return result;
  }

  function eventsFromCandidates(candidates, side, options, rangeStart, rangeEnd) {
    const events = [];
    let inContact = false;
    let startIndex = null;
    let offCount = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      const item = candidates[index];
      if (item.candidate) {
        offCount = 0;
        if (inContact) continue;
        if (startIndex === null) startIndex = index;
        const runLength = index - startIndex + 1;
        if (runLength < options.minimumContactFrames) continue;
        const onset = candidates[startIndex];
        const run = candidates.slice(startIndex, index + 1);
        const reasons = [];
        if (onset.frame <= rangeStart + options.minimumContactFrames - 1) reasons.push("range_boundary");
        if (run.some((entry) => (entry.foot?.score ?? 0) < options.lowConfidenceThreshold)) reasons.push("low_foot_confidence");
        events.push({
          id: `${side}-${onset.frame}-${events.length + 1}`,
          type: "contact",
          side,
          frame: onset.frame,
          original_frame: onset.frame,
          time_sec: onset.time,
          contact_point: onset.foot ? { x: onset.foot.x, y: onset.foot.y } : null,
          confidence: mean(run.map((entry) => entry.foot?.score ?? 0)),
          quality_reasons: reasons,
          corrected_by_user: false,
          correction_history: [],
        });
        inContact = true;
        startIndex = null;
      } else {
        startIndex = null;
        if (!inContact) continue;
        offCount += 1;
        if (offCount >= options.minimumFlightFrames) {
          inContact = false;
          offCount = 0;
        }
      }
    }
    if (events.length && events[events.length - 1].frame >= rangeEnd - options.minimumFlightFrames + 1) {
      const reasons = events[events.length - 1].quality_reasons;
      if (!reasons.includes("range_boundary")) reasons.push("range_boundary");
    }
    return events;
  }

  function suppressSimultaneousBoundaryContacts(events, options, rangeStart) {
    const boundaryEnd = rangeStart + options.minimumContactFrames - 1;
    const boundaryEvents = events.filter((event) => event.frame <= boundaryEnd);
    const left = boundaryEvents.find((event) => event.side === "left") || null;
    const right = boundaryEvents.find((event) => event.side === "right") || null;
    if (!left || !right) return { events, flags: [] };
    const timeGap = Number.isFinite(left.time_sec) && Number.isFinite(right.time_sec)
      ? Math.abs(left.time_sec - right.time_sec)
      : null;
    if (timeGap !== null && timeGap >= options.minimumStepTime) return { events, flags: [] };
    const suppressed = new Set([left.id, right.id]);
    return {
      events: events.filter((event) => !suppressed.has(event.id)),
      flags: [left, right].map((event) => ({
        frame: event.frame,
        reason: "simultaneous_boundary_contacts",
      })),
    };
  }

  function eventRows(events, options, qualityIntervals = []) {
    return events.map((event, index) => {
      const next = events[index + 1] || null;
      const sameSide = events.slice(index + 1).find((candidate) => candidate.side === event.side) || null;
      const rawStepTime = next && Number.isFinite(event.time_sec) && Number.isFinite(next.time_sec)
        ? next.time_sec - event.time_sec
        : null;
      const rawStrideTime = sameSide && Number.isFinite(event.time_sec) && Number.isFinite(sameSide.time_sec)
        ? sameSide.time_sec - event.time_sec
        : null;
      const stepTime = rawStepTime !== null && rawStepTime > 0 ? rawStepTime : null;
      const strideTime = rawStrideTime !== null && rawStrideTime > 0 ? rawStrideTime : null;
      const reasons = new Set(event.quality_reasons || []);
      const intervalEnd = next?.frame ?? event.frame;
      for (const interval of qualityIntervals) {
        if (!interval?.reason) continue;
        const start = finite(interval.start_frame);
        const end = finite(interval.end_frame);
        if (start === null || end === null) continue;
        if (start <= intervalEnd && end >= event.frame) reasons.add(String(interval.reason));
      }
      if (!options.captureFpsConfirmed) reasons.add("fps_unconfirmed");
      if (options.captureFpsConfirmed && options.playbackFps > 0
        && Math.abs(options.captureFps - options.playbackFps) / options.playbackFps >= options.fpsMismatchRatio) {
        reasons.add("playback_fps_mismatch");
      }
      if (options.backend === "mediapipe") reasons.add("fallback_single_person");
      if (next && (rawStepTime === null || rawStepTime <= 0)) {
        reasons.add("implausible_event_interval");
      } else if (stepTime !== null && (stepTime < options.minimumStepTime || stepTime > options.maximumStepTime)) {
        reasons.add("implausible_event_interval");
      }
      if (sameSide && (rawStrideTime === null || rawStrideTime <= 0)) {
        reasons.add("implausible_event_interval");
      }
      return {
        step_index: index + 1,
        side: event.side,
        contact_frame: event.frame,
        contact_time_s: event.time_sec,
        next_contact_frame: next?.frame ?? null,
        step_time_s: stepTime,
        stride_time_s: strideTime,
        step_length_m: null,
        speed_m_s: null,
        quality_status: reasons.size ? "review" : "good",
        quality_reasons: [...reasons],
        corrected_by_user: Boolean(event.corrected_by_user),
      };
    });
  }

  function cadenceFromRows(rows) {
    const intervals = rows.map((row) => row.step_time_s).filter((value) => Number.isFinite(value) && value > 0);
    const elapsed = intervals.reduce((sum, value) => sum + value, 0);
    return intervals.length && elapsed > 0 ? intervals.length * 60 / elapsed : null;
  }

  function intervalOverlaps(interval, startFrame, endFrame) {
    const start = finite(interval?.start_frame);
    const end = finite(interval?.end_frame);
    if (start === null || end === null) return false;
    return start <= endFrame && end >= startFrame;
  }

  function recomputeEventQualityReasons(events, options, qualityIntervals, rangeStart, rangeEnd) {
    const intervalReasons = new Set(
      qualityIntervals.map((interval) => interval?.reason).filter(Boolean).map(String),
    );
    const derivedReasons = new Set(["range_boundary", ...intervalReasons]);
    const activeIntervals = qualityIntervals.filter((interval) => intervalOverlaps(interval, rangeStart, rangeEnd));
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const next = events[index + 1] || null;
      const segmentStart = Number(event.frame);
      const segmentEnd = Math.max(segmentStart, Number(next?.frame ?? event.frame));
      const reasons = new Set(
        (event.quality_reasons || []).map(String).filter((reason) => !derivedReasons.has(reason)),
      );
      if (segmentStart <= rangeStart + options.minimumContactFrames - 1
        || segmentStart >= rangeEnd - options.minimumFlightFrames + 1) {
        reasons.add("range_boundary");
      }
      for (const interval of activeIntervals) {
        if (intervalOverlaps(interval, segmentStart, segmentEnd)) reasons.add(String(interval.reason));
      }
      event.quality_reasons = [...reasons];
    }
    return activeIntervals;
  }

  function summarize(events, rows, quality, frames, options) {
    const validStepIntervals = rows.filter((row) => Number.isFinite(row.step_time_s) && row.step_time_s > 0).length;
    const cadence = cadenceFromRows(rows);
    const bySide = {};
    for (const side of ["left", "right"]) {
      const sideRows = rows.filter((row) => row.side === side);
      bySide[side] = {
        step_time_s: statistics(sideRows.map((row) => row.step_time_s)),
        stride_time_s: statistics(sideRows.map((row) => row.stride_time_s)),
      };
    }
    const allReasons = new Set(quality.flags.map((flag) => flag.reason));
    rows.flatMap((row) => row.quality_reasons).forEach((reason) => allReasons.add(reason));
    if (!options.captureFpsConfirmed) allReasons.add("fps_unconfirmed");
    if (options.captureFpsConfirmed && options.playbackFps > 0
      && Math.abs(options.captureFps - options.playbackFps) / options.playbackFps >= options.fpsMismatchRatio) {
      allReasons.add("playback_fps_mismatch");
    }
    if (options.backend === "mediapipe") allReasons.add("fallback_single_person");
    const usableFrames = frames.filter((frame) => (
      footIsUsable(footFeature(frame, "left"), options)
      && footIsUsable(footFeature(frame, "right"), options)
    )).length;
    const usableRatio = frames.length ? usableFrames / frames.length : 0;
    if (usableRatio < options.minimumUsablePoseRatio) allReasons.add("insufficient_pose_data");
    if (validStepIntervals < 1) allReasons.add("insufficient_events");
    const unusable = validStepIntervals < 1 || usableRatio < options.minimumUsablePoseRatio;
    return {
      step_count: events.length,
      cadence_steps_min: cadence,
      step_time_s: statistics(rows.map((row) => row.step_time_s)),
      stride_time_s: statistics(rows.map((row) => row.stride_time_s)),
      by_side: bySide,
      usable_pose_ratio: usableRatio,
      quality_status: unusable ? "unusable" : allReasons.size ? "review" : "good",
      quality_reasons: [...allReasons],
    };
  }

  function defaultOptions(input = {}) {
    const captureFps = Math.max(0.001, finite(input.captureFps) ?? 30);
    return {
      captureFps,
      captureFpsConfirmed: input.captureFpsConfirmed === true,
      playbackFps: Math.max(0.001, finite(input.playbackFps) ?? captureFps),
      width: Math.max(1, finite(input.width) ?? 1),
      height: Math.max(1, finite(input.height) ?? 1),
      backend: String(input.backend || "unknown"),
      resumedFromCache: input.resumedFromCache === true,
      lowConfidenceThreshold: clamp(finite(input.lowConfidenceThreshold) ?? 0.55, 0, 1),
      minimumDetectionConfidence: clamp(finite(input.minimumDetectionConfidence) ?? 0.35, 0, 1),
      boneLengthTolerance: Math.max(0.05, finite(input.boneLengthTolerance) ?? 0.35),
      idJumpTolerance: Math.max(0.05, finite(input.idJumpTolerance) ?? 0.45),
      groundTolerance: Math.max(0.005, finite(input.groundTolerance) ?? 0.045),
      contactSpeedThreshold: Math.max(0.05, finite(input.contactSpeedThreshold) ?? 0.65),
      minimumContactFrames: Math.max(1, Math.round(finite(input.minimumContactFrames) ?? Math.max(2, captureFps * 0.018))),
      minimumFlightFrames: Math.max(1, Math.round(finite(input.minimumFlightFrames) ?? Math.max(2, captureFps * 0.012))),
      minimumStepTime: Math.max(0.03, finite(input.minimumStepTime) ?? 0.1),
      maximumStepTime: Math.max(0.2, finite(input.maximumStepTime) ?? 2),
      fpsMismatchRatio: Math.max(0.01, finite(input.fpsMismatchRatio) ?? 0.05),
      minimumUsablePoseRatio: clamp(finite(input.minimumUsablePoseRatio) ?? 0.6, 0.1, 1),
    };
  }

  function analyzePoseSequence(rawFrames, inputOptions = {}) {
    const options = defaultOptions(inputOptions);
    const frames = (Array.isArray(rawFrames) ? rawFrames : [])
      .map(normalizePoseFrame)
      .filter(Boolean)
      .sort((a, b) => a.frame - b.frame)
      .filter((frame, index, source) => index === 0 || frame.frame !== source[index - 1].frame);
    const rangeStart = Number.isInteger(Number(inputOptions.rangeStart))
      ? Math.round(Number(inputOptions.rangeStart))
      : frames[0]?.frame ?? 0;
    const rangeEnd = Number.isInteger(Number(inputOptions.rangeEnd))
      ? Math.round(Number(inputOptions.rangeEnd))
      : frames[frames.length - 1]?.frame ?? rangeStart;
    const heights = frames.map(bodyHeight).filter((height) => height > 1);
    const globalHeight = median(heights) || options.height * 0.7 || 1;
    const groundSamples = [];
    for (const frame of frames) {
      for (const side of ["left", "right"]) {
        const foot = footFeature(frame, side);
        if (foot && foot.score >= options.minimumDetectionConfidence) groundSamples.push(foot.y);
      }
    }
    const groundY = percentile(groundSamples, 0.92) ?? options.height - 1;
    const quality = qualityAnalysis(frames, options, globalHeight);
    const candidates = contactCandidates(frames, options, globalHeight, groundY);
    const rawEvents = [
      ...eventsFromCandidates(candidates.left, "left", options, rangeStart, rangeEnd),
      ...eventsFromCandidates(candidates.right, "right", options, rangeStart, rangeEnd),
    ].sort((a, b) => a.frame - b.frame || a.side.localeCompare(b.side));
    const suppression = suppressSimultaneousBoundaryContacts(rawEvents, options, rangeStart);
    const events = suppression.events;
    quality.flags.push(...suppression.flags);
    quality.intervals = intervalize(quality.flags);
    recomputeEventQualityReasons(events, options, quality.intervals, rangeStart, rangeEnd);
    const rows = eventRows(events, options);
    const metrics = summarize(events, rows, quality, frames, options);
    return {
      schema: SCHEMA,
      version: VERSION,
      algorithm: "foot_multisignal_state_machine_v1",
      generated_at: new Date().toISOString(),
      options,
      range: { start_frame: rangeStart, end_frame: rangeEnd },
      ground: { y_pixel: groundY, body_height_pixel: globalHeight, method: "foot_y_percentile_92" },
      events,
      steps: rows,
      metrics,
      quality: {
        status: metrics.quality_status,
        reasons: metrics.quality_reasons,
        intervals: quality.intervals,
      },
    };
  }

  function refreshAnalysis(analysis, inputOptions = {}) {
    if (!analysis || !Array.isArray(analysis.events)) return analysis;
    const options = defaultOptions({ ...(analysis.options || {}), ...inputOptions });
    analysis.events.sort((a, b) => a.frame - b.frame || String(a.side).localeCompare(String(b.side)));
    for (const event of analysis.events) {
      event.time_sec = options.captureFpsConfirmed
        ? event.frame / options.captureFps
        : finite(event.time_sec) ?? event.frame / options.playbackFps;
    }
    const rangeStart = Math.round(finite(inputOptions.rangeStart) ?? finite(analysis.range?.start_frame) ?? analysis.events[0]?.frame ?? 0);
    const rangeEnd = Math.round(finite(inputOptions.rangeEnd) ?? finite(analysis.range?.end_frame) ?? analysis.events.at(-1)?.frame ?? rangeStart);
    const normalizedRangeStart = Math.min(rangeStart, rangeEnd);
    const normalizedRangeEnd = Math.max(rangeStart, rangeEnd);
    const qualityIntervals = Array.isArray(analysis.quality?.intervals) ? analysis.quality.intervals : [];
    const activeIntervals = recomputeEventQualityReasons(
      analysis.events,
      options,
      qualityIntervals,
      normalizedRangeStart,
      normalizedRangeEnd,
    );
    analysis.steps = eventRows(analysis.events, options);
    const reasons = new Set(activeIntervals.map((interval) => interval.reason));
    analysis.steps.flatMap((row) => row.quality_reasons).forEach((reason) => reasons.add(reason));
    if (!options.captureFpsConfirmed) reasons.add("fps_unconfirmed");
    if (options.captureFpsConfirmed && options.playbackFps > 0
      && Math.abs(options.captureFps - options.playbackFps) / options.playbackFps >= options.fpsMismatchRatio) {
      reasons.add("playback_fps_mismatch");
    }
    if (options.backend === "mediapipe") reasons.add("fallback_single_person");
    const usableRatio = Number(analysis.metrics?.usable_pose_ratio);
    if (Number.isFinite(usableRatio) && usableRatio < options.minimumUsablePoseRatio) reasons.add("insufficient_pose_data");
    const validStepIntervals = analysis.steps.filter((row) => Number.isFinite(row.step_time_s) && row.step_time_s > 0).length;
    if (validStepIntervals < 1) reasons.add("insufficient_events");
    analysis.metrics = {
      ...(analysis.metrics || {}),
      step_count: analysis.events.length,
      cadence_steps_min: cadenceFromRows(analysis.steps),
      step_time_s: statistics(analysis.steps.map((row) => row.step_time_s)),
      stride_time_s: statistics(analysis.steps.map((row) => row.stride_time_s)),
      by_side: Object.fromEntries(["left", "right"].map((side) => {
        const rows = analysis.steps.filter((row) => row.side === side);
        return [side, {
          step_time_s: statistics(rows.map((row) => row.step_time_s)),
          stride_time_s: statistics(rows.map((row) => row.stride_time_s)),
        }];
      })),
      quality_reasons: [...reasons],
      quality_status: validStepIntervals < 1
        || Number.isFinite(usableRatio) && usableRatio < options.minimumUsablePoseRatio
        ? "unusable"
        : reasons.size ? "review" : "good",
    };
    analysis.options = options;
    analysis.range = { start_frame: normalizedRangeStart, end_frame: normalizedRangeEnd };
    analysis.quality = {
      ...(analysis.quality || {}),
      status: analysis.metrics.quality_status,
      reasons: analysis.metrics.quality_reasons,
    };
    return analysis;
  }

  function csvCell(value) {
    if (value === null || value === undefined || !Number.isFinite(value) && typeof value === "number") return "";
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function toStepCsv(analysis, trialId = "") {
    const header = [
      "trial_id", "step_index", "side", "contact_frame", "contact_time_s", "next_contact_frame",
      "step_time_s", "stride_time_s", "step_length_m", "speed_m_s", "quality_status",
      "quality_reasons", "corrected_by_user",
    ];
    const rows = (analysis?.steps || []).map((row) => [
      trialId,
      row.step_index,
      row.side,
      row.contact_frame,
      row.contact_time_s,
      row.next_contact_frame,
      row.step_time_s,
      row.stride_time_s,
      row.step_length_m,
      row.speed_m_s,
      row.quality_status,
      (row.quality_reasons || []).join("|"),
      row.corrected_by_user,
    ].map(csvCell).join(","));
    return `\ufeff${[header.join(","), ...rows].join("\r\n")}\r\n`;
  }

  function qualityLabel(reason) {
    return QUALITY_LABELS[reason] || reason;
  }

  global.VideoDigitizerStepCore = Object.freeze({
    SCHEMA,
    VERSION,
    MEDIAPIPE_INDEX,
    SKELETON,
    QUALITY_LABELS,
    analyzePoseSequence,
    defaultOptions,
    landmarksToPoseFrame,
    normalizePoseFrame,
    qualityLabel,
    refreshAnalysis,
    statistics,
    toStepCsv,
  });
})(globalThis);
