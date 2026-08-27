# RocketGPT

## Run locally

1. Install Node.js 18 or newer from https://nodejs.org.
2. Install Ollama from https://ollama.com/download.
3. Open PowerShell in this folder and download the free local model:

```powershell
ollama pull llama3.2
```

4. Start RocketGPT:

```powershell
npm start
```

5. Open http://localhost:3000/rocketgpt.html.

RocketGPT uses Ollama locally, so no API key, payment method, or cloud account is required. To use a different installed model, set `OLLAMA_MODEL` before starting the server.

## Publish AI chat

GitHub Pages hosts the frontend only. To make AI chat available publicly, deploy `server.js` to Render using `render.yaml`, add a Gemini API key as a private Render environment variable, then set the `api-base-url` meta tag in `rocketgpt.html` to the Render service URL before publishing the frontend update.
