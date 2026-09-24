/**
 * HomeScreen bootstrap: assemble cache-first payloads for GET /api/home
 * and warm those caches after server listen.
 */
const axios = require('axios')

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

/**
 * Build the homescreen payload by hitting existing cache-first routes in parallel.
 * When caches are warm this is sub-second; on first boot it fills upstream caches.
 */
async function getHomePayload() {
  const results = await Promise.allSettled([
    fetchLocal('/api/threat-summary', 90000),
    fetchLocal('/api/defcon', 15000),
    fetchLocal('/api/osint-x?limit=80', 15000),
    fetchLocal('/api/gas-prices/states', 8000),
    fetchLocal('/api/gas-prices', 30000),
    fetchLocal('/api/news', 30000),
    fetchLocal('/api/stocks', 20000),
    fetchLocal('/api/earthquakes/widget', 15000),
    fetchLocal('/api/space', 20000),
  ])

  const val = (i, fallback = null) =>
    results[i].status === 'fulfilled' ? results[i].value : fallback

  const news = val(5, { type: 'FeatureCollection', features: [] })
  // Slim news for transfer: keep features but clients may slice further
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
}
