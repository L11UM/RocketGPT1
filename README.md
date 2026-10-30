# Rocket 2.0

## Run locally

1. Install Node.js 18 or newer from https://nodejs.org.
2. Create an OpenAI API key at https://platform.openai.com/api-keys.
3. Set `OPENAI_API_KEY` in your shell, then start RocketGPT:

```sh
npm start
```

4. Open http://localhost:3000/rocketgpt.html.

To use Rocket without access to the hosted backend, click **OPENAI** in the top-right corner and enter your OpenAI API key. This sends requests directly from your browser to OpenAI using `gpt-4o-mini`; the key is held in memory only until you refresh or close the tab, and is not saved or sent to Rocket's server. Keep the key private, and note that API and optional web-search usage may be billed to your OpenAI account. Responses API storage is disabled (`store: false`). To search the web, select **Search the web** below the composer; returned sources appear below Rocket's answer.

Enable **Viral mode** from the welcome callout or composer to ask the model for more shareable, platform-aware content with stronger hooks and concise wording. The feature changes the model instructions; it cannot guarantee that content will go viral.

Recent chats are saved in the current browser only. They are not uploaded or synced between devices.

## Answer feedback

Use the helpful/not helpful buttons below an answer to submit a rating. The feedback endpoint stores only the rating and server submission time in JSON Lines format; it does not link the rating to the chat or store the prompt or reply. By default, the file is written to the operating system's temporary directory as `rocketgpt-feedback.jsonl`; set `FEEDBACK_FILE` to change the path. Temporary storage can be lost when the service restarts or redeploys. These unlinked ratings can show aggregate sentiment, but they do not train the hosted model or provide examples for RLHF.

## Publish AI chat

GitHub Pages hosts the frontend only. The optional hosted API uses `render.yaml` and needs `OPENAI_API_KEY` configured as a private Render environment variable. Alternatively, users can enter their own OpenAI key in the app for direct browser-to-OpenAI requests without access to Render.
