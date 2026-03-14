require('dotenv').config()
const express = require('express')
const cors = require('cors')
const apiRouter = require('./routes/api')
const newsService = require('./services/news')
const osintService = require('./services/osint')
const osintXFeedService = require('./services/osintXFeedService')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())
app.use('/api', apiRouter)

app.get('/', (req, res) => {
  res.json({
    name: 'Situational Awareness API',
    status: 'running',
    endpoints: {
      health: '/health',
      threatSummary: '/api/threat-summary',
      news: '/api/news',
      osint: '/api/osint',
      osintX: '/api/osint-x?limit=100',
      events: '/api/events?tag=&type=&startTime=&endTime=&bbox=&limit=',
      search: '/api/search?q=&tag=&entity=&startTime=&endTime=&lat=&lon=&radius=',
      clusters: '/api/clusters?lat=&lon=&radius=&radiusKm=50&days=1',
      flockCameras: '/api/flock/cameras?city=SanDiego',
      financeScreener: '/api/finance/screener?list=day_gainers',
      financeSearch: '/api/finance/search?search=AA',
      newsRapid: '/api/news/rapid?topic=TECHNOLOGY&limit=50',
      searchAdvanced: 'POST /api/search/advanced (body: { query })',
      searchSearxng: 'GET /api/search/searxng?q=',
      streamProxy: 'GET /api/stream/proxy?url=&referer= (HLS allowlist)',
      weatherHourly: '/api/weather/hourly?station=10637&start=&end=&tz=',
      weatherNearby: '/api/weather/nearby?lat=&lon=',
      adsb: '/api/adsb?lat=&lon=',
      cameras: '/api/cameras?lat=&lon=&radius=',
      forumCategories: '/api/forum/categories',
      forumCommunities: '/api/forum/communities?category_id=',
      forumPosts: '/api/forum/posts?community_id=',
      forumThread: '/api/forum/post/:id',
      config: 'GET/POST /api/config (user X handles, subreddits)',
    },
  })
})

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

const INGEST_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
// OSINT per-source intervals (DW 10min, CISA 15min, Bellingcat 30min)
const DW_INTERVAL_MS = 10 * 60 * 1000
const CISA_INTERVAL_MS = 15 * 60 * 1000
const BELLINGCAT_INTERVAL_MS = 30 * 60 * 1000
const OSINT_X_INTERVAL_MS = 1 * 60 * 1000 // 1 minute (Nitter mirrors may still be 15–60 min delayed)

function runIngest(isWarmup = false) {
  newsService.getNews()
    .catch((e) => console.warn('[ingest] news:', e.message))
    .then(() => { if (isWarmup) console.log('[ingest] News ready for search and feeds') })
}

function runOsintWarmup() {
  osintService.fetchAllOsint()
    .then((counts) => console.log('[osint] Warmup:', counts))
    .catch((e) => console.warn('[osint] Warmup:', e.message))
}

function runOsintXIngest() {
  osintXFeedService.fetchOsintXFeeds()
    .then((posts) => {
      if (posts.length > 0) console.log('[osint-x] Ingested', posts.length, 'posts')
    })
    .catch((e) => console.warn('[osint-x]', e.message))
}

app.listen(PORT, () => {
  console.log(`Situational Awareness API running on http://localhost:${PORT}`)
  // Defer initial ingest so server is responsive immediately (faster startup)
  setImmediate(() => runIngest(true))
  setInterval(() => runIngest(false), INGEST_INTERVAL_MS)
  setTimeout(runOsintWarmup, 5000)
  setInterval(() => osintService.fetchDW().catch((e) => console.warn('[osint] DW:', e.message)), DW_INTERVAL_MS)
  setInterval(() => osintService.fetchCISA().catch((e) => console.warn('[osint] CISA:', e.message)), CISA_INTERVAL_MS)
  setInterval(() => osintService.fetchBellingcat().catch((e) => console.warn('[osint] Bellingcat:', e.message)), BELLINGCAT_INTERVAL_MS)
  setInterval(() => osintService.fetchISW().catch((e) => console.warn('[osint] ISW:', e.message)), BELLINGCAT_INTERVAL_MS)
  setInterval(() => osintService.fetchDefenseOne().catch((e) => console.warn('[osint] Defense One:', e.message)), CISA_INTERVAL_MS)
  setInterval(() => osintService.fetchWarOnTheRocks().catch((e) => console.warn('[osint] War on the Rocks:', e.message)), BELLINGCAT_INTERVAL_MS)
  setInterval(() => osintService.fetchDefenseNews().catch((e) => console.warn('[osint] Defense News:', e.message)), CISA_INTERVAL_MS)
  setInterval(() => osintService.fetchTheWarZone().catch((e) => console.warn('[osint] The War Zone:', e.message)), CISA_INTERVAL_MS)
  setTimeout(runOsintXIngest, 10000)
  setInterval(runOsintXIngest, OSINT_X_INTERVAL_MS)
})
