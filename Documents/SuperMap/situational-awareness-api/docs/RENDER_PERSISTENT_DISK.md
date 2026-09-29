# Render Free tier — instant feeds without paid disk

**Hard constraint for Good Palantir:** Render **Free** only. No paid disk, no `DATA_DIR`, no Starter plan required. Instant paint for Glowie / OSINT Feeds / Videos / threat / home must work on an ephemeral filesystem + cold starts.

OSINT X already has a working free-tier path — leave it alone unless boot contention requires staggering other jobs away from it.

## Why things used to go blank for 1–3 minutes

Render Free wipes the local filesystem on every **deploy / sleep wake / restart**. That removes:

- `data/api-cache/*.json` (home / news / stocks / gas / osint last-good)
- `osint.db` (OSINT X + publisher events)
- `mediastack-cache.json`
- `last-threat-summary.json`

Without workarounds, boot logged `hadLastGood= false` and users stared at empty desks while RSS + FxTwitter caught up.

## Free-tier path (first-class — do this)

### 1. Keepalive: hit `/api/home`, not only `/health`

Sleep kills the process and all in-memory last-good. Wake the API every ~10 minutes with **both**:

1. `GET /health` (process alive)
2. `GET /api/home` (loads piece caches into memory)

This repo ships [`.github/workflows/api-keepalive.yml`](../../../.github/workflows/api-keepalive.yml) on a `*/10 * * * *` cron. Confirm Actions are enabled for the repo; no Render Dashboard buy-up needed.

Manual check:

```bash
curl -fsS https://supermap-api.onrender.com/health
curl -fsS https://supermap-api.onrender.com/api/home -o /tmp/home.json
```

### 2. What the API does on Free (no disk)

| Workaround | Effect |
| --- | --- |
| Aggressive **in-memory** last-good | Survives for process lifetime; `/api/news`, `/api/osint`, `/api/feeds/videos`, `/api/threat-summary`, `/api/home` serve it instantly |
| **MediaStack cold-seed** | One pull when news cache is empty after ephemeral wipe (outside 08:00/15:00 if needed); RSS still rebuilds in background |
| Prefer MediaStack when RSS empty | `getNewsCached()` synthesizes Glowie from MediaStack last-pull |
| Never overwrite richer last-good with thin live | OSINT / news persist skips shrinking mid-catch-up |
| Staggered boot catch-up | MediaStack → news RSS → (later) OSINT publishers → videos; OSINT X keeps its own early lane |
| Instant GETs | Empty news/videos/threat never block 12s+ on live rebuild; background fill + `refreshing` / `_warming` meta |

### 3. What the frontend does

| Workaround | Effect |
| --- | --- |
| Home snapshot (`localStorage`) | Seeds Glowie + threat on cold open before `/api/home` returns |
| Desk snapshots | OSINT Feeds + Recent Videos paint from local last-good; never blank while revalidating |
| Prefer richer | Thin live mid-catch-up does not replace a fatter local desk |
| Soft loading | “Loading…” only when there is nothing to paint |

### 4. Env on Free (minimal)

| Setting | Required? | Notes |
| --- | --- | --- |
| `MEDIASTACK_API_KEY` | Recommended | Seeds Glowie after wipe; still rate-limited to scheduled windows + one cold-seed |
| Keepalive workflow | **Yes for good UX** | `/health` then `/api/home` every 10 min |
| `DATA_DIR` / persistent disk | **No** | Not used on the free-tier path |

## Optional durable disk (not required)

If you already run a paid instance with a disk, you may set `DATA_DIR=/var/data` so SQLite + JSON survive deploys. That is **optional** and **not** the primary fix for Good Palantir Free. Free web services cannot attach disks — use the workarounds above instead.

## Unaffected

`WINDY_API` (radar + optional webcams) is unchanged. OSINT X ingest / Retry / content filter stay on their existing free-tier path.

## Local / without `DATA_DIR`

Defaults to `situational-awareness-api/data/` (and `osint.db` next to `database.js`), same as before. Memory + MediaStack/RSS catch-up still apply.
