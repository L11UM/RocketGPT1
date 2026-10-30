# Rocket 2.0

## Run locally

1. Install Node.js 18 or newer from https://nodejs.org.
2. Start Rocket 2.0:

```sh
npm start
```

3. Open http://localhost:3000/rocketgpt.html.

Rocket chat uses the free anonymous GPT-OSS model from Pollinations, directly from the browser; no account or API key is required. The free service is best-effort and rate-limited to one response per public IP every 30 seconds. Do not send sensitive information. Web search is not available in this mode.

The public homepage contains search-friendly information about Rocket 2.0, with an XML sitemap at `https://rocketgpt.net/sitemap.xml`. To request Google indexing, verify `rocketgpt.net` in Google Search Console and submit that sitemap. Google decides whether and when to index or rank pages; no code change can guarantee viral reach or instant results.

The homepage and chat page include native sharing with a clipboard fallback, and use a 1200×630 branded social preview image when shared. Share links include UTM tags for basic referral attribution.

Enable **Viral mode** from the welcome callout or composer to ask the model for more shareable, platform-aware content with stronger hooks and concise wording. The feature changes the model instructions; it cannot guarantee that content will go viral.

Recent chats are saved in the current browser only. They are not uploaded or synced between devices.

## Answer feedback

Use the helpful/not helpful buttons below an answer to submit a rating. The feedback endpoint stores only the rating and server submission time in JSON Lines format; it does not link the rating to the chat or store the prompt or reply. By default, the file is written to the operating system's temporary directory as `rocketgpt-feedback.jsonl`; set `FEEDBACK_FILE` to change the path. Temporary storage can be lost when the service restarts or redeploys. These unlinked ratings can show aggregate sentiment, but they do not train the hosted model or provide examples for RLHF.

## Publish AI chat

GitHub Pages hosts the frontend. Chat requests go directly from each visitor's browser to Pollinations' free text API, so chat does not depend on the Render service or a server-side API key. Answer feedback still uses the optional Render API.
