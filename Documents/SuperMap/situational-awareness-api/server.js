require('dotenv').config()
const express = require('express')
const cors = require('cors')
const apiRouter = require('./routes/api')
const newsService = require('./services/news')
const osintService = require('./services/osint')
const osintXFeedService = require('./services/osintXFeedService')
const mediastack = require('./services/mediastack')
const keywordTags = require('./services/keywordTags')
const feedSchedule = require('./services/feedSchedule')
const dataPaths = require('./services/dataPaths')
const { warmHomeCaches, refreshHomeImagesBackground } = require('./services/homeBootstrap')

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
      home: '/api/home',
      threatSummary: '/api/threat-summary',
      news: '/api/news',
      osint: '/api/osint',
      osintX: '/api/osint-x?limit=100',
      events: '/api/events?tag=&type=&startTime=&endTime=&bbox=&limit=',
      search: '/api/search?q=&tag=&entity=&startTime=&endTime=&lat=&lon=&radius=',
      searchOmnibar: '/api/search/omnibar?q=&limit=',
      clusters: '/api/clusters?lat=&lon=&radius=&radiusKm=50&days=1',
      financeScreener: '/api/finance/screener?list=day_gainers',
      financeSearch: '/api/finance/search?search=AA',
      newsRapid: '/api/news/rapid?topic=TECHNOLOGY&limit=50',
      searchAdvanced: 'POST /api/search/advanced (body: { query })',
      searchSearxng: 'GET /api/search/searxng?q=',
      streamProxy: 'GET /api/stream/proxy?url=&referer= (HLS allowlist)',
      weatherHourly: '/api/weather/hourly?station=10637&start=&end=&tz=',
      weatherNearby: '/api/weather/nearby?lat=&lon=',
      weatherForecast: '/api/weather/forecast?lat=&lon=&days=7',
      weatherHistorical: '/api/weather/historical?lat=&lon=&startDate=&endDate=',
      weatherMarine: '/api/weather/marine?lat=&lon=',
      weatherAirQuality: '/api/weather/air-quality?lat=&lon=',
      weatherFlood: '/api/weather/flood?lat=&lon=',
      weatherSatelliteRadiation: '/api/weather/satellite-radiation?lat=&lon=',
      weatherAlerts: '/api/weather/alerts?lat=&lon=',
      weatherRadarMeta: '/api/weather/radar/meta',
      weatherWindyConfig: '/api/weather/windy/config',
      adsbMil: '/api/adsb/mil',
      cameras: '/api/cameras?lat=&lon=&radius=',
      webcams: '/api/webcams?minLat=&maxLat=&minLon=&maxLon=&limit=',
      crimeStats: '/api/crime/stats',
      crimeStates: '/api/crime/states?year=',
      crimeCities: '/api/crime/cities?q=&state=&limit=&offset=',
      nwsAlerts: '/api/hazards/nws?bbox=',
      emscEarthquakes: '/api/hazards/emsc?bbox=&minmag=',
      usgsVolcanoes: '/api/hazards/volcanoes?bbox=',
      nhcTropical: '/api/hazards/nhc?bbox=',
      config: 'GET/POST /api/config (user X handles, subreddits)',
    },
  })
})

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

/** OSINT X: full handle list every 5 minutes (no rotate batch). */
const OSINT_X_INTERVAL_MS = 5 * 60 * 1000
/** Faster cadence while SQLite has zero X rows (free-tier ephemeral wipe). */
const OSINT_X_EMPTY_INTERVAL_MS = 3 * 60 * 1000
const HOME_IMAGES_REFRESH_MS = 3 * 60 * 1000
const MEDIASTACK_TICK_MS = 60 * 1000 // check ET window every minute
const FEEDS_815_TICK_MS = 60 * 1000 // news RSS + OSINT publishers 08:00/15:00 ET
const KEYWORD_TAGS_INTERVAL_MS = 60 * 60 * 1000
const VIDEOS_WARM_INTERVAL_MS = 60 * 60 * 1000 // YouTube RSS ~1h

const BATCH_JOB = 'news-osint-815'

/** Rebuild threat summary in background; never overwrite last-good with empty. */
function rebuildThreatSummaryBackground(reason = 'batch') {
  setImmediate(() => {
    try {
      const api = require('./routes/api')
      if (typeof api.rebuildThreatSummaryBackground === 'function') {
        api.rebuildThreatSummaryBackground(reason)
        return
      }
    } catch (_) { /* fall through */ }
    // Direct path if export unavailable
    ;(async () => {
      try {
        const threatSummaryService = require('./services/threatSummary')
        const result = await threatSummaryService.getThreatSummary()
        if (!result?.summary || result.fallback) {
          console.log('[threat-summary] skip persist (empty/fallback) after', reason)
          return
        }
        const api = require('./routes/api')
        if (typeof api.persistThreatSummaryIfGood === 'function') {
          api.persistThreatSummaryIfGood(result)
        }
      } catch (e) {
        console.warn('[threat-summary] rebuild:', e.message)
      }
    })()
  })
}

/** News RSS rebuild — only when scheduled or catch-up. */
function runNewsRebuild(reason = 'scheduled') {
  return newsService
    .getNews()
    .then((payload) => {
      console.log('[ingest] news rebuild', reason, 'features=', payload?.features?.length || 0)
      return payload
    })
    .catch((e) => {
      console.warn('[ingest] news:', e.message)
      return null
    })
}

/** MediaStack: only 08:00 and 15:00 America/New_York (once per window). */
function runMediaStackTick() {
  if (!mediastack.isPullWindowDue()) return
  mediastack
    .maybeScheduledPull()
    .then((cache) => {
      console.log(
        '[mediastack] scheduled pull done; articles=',
        (cache?.articles || []).length,
        'quota=',
        !!cache?.quotaExhausted,
      )
      // Merge MediaStack into news last-good without waiting for the shared batch mark
      return runNewsRebuild('mediastack')
    })
    .catch((e) => console.warn('[mediastack] tick:', e.message))
}

function runKeywordTagsRefresh() {
  keywordTags.refreshKeywordTags().catch((e) => console.warn('[keyword-tags]', e.message))
}

function runOsintPublishers() {
  return osintService
    .fetchAllOsint()
    .then((counts) => {
      console.log('[osint] publishers:', counts)
      return counts
    })
    .catch((e) => {
      console.warn('[osint] publishers:', e.message)
      return null
    })
}

/**
 * Shared 08:00 / 15:00 ET batch: news RSS + OSINT publishers + threat summary.
 * MediaStack keeps its own window tick (unchanged cadence).
 */
function run815FeedsBatch(force = false) {
  if (!force && !feedSchedule.isBatchDue(BATCH_JOB)) return Promise.resolve(null)
  console.log('[feeds-815] starting batch force=', !!force)
  return Promise.all([runNewsRebuild(force ? 'catch-up' : '815'), runOsintPublishers()])
    .then(() => {
      feedSchedule.markBatchDone(BATCH_JOB)
      rebuildThreatSummaryBackground(force ? 'catch-up' : '815')
      try {
        const api = require('./routes/api')
        if (typeof api.invalidateHomeBootstrapCache === 'function') api.invalidateHomeBootstrapCache()
      } catch (_) { /* optional */ }
      return true
    })
    .catch((e) => {
      console.warn('[feeds-815]', e.message)
      return null
    })
}

function runOsintXIngest() {
  osintXFeedService
    .fetchOsintXFeedsScheduled({ concurrency: osintXFeedService.FETCH_CONCURRENCY || 5 })
    .then((result) => {
      if (result?.skipped) {
        if (result.reason === 'inflight') console.log('[osint-x] skip tick (previous still running)')
        return
      }
      if (result?.count > 0) {
        console.log(
          '[osint-x] Ingested',
          result.count,
          'posts from',
          result.handleCount || (result.handles || []).length,
          'handles',
        )
      }
      try {
        const api = require('./routes/api')
        if (typeof api.invalidateHomeBootstrapCache === 'function') api.invalidateHomeBootstrapCache()
      } catch (_) { /* optional */ }
      refreshHomeImagesBackground().catch((e) => console.warn('[home] after-x:', e.message))
    })
    .catch((e) => console.warn('[osint-x]', e.message))
}

/** True when SQLite has no X rows — free-tier ephemeral wipe / cold boot. */
function osintXDbEmpty() {
  try {
    const { getEvents } = require('./database')
    const rows = getEvents(5, null, null, null, null, ['x'])
    return !rows || rows.length === 0
  } catch (_) {
    return true
  }
}

/** Boot: load disk/memory caches, catch-up news/OSINT if empty or missed last 8/15 window.
 * Free tier: stagger MediaStack cold-seed → news RSS → OSINT publishers so the
 * event loop stays responsive (avoid free-tier death spiral with OSINT X).
 */
function runBootCatchUp() {
  const cached = newsService.getNewsCached()
  const fetchedAt = newsService.getNewsFetchedAt?.() || cached?.meta?.fetchedAt || null
  const newsNeeds = !cached?.features?.length || feedSchedule.needsCatchUp(fetchedAt)

  let osintNeeds = false
  try {
    const live = osintService.getOsintFromDb(20)
    osintNeeds = !live?.features?.length
  } catch (_) {
    osintNeeds = true
  }

  if (newsNeeds || osintNeeds) {
    console.log('[boot] catch-up needed news=', newsNeeds, 'osint=', osintNeeds)
    // Soft stampede: MediaStack cold-seed first (sync-ish), then news RSS;
    // OSINT publishers delayed further so cold /api/home + OSINT X stay responsive.
    const startNews = () => {
      if (!newsNeeds) return Promise.resolve(null)
      return runNewsRebuild('catch-up').catch((e) => {
        console.warn('[boot] news catch-up:', e.message)
        return null
      })
    }

    if (newsNeeds) {
      // Prefer MediaStack seed when RSS last-good is gone (ephemeral wipe).
      mediastack
        .maybeColdSeedPull()
        .then((cache) => {
          const n = (cache?.articles || []).length
          if (n > 0) {
            console.log('[boot] MediaStack cold-seed articles=', n)
            // Re-read news cache so getNewsCached synthesizes from MediaStack ASAP
            try { newsService.getNewsCached() } catch (_) { /* optional */ }
          }
        })
        .catch((e) => console.warn('[boot] mediastack cold-seed:', e.message))
        .finally(() => {
          // Yield event loop before RSS fan-out
          setTimeout(() => {
            startNews().catch(() => {})
          }, 1500)
        })
    }

    if (osintNeeds) {
      // Free tier: push publisher fan-out later so news + OSINT X can paint first.
      const osintDelayMs = dataPaths.isDurable() ? 18000 : 28000
      setTimeout(() => {
        runOsintPublishers()
          .then(() => {
            feedSchedule.markBatchDone(BATCH_JOB)
            rebuildThreatSummaryBackground('catch-up')
            try {
              const api = require('./routes/api')
              if (typeof api.invalidateHomeBootstrapCache === 'function') api.invalidateHomeBootstrapCache()
            } catch (_) { /* optional */ }
          })
          .catch((e) => console.warn('[boot] osint catch-up:', e.message))
      }, osintDelayMs)
    } else if (newsNeeds) {
      feedSchedule.markBatchDone(BATCH_JOB)
    }
  } else {
    console.log('[boot] last-good caches present; skipping catch-up pull')
  }
}

app.listen(PORT, () => {
  console.log(`Situational Awareness API running on http://localhost:${PORT}`)
  try {
    dataPaths.logOnce()
  } catch (_) { /* optional */ }
  // Prefer keepalive hitting /api/home (not only /health) so in-memory last-good stays warm.

  // Load disk/memory last-good immediately so first requests are not blank
  let hadLastGood = false
  try {
    newsService.getNewsCached()
  } catch (_) { /* optional */ }
  try {
    if (typeof apiRouter.seedHomeCachesOnBoot === 'function') {
      hadLastGood = !!apiRouter.seedHomeCachesOnBoot()
    }
  } catch (e) {
    console.warn('[boot] seed:', e.message)
  }

  const ephemeral = !dataPaths.isDurable()

  // MediaStack: check every minute for 08:00 / 15:00 ET windows only
  setTimeout(runMediaStackTick, 15000)
  setInterval(runMediaStackTick, MEDIASTACK_TICK_MS)

  // News RSS + OSINT publishers: same 08:00 / 15:00 ET windows
  setTimeout(() => run815FeedsBatch(false), 20000)
  setInterval(() => run815FeedsBatch(false), FEEDS_815_TICK_MS)

  // Boot catch-up / OSINT-X: defer when last-good is present so cold-open HTTP
  // is not starved by ingest on the event loop.
  // Free tier (ephemeral): start OSINT X sooner (~10s) when DB empty; stagger
  // news/videos/publishers so catch-up does not death-spiral with X ingest.
  const xEmpty = osintXDbEmpty()
  const catchUpDelayMs = hadLastGood ? 45000 : (ephemeral ? 4000 : 6000)
  const osintXDelayMs = hadLastGood ? 50000 : (xEmpty ? 10000 : 32000)
  const warmHomeDelayMs = hadLastGood ? 15000 : 2500
  // Videos after news catch-up starts — avoid Innertube + RSS stampede on free tier
  const videosDelayMs = hadLastGood ? 20000 : (ephemeral ? 32000 : 22000)
  setTimeout(runBootCatchUp, catchUpDelayMs)
  console.log(
    '[boot] catch-up delay ms=',
    catchUpDelayMs,
    'osint-x delay ms=',
    osintXDelayMs,
    'warm-home delay ms=',
    warmHomeDelayMs,
    'videos delay ms=',
    videosDelayMs,
    'hadLastGood=',
    hadLastGood,
    'osintXEmpty=',
    xEmpty,
    'ephemeral=',
    ephemeral,
  )

  // Hourly keyword tags for threat summary
  setTimeout(runKeywordTagsRefresh, hadLastGood ? 45000 : 55000)
  setInterval(runKeywordTagsRefresh, KEYWORD_TAGS_INTERVAL_MS)

  // OSINT X: full list — while DB empty use 3min cadence so free-tier ephemeral
  // SQLite stays warm within process life; settle to 5min once populated.
  // Leave X path alone unless boot contention — delays above keep others off its lane.
  setTimeout(runOsintXIngest, osintXDelayMs)
  let osintXTimer = null
  const scheduleOsintXTick = () => {
    const interval = osintXDbEmpty() ? OSINT_X_EMPTY_INTERVAL_MS : OSINT_X_INTERVAL_MS
    osintXTimer = setTimeout(() => {
      runOsintXIngest()
      scheduleOsintXTick()
    }, interval)
    if (typeof osintXTimer.unref === 'function') osintXTimer.unref()
  }
  setTimeout(scheduleOsintXTick, osintXDelayMs + 500)

  // Warm home bootstrap early on cold boot so piece/MediaStack/stocks land <10s
  setTimeout(() => {
    warmHomeCaches().catch((e) => console.warn('[home] warmup:', e.message))
  }, warmHomeDelayMs)

  // Recent Videos: warm YouTube RSS into hourly cache on boot + every hour
  setTimeout(() => {
    if (typeof newsService.warmVideoFeedsCache === 'function') {
      newsService.warmVideoFeedsCache().catch((e) => console.warn('[videos] warm:', e.message))
    }
  }, videosDelayMs)
  setInterval(() => {
    if (typeof newsService.warmVideoFeedsCache === 'function') {
      newsService.warmVideoFeedsCache().catch((e) => console.warn('[videos] warm:', e.message))
    }
  }, VIDEOS_WARM_INTERVAL_MS)

  setInterval(() => {
    refreshHomeImagesBackground().catch((e) => console.warn('[home] images tick:', e.message))
  }, HOME_IMAGES_REFRESH_MS)
})
