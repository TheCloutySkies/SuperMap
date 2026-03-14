# Threat Summary Setup (Ollama + Render)

The **Today's Threat Summary** feature can use either **Ollama** (local / self‑hosted) or **Groq** (hosted API, works on Render).

---

## Option A: Ollama (local development or your own server)

### 1. Install Ollama

- **macOS / Windows / Linux**: Download from [https://ollama.com](https://ollama.com) and install.
- **macOS (Homebrew)**:
  ```bash
  brew install ollama
  ```
- Then start the service (often auto-starts after install):
  ```bash
  ollama serve   # or start the Ollama app from the menu
  ```

### 2. Pull TinyLlama

```bash
ollama pull tinyllama:1.1b
```

### 3. Point the API at Ollama

In `.env` (or environment):

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_THREAT_MODEL=tinyllama:1.1b
```

If Ollama runs on another machine (e.g. a VPS), set:

```env
OLLAMA_BASE_URL=http://your-server-ip:11434
```

Your Node API will call `GET/POST` to that URL for `/api/threat-summary`. No API key needed for Ollama.

### 4. Run the API

Start the situational-awareness-api as usual. The first request to `GET /api/threat-summary` will use Ollama. If Ollama is unreachable, the API returns a **title-only fallback** summary (no AI).

---

## Option B: Groq (for Render and other hosted backends)

**Render** (and similar platforms) don’t run Ollama next to your app. Use **Groq’s free API** so the same threat-summary logic runs in the cloud with no extra server.

### 1. Get a Groq API key

1. Go to [https://console.groq.com](https://console.groq.com).
2. Sign up (free tier, no card required).
3. Create an API key (e.g. **API Keys** → **Create API Key**).

### 2. Set the key on Render

In your **Render** dashboard for the **situational-awareness-api** service:

1. Open the service → **Environment**.
2. Add:
   - **Key**: `GROQ_API_KEY`
   - **Value**: your Groq API key

Do **not** set `OLLAMA_BASE_URL` (or leave it blank). The code uses Groq when `GROQ_API_KEY` is set.

### 3. Optional Groq settings

You can override the model (default is a small, fast Llama):

```env
GROQ_THREAT_MODEL=llama-3.1-8b-instant
```

The API will call Groq’s OpenAI-compatible endpoint and parse the response the same way as Ollama. Caching (60 minutes) and fallback (title-only) behavior are unchanged.

### 4. Safe rate limits (Groq Console)

In **Groq Console → Organization Limits** (or **Configure Model Limits** for a project), set **custom limits** for `llama-3.1-8b-instant` so you never hit your org cap. The app is designed to stay under these values:

| Field | Recommended value | Why |
|-------|-------------------|-----|
| **Requests per Minute** | `2` | App calls at most once per 55 minutes (and result is cached 60 min). |
| **Requests per Day** | `30` | App caps at 28 Groq calls per 24h; 30 leaves a small buffer. |
| **Tokens per Minute** | `6000` | One summary request fits well under this. |
| **Tokens per Day** | `200000` | ~24 requests × ~6K tokens ≈ 144K; 200K is a safe ceiling. |

The API enforces its own safeguards so it **never exceeds** these: it will not call Groq more than **28 times in 24 hours** or more than **once in 55 minutes**, and will return a title-only summary instead. You can tighten the app further with env vars:

- `GROQ_THREAT_MAX_CALLS_PER_24H=20` — lower daily cap (default 28).
- `GROQ_THREAT_MIN_INTERVAL_MS=3600000` — minimum 1 hour between Groq calls (default 55 min, in ms).

---

## Summary

| Where you run the API | What to use | What to set |
|------------------------|-------------|-------------|
| **Local**              | Ollama      | Install Ollama, `ollama pull tinyllama:1.1b`, optional `OLLAMA_BASE_URL` (default localhost) |
| **Your own VPS**       | Ollama      | Run Ollama on the VPS, set `OLLAMA_BASE_URL=http://localhost:11434` (or internal host) |
| **Render**             | Groq        | Set `GROQ_API_KEY` in Render env; leave Ollama vars unset |

If neither Ollama nor Groq is configured (or both fail), the API still responds: it returns a **title-only** threat summary and sets `fallback: true`.
