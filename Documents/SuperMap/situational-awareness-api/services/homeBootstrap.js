/**
 * HomeScreen bootstrap: assemble cache-first payloads for GET /api/home
 * and warm those caches after server listen.
 */
const axios = require('axios')
const osintXFeedService = require('./osintXFeedService')
const newsService = require('./news')

const HOME_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=600'

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

/**
 * Homepage gallery images: FxTwitter OSINT handles first, then Reddit combat video frames.
 */
async function buildHomeImages({ max = 24 } = {}) {
  const items = []
  const seen = new Set()
  const push = (row) => {
    if (!row?.src || seen.has(row.src) || !isRealPhotoUrl(row.src)) return
    seen.add(row.src)
    items.push(row)
  }

  try {
    const xImages = await osintXFeedService.fetchHomeOsintImages({ maxHandles: 10, maxImages: max })
    for (const img of xImages) {
      push({
        src: img.src,
        postUrl: img.postUrl,
        caption: img.caption,
        account: img.account,
        source: 'x',
        provider: img.provider || 'fxtwitter',
      })
      if (items.length >= max) return items
    }
  } catch (err) {
    console.warn('[home] FxTwitter images:', err.message)
  }

  // Resilient fallback already in repo: Reddit video preview frames (real photos)
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

  return items
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
  getHomePayload,
  warmHomeCaches,
  buildHomeImages,
}
