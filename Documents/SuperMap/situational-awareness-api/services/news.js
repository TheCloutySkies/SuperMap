const Parser = require('rss-parser')
const axios = require('axios')
const { geotagArticles } = require('./geotagger')
const { normalizeToEvent, ingestEvent, eventToFeature } = require('./ingest')

const REQUEST_HEADERS = { 'User-Agent': 'SuperMap/1.0 (OSINT dashboard; https://github.com/supermap)' }
const parser = new Parser({ timeout: 8000, headers: REQUEST_HEADERS })

const GLOBAL_RSS_DENY = [
  // Sports / celebrity / tabloid noise
  'celebrity', 'hollywood', 'kardashian', 'royal family', 'red carpet', 'reality tv',
  'gossip', 'tabloid',
  'premier league', 'champions league', 'nfl', 'nba', 'mlb', 'nhl', 'ufc', 'formula 1', 'f1',
  'football', 'soccer', 'basketball', 'baseball', 'hockey', 'tennis', 'golf', 'cricket',
]

function isGloballyDeniedItem(item) {
  const text = `${item.title || ''} ${item.contentSnippet || ''}`.toLowerCase()
  return GLOBAL_RSS_DENY.some((k) => text.includes(k))
}

const GOOGLE_NEWS_ALLOW = [
  'war', 'conflict', 'invasion', 'strike', 'missile', 'drone', 'airstrike', 'shelling', 'frontline',
  'ceasefire', 'nato', 'sanction', 'embargo', 'coup', 'insurgent', 'terror', 'hostage',
  'election', 'parliament', 'congress', 'president', 'prime minister', 'diplomacy', 'treaty', 'summit',
  'ukraine', 'russia', 'israel', 'gaza', 'iran', 'china', 'taiwan', 'north korea', 'syria', 'yemen',
  'cyber', 'hack', 'ransomware', 'breach', 'malware', 'ddos', 'espionage', 'intel', 'osint',
  'ai', 'semiconductor', 'chip', 'satellite', 'space', 'defense', 'military', 'navy', 'air force',
]
const GOOGLE_NEWS_DENY = [
  'celebrity', 'hollywood', 'kardashian', 'royal family', 'red carpet', 'reality tv',
  'gossip', 'tabloid', 'fashion week',
  'premier league', 'champions league', 'nfl', 'nba', 'mlb', 'nhl', 'ufc', 'formula 1', 'f1',
  'football', 'soccer', 'basketball', 'baseball', 'hockey', 'tennis', 'golf', 'cricket',
]

const GOOGLE_NEWS_DISASTER = [
  'tornado', 'tornadoes', 'hurricane', 'typhoon', 'cyclone', 'storm', 'thunderstorm', 'hail',
  'earthquake', 'wildfire', 'flood', 'tsunami', 'landslide', 'blizzard', 'heatwave', 'weather',
]

const GOOGLE_NEWS_PRIMARY = [
  // Require one of these when disaster/weather terms appear.
  'war', 'conflict', 'invasion', 'strike', 'missile', 'drone', 'airstrike', 'shelling',
  'ceasefire', 'nato', 'sanction', 'embargo', 'coup', 'terror', 'hostage',
  'election', 'parliament', 'congress', 'president', 'prime minister', 'diplomacy', 'treaty', 'summit',
  'cyber', 'hack', 'ransomware', 'breach', 'malware', 'ddos', 'espionage', 'intel', 'osint',
  'defense', 'military',
  'ukraine', 'russia', 'israel', 'gaza', 'iran', 'china', 'taiwan', 'north korea', 'syria', 'yemen',
]

const WIKI_ALLOW = [
  // Conflict / geopolitics
  'war', 'conflict', 'invasion', 'strike', 'missile', 'drone', 'airstrike', 'ceasefire',
  'nato', 'sanction', 'embargo', 'treaty', 'diplomacy', 'summit',
  'ukraine', 'russia', 'israel', 'gaza', 'iran', 'china', 'taiwan', 'north korea', 'syria', 'yemen',
  // Politics / state
  'election', 'parliament', 'congress', 'president', 'prime minister', 'government', 'coup',
  // Cyber / intel / defense / tech
  'cyber', 'hack', 'ransomware', 'breach', 'malware', 'ddos', 'espionage', 'intelligence', 'osint',
  'defense', 'military', 'navy', 'air force',
  'satellite', 'space', 'semiconductor', 'chip', 'ai',
  // Infrastructure / energy (often relevant)
  'oil', 'gas', 'pipeline', 'grid', 'power', 'nuclear',
]

const WIKI_DENY = [
  // Celebrity / entertainment / sports / tabloid patterns
  'actor', 'actress', 'singer', 'album', 'song', 'film', 'movie', 'television', 'tv series',
  'celebrity', 'model', 'fashion', 'award', 'oscars', 'grammy',
  'football', 'soccer', 'basketball', 'baseball', 'hockey', 'tennis', 'golf', 'cricket',
]

function isRelevantWikiItem(item) {
  const text = `${item.title || ''} ${item.contentSnippet || ''}`.toLowerCase()
  const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const hit = (kw) => {
    const k = String(kw).toLowerCase()
    if (!k) return false
    if (k.length <= 5 && !k.includes(' ')) return new RegExp(`\\b${escapeRe(k)}\\b`, 'i').test(text)
    return text.includes(k)
  }
  const allowHit = WIKI_ALLOW.some(hit)
  const denyHit = WIKI_DENY.some(hit)
  if (denyHit && !allowHit) return false
  return allowHit
}

function isRelevantGoogleNewsItem(item) {
  const text = `${item.title || ''} ${item.contentSnippet || ''}`.toLowerCase()
  const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const hit = (kw) => {
    const k = String(kw).toLowerCase()
    if (!k) return false
    // For short single-word keywords, require word boundaries to avoid nonsense matches (e.g. "ai" in "thai").
    if (k.length <= 5 && !k.includes(' ')) {
      return new RegExp(`\\b${escapeRe(k)}\\b`, 'i').test(text)
    }
    return text.includes(k)
  }
  const denyHit = GOOGLE_NEWS_DENY.some(hit)
  const allowHit = GOOGLE_NEWS_ALLOW.some(hit)
  const disasterHit = GOOGLE_NEWS_DISASTER.some(hit)
  const primaryHit = GOOGLE_NEWS_PRIMARY.some(hit)
  // If it matches deny topics and doesn't match any allow topic, drop it.
  if (denyHit && !allowHit) return false
  // Drop disaster/weather items unless they're also clearly geopolitics/conflict/cyber/defense.
  if (disasterHit && !primaryHit) return false
  // Otherwise require at least one allow keyword to avoid "anything goes" RSS noise.
  return allowHit
}

function domainFavicon(url) {
  try {
    const u = new URL(url)
    const host = u.hostname
    if (!host) return null
    // Small, stable thumbnails without fetching article pages.
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`
  } catch {
    return null
  }
}

function pickThumbnailFromItem(item) {
  if (!item || typeof item !== 'object') return null
  const encUrl = item.enclosure?.url
  if (typeof encUrl === 'string' && encUrl.startsWith('http')) return encUrl

  // Common RSS media extensions
  const mediaThumb = item['media:thumbnail']?.$.url || item['media:thumbnail']?.url
  if (typeof mediaThumb === 'string' && mediaThumb.startsWith('http')) return mediaThumb
  const mediaContent = item['media:content']?.$.url || item['media:content']?.url
  if (typeof mediaContent === 'string' && mediaContent.startsWith('http')) return mediaContent
  const itunesImg = item['itunes:image']?.href || item['itunes:image']?.url
  if (typeof itunesImg === 'string' && itunesImg.startsWith('http')) return itunesImg

  // Fallback: parse first image from HTML content
  const html = String(item.content || item['content:encoded'] || '').trim()
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (m && m[1] && String(m[1]).startsWith('http')) return m[1]
  return null
}

// RSS feeds (with parser)
const FEEDS = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World' },
  { url: 'https://news.google.com/rss', name: 'Google News' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', name: 'NYT World' },
  { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR' },
  { url: 'https://www.theguardian.com/world/rss', name: 'The Guardian' },
  { url: 'https://feeds.bbci.co.uk/news/rss.xml', name: 'BBC' },
  // Higher-signal geopolitics / security sources
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera' },
  { url: 'https://rss.politico.com/defense.xml', name: 'POLITICO Defense' },
  { url: 'https://rss.politico.com/politics-news.xml', name: 'POLITICO Politics' },
  { url: 'https://www.foreignaffairs.com/rss.xml', name: 'Foreign Affairs' },
]

async function fetchFeed(feed) {
  try {
    const result = await parser.parseURL(feed.url)
    const rows = (result.items || []).map((item) => ({
      title: item.title || '',
      link: item.link || item.guid || '',
      pubDate: item.pubDate || '',
      source: feed.name,
      contentSnippet: (item.contentSnippet || item.content || '').replace(/<[^>]+>/g, ' ').slice(0, 500),
      thumbnail: pickThumbnailFromItem(item) || domainFavicon(item.link || item.guid || ''),
    }))
    if (feed.name === 'Google News') {
      return rows.filter(isRelevantGoogleNewsItem)
    }
    return rows.filter((r) => !isGloballyDeniedItem(r))
  } catch (err) {
    console.warn(`[news] Failed to fetch ${feed.name}:`, err.message)
    return []
  }
}

/** Wikipedia featured content – no API key, stable JSON. See https://api.wikimedia.org/wiki/Feed_API */
async function fetchWikipediaFeatured() {
  const items = []
  const d = new Date()
  const dates = [
    [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')],
    [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate() - 1).padStart(2, '0')],
  ]
  for (const [y, m, day] of dates) {
    try {
      const url = `https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${y}/${m}/${day}`
      const res = await axios.get(url, { timeout: 8000, headers: REQUEST_HEADERS })
      const data = res.data || {}
      if (data.tfa && data.tfa.title) {
        const title = (data.tfa.titles && data.tfa.titles.display) || String(data.tfa.title).replace(/_/g, ' ')
        const row = {
          title: `Featured: ${title}`,
          link: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(data.tfa.title).replace(/ /g, '_'))}`,
          pubDate: new Date().toISOString(),
          source: 'Wikipedia',
          contentSnippet: (data.tfa.extract || '').slice(0, 500),
          thumbnail: data.tfa.thumbnail?.source || null,
        }
        if (isRelevantWikiItem(row)) items.push(row)
      }
      const list = Array.isArray(data.mostread?.articles) ? data.mostread.articles : []
      list.slice(0, 10).forEach((a) => {
        const title = (a.title && a.title.replace(/_/g, ' ')) || a.title || ''
        if (!title) return
        const link = a.url ? `https://en.wikipedia.org${a.url}` : `https://en.wikipedia.org/wiki/${encodeURIComponent(String(a.title || '').replace(/ /g, '_'))}`
        const row = {
          title,
          link,
          pubDate: new Date().toISOString(),
          source: 'Wikipedia',
          contentSnippet: (a.extract || '').slice(0, 500),
          thumbnail: a.thumbnail?.source || null,
        }
        if (isRelevantWikiItem(row)) items.push(row)
      })
      if (items.length > 0) break
    } catch (err) {
      if (items.length === 0) console.warn('[news] Wikipedia featured:', err.message)
    }
  }
  return items
}

/** Reddit /r/worldnews and /r/news – no API key, JSON. Reddit requires User-Agent. Throttled to avoid 429. */
let redditCache = { items: [], okAt: 0, cooldownUntil: 0 }
async function fetchRedditNews() {
  // Avoid hammering Reddit; it rate-limits aggressively (429/403). Prefer stale data over none.
  const REDDIT_TTL_MS = 30 * 60 * 1000
  if (redditCache.okAt && Date.now() - redditCache.okAt < REDDIT_TTL_MS) {
    return Array.isArray(redditCache.items) ? redditCache.items : []
  }
  if (Date.now() < (redditCache.cooldownUntil || 0)) {
    return Array.isArray(redditCache.items) ? redditCache.items : []
  }
  const items = []
  const subs = [
    { url: 'https://www.reddit.com/r/worldnews.json', name: 'Reddit r/worldnews' },
    { url: 'https://www.reddit.com/r/news.json', name: 'Reddit r/news' },
  ]

  // Public proxy first (avoids direct Reddit 429 for many networks).
  // Shape: { items: [{ title, link, isoDate, ... }] }
  const proxyBases = [
    'https://reddit-rss-api.deno.dev',
  ]
  for (const sub of subs) {
    const subName = sub.url.includes('/r/worldnews') ? 'worldnews' : (sub.url.includes('/r/news') ? 'news' : '')
    if (!subName) continue
    for (const base of proxyBases) {
      try {
        const res = await axios.get(`${base}/r/${subName}`, { timeout: 8000, headers: REQUEST_HEADERS, validateStatus: (s) => s === 200 })
        const arr = Array.isArray(res.data?.items) ? res.data.items : []
        if (arr.length) {
          items.push(...arr.slice(0, 15).map((it) => ({
            title: it.title || '',
            link: it.link || '',
            pubDate: it.isoDate || it.pubDate || '',
            source: `Reddit r/${subName} (proxy)`,
            contentSnippet: '',
            thumbnail: domainFavicon(it.link || ''),
          })))
          break
        }
      } catch (_) {
        // Try next proxy/base.
      }
    }
  }

  if (items.length > 0) {
    redditCache.items = items
    redditCache.okAt = Date.now()
    return items
  }

  for (let i = 0; i < subs.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500))
    const sub = subs[i]
    try {
      const res = await axios.get(sub.url, {
        timeout: 8000,
        headers: REQUEST_HEADERS,
        maxRedirects: 3,
        validateStatus: (s) => s === 200,
      })
      const children = res.data?.data?.children || []
      children.slice(0, 15).forEach((p) => {
        const d = p.data
        if (d && d.title && (d.url || d.permalink)) {
          items.push({
            title: d.title,
            link: d.url || `https://www.reddit.com${d.permalink || ''}`,
            pubDate: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : new Date().toISOString(),
            source: sub.name,
            contentSnippet: (d.selftext || '').slice(0, 500),
            thumbnail: null,
          })
        }
      })
    } catch (err) {
      const status = err?.response?.status
      if (status === 429 || status === 403) {
        console.warn(`[news] ${sub.name} JSON blocked (${status}) – trying RSS fallback`)
        try {
          const rssUrl = sub.url.replace(/\.json$/i, '/.rss')
          const result = await parser.parseURL(rssUrl)
          const rssItems = (result.items || []).slice(0, 15).map((item) => ({
            title: item.title || '',
            link: item.link || item.guid || '',
            pubDate: item.pubDate || '',
            source: `${sub.name} (RSS)`,
            contentSnippet: (item.contentSnippet || item.content || '').replace(/<[^>]+>/g, ' ').slice(0, 500),
            thumbnail: item.enclosure?.url || null,
          }))
          items.push(...rssItems)
        } catch (rssErr) {
          console.warn(`[news] ${sub.name} RSS fallback failed:`, rssErr?.message || rssErr)
        }
        // Back off aggressively; serve last-known-good Reddit items if any.
        redditCache.cooldownUntil = Date.now() + 10 * 60 * 1000
      } else {
        console.warn(`[news] ${sub.name}:`, err.message)
      }
    }
  }
  if (items.length > 0) {
    redditCache.items = items
    redditCache.okAt = Date.now()
  }
  return items.length > 0 ? items : (Array.isArray(redditCache.items) ? redditCache.items : [])
}

let cachedNews = null

async function getNews() {
  const [rssResults, redditItems] = await Promise.all([
    Promise.allSettled(FEEDS.map(fetchFeed)),
    fetchRedditNews(),
  ])
  let items = rssResults
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
  items = items.concat(redditItems)
  // Keep feed diversity: cap per-source and reserve a few newest items per source
  // so prolific feeds don't crowd out everything else.
  const PER_SOURCE_CAP = 25
  const PER_SOURCE_RESERVE = 6
  const bySource = new Map()
  for (const it of items) {
    const src = String(it?.source || '—')
    const list = bySource.get(src) || []
    if (list.length < PER_SOURCE_CAP) list.push(it)
    bySource.set(src, list)
  }
  const reserved = []
  const reservedKeys = new Set()
  for (const [, list] of bySource) {
    const sorted = [...list].sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    for (const it of sorted.slice(0, PER_SOURCE_RESERVE)) {
      const k = `${it.source}|${it.link || ''}|${it.title || ''}|${it.pubDate || ''}`
      if (reservedKeys.has(k)) continue
      reservedKeys.add(k)
      reserved.push(it)
    }
  }
  const pool = Array.from(bySource.values()).flat().filter((it) => {
    const k = `${it.source}|${it.link || ''}|${it.title || ''}|${it.pubDate || ''}`
    return !reservedKeys.has(k)
  })
  pool.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
  items = reserved.concat(pool).slice(0, 120)

  let geotagged = items
  try {
    const tagged = await Promise.race([
      geotagArticles(items),
      new Promise((_, reject) => setTimeout(() => reject(new Error('geotag_timeout')), 10000)),
    ])
    geotagged = tagged
  } catch (err) {
    if (err.message !== 'geotag_timeout') console.warn('[news] Geotag skipped:', err.message)
  }

  const events = []
  for (const item of geotagged) {
    const event = normalizeToEvent(
      {
        ...item,
        coordinates: item.coordinates,
        lat: item.coordinates?.[1],
        lon: item.coordinates?.[0],
      },
      'news',
      item.source
    )
    if (event.lat == null && event.lon == null && item.coordinates?.length >= 2) {
      event.lon = item.coordinates[0]
      event.lat = item.coordinates[1]
    }
    ingestEvent(event)
    events.push(event)
  }

  const features = events.map(eventToFeature)
  const result = { type: 'FeatureCollection', features }
  cachedNews = result
  return result
}

function getNewsCached() {
  return cachedNews
}

module.exports = { getNews, getNewsCached }
