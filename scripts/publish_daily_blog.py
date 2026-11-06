#!/usr/bin/env python3
"""Publish a dated note, RSS feed, and static story pages for the RocketGPT blog."""

import argparse
from email.utils import format_datetime
from html import escape
import json
from datetime import date, datetime, time, timezone
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo


SITE_URL = "https://rocketgpt.net"
ATOM_NAMESPACE = "http://www.w3.org/2005/Atom"
SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9"


DAILY_NOTES = (
    {
        "title": "Start with the rough idea",
        "summary": "A useful first prompt does not need to be polished. Give Rocket 2.0 the rough idea and ask it to help find a clear starting point.",
        "body": [
            "Try describing what you want to make, who it is for, and what feels difficult about getting started. Then ask for a few directions rather than a finished answer.",
            "Treat the suggestions as a first draft: keep what fits, adjust what does not, and verify important facts before using them."
        ]
    },
    {
        "title": "Turn a big goal into a next step",
        "summary": "When a project feels too large, ask Rocket 2.0 to break it into small actions and identify the first one you can do today.",
        "body": [
            "Share the outcome you want, any deadline, and the resources or limits you are working with. Ask for a short sequence of steps and a realistic first task.",
            "The plan is a starting point, not a guarantee. Review it against your actual schedule and revise it as the work changes."
        ]
    },
    {
        "title": "Give a draft a clearer voice",
        "summary": "A draft is easier to improve when you name the audience, tone, and one thing you want readers to remember.",
        "body": [
            "Ask Rocket 2.0 to revise a paragraph for a specific audience and tone, then compare the revision with your original. A focused instruction usually gives you more useful options.",
            "Keep your own judgment in the loop. Check the facts, preserve your intent, and make the final wording sound like you."
        ]
    },
    {
        "title": "Make the first line do more work",
        "summary": "For a post or pitch, ask Rocket 2.0 for several opening lines that make the main idea clear without overpromising.",
        "body": [
            "Include the audience and the central point, then request a few different openings: direct, curious, and story-led. Seeing alternatives can make the strongest angle easier to spot.",
            "Choose a hook that the rest of the piece can genuinely deliver on; clarity is more useful than a dramatic claim."
        ]
    },
    {
        "title": "Use NALL-E to explore a visual direction",
        "summary": "A helpful image prompt describes the subject, setting, mood, and composition—not just a list of objects.",
        "body": [
            "Start with the main subject and add a few details about light, color, framing, or style. Change one detail at a time when you want to explore alternatives.",
            "NALL-E sends prompts to a public third-party image service. Avoid private information, and remember that service availability can vary."
        ]
    },
    {
        "title": "Ask for options before choosing",
        "summary": "When you are deciding between directions, ask Rocket 2.0 to compare the trade-offs using criteria that matter to you.",
        "body": [
            "Name the options and what you value—such as time, simplicity, or cost—and ask for a concise comparison. This can help surface questions you still need to answer.",
            "The model may miss context or make mistakes. Use its comparison to support your decision, not to replace your own research."
        ]
    },
    {
        "title": "Check an AI answer that matters",
        "summary": "AI can be a useful starting point, but important details deserve a second look—especially facts, dates, and advice.",
        "body": [
            "Ask Rocket 2.0 to explain its reasoning or identify which parts need verification. Then check those claims against sources you trust.",
            "Rocket 2.0's current free chat does not browse the web, so it cannot confirm live information. Do not rely on it for emergencies or professional advice."
        ]
    },
    {
        "title": "Make a prompt more specific",
        "summary": "A little context can turn a broad request into a more useful answer: explain the goal, the audience, and the format you need.",
        "body": [
            "Instead of asking for general ideas, describe where the ideas will be used and what a good result should accomplish. If you have constraints, include them up front.",
            "If the answer is not quite right, say what to change. Prompting is a conversation; a clear follow-up can be more effective than starting over."
        ]
    },
    {
        "title": "Find the useful question inside the problem",
        "summary": "If a challenge feels vague, ask Rocket 2.0 to help turn it into a few smaller questions you can answer one at a time.",
        "body": [
            "Describe what is happening and what outcome you want. Ask for the key unknowns or decisions, then choose one to work through first.",
            "You do not need to share sensitive details to get started. Keep personal, financial, and confidential information out of prompts."
        ]
    },
    {
        "title": "Create a simple outline before you write",
        "summary": "An outline can make a blank page feel more manageable. Ask Rocket 2.0 for a few sections that support one clear takeaway.",
        "body": [
            "Share the audience and the point you want to make. Request a short outline, then remove any section that does not help the reader understand or act.",
            "Use the structure as a guide, not a script. Your examples and experience are what make the finished piece specific."
        ]
    },
    {
        "title": "Explore a mood with NALL-E",
        "summary": "For a more intentional image, describe how the scene should feel and how its colors and lighting can support that mood.",
        "body": [
            "Try words such as calm, energetic, or quiet alongside concrete visual details like soft morning light or a wide composition. The more specific the scene, the easier it is to explore variations.",
            "Generated images can contain unexpected details. Review the result before you download or share it."
        ]
    },
    {
        "title": "Make a long explanation easier to scan",
        "summary": "Ask Rocket 2.0 to reorganize a long draft into a short summary, headings, and a few clear supporting points.",
        "body": [
            "Tell it who will read the explanation and what they should understand afterward. A useful summary keeps the important meaning while making the structure easier to follow.",
            "Compare the shortened version with your source so that essential qualifications or context are not lost."
        ]
    },
    {
        "title": "Compare ideas with a clear framework",
        "summary": "A simple set of criteria can make brainstorming more focused and help you compare options on equal terms.",
        "body": [
            "Ask Rocket 2.0 to generate ideas that fit your goal, then sort them by a few priorities such as effort, audience fit, or time to test.",
            "The best option depends on real-world constraints the model may not know. Use the list to guide a small experiment or gather more information."
        ]
    },
    {
        "title": "Give a creative project a small constraint",
        "summary": "A word limit, a defined audience, or one required detail can make an open-ended creative task easier to begin.",
        "body": [
            "Share the constraint with Rocket 2.0 and ask for several distinct directions. Constraints help narrow the space without deciding the final result for you.",
            "Keep the version that feels most natural, and adjust it until it reflects what you actually want to say."
        ]
    }
)


def post_slug(post: dict) -> str:
    title_slug = re.sub(r"[^a-z0-9]+", "-", post["title"].lower()).strip("-")
    return f'{post["date"]}-{title_slug}'


def article_url(post: dict) -> str:
    return f"{SITE_URL}/blog/articles/{post_slug(post)}.html"


def generate_article_pages(posts_path: Path, articles_dir: Path) -> None:
    posts = json.loads(posts_path.read_text(encoding="utf-8"))
    if not isinstance(posts, list):
        raise ValueError(f"{posts_path} must contain a JSON array")

    articles_dir.mkdir(parents=True, exist_ok=True)
    for post in posts:
        title = escape(post["title"])
        summary = escape(post["summary"])
        category = escape(post["category"])
        published = date.fromisoformat(post["date"])
        published_label = published.strftime("%B %d, %Y").replace(" 0", " ")
        image = escape(post["image"], quote=True)
        image_alt = escape(post["imageAlt"], quote=True)
        url = article_url(post)
        body = "\n".join(
            f"          <p>{escape(paragraph)}</p>" for paragraph in post["body"]
        )
        page = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark light" />
  <meta name="default-theme" content="light" />
  <meta name="theme-color" content="#080b12" />
  <meta name="description" content="{summary}" />
  <link rel="canonical" href="{url}" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="icon" type="image/svg+xml" href="/pwa-icon.svg" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="RocketGPT" />
  <meta property="og:title" content="{title} | RocketGPT Blog" />
  <meta property="og:description" content="{summary}" />
  <meta property="og:url" content="{url}" />
  <meta property="og:image" content="{SITE_URL}/rocketgpt-share.png" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Rocket 2.0 — a free AI chat workspace for sharper ideas and shareable content." />
  <meta property="article:published_time" content="{published.isoformat()}T00:00:00Z" />
  <meta property="article:section" content="{category}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{title} | RocketGPT Blog" />
  <meta name="twitter:description" content="{summary}" />
  <meta name="twitter:image" content="{SITE_URL}/rocketgpt-share.png" />
  <link rel="stylesheet" href="/site.css" />
  <link rel="stylesheet" href="/blog.css?v=3-editorial" />
  <title>{title} | RocketGPT Blog</title>
</head>
<body class="blog-page">
  <header class="site-header">
    <a class="brand" href="/" aria-label="RocketGPT home">
      <img src="/rocketgpt-logo.svg" alt="" />
      <span>RocketGPT</span>
    </a>
    <nav class="site-nav" aria-label="Main navigation">
      <a href="/">Home</a>
      <a href="/rocketgpt.html">Rocket 2.0</a>
      <a href="/nall-e.html">NALL-E</a>
      <a href="/blog.html" aria-current="page">Blog</a>
      <a href="/store.html">Store</a>
    </nav>
    <a class="header-cta" href="/rocketgpt.html">Try Rocket 2.0 <span aria-hidden="true">→</span></a>
  </header>
  <main>
    <section class="posts-section" aria-label="Blog story">
      <div class="posts is-detail">
        <a class="back-link" href="/blog.html">← All stories</a>
        <article class="post post-detail">
          <img class="post-detail-image" src="{image}" alt="{image_alt}" />
          <div class="post-content">
            <div class="post-meta"><span class="post-category">{category}</span><time datetime="{published.isoformat()}">{published_label}</time></div>
            <h1>{title}</h1>
            <p class="post-summary">{summary}</p>
            <div class="post-body">
{body}
            </div>
            <div class="post-share-actions">
              <button class="share-story" type="button" data-share-url="{url}" data-share-title="{title}" data-share-text="{summary}">Share this story</button>
              <span class="share-status" role="status" aria-live="polite"></span>
            </div>
          </div>
        </article>
      </div>
    </section>
  </main>
  <footer class="site-footer">
    <a href="/">RocketGPT</a>
    <span>Useful AI, built with care.</span>
    <a href="/rocketgpt.html">Open Rocket 2.0</a>
  </footer>
  <script src="/site.js"></script>
  <script src="/blog-article.js" defer></script>
</body>
</html>
"""
        (articles_dir / f"{post_slug(post)}.html").write_text(page, encoding="utf-8")


def update_sitemap(posts_path: Path, sitemap_path: Path) -> None:
    posts = json.loads(posts_path.read_text(encoding="utf-8"))
    if not isinstance(posts, list):
        raise ValueError(f"{posts_path} must contain a JSON array")

    ET.register_namespace("", SITEMAP_NAMESPACE)
    sitemap = ET.parse(sitemap_path).getroot()
    existing_urls = {
        element.text
        for element in sitemap.findall(f"{{{SITEMAP_NAMESPACE}}}url/{{{SITEMAP_NAMESPACE}}}loc")
    }
    for post in posts:
        url = article_url(post)
        if url in existing_urls:
            continue
        entry = ET.SubElement(sitemap, f"{{{SITEMAP_NAMESPACE}}}url")
        ET.SubElement(entry, f"{{{SITEMAP_NAMESPACE}}}loc").text = url
        ET.SubElement(entry, f"{{{SITEMAP_NAMESPACE}}}changefreq").text = "yearly"
        ET.SubElement(entry, f"{{{SITEMAP_NAMESPACE}}}priority").text = "0.5"

    ET.indent(sitemap, space="  ")
    sitemap_path.write_bytes(
        ET.tostring(sitemap, encoding="utf-8", xml_declaration=True) + b"\n"
    )


def append_daily_post(posts_path: Path, posted_date: date) -> bool:
    posts = json.loads(posts_path.read_text(encoding="utf-8"))
    if not isinstance(posts, list):
        raise ValueError(f"{posts_path} must contain a JSON array")

    if any(
        post.get("date") == posted_date.isoformat()
        and post.get("category") == "Daily note"
        for post in posts
    ):
        return False

    note = DAILY_NOTES[(posted_date - date(2026, 11, 6)).days % len(DAILY_NOTES)]
    posts.insert(0, {
        "date": posted_date.isoformat(),
        "category": "Daily note",
        "image": "/blog/images/daily-note.svg",
        "imageAlt": "An open notebook with a green star drawn on its page.",
        **note
    })
    posts.sort(key=lambda post: post["date"], reverse=True)
    posts_path.write_text(
        f"{json.dumps(posts, ensure_ascii=False, indent=2)}\n",
        encoding="utf-8"
    )
    return True


def write_rss_feed(posts_path: Path, feed_path: Path) -> None:
    posts = json.loads(posts_path.read_text(encoding="utf-8"))
    if not isinstance(posts, list):
        raise ValueError(f"{posts_path} must contain a JSON array")

    ET.register_namespace("atom", ATOM_NAMESPACE)
    rss = ET.Element("rss", {"version": "2.0"})
    channel = ET.SubElement(rss, "channel")
    ET.SubElement(channel, "title").text = "RocketGPT Blog"
    ET.SubElement(channel, "link").text = f"{SITE_URL}/blog.html"
    ET.SubElement(
        channel,
        f"{{{ATOM_NAMESPACE}}}link",
        {
            "href": f"{SITE_URL}/blog/feed.xml",
            "rel": "self",
            "type": "application/rss+xml"
        }
    )
    ET.SubElement(channel, "description").text = (
        "Product updates and daily notes from RocketGPT."
    )
    ET.SubElement(channel, "language").text = "en-us"

    for post in posts:
        post_url = article_url(post)
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = post["title"]
        ET.SubElement(item, "link").text = post_url
        ET.SubElement(item, "guid", {"isPermaLink": "true"}).text = post_url
        ET.SubElement(item, "description").text = post["summary"]
        ET.SubElement(item, "category").text = post["category"]
        published = datetime.combine(
            date.fromisoformat(post["date"]), time.min, tzinfo=timezone.utc
        )
        ET.SubElement(item, "pubDate").text = format_datetime(published, usegmt=True)

    ET.indent(rss, space="  ")
    feed_path.parent.mkdir(parents=True, exist_ok=True)
    feed_path.write_bytes(
        ET.tostring(rss, encoding="utf-8", xml_declaration=True) + b"\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--date",
        help="Override the local publishing date (YYYY-MM-DD), primarily for testing."
    )
    args = parser.parse_args()
    posted_date = (
        date.fromisoformat(args.date)
        if args.date
        else datetime.now(ZoneInfo("America/Los_Angeles")).date()
    )
    posts_path = Path(__file__).resolve().parents[1] / "blog" / "posts.json"
    feed_path = posts_path.parent / "feed.xml"
    articles_dir = posts_path.parent / "articles"
    sitemap_path = posts_path.parent.parent / "sitemap.xml"
    if append_daily_post(posts_path, posted_date):
        print(f"Added RocketGPT daily blog post for {posted_date.isoformat()}.")
    else:
        print(f"A daily blog post for {posted_date.isoformat()} already exists.")
    write_rss_feed(posts_path, feed_path)
    generate_article_pages(posts_path, articles_dir)
    update_sitemap(posts_path, sitemap_path)
    print(f"Updated RSS feed at {feed_path}.")
    print(f"Generated static article pages in {articles_dir}.")
    print(f"Updated sitemap at {sitemap_path}.")


if __name__ == "__main__":
    main()
