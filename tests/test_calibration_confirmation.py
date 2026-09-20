from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class CalibrationConfirmationTests(unittest.TestCase):
    def test_real_world_coordinates_require_explicit_confirmation(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")
        html = (ROOT / "web_viewer" / "index.html").read_text(encoding="utf-8")

        self.assertIn('id="calibRealConfirmed"', html)
        self.assertIn("if (!state.calibration.realPointsConfirmed) return null;", app)
        self.assertIn("real_points_confirmed: state.calibration.realPointsConfirmed", app)
        self.assertIn("実際の較正枠の座標ですか？", app)
        self.assertIn("els.calibRealConfirmed.checked = false", app)

    def test_legacy_projects_do_not_silently_confirm_placeholder_values(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")

        self.assertIn("savedCalibration.real_points_confirmed === true", app)
        self.assertNotIn("Boolean(savedCalibration.enabled) &&", app)


if __name__ == "__main__":
    unittest.main()
