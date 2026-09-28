/**
 * HomeScreen bootstrap: assemble cache-first payloads for GET /api/home
 * and warm those caches after server listen.
 *
 * Cold-open contract:
 * 1) Serve disk / piece last-good immediately (sync) — never wait on live ingest.
 * 2) Rebuild / catch-up in the background; never overwrite last-good with empty.
 */
const axios = require('axios')
const fs = require('fs')
const osintXFeedService = require('./osintXFeedService')
const newsService = require('./news')
const apiResultCache = require('./apiResultCache')
const dataPaths = require('./dataPaths')

const HOME_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=600'
/** Hard ceiling for cold /api/home when no last-good exists (ms). */
const HOME_LIVE_DEADLINE_MS = 8000

/** In-memory homeImages cache so gallery stays non-empty and refreshes on a TTL. */
const HOME_IMAGES_TTL_MS = 90 * 1000
let homeImagesCache = { at: 0, items: [], source: null }

function threatSummaryFile() {
  return dataPaths.threatSummaryPath()
}

function apiBaseUrl() {
  const port = process.env.PORT || 3001
  return `http://127.0.0.1:${port}`
}

async function fetchLocal(pathName, timeoutMs = 45000) {
  const { data } = await axios.get(`${apiBaseUrl()}${pathName}`, {
    timeout: timeoutMs,
    validateStatus: (s) => s >= 200 && s < 500,
  })
  return data
}

function isRealPhotoUrl(url) {
  const u = String(url || '')
  if (!/^https?:\/\//i.test(u)) return false
  // Skip tiny favicons / google s2 icons used as news thumbnails
  if (/\/favicon|gstatic\.com\/favicon|google\.com\/s2\/favicons/i.test(u)) return false
  return true
}

function invalidateHomeImagesCache() {
  homeImagesCache = { at: 0, items: [], source: null }
}

function readThreatSummaryDisk() {
  try {
    const file = threatSummaryFile()
    const legacy = require('path').join(__dirname, '..', 'data', 'last-threat-summary.json')
    if (!fs.existsSync(file) && fs.existsSync(legacy) && dataPaths.isDurable()) {
      try { fs.copyFileSync(legacy, file) } catch (_) { /* optional */ }
    }
    if (!fs.existsSync(file)) return null
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (data && typeof data.summary === 'string' && data.summary.trim()) return data
  } catch (_) { /* optional */ }
  return null
}

function readOsintXFromDb(limit = 80) {
  try {
    const { getEvents, getEventTagNames } = require('../database')
    const { PRIORITY_ORDER } = require('./osintXFeedService')
    const cutoff = Date.now() - 48 * 60 * 60 * 1000
    const rows = getEvents(Math.min(limit * 3, 400), null, null, null, null, ['x'])
    const mapped = rows
      .filter((r) => r.timestamp && r.timestamp >= cutoff)
      .map((r) => {
        let raw = {}
        try {
          raw = r.raw_data ? JSON.parse(r.raw_data) : {}
        } catch (_) { /* ignore */ }
        const tags = typeof getEventTagNames === 'function' ? getEventTagNames(r.id) : []
        return {
          id: r.id,
          source: 'x',
          account: raw.account || 'x',
          displayName: raw.displayName || raw.account || 'x',
          avatarUrl: raw.avatarUrl || null,
          verified: !!raw.verified,
          title: r.title,
          content: r.description,
          timestamp: r.timestamp,
          tags,
          risk_score: raw.risk_score != null ? Number(raw.risk_score) : null,
          priority: raw.priority || 'medium',
          url: raw.link || raw.url,
          images: Array.isArray(raw.images) ? raw.images : [],
          videos: Array.isArray(raw.videos) ? raw.videos : [],
          provider: raw.provider || 'fxtwitter',
        }
      })
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 2
        const pb = PRIORITY_ORDER[b.priority] ?? 2
        if (pa !== pb) return pa - pb
        return (b.timestamp || 0) - (a.timestamp || 0)
      })
    try {
      const { filterOsintXPosts, getDefaultOpts } = require('./osintXContentFilter')
      const opts = getDefaultOpts()
      return filterOsintXPosts(mapped, opts).posts.slice(0, limit)
    } catch (_) {
      return mapped.slice(0, limit)
    }
  } catch (_) {
    return []
  }
}

/**
 * Sync assemble from disk/memory last-good only.
 * Never hits live RSS, EIA, Yahoo, FxTwitter, or AI threat generation.
 */
function assembleHomeFromCaches() {
  const news = newsService.getNewsCached() || { type: 'FeatureCollection', features: [] }
  const threatSummary = readThreatSummaryDisk()
  const osintX = readOsintXFromDb(80)

  let homeImages = []
  try {
    if (homeImagesCache.items.length) {
      homeImages = homeImagesCache.items.slice(0, 24)
    } else {
      homeImages = osintXFeedService.collectDbOsintImages({ max: 24 }) || []
      if (homeImages.length) {
        homeImagesCache = { at: Date.now(), items: homeImages, source: 'db' }
      }
    }
  } catch (_) { /* optional */ }

  const stocksHit = apiResultCache.getNewestStale('stocks', apiResultCache.TTL.DAILY)
  const gasHit =
    apiResultCache.getStale('gas-prices', 'gas-prices', apiResultCache.TTL.WEEKLY)
    || apiResultCache.getNewestStale('gas-prices', apiResultCache.TTL.WEEKLY)
  const spaceHit = apiResultCache.getStale('space', 'space', 2 * apiResultCache.TTL.DAILY)

  return {
    threatSummary,
    defcon: null,
    osintX,
    gasStates: Array.isArray(gasHit?.value?.states) ? gasHit.value.states : [],
    gasPrices: gasHit?.value || null,
    news,
    stocks: stocksHit?.value || null,
    earthquakes: null,
    space: spaceHit?.value || null,
    homeImages,
    updatedAt: new Date().toISOString(),
    _fromPieces: true,
  }
}

/**
 * Homepage gallery images:
 * 1) Recent DB OSINT-X images (from continuous ingest) — fast, always available
 * 2) Live FxTwitter top-up (rotating handles) — keeps gallery fresh
 * 3) Reddit video frames fallback
 *
 * Cached ~90s unless force=true.
 * cacheOnly=true skips live FxTwitter / Reddit (cold-open path).
 */
async function buildHomeImages({ max = 24, force = false, cacheOnly = false } = {}) {
  const now = Date.now()
  if (
    !force &&
    homeImagesCache.items.length > 0 &&
    now - homeImagesCache.at < HOME_IMAGES_TTL_MS
  ) {
    return homeImagesCache.items.slice(0, max)
  }

  const items = []
  const seen = new Set()
  const push = (row) => {
    if (!row?.src || seen.has(row.src) || !isRealPhotoUrl(row.src)) return
    seen.add(row.src)
    items.push(row)
  }

  // 1) DB-backed images from continuous ingest
  try {
    const fromDb = osintXFeedService.collectDbOsintImages({ max })
    for (const img of fromDb) push(img)
  } catch (err) {
    console.warn('[home] DB images:', err.message)
  }

  if (cacheOnly) {
    if (items.length) {
      homeImagesCache = {
        at: Date.now(),
        items: items.slice(0, max),
        source: items[0]?.provider || 'db',
      }
    }
    return items.slice(0, max)
  }

  // 2) Live FxTwitter top-up (skip if already full unless force)
  if (items.length < max || force) {
    try {
      const need = Math.max(max - items.length, force ? Math.min(8, max) : 0)
      const maxHandles = force ? 10 : 6
      const xImages = await osintXFeedService.fetchHomeOsintImages({
        maxHandles,
        maxImages: Math.max(need, force ? max : need),
      })
      // On force, prefer live images first by rebuilding order: live then prior DB
      if (force && xImages.length) {
        const liveFirst = []
        const liveSeen = new Set()
        for (const img of xImages) {
          if (!img?.src || liveSeen.has(img.src) || !isRealPhotoUrl(img.src)) continue
          liveSeen.add(img.src)
          liveFirst.push({
            src: img.src,
            postUrl: img.postUrl,
            caption: img.caption,
            account: img.account,
            source: 'x',
            provider: img.provider || 'fxtwitter',
          })
          if (liveFirst.length >= max) break
        }
        for (const prev of items) {
          if (liveFirst.length >= max) break
          if (liveSeen.has(prev.src)) continue
          liveSeen.add(prev.src)
          liveFirst.push(prev)
        }
        items.length = 0
        seen.clear()
        for (const row of liveFirst) {
          seen.add(row.src)
          items.push(row)
        }
      } else {
        for (const img of xImages) {
          push({
            src: img.src,
            postUrl: img.postUrl,
            caption: img.caption,
            account: img.account,
            source: 'x',
            provider: img.provider || 'fxtwitter',
          })
          if (items.length >= max) break
        }
      }
    } catch (err) {
      console.warn('[home] FxTwitter images:', err.message)
    }
  }

  // 3) Reddit fallback if still short
  if (items.length < Math.min(8, max)) {
    try {
      const reddit = typeof newsService.getRedditVideoItems === 'function'
        ? await newsService.getRedditVideoItems()
        : []
      for (const r of reddit) {
        if (!r?.thumbnail) continue
        push({
          src: r.thumbnail,
          postUrl: r.link || r.thumbnail,
          caption: r.title || '',
          account: null,
          source: 'reddit',
          provider: r.source || 'reddit',
        })
        if (items.length >= max) break
      }
    } catch (err) {
      console.warn('[home] Reddit image fallback:', err.message)
    }
  }

  if (items.length) {
    homeImagesCache = {
      at: Date.now(),
      items: items.slice(0, max),
      source: items[0]?.provider || 'mixed',
    }
  }
  return items.slice(0, max)
}

/** Background refresh used after scheduled X ingest. */
async function refreshHomeImagesBackground() {
  try {
    invalidateHomeImagesCache()
    const images = await buildHomeImages({ max: 24, force: true })
    console.log('[home] images refreshed:', images.length)
    return images
  } catch (err) {
    console.warn('[home] images refresh:', err.message)
    return []
  }
}

/**
 * Build the homescreen payload by hitting existing cache-first routes in parallel.
 * When caches are warm this is sub-second; on first boot it fills upstream caches.
 * @param {{ fast?: boolean }} opts fast=true uses short timeouts + cache-only images
 */
async function getHomePayload(opts = {}) {
  const fast = !!opts.fast
  // Fast path: never block cold open on AI / live ingest / EIA.
  const tThreat = fast ? 2500 : 12000
  const tDefcon = fast ? 2500 : 8000
  const tOsintX = fast ? 2500 : 8000
  const tGasStates = fast ? 2000 : 5000
  const tGas = fast ? 3000 : 12000
  const tNews = fast ? 2500 : 12000
  const tStocks = fast ? 3000 : 12000
  const tQuakes = fast ? 2500 : 8000
  const tSpace = fast ? 3000 : 12000

  const results = await Promise.allSettled([
    fetchLocal('/api/threat-summary', tThreat),
    fetchLocal('/api/defcon', tDefcon),
    fetchLocal('/api/osint-x?limit=80', tOsintX),
    fetchLocal('/api/gas-prices/states', tGasStates),
    fetchLocal('/api/gas-prices', tGas),
    fetchLocal('/api/news', tNews),
    fetchLocal('/api/stocks', tStocks),
    fetchLocal('/api/earthquakes/widget', tQuakes),
    fetchLocal('/api/space', tSpace),
    buildHomeImages({ max: 24, cacheOnly: fast }),
  ])

  const val = (i, fallback = null) =>
    results[i].status === 'fulfilled' ? results[i].value : fallback

  const news = val(5, { type: 'FeatureCollection', features: [] })
  const homeImages = Array.isArray(val(9)) ? val(9) : []

  // Merge piece last-good under any null/empty slots so a slow upstream cannot blank UI.
  const pieces = assembleHomeFromCaches()
  const mergeArr = (live, cached) =>
    (Array.isArray(live) && live.length ? live : null)
    || (Array.isArray(cached) && cached.length ? cached : [])
  const mergeObj = (live, cached, ok) => {
    if (live != null && (!ok || ok(live))) return live
    return cached || live || null
  }

  return {
    threatSummary: mergeObj(val(0), pieces.threatSummary, (t) => !!t?.summary),
    defcon: mergeObj(val(1), pieces.defcon, (d) => d?.level != null || d?.label),
    osintX: mergeArr(val(2), pieces.osintX),
    gasStates: mergeArr(val(3), pieces.gasStates),
    gasPrices: mergeObj(val(4), pieces.gasPrices, (g) => g && !g.gasUnavailable && g.ok !== false),
    news: (news?.features?.length ? news : null) || pieces.news || news,
    stocks: mergeObj(val(6), pieces.stocks, (s) => !!s?.current),
    earthquakes: mergeObj(val(7), pieces.earthquakes, (e) => Array.isArray(e?.events)),
    space: mergeObj(val(8), pieces.space, (s) => !!(s?.eonet || s?.nasaNews || s?.apod)),
    homeImages: homeImages.length ? homeImages : pieces.homeImages,
    updatedAt: new Date().toISOString(),
  }
}

/** Race live assemble against a hard deadline; always fall back to piece caches. */
async function getHomePayloadWithDeadline(deadlineMs = HOME_LIVE_DEADLINE_MS) {
  const pieces = assembleHomeFromCaches()
  let live = null
  try {
    live = await Promise.race([
      getHomePayload({ fast: true }),
      new Promise((resolve) => {
        setTimeout(() => resolve(null), Math.max(1000, deadlineMs))
      }),
    ])
  } catch (e) {
    console.warn('[home] live assemble:', e.message)
  }
  if (live) {
    // Prefer live fields but keep piece last-good where live is empty
    const prefer = (a, b, ok) => (a != null && (!ok || ok(a)) ? a : b)
    return {
      threatSummary: prefer(live.threatSummary, pieces.threatSummary, (t) => !!t?.summary),
      defcon: prefer(live.defcon, pieces.defcon, (d) => d?.level != null || d?.label),
      osintX: (live.osintX?.length ? live.osintX : pieces.osintX) || [],
      gasStates: (live.gasStates?.length ? live.gasStates : pieces.gasStates) || [],
      gasPrices: prefer(live.gasPrices, pieces.gasPrices, (g) => g && !g.gasUnavailable),
      news: (live.news?.features?.length ? live.news : pieces.news) || live.news,
      stocks: prefer(live.stocks, pieces.stocks, (s) => !!s?.current),
      earthquakes: prefer(live.earthquakes, pieces.earthquakes, (e) => Array.isArray(e?.events) && e.events.length),
      space: prefer(live.space, pieces.space, (s) => !!(s?.eonet || s?.nasaNews || s?.apod)),
      homeImages: (live.homeImages?.length ? live.homeImages : pieces.homeImages) || [],
      updatedAt: new Date().toISOString(),
      _deadlineMs: deadlineMs,
    }
  }
  return { ...pieces, _deadlineMs: deadlineMs, _timedOut: true }
}

/** Fire-and-forget warmup of home caches (news ingest should already be running). */
async function warmHomeCaches() {
  try {
    // Prefer disk last-good so first paint is instant even before upstreams finish.
    try {
      const api = require('../routes/api')
      const disk = typeof api.loadHomeLastGood === 'function' ? api.loadHomeLastGood() : null
      if (disk) {
        console.log('[home] Loaded disk last-good before warm rebuild')
      } else {
        const pieces = assembleHomeFromCaches()
        if (typeof api.persistHomeLastGood === 'function') api.persistHomeLastGood(pieces)
        console.log('[home] Seeded from piece caches before warm rebuild')
      }
    } catch (_) { /* optional */ }

    const payload = await getHomePayload({ fast: false })
    const counts = {
      threat: !!payload.threatSummary?.summary,
      defcon: payload.defcon?.level != null,
      osintX: payload.osintX?.length || 0,
      homeImages: payload.homeImages?.length || 0,
      news: payload.news?.features?.length || 0,
      stocks: !!payload.stocks?.current,
      quakes: payload.earthquakes?.events?.length || 0,
      space: !!(payload.space?.eonet || payload.space?.nasaNews),
    }
    console.log('[home] Warm caches ready:', counts)
    try {
      const api = require('../routes/api')
      if (typeof api.persistHomeLastGood === 'function') api.persistHomeLastGood(payload)
    } catch (_) { /* optional */ }
    return payload
  } catch (e) {
    console.warn('[home] Warm caches failed:', e.message)
    return null
  }
}

module.exports = {
  HOME_CACHE_CONTROL,
  HOME_IMAGES_TTL_MS,
  HOME_LIVE_DEADLINE_MS,
  getHomePayload,
  getHomePayloadWithDeadline,
  assembleHomeFromCaches,
  warmHomeCaches,
  buildHomeImages,
  invalidateHomeImagesCache,
  refreshHomeImagesBackground,
}
