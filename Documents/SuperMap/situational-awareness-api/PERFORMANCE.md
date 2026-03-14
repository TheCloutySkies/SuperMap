# Situational Awareness API — Performance & Startup

## Implemented

- **Threat summary**: `/api/threat-summary` lazy-loads the `threatSummary` service (and thus the database module) only on first request. No impact on startup.
- **Threat summary cache**: Result cached 60 minutes in memory; no repeated Ollama calls within the window.
- **Deferred initial ingest**: First news ingest runs in `setImmediate()` after `listen()`, so the server responds to `/health` and `/` immediately without waiting for RSS.

## Recommended improvements

### Startup

1. **Lazy-load heavy route handlers**  
   For routes that use `require()` only when first hit (e.g. threat-summary), consider the same pattern for other optional features (search/advanced, stream/proxy, etc.) so they don’t slow boot.

2. **Avoid synchronous work in top-level require**  
   Keep `database.js` and other core modules to schema/connection only; avoid running heavy queries or file I/O at load time.

3. **OSINT warmup delay**  
   `runOsintWarmup` is already delayed (5s). You can increase to 10–15s if you want the process to be ready for health checks even sooner.

### Caching

4. **RSS/news**  
   `newsService.getNewsCached()` already reduces repeated fetches. Ensure TTLs match your freshness needs.

5. **Connection pooling**  
   Supabase client is created once; no connection pool needed for it. If you add a direct Postgres pool later, use a small pool (e.g. 5–10) and reuse it.

### Tag indexes

6. **SQLite**  
   `idx_events_timestamp`, `idx_events_type`, `idx_event_tags_tag` already exist. For threat-summary, `getEventsWithAnyTagInTimeRange` benefits from these. No extra indexes required for the current query pattern.

### Heavy dependencies

7. **Identify slow requires**  
   If startup is still slow, profile with `NODE_OPTIONS='--require perf_hooks'` or a simple `Date.now()` around top-level `require()` in `server.js` and `routes/api.js`. Likely candidates: `@turf/turf`, `better-sqlite3` (first access), `rss-parser`, and any module that does network or disk on load.

8. **Optional features**  
   Consider loading camera-discovery, finance, or stream-proxy only when their env vars are set, to avoid pulling in large deps for every deployment.
