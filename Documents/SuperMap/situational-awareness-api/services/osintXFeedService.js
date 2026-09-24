/**
 * OSINT X feed ingestion via FxTwitter / FixTweet public profile API (no API key):
 *   GET https://api.fxtwitter.com/2/profile/:handle/statuses?count=N
 *
 * Fault-tolerant: per-handle failures are skipped; others continue.
 */

const axios = require('axios')
const { getOsintXFeeds } = require('../config/userConfig')
const { normalizeToEvent, ingestEvent } = require('./ingest')
const { tagOsintPost } = require('./osintTagger')
const { geotagArticle } = require('./geotagger')

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

const FXTWITTER_PROFILE = 'https://api.fxtwitter.com/2/profile'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/** Prevent stampeding live refreshes when the DB is empty. */
let lastLiveRefreshAt = 0
let liveRefreshInFlight = null
const LIVE_REFRESH_COOLDOWN_MS = 90 * 1000

function isLikelyImageUrl(url) {
  const u = String(url || '').trim()
  if (!/^https?:\/\//i.test(u)) return false
  if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(u)) return true
  if (/pbs\.twimg\.com\/(media|card_img|amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)\//i.test(u)) return true
  if (/[?&]format=(jpe?g|png|webp|gif)\b/i.test(u)) return true
  return false
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
      const videos = (Array.isArray(t.media?.videos) ? t.media.videos : [])
        .map((m) => m.url || m.thumbnail_url)
        .filter(Boolean)
      // Video posts often expose a thumbnail usable in the gallery
      const thumbs = (Array.isArray(t.media?.videos) ? t.media.videos : [])
        .map((m) => m.thumbnail_url)
        .filter((u) => isLikelyImageUrl(u))
      for (const th of thumbs) {
        if (!images.includes(th)) images.push(th)
      }
      const text = (t.text || t.raw_text?.text || '').trim()
      let created = t.created_at || ''
      if (!created && t.created_timestamp) {
        const ts = Number(t.created_timestamp)
        created = new Date(ts < 1e12 ? ts * 1000 : ts).toISOString()
      }
      return {
        source: 'x',
        category: 'osint',
        account: feed.handle,
        name: feed.name,
        title: text.slice(0, 140),
        content: text.slice(0, 2000),
        url: t.url || `https://x.com/${handle}/status/${t.id}`,
        pubDate: created,
        priority: feed.priority,
        images,
        videos,
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
    priority: item.priority,
    images: item.images || [],
    videos: item.videos || [],
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

async function fetchOsintXFeeds({ limitFeeds = 0, skipGeotag = false } = {}) {
  let osintXFeeds = getOsintXFeeds()
  if (limitFeeds > 0) osintXFeeds = osintXFeeds.slice(0, limitFeeds)
  if (osintXFeeds.length === 0) {
    console.warn('[osint-x] No feeds configured. Add handles in Settings or user-config.json.')
    return []
  }

  const CONCURRENCY = 4
  const settled = []
  for (let i = 0; i < osintXFeeds.length; i += CONCURRENCY) {
    const chunk = osintXFeeds.slice(i, i + CONCURRENCY)
    const part = await Promise.allSettled(
      chunk.map((feed) => fetchOneFeed(feed).then((items) => ({ feed, items }))),
    )
    settled.push(...part)
  }

  const results = []
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
      const tags = tagOsintPost({ title: item.title, content: item.content })
      const event = normalizeToOsintEvent(item)
      ingestEvent(event, { extraTags: ['x', 'osint', ...tags] })
      results.push({
        id: event.id,
        source: 'x',
        account: item.account,
        title: item.title,
        content: item.content,
        timestamp: event.timestamp,
        tags: ['x', 'osint', ...tags],
        priority: item.priority,
        url: item.url,
        images: item.images || [],
        videos: item.videos || [],
        provider: 'fxtwitter',
      })
    }
  }
  const ok = Object.entries(byHandle).filter(([, v]) => v.ok && v.count > 0)
  const fail = Object.entries(byHandle).filter(([, v]) => !v.ok || v.count === 0)
  if (ok.length) console.log('[osint-x] OK:', ok.map(([h, v]) => `${h}=${v.count}`).join(', '))
  if (fail.length) console.warn('[osint-x] Failed:', fail.map(([h]) => h).join(', '))
  return results
}

/**
 * If the event DB has no recent X posts, run a live ingest (cooldown-guarded).
 * Pass force: true to bypass cooldown (user-initiated refresh).
 * Live path skips geotag so the API returns quickly; scheduled ingest still geotags.
 */
async function ensureOsintXFresh({ limitFeeds = 12, force = false } = {}) {
  const now = Date.now()
  if (!force && now - lastLiveRefreshAt < LIVE_REFRESH_COOLDOWN_MS) {
    return { refreshed: false, reason: 'cooldown' }
  }
  if (liveRefreshInFlight) {
    await liveRefreshInFlight
    return { refreshed: false, reason: 'awaited-inflight' }
  }
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

/**
 * Fast path for homepage gallery: live FxTwitter images only (no DB required).
 * Returns [{ src, postUrl, caption, account, source }]
 */
async function fetchHomeOsintImages({ maxHandles = 8, maxImages = 24 } = {}) {
  const feeds = getOsintXFeeds().slice(0, maxHandles)
  const items = []
  const seen = new Set()
  const CONCURRENCY = 4
  for (let i = 0; i < feeds.length && items.length < maxImages; i += CONCURRENCY) {
    const chunk = feeds.slice(i, i + CONCURRENCY)
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

module.exports = {
  fetchOsintXFeeds,
  ensureOsintXFresh,
  fetchHomeOsintImages,
  PRIORITY_ORDER,
}
