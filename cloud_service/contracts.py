from __future__ import annotations

import hashlib
import hmac
import json
import math
import re
import zlib
from typing import Any


CLOUD_SCHEMA = "video_digitizer_cloud_data_v1"
PROJECT_ID_RE = re.compile(r"^[a-f0-9]{32}$")
MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
MAX_MARKERS = 256
MAX_POINT_COUNT = 3_000_000
ALLOWED_TOP_LEVEL_KEYS = {
    "schema",
    "version",
    "saved_at",
    "source_signature",
    "frame_range",
    "markers",
    "skeleton_segments",
    "tracking_constraints",
    "calibration",
    "timing",
    "coordinate_system",
    "points",
    "point_flags",
}
FORBIDDEN_KEYS = {
    "source_path",
    "video_name",
    "video_bytes",
    "image",
    "images",
    "thumbnail",
    "frame_cache",
    "blob",
    "metadata",
    "ai_suggestions",
    "audit_log",
}
POINT_QUALITY_KEYS = {
    "confidence", "note", "track_score", "track_error", "track_disagreement", "match_margin",
    "source_frame", "patch_radius", "search_radius_x", "search_radius_y", "elapsed_ms", "method",
    "forward_confidence", "backward_confidence", "start_anchor_frame", "end_anchor_frame", "alpha",
    "anchor_start", "anchor_end", "model_id", "model_version", "runtime", "suggestion_id",
    "landmark_index", "generated_at", "accepted_at", "device", "input_resolution", "visible", "redetected",
}
POINT_FLAG_KEYS = {"status", "updated_at", "confidence", "model_id", "model_version"}
POINT_STATUSES = {"valid", "uncertain", "occluded", "out_of_frame", "unidentifiable", "excluded"}


class ContractError(ValueError):
    pass


def decompress_gzip_limited(body: bytes, limit: int = MAX_UNCOMPRESSED_BYTES) -> bytes:
    decompressor = zlib.decompressobj(16 + zlib.MAX_WBITS)
    output = decompressor.decompress(body, limit + 1)
    if len(output) > limit or decompressor.unconsumed_tail:
        raise ContractError("Cloud payload is too large")
    output += decompressor.flush(limit + 1 - len(output))
    if len(output) > limit or not decompressor.eof:
        raise ContractError("Cloud payload is invalid or too large")
    return output


def validate_project_id(project_id: str) -> str:
    if not PROJECT_ID_RE.fullmatch(project_id or ""):
        raise ContractError("Invalid project id")
    return project_id


def canonical_json(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def user_storage_key(subject: str, secret: bytes) -> str:
    if not subject or len(secret) < 32:
        raise ContractError("User key configuration is invalid")
    return hmac.new(secret, subject.encode("utf-8"), hashlib.sha256).hexdigest()


def _walk_keys(value: Any):
    if isinstance(value, dict):
        for key, child in value.items():
            yield str(key)
            yield from _walk_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_keys(child)


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{label} must be an object")
    return value


def _reject_unknown(value: dict[str, Any], allowed: set[str], label: str) -> None:
    unknown = set(map(str, value)) - allowed
    if unknown:
        raise ContractError(f"{label} contains unsupported fields: {', '.join(sorted(unknown))}")


def _finite_number(value: Any, label: str) -> float:
    if isinstance(value, bool):
        raise ContractError(f"{label} must be a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise ContractError(f"{label} must be a finite number") from error
    if not math.isfinite(number):
        raise ContractError(f"{label} must be a finite number")
    return number


def _validate_sections(payload: dict[str, Any], marker_names: set[str]) -> None:
    signature = _object(payload.get("source_signature"), "source_signature")
    _reject_unknown(signature, {"digest_algorithm", "digest", "fps", "frame_count", "width", "height"}, "source_signature")
    if len(str(signature.get("digest") or "")) > 256 or len(str(signature.get("digest_algorithm") or "")) > 64:
        raise ContractError("source_signature digest is invalid")
    for key in ("fps", "frame_count", "width", "height"):
        _finite_number(signature.get(key, 0), f"source_signature.{key}")

    frame_range = _object(payload.get("frame_range"), "frame_range")
    _reject_unknown(frame_range, {"start", "end"}, "frame_range")
    start = int(_finite_number(frame_range.get("start"), "frame_range.start"))
    end = int(_finite_number(frame_range.get("end"), "frame_range.end"))
    if start < 0 or end < start:
        raise ContractError("frame_range is invalid")

    skeleton = payload.get("skeleton_segments")
    if not isinstance(skeleton, list) or any(
        not isinstance(segment, list)
        or len(segment) != 2
        or any(str(marker) not in marker_names for marker in segment)
        for segment in skeleton
    ):
        raise ContractError("skeleton_segments is invalid")

    constraints = _object(payload.get("tracking_constraints"), "tracking_constraints")
    if not set(map(str, constraints)).issubset(marker_names):
        raise ContractError("tracking_constraints contains an unknown marker")
    for value in constraints.values():
        item = _object(value, "tracking constraint")
        _reject_unknown(item, {"maxMove", "direction", "patchRadius", "confidence"}, "tracking constraint")
        if item.get("direction", "any") not in {"any", "horizontal", "vertical"}:
            raise ContractError("tracking direction is invalid")
        for key in ("maxMove", "patchRadius", "confidence"):
            if key in item:
                _finite_number(item[key], f"tracking constraint.{key}")

    calibration = _object(payload.get("calibration"), "calibration")
    _reject_unknown(calibration, {"method", "points", "real_points", "unit", "enabled", "lens"}, "calibration")
    if calibration.get("method") != "four_point":
        raise ContractError("calibration method is invalid")
    for list_key, allowed in (("points", {"label", "x", "y"}), ("real_points", {"x", "y"})):
        items = calibration.get(list_key)
        if not isinstance(items, list) or len(items) > 4:
            raise ContractError(f"calibration.{list_key} is invalid")
        for item_value in items:
            item = _object(item_value, f"calibration.{list_key} item")
            _reject_unknown(item, allowed, f"calibration.{list_key} item")
            _finite_number(item.get("x"), f"calibration.{list_key}.x")
            _finite_number(item.get("y"), f"calibration.{list_key}.y")
    lens = _object(calibration.get("lens"), "calibration.lens")
    _reject_unknown(lens, {"enabled", "fx", "fy", "cx", "cy", "k1", "k2", "p1", "p2"}, "calibration.lens")
    for key in ("fx", "fy", "cx", "cy", "k1", "k2", "p1", "p2"):
        if key in lens:
            _finite_number(lens[key], f"calibration.lens.{key}")

    timing = _object(payload.get("timing"), "timing")
    _reject_unknown(timing, {"mode", "frame_timestamps"}, "timing")
    if timing.get("mode") not in {"constant_fps", "per_frame"}:
        raise ContractError("timing mode is invalid")
    timestamps = _object(timing.get("frame_timestamps"), "timing.frame_timestamps")
    for frame, timestamp in timestamps.items():
        if not str(frame).isdigit() or not start <= int(frame) <= end:
            raise ContractError("timing frame is outside frame_range")
        _finite_number(timestamp, "timing timestamp")

    coordinates = _object(payload.get("coordinate_system"), "coordinate_system")
    _reject_unknown(coordinates, {"originX", "originY", "xDirection", "yDirection"}, "coordinate_system")
    _finite_number(coordinates.get("originX", 0), "coordinate_system.originX")
    _finite_number(coordinates.get("originY", 0), "coordinate_system.originY")
    if coordinates.get("xDirection", "right") not in {"right", "left"}:
        raise ContractError("coordinate_system.xDirection is invalid")
    if coordinates.get("yDirection", "down") not in {"down", "up"}:
        raise ContractError("coordinate_system.yDirection is invalid")


def validate_cloud_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ContractError("Cloud payload must be an object")
    unknown = set(payload) - ALLOWED_TOP_LEVEL_KEYS
    if unknown:
        raise ContractError(f"Cloud payload contains unsupported fields: {', '.join(sorted(unknown))}")
    forbidden = FORBIDDEN_KEYS.intersection(_walk_keys(payload))
    if forbidden:
        raise ContractError(f"Cloud payload contains local-only fields: {', '.join(sorted(forbidden))}")
    if payload.get("schema") != CLOUD_SCHEMA or payload.get("version") != 1:
        raise ContractError("Unsupported cloud payload schema")

    markers = payload.get("markers")
    points = payload.get("points")
    if not isinstance(markers, list) or not 1 <= len(markers) <= MAX_MARKERS:
        raise ContractError("Marker list is invalid")
    if len(set(map(str, markers))) != len(markers):
        raise ContractError("Marker names must be unique")
    if not isinstance(points, dict):
        raise ContractError("Point store is invalid")

    point_count = 0
    marker_names = set(map(str, markers))
    if any(not name or len(name) > 200 for name in marker_names):
        raise ContractError("Marker name is invalid")
    _validate_sections(payload, marker_names)
    for frame, row in points.items():
        try:
            frame_index = int(frame)
        except (TypeError, ValueError) as error:
            raise ContractError("Point frame is invalid") from error
        if frame_index < 0 or not isinstance(row, dict):
            raise ContractError("Point frame is invalid")
        frame_range = payload["frame_range"]
        if frame_index < int(frame_range["start"]) or frame_index > int(frame_range["end"]):
            raise ContractError("Point frame is outside frame_range")
        if not set(map(str, row)).issubset(marker_names):
            raise ContractError("Point store contains an unknown marker")
        for point in row.values():
            if not isinstance(point, dict):
                raise ContractError("Point value is invalid")
            _reject_unknown(point, {"x", "y", "src", "quality"}, "Point value")
            try:
                x = float(point["x"])
                y = float(point["y"])
            except (KeyError, TypeError, ValueError, OverflowError) as error:
                raise ContractError("Point coordinate is invalid") from error
            if not math.isfinite(x) or not math.isfinite(y):
                raise ContractError("Point coordinate must be finite")
            if point.get("src", "") not in {"", "manual", "interp", "ai", "track"}:
                raise ContractError("Point source is invalid")
            quality = _object(point.get("quality", {}), "Point quality")
            _reject_unknown(quality, POINT_QUALITY_KEYS, "Point quality")
            if any(isinstance(value, (dict, list)) for value in quality.values()):
                raise ContractError("Point quality value is invalid")
        point_count += len(row)
        if point_count > MAX_POINT_COUNT:
            raise ContractError("Point store is too large")

    flags = _object(payload.get("point_flags"), "point_flags")
    for frame, row in flags.items():
        if not str(frame).isdigit() or not int(payload["frame_range"]["start"]) <= int(frame) <= int(payload["frame_range"]["end"]):
            raise ContractError("Point flag frame is invalid")
        row = _object(row, "Point flag row")
        if not set(map(str, row)).issubset(marker_names):
            raise ContractError("Point flag contains an unknown marker")
        for value in row.values():
            flag = _object(value, "Point flag")
            _reject_unknown(flag, POINT_FLAG_KEYS, "Point flag")
            if flag.get("status") not in POINT_STATUSES:
                raise ContractError("Point flag status is invalid")

    body = canonical_json(payload)
    if len(body) > MAX_UNCOMPRESSED_BYTES:
        raise ContractError("Cloud payload is too large")
    return payload


def point_rows(payload: dict[str, Any], user_key: str, project_id: str, revision: str):
    saved_at = str(payload.get("saved_at") or "")
    for frame, row in payload["points"].items():
        for marker, point in row.items():
            if not isinstance(point, dict):
                continue
            flag = ((payload.get("point_flags", {}).get(str(frame), {}) or {}).get(marker) or {})
            yield {
                "user_key": user_key,
                "project_id": project_id,
                "revision": revision,
                "saved_at": saved_at,
                "frame": int(frame),
                "marker": str(marker),
                "x": float(point.get("x", 0)),
                "y": float(point.get("y", 0)),
                "status": str(flag.get("status") or "valid"),
                "source": str(point.get("src") or ""),
                "quality_json": json.dumps(point.get("quality") or {}, ensure_ascii=False, separators=(",", ":")),
            }
