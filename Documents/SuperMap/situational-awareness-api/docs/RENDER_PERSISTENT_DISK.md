# Render persistent disk for last-good caches

## Why the home screen is empty for 1–3 minutes after deploy

Render’s default disk is **ephemeral**. On every deploy or restart the API loses:

- `data/api-cache/*.json` (home / news / stocks / gas / osint last-good)
- `osint.db` (OSINT X posts + publisher events)
- `mediastack-cache.json` (Glowie MediaStack last pull)
- `last-threat-summary.json`

Boot then logs `hadLastGood= false`, runs cold catch-up, and `/api/home` can show `news=0` / `osintX=0` until RSS + FxTwitter finish (often 1–3 minutes under load).

## Fix (recommended): persistent disk + `DATA_DIR`

Persistent disks require a **paid** Render plan (**Starter** or higher). Free web services cannot attach disks.

### Dashboard steps

1. Open the **situational-awareness-api** web service in the Render dashboard.
2. Confirm the instance plan is **Starter** or above (not Free).
3. **Disks** → **Add disk** (or Settings → Disk):
   - **Mount path:** `/var/data`
   - **Size:** 1 GB is enough for SQLite + JSON caches
4. **Environment** → add:
   - `DATA_DIR` = `/var/data`
5. Save and **redeploy**.

After boot you should see:

```text
[dataPaths] root= /var/data durable= true (DATA_DIR set — survives Render deploys)
[boot] … hadLastGood= true
```

Subsequent deploys reuse the same disk: home/news/osint-x/threat last-good seed into memory immediately.

### What lives under `DATA_DIR`

| Path | Purpose |
| --- | --- |
| `$DATA_DIR/api-cache/` | Home, news, stocks, gas, space, osint last-good JSON |
| `$DATA_DIR/osint.db` | SQLite (OSINT X + publisher events) |
| `$DATA_DIR/mediastack-cache.json` | MediaStack Glowie last pull |
| `$DATA_DIR/last-threat-summary.json` | Threat summary last-good |
| `$DATA_DIR/keyword-tags.json` | Keyword tag cache |
| `$DATA_DIR/user-config.json` | User X handles / subreddits (migrated from `config/`) |

Static packs (`data/crime`, `data/sex-offenders`) stay in the repo and are **not** moved.

### Blueprint snippet (optional)

```yaml
services:
  - type: web
    name: situational-awareness-api
    plan: starter
    envVars:
      - key: DATA_DIR
        value: /var/data
    disk:
      name: supermap-data
      mountPath: /var/data
      sizeGB: 1
```

## Free tier (no disk)

Without a disk, caches still wipe on every deploy. This codebase softens the blank window by:

1. Warming `/api/home` within ~2.5s from piece caches / live stocks-gas
2. Preferring **MediaStack last-pull** for news when RSS last-good is gone
3. Starting OSINT X sooner when SQLite is empty (~10s), with a **3-minute** ingest cadence until the first posts land, then settling to 5 minutes. Full-list ingest **yields the event loop** between handle chunks so `/health` and feed GETs stay responsive (Render free-tier death spiral: blocked event loop → failed health → restart → empty DB again).
4. **`GET /api/osint-x?refresh=1`** awaits a budgeted FxTwitter pull (~18s, 12 handles, heuristics only — no LLM), writes SQLite, then re-reads — Retry no longer returns `[]` while ingest is still running. Full-list is only kicked if the budgeted slice left the feed thin.
5. Expanding the OSINT X window to 14 days / relaxing the content filter / serving process memory last-good when the 48h curated slice is empty
6. Cold `/api/news` awaits up to ~12s for RSS/MediaStack rebuild instead of returning an empty FeatureCollection immediately
7. Not aborting the news batch when Google News / individual feeds 406 or time out
8. Frontend OSINT X seeds from `/api/home.osintX` while the dedicated endpoint catches up

Expect a short warm-up until RSS + X refill; **attach a disk + set `DATA_DIR=/var/data`** for durable last-good across deploys.

### Must set on Render (after merge)

| Env / setting | Required? | Value |
| --- | --- | --- |
| Plan | For durable disk | **Starter+** (Free cannot attach disks) |
| Disk mount | Recommended | `/var/data` (1 GB) |
| `DATA_DIR` | Recommended | `/var/data` |
| Keepalive | Recommended | Hit `/api/home` (not only `/health`) so last-good stays warm |

If `DATA_DIR` is unset, feeds still refill within the process life via continuous ingest + Retry budget — but every redeploy starts empty again.

## Unaffected

`WINDY_API` (radar + optional webcams) is unchanged — still read from env only; no disk dependency.

## Local / without `DATA_DIR`

Defaults to `situational-awareness-api/data/` (and `osint.db` next to `database.js`), same as before.
