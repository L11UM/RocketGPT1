import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
import xml.etree.ElementTree as ET

from scripts.publish_daily_blog import (
    append_daily_post,
    generate_article_pages,
    update_sitemap,
    write_rss_feed,
)


class PublishDailyBlogTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.posts_path = Path(self.temp_dir.name) / "posts.json"
        self.posts_path.write_text(
            json.dumps([{
                "date": "2026-11-06",
                "category": "Product update",
                "title": "A shipped change",
                "image": "/blog/images/rocketgpt-update.svg",
                "imageAlt": "A rocket orbiting a star.",
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

    def test_writes_rss_items_with_article_links_and_dates(self):
        feed_path = Path(self.temp_dir.name) / "feed.xml"
        write_rss_feed(self.posts_path, feed_path)
        channel = ET.parse(feed_path).getroot().find("channel")

        self.assertIsNotNone(channel)
        item = channel.find("item")
        self.assertIsNotNone(item)
        self.assertEqual(item.findtext("title"), "A shipped change")
        self.assertEqual(
            item.findtext("link"),
            "https://rocketgpt.net/blog/articles/2026-11-06-a-shipped-change.html"
        )
        self.assertEqual(item.findtext("pubDate"), "Fri, 06 Nov 2026 00:00:00 GMT")

    def test_generates_static_article_metadata_and_escaped_content(self):
        posts = json.loads(self.posts_path.read_text(encoding="utf-8"))
        posts[0]["title"] = "A <safe> change & launch"
        posts[0]["body"] = ["Keep <script> text as content."]
        self.posts_path.write_text(json.dumps(posts), encoding="utf-8")
        articles_dir = Path(self.temp_dir.name) / "articles"
        generate_article_pages(self.posts_path, articles_dir)
        page = (articles_dir / "2026-11-06-a-safe-change-launch.html").read_text(
            encoding="utf-8"
        )

        self.assertIn('property="og:type" content="article"', page)
        self.assertIn(
            "https://rocketgpt.net/blog/articles/2026-11-06-a-safe-change-launch.html",
            page
        )
        self.assertIn("A &lt;safe&gt; change &amp; launch", page)
        self.assertIn("Keep &lt;script&gt; text as content.", page)

    def test_adds_static_story_to_sitemap_without_duplicate_entries(self):
        sitemap_path = Path(self.temp_dir.name) / "sitemap.xml"
        sitemap_path.write_text(
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            '<url><loc>https://rocketgpt.net/</loc></url></urlset>',
            encoding="utf-8"
        )
        update_sitemap(self.posts_path, sitemap_path)
        update_sitemap(self.posts_path, sitemap_path)
        urls = [
            item.text
            for item in ET.parse(sitemap_path).getroot().findall(
                "{http://www.sitemaps.org/schemas/sitemap/0.9}url/"
                "{http://www.sitemaps.org/schemas/sitemap/0.9}loc"
            )
        ]

        self.assertEqual(len(urls), 2)
        self.assertIn(
            "https://rocketgpt.net/blog/articles/2026-11-06-a-shipped-change.html",
            urls
        )


if __name__ == "__main__":
    unittest.main()
