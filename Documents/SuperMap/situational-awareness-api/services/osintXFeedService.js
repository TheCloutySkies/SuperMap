/**
 * OSINT X feed ingestion via FxTwitter / FixTweet public profile API (no API key):
 *   GET https://api.fxtwitter.com/2/profile/:handle/statuses?count=N
 *
 * Fault-tolerant: per-handle failures are skipped; others continue.
 */

const axios = require('axios')
const { getOsintXFeeds } = require('../config/userConfig')
const { normalizeToEvent, ingestEvent } = require('./ingest')
const { geotagArticle } = require('./geotagger')
const { assessItemsBatch } = require('./riskScoring')
const { tagOsintPost } = require('./osintTagger')

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }
/** Concurrent FxTwitter profile fetches per cycle (keep gentle on free API). */
const FETCH_CONCURRENCY = 3

const FXTWITTER_PROFILE = 'https://api.fxtwitter.com/2/profile'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/** Prevent stampeding live refreshes when the DB is empty. */
let lastLiveRefreshAt = 0
let liveRefreshInFlight = null
const LIVE_REFRESH_COOLDOWN_MS = 90 * 1000

/** Let Express /health and /api/* run between FxTwitter + SQLite bursts. */
function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve))
}

function isLikelyImageUrl(url) {
  const u = String(url || '').trim()
  if (!/^https?:\/\//i.test(u)) return false
  if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(u)) return true
  if (/pbs\.twimg\.com\/(media|card_img|amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)\//i.test(u)) return true
  if (/[?&]format=(jpe?g|png|webp|gif)\b/i.test(u)) return true
  return false
}

/** Prefer best MP4 from FxTwitter formats[]; never return thumbnail URLs as video. */
function pickBestVideoUrl(mediaVideo) {
  if (!mediaVideo || typeof mediaVideo !== 'object') return null
  const formats = Array.isArray(mediaVideo.formats) ? mediaVideo.formats : []
  const mp4s = formats
    .filter((f) => {
      if (!f || !f.url) return false
      const container = String(f.container || f.content_type || f.type || '').toLowerCase()
      const url = String(f.url)
      if (/\.m3u8(\?|$)/i.test(url) || container.includes('mpegurl') || container.includes('hls')) return false
      return container.includes('mp4') || /\.mp4(\?|$)/i.test(url)
    })
    .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0))
  if (mp4s.length && mp4s[0].url) return mp4s[0].url
  const direct = mediaVideo.url
  if (direct && typeof direct === 'string' && /^https?:\/\//i.test(direct) && !isLikelyImageUrl(direct)) {
    if (/\.m3u8(\?|$)/i.test(direct)) return null
    return direct
  }
  return null
}

/** Filter out pure reposts; keep original posts and media posts. */
function isOriginalWithHeadline(item) {
  const title = (item.title || '').trim()
  const content = (item.content || '').trim()
  const combined = `${title} ${content}`.toLowerCase()
  if (/^\s*rt\s+@/.test(combined) || /\brt\s+@\w+/.test(combined)) return false
  if (/\b(?:repost|retweet)\b/.test(combined) && combined.length < 80) return false
  if (title.length >= 8 || content.length >= 24) return true
  if ((item.images && item.images.length) || (item.videos && item.videos.length)) return true
  return false
}

/** FxTwitter free profile timeline (JSON) — no API key. */
async function fetchFromFxTwitter(feed) {
  const handle = feed.handle
  const url = `${FXTWITTER_PROFILE}/${encodeURIComponent(handle)}/statuses?count=20`
  const res = await axios.get(url, {
    timeout: 18000,
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
    },
    validateStatus: (s) => s >= 200 && s < 500,
  })
  if (res.status !== 200 || !res.data || res.data.code !== 200) {
    throw new Error(`FxTwitter HTTP ${res.status}`)
  }
  const results = Array.isArray(res.data.results) ? res.data.results : []
  return results
    .filter((t) => t && t.type === 'status')
    .map((t) => {
      const photos = Array.isArray(t.media?.photos) ? t.media.photos : []
      const allMedia = Array.isArray(t.media?.all) ? t.media.all : photos
      const images = allMedia
        .filter((m) => m && (m.type === 'photo' || isLikelyImageUrl(m.url)))
        .map((m) => m.url)
        .filter(Boolean)
      const videoMedia = Array.isArray(t.media?.videos) ? t.media.videos : []
      const videos = videoMedia.map(pickBestVideoUrl).filter(Boolean)
      // Video posts often expose a thumbnail usable in the gallery (never put in videos[])
      const thumbs = videoMedia.map((m) => m.thumbnail_url).filter((u) => isLikelyImageUrl(u))
      for (const th of thumbs) {
        if (!images.includes(th)) images.push(th)
      }
      const text = (t.text || t.raw_text?.text || '').trim()
      let created = t.created_at || ''
      if (!created && t.created_timestamp) {
        const ts = Number(t.created_timestamp)
        created = new Date(ts < 1e12 ? ts * 1000 : ts).toISOString()
      }
      const author = t.author && typeof t.author === 'object' ? t.author : null
      const screenName = (author?.screen_name || feed.handle || '').replace(/^@/, '')
      return {
        source: 'x',
        category: 'osint',
        account: screenName || feed.handle,
        name: feed.name,
        displayName: author?.name || feed.name || screenName || feed.handle,
        avatarUrl: author?.avatar_url || null,
        verified: !!(author?.verification?.verified),
        title: text.slice(0, 140),
        content: text.slice(0, 2000),
        url: t.url || `https://x.com/${handle}/status/${t.id}`,
        tweetId: t.id ? String(t.id) : null,
        pubDate: created,
        priority: feed.priority,
        images,
        videos,
        // FxTwitter exposes counts only — not reply thread bodies.
        metrics: {
          replies: Number(t.replies) || 0,
          reposts: Number(t.reposts) || 0,
          likes: Number(t.likes) || 0,
          bookmarks: Number(t.bookmarks) || 0,
          quotes: Number(t.quotes) || 0,
          views: Number(t.views) || 0,
        },
        replyCount: Number(t.replies) || 0,
        replyingTo: t.replying_to || null,
        provider: 'fxtwitter',
      }
    })
    .filter(isOriginalWithHeadline)
}

async function fetchOneFeed(feed) {
  try {
    const items = await fetchFromFxTwitter(feed)
    if (items.length) console.log('[osint-x]', feed.handle, 'FxTwitter ok', `(${items.length})`)
    return items
  } catch (err) {
    console.error('[osint-x] FxTwitter failed:', feed.handle, err.message)
    return []
  }
}

function normalizeToOsintEvent(item) {
  const raw = {
    title: item.title,
    contentSnippet: item.content,
    link: item.url,
    pubDate: item.pubDate,
    account: item.account,
    priority: item.priority,
    coordinates: item.coordinates,
    country: item.country,
    confidence: item.confidence,
  }
  if (item.coordinates?.length >= 2) {
    raw.lon = item.coordinates[0]
    raw.lat = item.coordinates[1]
  }
  const event = normalizeToEvent(raw, 'osint', 'x')
  event.raw_data = JSON.stringify({
    link: item.url,
    url: item.url,
    account: item.account,
    displayName: item.displayName || item.name || item.account,
    avatarUrl: item.avatarUrl || null,
    verified: !!item.verified,
    tweetId: item.tweetId || null,
    priority: item.priority,
    images: item.images || [],
    videos: item.videos || [],
    metrics: item.metrics || null,
    replyCount: item.replyCount != null ? Number(item.replyCount) : (item.metrics?.replies ?? 0),
    replyingTo: item.replyingTo || null,
    country: item.country || null,
    confidence: item.confidence || null,
    provider: item.provider || 'fxtwitter',
  })
  if (item.coordinates?.length >= 2) {
    event.lon = item.coordinates[0]
    event.lat = item.coordinates[1]
  }
  return event
}

function invalidateOmnibarAfterX() {
  try {
    require('./omnibarContent').invalidateOmnibarContentCache()
  } catch (_) { /* optional */ }
}

async function fetchOsintXFeeds({ limitFeeds = 0, skipGeotag = false, preferAi = null } = {}) {
  let osintXFeeds = getOsintXFeeds()
  if (limitFeeds > 0) osintXFeeds = osintXFeeds.slice(0, limitFeeds)
  if (osintXFeeds.length === 0) {
    console.warn('[osint-x] No feeds configured. Add handles in Settings or user-config.json.')
    return []
  }

  // Live/Retry path must stay budget-friendly — heuristics only, no LLM wait.
  const useAi = preferAi == null ? !skipGeotag : !!preferAi

  const settled = []
  for (let i = 0; i < osintXFeeds.length; i += FETCH_CONCURRENCY) {
    const chunk = osintXFeeds.slice(i, i + FETCH_CONCURRENCY)
    const part = await Promise.allSettled(
      chunk.map((feed) => fetchOneFeed(feed).then((items) => ({ feed, items }))),
    )
    settled.push(...part)
    await yieldToEventLoop()
  }

  const pending = []
  const byHandle = {}
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]
    const feed = osintXFeeds[i]
    const handle = feed.handle
    if (s.status !== 'fulfilled') {
      console.warn('[osint-x]', handle, 'rejected:', s.reason?.message || s.reason)
      byHandle[handle] = { ok: false, count: 0, err: s.reason?.message }
      continue
    }
    const { items } = s.value
    byHandle[handle] = { ok: true, count: items.length }
    for (const item of items) {
      if (!skipGeotag) {
        try {
          const tagged = await geotagArticle({
            title: item.title,
            content: item.content,
            contentSnippet: item.content,
          })
          if (tagged.coordinates) {
            item.coordinates = tagged.coordinates
            item.country = tagged.country
            item.confidence = tagged.confidence
          }
        } catch (_) { /* geotag optional */ }
      }
      pending.push(item)
    }
  }

  // AI/heuristic risk scoring for the batch (graceful degrade inside assessItemsBatch)
  let assessments = []
  try {
    assessments = await assessItemsBatch(
      pending.map((item) => ({
        title: item.title,
        content: item.content,
        source: 'x',
      })),
      { preferAi: useAi, maxAiItems: useAi ? 16 : 0 },
    )
  } catch (_) {
    assessments = []
  }

  const results = []
  for (let i = 0; i < pending.length; i++) {
    const item = pending[i]
    const assessment = assessments[i] || null
    const event = normalizeToOsintEvent(item)
    const ingested = ingestEvent(event, {
      extraTags: ['x', 'osint'],
      assessment: assessment || undefined,
    })
    results.push({
      id: event.id,
      source: 'x',
      account: item.account,
      displayName: item.displayName || item.name || item.account,
      avatarUrl: item.avatarUrl || null,
      verified: !!item.verified,
      title: item.title,
      content: item.content,
      timestamp: event.timestamp,
      tags: ingested.tags,
      risk_score: ingested.risk_score,
      risk_label: ingested.risk_label,
      priority: item.priority,
      url: item.url,
      tweetId: item.tweetId || null,
      images: item.images || [],
      videos: item.videos || [],
      metrics: item.metrics || null,
      replyCount: item.replyCount != null ? Number(item.replyCount) : 0,
      provider: 'fxtwitter',
    })
    if (i > 0 && i % 25 === 0) await yieldToEventLoop()
  }
  const ok = Object.entries(byHandle).filter(([, v]) => v.ok && v.count > 0)
  const fail = Object.entries(byHandle).filter(([, v]) => !v.ok || v.count === 0)
  if (ok.length) console.log('[osint-x] OK:', ok.map(([h, v]) => `${h}=${v.count}`).join(', '))
  if (fail.length) console.warn('[osint-x] Failed:', fail.map(([h]) => h).join(', '))
  if (results.length) invalidateOmnibarAfterX()
  return results
}

/**
 * If the event DB has no recent X posts, run a live ingest (cooldown-guarded).
 * Pass force: true to bypass cooldown (user-initiated refresh).
 * Live path skips geotag so the API returns quickly; scheduled ingest still geotags.
 *
 * @param {object} [opts]
 * @param {number} [opts.limitFeeds]
 * @param {boolean} [opts.force]
 * @param {number} [opts.budgetMs] — hard cap; returns early without cancelling the in-flight job
 */
async function ensureOsintXFresh({ limitFeeds = 12, force = false, budgetMs = 0 } = {}) {
  const now = Date.now()
  if (!force && now - lastLiveRefreshAt < LIVE_REFRESH_COOLDOWN_MS) {
    return { refreshed: false, reason: 'cooldown' }
  }

  const startOrJoin = () => {
    if (liveRefreshInFlight) return liveRefreshInFlight
    liveRefreshInFlight = (async () => {
      try {
        const posts = await fetchOsintXFeeds({ limitFeeds, skipGeotag: true })
        lastLiveRefreshAt = Date.now()
        return { refreshed: true, count: posts.length }
      } finally {
        liveRefreshInFlight = null
      }
    })()
    return liveRefreshInFlight
  }

  const job = startOrJoin()
  if (!budgetMs || budgetMs <= 0) return job

  let timer
  try {
    return await Promise.race([
      job,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ refreshed: false, reason: 'budget' }), budgetMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Fast path for homepage gallery: live FxTwitter images (no DB required).
 * Rotates start handle so repeated calls surface fresher accounts over time.
 * Returns [{ src, postUrl, caption, account, source, provider }]
 */
let homeImageHandleCursor = 0

async function fetchHomeOsintImages({ maxHandles = 8, maxImages = 24 } = {}) {
  const all = getOsintXFeeds()
  if (!all.length) return []
  const start = homeImageHandleCursor % all.length
  homeImageHandleCursor = (start + maxHandles) % all.length
  const feeds = []
  for (let i = 0; i < Math.min(maxHandles, all.length); i++) {
    feeds.push(all[(start + i) % all.length])
  }
  const items = []
  const seen = new Set()
  for (let i = 0; i < feeds.length && items.length < maxImages; i += FETCH_CONCURRENCY) {
    const chunk = feeds.slice(i, i + FETCH_CONCURRENCY)
    const settled = await Promise.allSettled(chunk.map((f) => fetchFromFxTwitter(f)))
    for (let j = 0; j < settled.length; j++) {
      const s = settled[j]
      if (s.status !== 'fulfilled') continue
      const feed = chunk[j]
      for (const post of s.value) {
        for (const src of post.images || []) {
          if (!src || seen.has(src)) continue
          seen.add(src)
          items.push({
            src,
            postUrl: post.url || src,
            caption: (post.content || post.title || '').trim().slice(0, 400),
            account: feed.handle,
            source: 'x',
            provider: 'fxtwitter',
          })
          if (items.length >= maxImages) break
        }
        if (items.length >= maxImages) break
      }
    }
  }
  return items
}

/**
 * Images already ingested into the DB (from scheduled/live pulls).
 * Fast, non-network path so the homepage stays non-empty between FxTwitter calls.
 */
function collectDbOsintImages({ max = 24, maxAgeMs = 48 * 60 * 60 * 1000 } = {}) {
  let getEvents
  try {
    getEvents = require('../database').getEvents
  } catch (_) {
    return []
  }
  const cutoff = Date.now() - maxAgeMs
  const rows = getEvents(Math.min(max * 4, 200), null, null, null, null, ['x'])
  const items = []
  const seen = new Set()
  for (const r of rows) {
    if ((r.timestamp != null ? Number(r.timestamp) : 0) < cutoff) continue
    let raw = {}
    try {
      raw = r.raw_data ? JSON.parse(r.raw_data) : {}
    } catch (_) {}
    const images = Array.isArray(raw.images) ? raw.images : []
    for (const src of images) {
      if (!src || seen.has(src)) continue
      seen.add(src)
      items.push({
        src,
        postUrl: raw.link || raw.url || src,
        caption: (r.description || r.title || '').trim().slice(0, 400),
        account: raw.account || null,
        source: 'x',
        provider: raw.provider || 'fxtwitter',
      })
      if (items.length >= max) return items
    }
  }
  return items
}

/**
 * Scheduled ingest: full configured handle list every tick.
 * Concurrency-capped; overlap-guarded — skips if a previous cycle is still running.
 */
let scheduledIngestInFlight = null
let lastScheduledAt = 0
let lastScheduledResult = null

async function fetchOsintXFeedsScheduled({ concurrency = FETCH_CONCURRENCY } = {}) {
  if (scheduledIngestInFlight) {
    return { skipped: true, reason: 'inflight', ...(lastScheduledResult || {}) }
  }
  // Avoid stacking a full-list on top of an in-flight live Retry pull.
  if (liveRefreshInFlight) {
    return { skipped: true, reason: 'live-inflight', ...(lastScheduledResult || {}) }
  }
  const all = getOsintXFeeds()
  if (!all.length) return { skipped: true, reason: 'no-feeds', count: 0, handles: [] }

  const conc = Math.max(1, Math.min(Number(concurrency) || FETCH_CONCURRENCY, 5))

  scheduledIngestInFlight = (async () => {
    const t0 = Date.now()
    const results = []
    for (let i = 0; i < all.length; i += conc) {
      const chunk = all.slice(i, i + conc)
      const part = await Promise.allSettled(chunk.map((feed) => fetchOneFeed(feed)))
      for (let j = 0; j < part.length; j++) {
        const s = part[j]
        const feed = chunk[j]
        if (s.status !== 'fulfilled' || !s.value.length) continue
        for (const item of s.value) {
          const tags = tagOsintPost({ title: item.title, content: item.content })
          const event = normalizeToOsintEvent(item)
          ingestEvent(event, { extraTags: ['x', 'osint', ...tags] })
          results.push({
            id: event.id,
            account: item.account,
            title: item.title,
            images: item.images || [],
            provider: 'fxtwitter',
          })
        }
      }
      // Critical on Render free: without this, /health and feed GETs starve for minutes.
      await yieldToEventLoop()
    }
    lastScheduledAt = Date.now()
    lastLiveRefreshAt = lastScheduledAt
    lastScheduledResult = {
      skipped: false,
      count: results.length,
      handles: all.map((f) => f.handle),
      handleCount: all.length,
      ms: Date.now() - t0,
    }
    console.log(
      '[osint-x] full-list ingest',
      `handles=${all.length}`,
      `posts=${results.length}`,
      `ms=${lastScheduledResult.ms}`,
    )
    if (results.length) invalidateOmnibarAfterX()
    return lastScheduledResult
  })()

  try {
    return await scheduledIngestInFlight
  } finally {
    scheduledIngestInFlight = null
  }
}

/** @deprecated Use fetchOsintXFeedsScheduled — kept for any external callers. */
async function fetchOsintXFeedsRotated(opts = {}) {
  return fetchOsintXFeedsScheduled({ concurrency: opts.concurrency || FETCH_CONCURRENCY })
}

function getIngestStatus() {
  return {
    lastScheduledAt: lastScheduledAt || null,
    lastLiveRefreshAt: lastLiveRefreshAt || null,
    lastScheduledResult,
    liveInFlight: !!liveRefreshInFlight,
    scheduledInFlight: !!scheduledIngestInFlight,
    handleCount: getOsintXFeeds().length,
    intervalHintMs: 5 * 60 * 1000,
  }
}

module.exports = {
  fetchOsintXFeeds,
  fetchOsintXFeedsScheduled,
  fetchOsintXFeedsRotated,
  ensureOsintXFresh,
  fetchHomeOsintImages,
  collectDbOsintImages,
  getIngestStatus,
  PRIORITY_ORDER,
  FETCH_CONCURRENCY,
}
