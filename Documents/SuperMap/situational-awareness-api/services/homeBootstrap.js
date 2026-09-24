/**
 * HomeScreen bootstrap: assemble cache-first payloads for GET /api/home
 * and warm those caches after server listen.
 */
const axios = require('axios')
const osintXFeedService = require('./osintXFeedService')
const newsService = require('./news')

const HOME_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=600'

/** In-memory homeImages cache so gallery stays non-empty and refreshes on a TTL. */
const HOME_IMAGES_TTL_MS = 90 * 1000
let homeImagesCache = { at: 0, items: [], source: null }

function apiBaseUrl() {
  const port = process.env.PORT || 3001
  return `http://127.0.0.1:${port}`
}

async function fetchLocal(path, timeoutMs = 45000) {
  const { data } = await axios.get(`${apiBaseUrl()}${path}`, {
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

/**
 * Homepage gallery images:
 * 1) Recent DB OSINT-X images (from continuous ingest) — fast, always available
 * 2) Live FxTwitter top-up (rotating handles) — keeps gallery fresh
 * 3) Reddit video frames fallback
 *
 * Cached ~90s unless force=true.
 */
async function buildHomeImages({ max = 24, force = false } = {}) {
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
 */
async function getHomePayload() {
  const results = await Promise.allSettled([
    fetchLocal('/api/threat-summary', 90000),
    fetchLocal('/api/defcon', 15000),
    fetchLocal('/api/osint-x?limit=80', 45000),
    fetchLocal('/api/gas-prices/states', 8000),
    fetchLocal('/api/gas-prices', 30000),
    fetchLocal('/api/news', 30000),
    fetchLocal('/api/stocks', 20000),
    fetchLocal('/api/earthquakes/widget', 15000),
    fetchLocal('/api/space', 20000),
    buildHomeImages({ max: 24 }),
  ])

  const val = (i, fallback = null) =>
    results[i].status === 'fulfilled' ? results[i].value : fallback

  const news = val(5, { type: 'FeatureCollection', features: [] })
  const homeImages = Array.isArray(val(9)) ? val(9) : []

  return {
    threatSummary: val(0),
    defcon: val(1),
    osintX: Array.isArray(val(2)) ? val(2) : [],
    gasStates: Array.isArray(val(3)) ? val(3) : [],
    gasPrices: val(4),
    news,
    stocks: val(6),
    earthquakes: val(7),
    space: val(8),
    homeImages,
    updatedAt: new Date().toISOString(),
  }
}

/** Fire-and-forget warmup of home caches (news ingest should already be running). */
async function warmHomeCaches() {
  try {
    const payload = await getHomePayload()
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
    return payload
  } catch (e) {
    console.warn('[home] Warm caches failed:', e.message)
    return null
  }
}

module.exports = {
  HOME_CACHE_CONTROL,
  HOME_IMAGES_TTL_MS,
  getHomePayload,
  warmHomeCaches,
  buildHomeImages,
  invalidateHomeImagesCache,
  refreshHomeImagesBackground,
}
