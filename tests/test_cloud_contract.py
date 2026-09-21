import unittest
import gzip
import math
from pathlib import Path

from cloud_service.contracts import (
    ContractError,
    decompress_gzip_limited,
    point_rows,
    user_storage_key,
    validate_cloud_payload,
    validate_project_id,
)


def valid_payload():
    return {
        "schema": "video_digitizer_cloud_data_v1",
        "version": 1,
        "saved_at": "2026-08-10T00:00:00Z",
        "source_signature": {"digest": "abc", "fps": 60, "frame_count": 2, "width": 1920, "height": 1080},
        "frame_range": {"start": 0, "end": 1},
        "markers": ["右膝"],
        "skeleton_segments": [],
        "tracking_constraints": {},
        "calibration": {"method": "four_point", "points": [], "real_points": [], "unit": "m", "enabled": False, "lens": {}},
        "timing": {"mode": "constant_fps", "frame_timestamps": {}},
        "coordinate_system": {},
        "points": {"0": {"右膝": {"x": 10.125, "y": 20.25, "src": "manual", "quality": {}}}},
        "point_flags": {},
    }


class CloudContractTests(unittest.TestCase):
    def test_deployment_passes_explicit_project_id_to_cloud_run(self):
        bootstrap = (Path(__file__).parents[1] / "cloud_service" / "infra" / "bootstrap.sh").read_text(
            encoding="utf-8"
        )
        main = (Path(__file__).parents[1] / "cloud_service" / "main.py").read_text(encoding="utf-8")
        self.assertIn("GCP_PROJECT_ID=${PROJECT_ID}", bootstrap)
        self.assertIn('os.environ.get("GCP_PROJECT_ID")', main)

    def test_accepts_digitize_only_payload(self):
        payload = valid_payload()
        self.assertIs(validate_cloud_payload(payload), payload)

    def test_rejects_media_and_local_path_fields_at_any_depth(self):
        for key in ["video_bytes", "image", "thumbnail", "source_path", "frame_cache"]:
            payload = valid_payload()
            payload["tracking_constraints"][key] = "must-not-leave-device"
            with self.subTest(key=key), self.assertRaises(ContractError):
                validate_cloud_payload(payload)

    def test_rejects_unknown_top_level_fields(self):
        payload = valid_payload()
        payload["metadata"] = {"subject": "private"}
        with self.assertRaises(ContractError):
            validate_cloud_payload(payload)

    def test_rejects_missing_or_non_finite_coordinates(self):
        for point in [{"x": 1}, {"x": math.nan, "y": 2}, {"x": "bad", "y": 2}]:
            payload = valid_payload()
            payload["points"]["0"]["右膝"] = point
            with self.subTest(point=point), self.assertRaises(ContractError):
                validate_cloud_payload(payload)

    def test_rejects_unlisted_nested_fields_and_out_of_range_points(self):
        payload = valid_payload()
        payload["calibration"]["points"] = [{"label": "calib_p1", "x": 1, "y": 2, "source_file": "private.csv"}]
        with self.assertRaises(ContractError):
            validate_cloud_payload(payload)

        payload = valid_payload()
        payload["points"]["0"]["右膝"]["quality"] = {"private_blob": {"data": "hidden"}}
        with self.assertRaises(ContractError):
            validate_cloud_payload(payload)

        payload = valid_payload()
        payload["points"]["2"] = payload["points"].pop("0")
        with self.assertRaises(ContractError):
            validate_cloud_payload(payload)

    def test_user_key_is_stable_and_secret_scoped(self):
        first = user_storage_key("google-subject", b"a" * 32)
        self.assertEqual(first, user_storage_key("google-subject", b"a" * 32))
        self.assertNotEqual(first, user_storage_key("google-subject", b"b" * 32))
        self.assertNotIn("google-subject", first)

    def test_project_id_is_restricted(self):
        self.assertEqual(validate_project_id("a" * 32), "a" * 32)
        for value in ["", "../project", "A" * 32, "a" * 31]:
            with self.subTest(value=value), self.assertRaises(ContractError):
                validate_project_id(value)

    def test_bigquery_rows_preserve_subpixel_coordinates(self):
        payload = valid_payload()
        payload["point_flags"] = {"0": {"右膝": {"status": "uncertain", "review_status": "confirmed"}}}
        rows = list(point_rows(payload, "user", "a" * 32, "revision"))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["x"], 10.125)
        self.assertEqual(rows[0]["y"], 20.25)
        self.assertEqual(rows[0]["status"], "uncertain")

    def test_accepts_independent_review_status_and_copy_source(self):
        payload = valid_payload()
        payload["points"]["0"]["右膝"]["src"] = "copy"
        payload["point_flags"] = {"0": {"右膝": {"status": "valid", "review_status": "unreviewed"}}}
        self.assertIs(validate_cloud_payload(payload), payload)

        payload["point_flags"]["0"]["右膝"]["review_status"] = "approved-ish"
        with self.assertRaises(ContractError):
            validate_cloud_payload(payload)

    def test_gzip_decompression_is_size_bounded(self):
        self.assertEqual(decompress_gzip_limited(gzip.compress(b"small"), 5), b"small")
        with self.assertRaises(ContractError):
            decompress_gzip_limited(gzip.compress(b"too-large"), 5)


if __name__ == "__main__":
    unittest.main()
