# Rocket 2.0

## Run locally

1. Install Node.js 18 or newer from https://nodejs.org.
2. Create a Gemini API key at https://aistudio.google.com/apikey.
3. Set `GEMINI_API_KEY` in your shell, then start RocketGPT:

```sh
npm start
```

4. Open http://localhost:3000/rocketgpt.html.

The API key stays on the server and must never be placed in the frontend. The example settings in `.env.example` are a reference; the app does not load `.env` files automatically.

## Publish AI chat

GitHub Pages hosts the frontend only. Render runs the API using `render.yaml`; add `GEMINI_API_KEY` as a private Render environment variable and deploy the service. The frontend's `api-base-url` must match the Render service URL. The blueprint uses Gemini 4 Argon with high reasoning, Google Search grounding, and code execution, and tries Gemini 3.8 Flash, 3.6 Flash, then 3.5 Flash-Lite during temporary model overload. Search grounding may incur Google API charges; local `.env.example` settings leave search disabled by default.
