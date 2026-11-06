import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from scripts.publish_daily_blog import append_daily_post


class PublishDailyBlogTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.posts_path = Path(self.temp_dir.name) / "posts.json"
        self.posts_path.write_text(
            json.dumps([{
                "date": "2026-11-06",
                "category": "Product update",
                "title": "A shipped change",
                "summary": "A product update already exists for this date.",
                "body": ["This is not a daily note."]
            }]),
            encoding="utf-8"
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_adds_daily_note_without_overwriting_same_day_product_update(self):
        self.assertTrue(append_daily_post(self.posts_path, date(2026, 11, 6)))
        posts = json.loads(self.posts_path.read_text(encoding="utf-8"))

        self.assertEqual(len(posts), 2)
        self.assertEqual(posts[0]["category"], "Daily note")
        self.assertEqual(posts[0]["date"], "2026-11-06")
        self.assertEqual(posts[1]["title"], "A shipped change")

    def test_does_not_duplicate_daily_note_when_run_twice(self):
        self.assertTrue(append_daily_post(self.posts_path, date(2026, 11, 6)))
        self.assertFalse(append_daily_post(self.posts_path, date(2026, 11, 6)))
        posts = json.loads(self.posts_path.read_text(encoding="utf-8"))

        self.assertEqual(sum(post["category"] == "Daily note" for post in posts), 1)

    def test_newer_daily_posts_sort_before_older_posts(self):
        append_daily_post(self.posts_path, date(2026, 11, 7))
        posts = json.loads(self.posts_path.read_text(encoding="utf-8"))

        self.assertEqual(posts[0]["date"], "2026-11-07")


if __name__ == "__main__":
    unittest.main()
