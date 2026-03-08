const Parser = require('rss-parser')
const axios = require('axios')
const { geotagArticles } = require('./geotagger')
const { normalizeToEvent, ingestEvent, eventToFeature } = require('./ingest')

const REQUEST_HEADERS = { 'User-Agent': 'SuperMap/1.0 (OSINT dashboard; https://github.com/supermap)' }
const parser = new Parser({ timeout: 8000, headers: REQUEST_HEADERS })

// RSS feeds (with parser)
const FEEDS = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World' },
  { url: 'https://news.google.com/rss', name: 'Google News' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', name: 'NYT World' },
  { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR' },
  { url: 'https://www.theguardian.com/world/rss', name: 'The Guardian' },
  { url: 'https://feeds.bbci.co.uk/news/rss.xml', name: 'BBC' },
]

async function fetchFeed(feed) {
  try {
    const result = await parser.parseURL(feed.url)
    return (result.items || []).map((item) => ({
      title: item.title || '',
      link: item.link || item.guid || '',
      pubDate: item.pubDate || '',
      source: feed.name,
      contentSnippet: (item.contentSnippet || item.content || '').replace(/<[^>]+>/g, ' ').slice(0, 500),
      thumbnail: item.enclosure?.url || (item.content && item.content.match(/src="([^"]+)"/)?.[1]) || null,
    }))
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
        items.push({
          title: `Featured: ${title}`,
          link: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(data.tfa.title).replace(/ /g, '_'))}`,
          pubDate: new Date().toISOString(),
          source: 'Wikipedia',
          contentSnippet: (data.tfa.extract || '').slice(0, 500),
          thumbnail: data.tfa.thumbnail?.source || null,
        })
      }
      const list = Array.isArray(data.mostread?.articles) ? data.mostread.articles : []
      list.slice(0, 10).forEach((a) => {
        const title = (a.title && a.title.replace(/_/g, ' ')) || a.title || ''
        if (!title) return
        const link = a.url ? `https://en.wikipedia.org${a.url}` : `https://en.wikipedia.org/wiki/${encodeURIComponent(String(a.title || '').replace(/ /g, '_'))}`
        items.push({
          title,
          link,
          pubDate: new Date().toISOString(),
          source: 'Wikipedia',
          contentSnippet: (a.extract || '').slice(0, 500),
          thumbnail: a.thumbnail?.source || null,
        })
      })
      if (items.length > 0) break
    } catch (err) {
      if (items.length === 0) console.warn('[news] Wikipedia featured:', err.message)
    }
  }
  return items
}

/** Reddit /r/worldnews and /r/news – no API key, JSON. Reddit requires User-Agent. Throttled to avoid 429. */
async function fetchRedditNews() {
  const items = []
  const subs = [
    { url: 'https://www.reddit.com/r/worldnews.json', name: 'Reddit r/worldnews' },
    { url: 'https://www.reddit.com/r/news.json', name: 'Reddit r/news' },
  ]
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
      if (err.response && err.response.status === 429) {
        console.warn('[news] Reddit rate limited (429) – skipping r/worldnews and r/news')
      } else {
        console.warn(`[news] ${sub.name}:`, err.message)
      }
    }
  }
  return items
}

let cachedNews = null

async function getNews() {
  const [rssResults, wikiItems, redditItems] = await Promise.all([
    Promise.allSettled(FEEDS.map(fetchFeed)),
    fetchWikipediaFeatured(),
    fetchRedditNews(),
  ])
  let items = rssResults
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
  items = items.concat(wikiItems).concat(redditItems)
  items.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
  items = items.slice(0, 120)

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
