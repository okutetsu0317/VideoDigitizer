import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ProjectSafetyTests(unittest.TestCase):
    def test_partial_file_write_is_aborted_and_never_marked_saved(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")

        self.assertIn("await writable.abort?.();", app)
        self.assertLess(app.index("await writable.write(text);"), app.index("await writable.close();"))
        self.assertIn("const complete = saved && requiredDestinationsSaved;", app)
        self.assertIn("if (!complete) setStatus(\"自動保存に失敗しました", app)

    def test_same_project_in_multiple_tabs_blocks_automatic_and_overwrite_saves(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")
        html = (ROOT / "web_viewer" / "index.html").read_text(encoding="utf-8")

        self.assertIn("TAB_PRESENCE_PREFIX", app)
        self.assertIn("if (updateTabConflict()) return false;", app)
        self.assertIn("別タブでも同じプロジェクトを開いているため", app)
        self.assertIn('id="multiTabWarning"', html)
        self.assertIn('id="saveProjectCopy"', html)

    def test_reliability_report_is_marker_and_axis_specific(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")
        html = (ROOT / "web_viewer" / "index.html").read_text(encoding="utf-8")

        self.assertIn("function reliabilityAxisStats", app)
        self.assertIn("X差平均", app)
        self.assertIn("Y RMSE", app)
        self.assertIn('id="reliabilityTable"', html)

    def test_context_help_links_target_existing_guide_topics(self):
        html = (ROOT / "web_viewer" / "index.html").read_text(encoding="utf-8")
        help_core = (ROOT / "web_viewer" / "help-core.mjs").read_text(encoding="utf-8")

        for topic in ("range", "zoom", "tracking", "copy-interpolate", "calibration", "analysis"):
            with self.subTest(topic=topic):
                self.assertIn(f'href="./help.html#{topic}"', html)
                self.assertIn(f"id: '{topic}'", help_core)


if __name__ == "__main__":
    unittest.main()
