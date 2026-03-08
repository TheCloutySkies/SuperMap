# SuperMap

Situational awareness map with OSINT feeds, news, and advanced search.

## Easiest way to start (no terminal needed)

1. **First time only:** open Terminal, go to this folder, and run:
   ```bash
   npm run install:all
   ```
2. **Every time you want to use SuperMap:** double-click **Start-SuperMap.command** (in this folder). A window will open; when it says the app is running, open **http://localhost:5173** in your browser.

If double-click says the file can’t be run, open Terminal, go to this folder (`cd` to the SuperMap project folder), and run: `chmod +x Start-SuperMap.command` once. Then double-click again.

That’s it. The app and the API (search, feeds, maps) all run together.

## Or use the terminal

From the **project root** (the folder that contains `SuperMap` and `situational-awareness-api`):

```bash
# First time only
npm run install:all

# Start app + API
npm run dev
```

Then open **http://localhost:5173**. The API runs on port 3001 in the same process.

## What runs

| Command | What it does |
|--------|----------------|
| `npm run install:all` | Installs dependencies in root, frontend, and API (run once) |
| `npm run dev` | Starts **both** the web app and the API in one terminal (use this so search/feeds work) |
| `npm run dev:frontend` | Starts only the web app (omnibar search and feeds will show no results) |
| `npm run api` | Starts only the API (port 3001) |

## Start the API at login (optional)

If you want the API to run in the background as soon as you log in (so you only start the app when you need it):

```bash
chmod +x scripts/install-api-on-login.sh
./scripts/install-api-on-login.sh
```

After that, the API starts automatically at login. You can then run just the app with `npm run dev:frontend` or double-click **Start-SuperMap.command** (the script starts both app and API; the API will already be running).

## Project layout

- **SuperMap/** – React + Vite frontend
- **situational-awareness-api/** – Node backend (OSINT, news, search, etc.)

API port is **3001** (configurable via `situational-awareness-api/.env`). The frontend uses `SuperMap/.env` with `VITE_API_URL=http://localhost:3001`.

### Optional API keys (in `situational-awareness-api/.env`)

- **RAPIDAPI_KEY** – Yahoo Finance (v2 tickers, 6h cache to keep within ~100 req/month), Flock, Meteostat, etc.
- **RAPIDAPI_GOOGLE_SEARCH_KEY** – Advanced Search (unlimited-google-search1). If unset, `RAPIDAPI_KEY` is used.
