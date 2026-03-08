/**
 * OSINT X feed ingestion: fetch from Nitter-style RSS mirrors, normalize, tag, ingest.
 * Fault-tolerant: retry once per feed, skip on failure, continue with others.
 */

const Parser = require('rss-parser')
const { getOsintXFeeds, getNitterMirrors } = require('../config/userConfig')
const { normalizeToEvent, ingestEvent } = require('./ingest')
const { tagOsintPost } = require('./osintTagger')
const { geotagArticle } = require('./geotagger')

const parser = new Parser({
  timeout: 18000,
  headers: { 'User-Agent': 'SuperMap-OSINT-X/1.0 (https://github.com/supermap)' },
})

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

/** Extract image and video URLs from RSS item (HTML content and enclosures). */
function extractMediaFromItem(item) {
  const images = []
  const videos = []
  const seen = new Set()
  const addImage = (url) => {
    if (!url || seen.has(url)) return
    const u = url.trim()
    if (/^https?:\/\//i.test(u) && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(u)) {
      seen.add(u)
      images.push(u)
    }
  }
  const addVideo = (url) => {
    if (!url || seen.has(url)) return
    const u = url.trim()
    if (!/^https?:\/\//i.test(u)) return
    if (/\.(mp4|webm|ogg)(\?|$)/i.test(u) || /youtube\.com|youtu\.be|vimeo\.com|twimg\.com.*video/i.test(u)) {
      seen.add(u)
      videos.push(u)
    }
  }
  const html = (item.content || item['content:encoded'] || '').trim()
  if (html) {
    const imgRe = /<img[^>]+src=["']([^"']+)["']/gi
    let m
    while ((m = imgRe.exec(html)) !== null) addImage(m[1])
    const videoSrcRe = /<video[^>]+src=["']([^"']+)["']|<source[^>]+src=["']([^"']+)["']/gi
    while ((m = videoSrcRe.exec(html)) !== null) addVideo(m[1] || m[2])
    const aHrefRe = /<a[^>]+href=["']([^"']+)["']/gi
    while ((m = aHrefRe.exec(html)) !== null) {
      const href = (m[1] || '').trim()
      if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(href)) addImage(href)
      else addVideo(href)
    }
  }
  const enc = item.enclosure || item.enclosures
  if (enc) {
    const list = Array.isArray(enc) ? enc : [enc]
    for (const e of list) {
      const url = e.url || e.$.url
      const type = (e.type || (e.$ && e.$.type) || '').toLowerCase()
      if (type.startsWith('image/')) addImage(url)
      else if (type.startsWith('video/') || /video/.test(type)) addVideo(url)
      else if (url && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url)) addImage(url)
      else if (url && /\.(mp4|webm)(\?|$)/i.test(url)) addVideo(url)
    }
  }
  return { images, videos }
}

/** Filter out reposts/RTs (RT @user, r to @user, etc.) and keep only original posts with headline or substantive content */
function isOriginalWithHeadline(item) {
  const title = (item.title || '').trim()
  const rawContent = (item.contentSnippet || item.content || '').trim()
  const content = rawContent.replace(/<[^>]+>/g, ' ').trim().slice(0, 2000)
  const combined = `${title} ${content}`
  const combinedLower = combined.toLowerCase()
  if (/^\s*r\s*t\s*@/i.test(combined) || /^\s*r\s+to\s+@/i.test(combined)) return false
  if (/\brt\s+@\w+/i.test(combinedLower)) return false
  if (/\br\s+to\s+@\w+/i.test(combinedLower)) return false
  if (/\b(?:repost|retweet|via\s+@)\b/i.test(combinedLower) && combined.length < 80) return false
  if (title.length >= 12) return true
  if (content.length >= 40 && !/^https?:\/\//i.test(content.trim())) return true
  return false
}

/** Try one mirror URL; returns { items } on success or throws. */
async function fetchFromUrl(rssUrl) {
  const parsed = await parser.parseURL(rssUrl)
  const items = parsed.items || []
  return items
}

/** Fetch one feed, trying each Nitter mirror in order. Returns items or []. */
async function fetchOneFeed(feed, mirrors, retryMirror = true) {
  const handle = feed.handle
  for (let i = 0; i < mirrors.length; i++) {
    const base = mirrors[i].replace(/\/$/, '')
    const rssUrl = `${base}/${encodeURIComponent(handle)}/rss`
    try {
      const items = await fetchFromUrl(rssUrl)
      const mapped = items
        .map((item) => {
          const media = extractMediaFromItem(item)
          return {
            source: 'x',
            category: 'osint',
            account: feed.handle,
            name: feed.name,
            title: item.title || '',
            content: item.contentSnippet || (item.content || '').replace(/<[^>]+>/g, ' ').slice(0, 2000),
            url: item.link || item.guid || '',
            pubDate: item.pubDate || '',
            priority: feed.priority,
            images: media.images,
            videos: media.videos,
          }
        })
        .filter(isOriginalWithHeadline)
      if (i > 0) {
        console.log('[osint-x]', handle, 'succeeded via backup mirror', base)
      }
      return mapped
    } catch (err) {
      if (i < mirrors.length - 1) {
        console.warn('[osint-x]', handle, 'mirror failed:', base, err.message)
      } else if (retryMirror) {
        console.warn('[osint-x] Retry once:', handle)
        return fetchOneFeed(feed, mirrors, false)
      } else {
        console.error('[osint-x] Feed failed (all mirrors):', handle, err.message)
      }
    }
  }
  return []
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
  })
  if (item.coordinates?.length >= 2) {
    event.lon = item.coordinates[0]
    event.lat = item.coordinates[1]
  }
  return event
}

async function fetchOsintXFeeds() {
  const mirrors = getNitterMirrors()
  const osintXFeeds = getOsintXFeeds()
  if (osintXFeeds.length === 0) {
    console.warn('[osint-x] No feeds configured. Add handles in Settings or user-config.json.')
    return []
  }
  if (mirrors.length === 0) {
    console.warn('[osint-x] No Nitter mirrors. Set NITTER_MIRRORS or NITTER_BASE in .env')
    return []
  }
  const settled = await Promise.allSettled(
    osintXFeeds.map((feed) => fetchOneFeed(feed, mirrors).then((items) => ({ feed, items })))
  )
  const results = []
  const byHandle = {}
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]
    const feed = osintXFeeds[i]
    const handle = feed.handle
    if (s.status === 'rejected') {
      console.warn('[osint-x]', handle, 'rejected:', s.reason?.message || s.reason)
      byHandle[handle] = { ok: false, count: 0, err: s.reason?.message }
      continue
    }
    const { items } = s.value
    byHandle[handle] = { ok: true, count: items.length }
    for (const item of items) {
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
      })
    }
  }
  const ok = Object.entries(byHandle).filter(([, v]) => v.ok && v.count > 0)
  const fail = Object.entries(byHandle).filter(([, v]) => !v.ok || v.count === 0)
  if (ok.length) console.log('[osint-x] OK:', ok.map(([h, v]) => `${h}=${v.count}`).join(', '))
  if (fail.length) console.warn('[osint-x] No data or failed:', fail.map(([h]) => h).join(', '), '| Mirrors tried:', mirrors.join(', '))
  return results
}

module.exports = { fetchOsintXFeeds, PRIORITY_ORDER }
