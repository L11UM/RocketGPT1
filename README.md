# RocketGPT

RocketGPT is an American artificial intelligence research and deployment company. Rocket 2.0 is a browser-based chat product powered by a third-party large language model (LLM); NALL-E uses a third-party image service. RocketGPT has not trained or hosted the model powering the public chat.

## Run locally

1. Install Node.js 18 or newer from https://nodejs.org.
2. Start Rocket 2.0:

```sh
npm start
```

3. Open http://localhost:3000/rocketgpt.html.

Rocket 2.0 is an LLM-powered chat experience. It sends requests to Pollinations' free third-party text model directly from the browser; no account or API key is required. The model is not trained or hosted by RocketGPT. The free service is best-effort and rate-limited to one response per public IP every 30 seconds. Do not send sensitive information. Web search is not available in this mode.

The public homepage contains search-friendly information about Rocket 2.0, with an XML sitemap at `https://rocketgpt.net/sitemap.xml`. To request Google indexing, verify `rocketgpt.net` in Google Search Console and submit that sitemap. Google decides whether and when to index or rank pages; no code change can guarantee viral reach or instant results.

The homepage and chat page include native sharing with a clipboard fallback, and use a 1200×630 branded social preview image when shared. Share links include UTM tags for basic referral attribution.

The RocketGPT blog is at `blog.html`; dated product updates and daily editorial notes live in `blog/posts.json`. GitHub Actions runs `scripts/publish_daily_blog.py` daily, adds one editorial note from its curated rotation, and deploys the updated static site. Daily notes are not claims of new product releases.

The showcase-only merchandise preview is at `store.html`. It displays concept art for a RocketGPT hat, shirt, and hoodie; it does not take orders or payments.

Enable **Viral mode** from the welcome callout or composer to ask the model for more shareable, platform-aware content with stronger hooks and concise wording. The feature changes the model instructions; it cannot guarantee that content will go viral.

`nall-e.html` is RocketGPT's NALL-E text-to-image experience. It sends prompts directly from the browser to Pollinations' public image service and displays a downloadable result; no OpenAI key, Render image endpoint, or owner account is required. The provider controls availability and may rate-limit or reject requests. Prompts are sent to Pollinations, so users should not enter sensitive information. NALL-E uses a third-party image service rather than a model trained from scratch by RocketGPT.

Recent chats are saved in the current browser only. They are not uploaded or synced between devices.

Chat requests time out after 90 seconds. When a request fails, Rocket keeps the unsent message in the composer and offers a retry action; failed turns are not included in later AI context. The AI provider still controls response quality and availability.

## Answer feedback

Use the helpful/not helpful buttons below an answer to submit a rating. The feedback endpoint stores only the rating and server submission time in JSON Lines format; it does not link the rating to the chat or store the prompt or reply. By default, the file is written to the operating system's temporary directory as `rocketgpt-feedback.jsonl`; set `FEEDBACK_FILE` to change the path. Temporary storage can be lost when the service restarts or redeploys. These unlinked ratings can show aggregate sentiment, but they do not train the hosted model or provide examples for RLHF.

## Publish AI chat

GitHub Pages hosts the frontend. Rocket 2.0 is an LLM-powered chat product; its requests go directly from each visitor's browser to Pollinations' free third-party text API, so chat does not depend on the Render service or a server-side API key. The underlying language model is not trained or hosted by RocketGPT. Answer feedback still uses the optional Render API.
