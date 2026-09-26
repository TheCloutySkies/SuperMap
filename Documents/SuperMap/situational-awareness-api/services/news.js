const Parser = require('rss-parser')
const axios = require('axios')
const { geotagArticles } = require('./geotagger')
const { normalizeToEvent, ingestEvent, eventToFeature } = require('./ingest')
const { assessItemsBatch } = require('./riskScoring')

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

/** Heuristic category for RSS items (MediaStack provides its own). */
function inferCategory(title = '', snippet = '', source = '') {
  const text = `${title} ${snippet} ${source}`.toLowerCase()
  if (/\b(cyber|hack|ransomware|breach|malware|chip|semiconductor|ai|tech)\b/.test(text)) return 'technology'
  if (/\b(health|hospital|vaccine|disease|outbreak|who|pandemic|covid)\b/.test(text)) return 'health'
  if (/\b(market|stock|oil|gas|economy|inflation|bank|trade|sanction)\b/.test(text)) return 'business'
  if (/\b(climate|space|nasa|scientist|research|study)\b/.test(text)) return 'science'
  if (/\b(election|congress|parliament|president|diplomacy|nato|war|conflict|military|missile)\b/.test(text)) return 'general'
  return 'general'
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

/** Pick video URL from item: enclosure (type video), media:content video, or link if youtube/vimeo. */
function pickVideoUrlFromItem(item) {
  if (!item || typeof item !== 'object') return null
  const link = (item.link || item.guid || '').trim()
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(link)) return link
  const enc = item.enclosure || item.enclosures
  if (enc) {
    const list = Array.isArray(enc) ? enc : [enc]
    for (const e of list) {
      const url = e.url || (e.$ && e.$.url)
      const type = (e.type || (e.$ && e.$.type) || '').toLowerCase()
      if (type.startsWith('video/') || /video/.test(type)) return url
      if (url && /\.(mp4|webm|ogg)(\?|$)/i.test(url)) return url
    }
  }
  const mediaContent = item['media:content']
  const mcUrl = mediaContent?.$?.url || mediaContent?.url
  const mcType = (mediaContent?.$?.type || mediaContent?.type || '').toLowerCase()
  if (mcUrl && (mcType.startsWith('video/') || /video/.test(mcType))) return mcUrl
  return null
}

// RSS feeds (with parser) — only free, no-key sources that respond without auth
const FEEDS = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World' },
  { url: 'https://news.google.com/rss', name: 'Google News' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', name: 'NYT World' },
  { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR' },
  { url: 'https://www.theguardian.com/world/rss', name: 'The Guardian' },
  { url: 'https://feeds.bbci.co.uk/news/rss.xml', name: 'BBC' },
  // Higher-signal geopolitics / security sources
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera' },
  // POLITICO (rss.politico.com) removed: ENOTFOUND / DNS unreachable
  { url: 'https://www.foreignaffairs.com/rss.xml', name: 'Foreign Affairs' },
  { url: 'https://www.crisisgroup.org/rss', name: 'International Crisis Group' },
  // Additional free no-setup feeds (verified reachable)
  { url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', name: 'UN News' },
  { url: 'https://www.hrw.org/rss/news', name: 'Human Rights Watch' },
  { url: 'https://www.france24.com/en/rss', name: 'France 24' },
  { url: 'https://www.euronews.com/rss?format=mrss&level=vertical&name=news', name: 'Euronews' },
  { url: 'https://theintercept.com/feed/?rss', name: 'The Intercept' },
  { url: 'https://www.occrp.org/en/feed', name: 'OCCRP' },
  { url: 'https://www.atlanticcouncil.org/feed/', name: 'Atlantic Council' },
  // Reuters blocks direct RSS; Google News site: filter is free and stable
  { url: 'https://news.google.com/rss/search?q=site:reuters.com+when:2d&hl=en-US&gl=US&ceid=US:en', name: 'Reuters (Google News)' },
]

/** Video feeds: Reddit only for now. Set to [] so getVideoFeedItems() uses only getRedditVideoItems(). */
const VIDEO_FEEDS = []

async function parseFeedXml(xml) {
  return parser.parseString(xml)
}

async function fetchFeed(feed) {
  try {
    // Prefer axios so gzip / redirects (e.g. UN News) decompress cleanly for rss-parser.
    let result
    try {
      const res = await axios.get(feed.url, {
        timeout: 10000,
        headers: { ...REQUEST_HEADERS, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
        responseType: 'text',
        decompress: true,
      })
      const body = typeof res.data === 'string' ? res.data : String(res.data || '')
      result = await parseFeedXml(body)
    } catch (axiosErr) {
      result = await parser.parseURL(feed.url)
    }
    const rows = (result.items || []).map((item) => {
      const link = item.link || item.guid || ''
      const videoUrl = pickVideoUrlFromItem(item)
      const title = item.title || ''
      const contentSnippet = (item.contentSnippet || item.content || '').replace(/<[^>]+>/g, ' ').slice(0, 500)
      return {
        title,
        link,
        pubDate: item.pubDate || '',
        source: feed.name,
        contentSnippet,
        thumbnail: pickThumbnailFromItem(item) || domainFavicon(link || ''),
        videoUrl: videoUrl || undefined,
        category: inferCategory(title, contentSnippet, feed.name),
      }
    })
    if (feed.name === 'Google News' || feed.name.startsWith('Reuters')) {
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

let cachedNews = null

/** Merge MediaStack disk cache (publisher source + image). No MediaStack chip — use publisher name. */
function getMediaStackItems() {
  try {
    const mediastack = require('./mediastack')
    return mediastack.getCachedArticles() || []
  } catch (_) {
    return []
  }
}

async function getNews() {
  const rssResults = await Promise.allSettled(FEEDS.map(fetchFeed))
  let items = rssResults
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
  // MediaStack cache (filled only at 08:00 / 15:00 ET scheduled pulls)
  items = items.concat(getMediaStackItems())
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
  let assessments = []
  try {
    assessments = await assessItemsBatch(
      geotagged.map((item) => ({
        title: item.title,
        description: item.contentSnippet || item.content || '',
        source: item.source,
        score: item.score || item.ups,
      })),
      { preferAi: true, maxAiItems: 16 },
    )
  } catch (_) {
    assessments = []
  }

  for (let i = 0; i < geotagged.length; i++) {
    const item = geotagged[i]
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
    const extraTags = ['news']
    if (item.category) extraTags.push(`cat-${String(item.category).toLowerCase()}`)
    if (item.fromMediaStack) extraTags.push('mediastack')
    ingestEvent(event, {
      extraTags,
      assessment: assessments[i] || undefined,
    })
    events.push(event)
  }

  const features = events.map(eventToFeature)
  let mediastackMeta = { quotaExhausted: false, fetchedAt: null, articleCount: 0 }
  try {
    const mediastack = require('./mediastack')
    mediastackMeta = mediastack.getStatus()
  } catch (_) { /* optional */ }
  let keywordTags = []
  try {
    const kt = require('./keywordTags')
    keywordTags = kt.getKeywordTags()?.tags || []
  } catch (_) { /* optional */ }

  const result = {
    type: 'FeatureCollection',
    features,
    meta: {
      mediastack: {
        quotaExhausted: !!mediastackMeta.quotaExhausted,
        fetchedAt: mediastackMeta.fetchedAt || null,
        articleCount: mediastackMeta.articleCount || 0,
      },
      keywordTags,
    },
  }
  cachedNews = result
  return result
}

function getNewsCached() {
  return cachedNews
}

/** Reddit video subreddits. raw_json=1 gives unescaped preview image URLs for video-frame thumbnails. */
const REDDIT_VIDEO_SUBS = [
  { url: 'https://www.reddit.com/r/CombatFootage.json?raw_json=1&limit=50', name: 'Reddit r/CombatFootage' },
  { url: 'https://www.reddit.com/r/UkraineWarVideoReport.json?raw_json=1&limit=50', name: 'Reddit r/UkraineWarVideoReport' },
  { url: 'https://www.reddit.com/r/MilitaryGfys.json?raw_json=1&limit=25', name: 'Reddit r/MilitaryGfys' },
  { url: 'https://www.reddit.com/r/DestroyedTanks.json?raw_json=1&limit=25', name: 'Reddit r/DestroyedTanks' },
]

/** Pick best thumbnail for a Reddit video post: preview frame (preview.images[0]) then thumbnail URL. */
function redditVideoThumbnail(d, link) {
  const preview = d.preview
  if (preview && Array.isArray(preview.images) && preview.images.length > 0) {
    const img = preview.images[0]
    const source = img.source || (img.resolutions && img.resolutions[img.resolutions.length - 1])
    if (source && source.url) {
      let url = source.url
      if (typeof url === 'string' && (url.includes('&amp;') || url.includes('&quot;'))) {
        url = url.replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      }
      if (/^https?:\/\//i.test(url)) return url
    }
  }
  if (d.thumbnail && /^https?:\/\//i.test(d.thumbnail)) return d.thumbnail
  return domainFavicon(link)
}

async function getRedditVideoItems() {
  const items = []
  const seen = new Set()
  for (const sub of REDDIT_VIDEO_SUBS) {
    try {
      const res = await axios.get(sub.url, {
        timeout: 12000,
        headers: REQUEST_HEADERS,
        maxRedirects: 2,
        validateStatus: (s) => s === 200,
      })
      const children = res.data?.data?.children || []
      const limit = sub.limit || 25
      children.slice(0, limit).forEach((p) => {
        const d = p.data
        if (!d || !d.title || !d.is_video) return
        const fallback = d.secure_media?.reddit_video?.fallback_url
        if (!fallback) return
        const link = d.url || `https://www.reddit.com${d.permalink || ''}`
        const key = `${d.id || link}`
        if (seen.has(key)) return
        seen.add(key)
        items.push({
          title: d.title,
          link,
          pubDate: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : new Date().toISOString(),
          source: sub.name,
          contentSnippet: (d.selftext || '').slice(0, 300),
          thumbnail: redditVideoThumbnail(d, link),
          videoUrl: fallback,
        })
      })
    } catch (err) {
      console.warn('[news] Reddit video sub failed:', sub.name, err.message)
    }
  }
  return items.slice(0, 80)
}

/** Theme keywords for video filter: conflict, OSINT, defense, geopolitics. Only include items that match. */
const VIDEO_THEME_KEYWORDS = [
  'war', 'conflict', 'invasion', 'strike', 'drone', 'missile', 'military', 'defense', 'nato', 'frontline',
  'ukraine', 'russia', 'gaza', 'israel', 'iran', 'syria', 'yemen', 'taiwan', 'china', 'north korea',
  'osint', 'intel', 'combat', 'footage', 'shelling', 'airstrike', 'ceasefire', 'sanction', 'crisis',
  'geopolitic', 'analysis', 'investigation', 'bellingcat', 'refugee', 'humanitarian', 'weapon',
]
function isVideoThemeRelevant(title = '', source = '', description = '') {
  const text = `${title} ${source} ${description}`.toLowerCase()
  return VIDEO_THEME_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()))
}

/** Fetch video-only feeds; returns flat array of items with videoUrl, theme-filtered. */
async function getVideoFeedItems() {
  const videoFeedNames = new Set(VIDEO_FEEDS.map((f) => f.name))
  const [feedResults, redditVideos] = await Promise.all([
    Promise.allSettled(VIDEO_FEEDS.map(fetchFeed)),
    getRedditVideoItems(),
  ])
  const items = feedResults
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .map((it) => {
      if (!it.videoUrl && it.link && videoFeedNames.has(it.source)) it.videoUrl = it.link
      return it
    })
    .filter((it) => it.videoUrl || /youtube\.com|youtu\.be|vimeo\.com/i.test(it.link || ''))
    .filter((it) => isVideoThemeRelevant(it.title, it.source, it.contentSnippet))
  items.push(...redditVideos)
  return items.slice(0, 80)
}

module.exports = { getNews, getNewsCached, getVideoFeedItems, getRedditVideoItems, VIDEO_FEEDS, isVideoThemeRelevant }
