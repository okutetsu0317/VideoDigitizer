from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / ("web_viewer" if (ROOT / "web_viewer").is_dir() else "web")


class Elements(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


class BrowserGuideTests(unittest.TestCase):
    def setUp(self):
        self.html = (WEB / "help.html").read_text()
        self.tags = Elements(self.html).tags

    def test_guide_is_static_with_twenty_unique_topics(self):
        topics = [attrs["id"] for _, attrs in self.tags if attrs.get("class") == "guide-topic"]
        self.assertEqual(len(topics), 20)
        self.assertEqual(len(set(topics)), 20)
        self.assertIn("動画そのものは含まれません", self.html)
        self.assertIn("同じ平面", self.html)
        self.assertIn("初期", self.html)

    def test_all_table_of_contents_anchors_exist(self):
        ids = {attrs["id"] for _, attrs in self.tags if "id" in attrs}
        for _, attrs in self.tags:
            href = attrs.get("href", "")
            if href.startswith("#"):
                self.assertIn(href[1:], ids)

    def test_screenshot_assets_are_local_and_accessible(self):
        screenshots = [attrs for tag, attrs in self.tags if tag == "img" and "guide-assets" in attrs.get("src", "")]
        self.assertEqual(len(screenshots), 5)
        for attrs in screenshots:
            self.assertTrue((WEB / attrs["src"]).is_file(), attrs["src"])
            self.assertTrue(attrs.get("alt"))
            self.assertEqual(attrs["loading"], "lazy")

    def test_guide_has_no_model_or_external_communications(self):
        self.assertIn("connect-src 'none'", self.html)
        self.assertIn("worker-src 'none'", self.html)
        script = (WEB / "help.js").read_text()
        for term in ["fetch(", "new Worker", "indexedDB", "localStorage", "innerHTML"]:
            self.assertNotIn(term, script)
        for path in ["help-worker.js", "help-config.mjs", "vendor/webllm"]:
            self.assertFalse((WEB / path).exists())
        self.assertNotIn("loadAI", self.html)

    def test_search_clears_for_bookmarks_and_preserves_plain_reading(self):
        script = (WEB / "help.js").read_text()
        self.assertIn("hashchange", script)
        self.assertIn("section.hidden", script)
        self.assertIn("search.value = ''", script)
        self.assertIn('id="noResults" hidden', self.html)
        for _, attrs in self.tags:
            if attrs.get("class") == "guide-topic":
                self.assertNotIn("hidden", attrs)

    def test_main_app_and_cache_do_not_preload_guide_assets(self):
        main = (WEB / "index.html").read_text()
        self.assertIn('href="./help.html"', main)
        self.assertIn("使い方ガイド", main)
        shell = (WEB / "service-worker.js").read_text().split('self.addEventListener')[0]
        self.assertNotIn("help.js", shell)
        self.assertNotIn("guide-assets", shell)


if __name__ == "__main__":
    unittest.main()
