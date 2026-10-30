# Rocket 2.0

## Run locally

1. Install Node.js 18 or newer from https://nodejs.org.
2. Create an OpenAI API key at https://platform.openai.com/api-keys.
3. Set `OPENAI_API_KEY` in your shell, then start RocketGPT:

```sh
npm start
```

4. Open http://localhost:3000/rocketgpt.html.

The API key stays on the server and must never be placed in the frontend. The example settings in `.env.example` are a reference; the app does not load `.env` files automatically. Rocket uses OpenAI's Responses API and defaults to `gpt-6-luna`; the model must be available to your OpenAI API account. API and web-search usage may incur charges. Responses API storage is disabled (`store: false`). To search the web for a message, select **Search the web** below the composer; returned sources appear below Rocket's answer. Without an API key, Rocket uses a limited local fallback that cannot answer general questions or search the web.

Recent chats are saved in the current browser only. They are not uploaded or synced between devices.

## Answer feedback

Use the helpful/not helpful buttons below an answer to submit a rating. The feedback endpoint stores only the rating and server submission time in JSON Lines format; it does not link the rating to the chat or store the prompt or reply. By default, the file is written to the operating system's temporary directory as `rocketgpt-feedback.jsonl`; set `FEEDBACK_FILE` to change the path. Temporary storage can be lost when the service restarts or redeploys. These unlinked ratings can show aggregate sentiment, but they do not train the hosted model or provide examples for RLHF.

## Publish AI chat

GitHub Pages hosts the frontend only. Render runs the API using `render.yaml`; add `OPENAI_API_KEY` as a private Render environment variable and deploy the service. The frontend's `api-base-url` must match the Render service URL. You can change the model with `OPENAI_MODEL`.
