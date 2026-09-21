from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class PointReviewStateTests(unittest.TestCase):
    def setUp(self):
        self.app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")
        self.html = (ROOT / "web_viewer" / "index.html").read_text(encoding="utf-8")

    def test_measurement_and_researcher_review_are_separate_controls(self):
        self.assertIn('id="pointStatus"', self.html)
        self.assertIn('id="pointReviewStatus"', self.html)
        self.assertIn('value="unreviewed"', self.html)
        self.assertIn('value="confirmed"', self.html)
        self.assertIn("function pointReviewStatusAt(frame, marker)", self.app)
        self.assertIn('review_status: reviewStatus', self.app)
        self.assertIn('recordAudit("set_point_review_status"', self.app)

    def test_legacy_review_default_depends_on_provenance(self):
        self.assertIn('point.src === "manual" ? "confirmed" : "unreviewed"', self.app)
        self.assertIn('flag?.model_id || flag?.model_version', self.app)
        self.assertIn('src: "copy"', self.app)
        self.assertIn('if (src === "copy") return "C";', self.app)

    def test_review_state_is_exported_and_cloud_allowlisted(self):
        self.assertIn('`${marker}_review_status`', self.app)
        self.assertIn('review_status: pointReviewStatusAt(frame, marker)', self.app)
        self.assertIn('...(reviewStatus ? { review_status: reviewStatus } : {})', self.app)

    def test_unreviewed_points_are_in_review_and_quality_workflows(self):
        self.assertIn('pointReviewStatusAt(frame, marker) === "unreviewed"', self.app)
        self.assertIn('text: `研究者が未確認の点が ${unreviewed} 点あります`', self.app)
        self.assertIn('reviewStatus === "unreviewed"', self.app)


if __name__ == "__main__":
    unittest.main()
