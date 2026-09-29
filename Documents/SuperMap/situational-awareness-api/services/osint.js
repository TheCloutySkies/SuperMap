/**
 * OSINT ingestion: Bellingcat, CISA, DW.
 * Each fetcher normalizes to unified event schema and ingests with source-specific tags.
 * Scheduled at different intervals; GET /api/osint returns from DB.
 */

const Parser = require('rss-parser')
const axios = require('axios')
const { normalizeToEvent, ingestEvent, eventToFeature } = require('./ingest')
const { getEvents } = require('../database')
const { geotagArticle } = require('./geotagger')

/** Browser-like UA — GDACS and similar CDNs often 406 bare bot agents. */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const REQUEST_HEADERS = {
  'User-Agent': BROWSER_UA,
  Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}
const parser = new Parser({
  timeout: 12000,
  headers: REQUEST_HEADERS,
  customFields: {
    item: [
      ['media:thumbnail', 'mediaThumbnail'],
      ['media:content', 'mediaContent'],
      ['media:group', 'mediaGroup'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
})

/** Pick image from RSS enclosure / media / content HTML. */
function pickImageFromRssItem(item) {
  if (!item || typeof item !== 'object') return null
  const enc = item.enclosure || item.enclosures
  if (enc) {
    const list = Array.isArray(enc) ? enc : [enc]
    for (const e of list) {
      const url = e.url || (e.$ && e.$.url)
      const type = (e.type || (e.$ && e.$.type) || '').toLowerCase()
      if (url && /^https?:\/\//i.test(url) && (type.startsWith('image/') || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url))) {
        return url
      }
    }
  }
  const mediaThumb = item.mediaThumbnail?.$?.url || item.mediaThumbnail?.url || item['media:thumbnail']?.$?.url || item['media:thumbnail']?.url
  if (typeof mediaThumb === 'string' && mediaThumb.startsWith('http')) return mediaThumb
  const mediaGroup = item.mediaGroup || item['media:group']
  if (mediaGroup) {
    const t = mediaGroup['media:thumbnail']?.$?.url || mediaGroup['media:thumbnail']?.url
      || (Array.isArray(mediaGroup['media:thumbnail']) && (mediaGroup['media:thumbnail'][0]?.$?.url || mediaGroup['media:thumbnail'][0]?.url))
    if (typeof t === 'string' && t.startsWith('http')) return t
  }
  const mediaContent = item.mediaContent?.$?.url || item.mediaContent?.url || item['media:content']?.$?.url || item['media:content']?.url
  const mcType = (item.mediaContent?.$?.type || item.mediaContent?.type || item['media:content']?.$?.type || '').toLowerCase()
  if (typeof mediaContent === 'string' && mediaContent.startsWith('http') && (mcType.startsWith('image/') || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(mediaContent))) {
    return mediaContent
  }
  const html = String(item.contentEncoded || item.content || item.description || '').trim()
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (m && m[1] && String(m[1]).startsWith('http')) return m[1]
  return null
}

/** Budgeted og:image fetch when RSS has no image. Short timeout; skip failures. */
const OG_IMAGE_TIMEOUT_MS = 2500
let ogImageBudget = 12

async function fetchOgImage(pageUrl) {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl) || ogImageBudget <= 0) return null
  ogImageBudget -= 1
  try {
    const res = await axios.get(pageUrl, {
      timeout: OG_IMAGE_TIMEOUT_MS,
      headers: { ...REQUEST_HEADERS, Accept: 'text/html,application/xhtml+xml' },
      maxRedirects: 3,
      responseType: 'text',
      validateStatus: (s) => s >= 200 && s < 400,
    })
    const html = typeof res.data === 'string' ? res.data.slice(0, 120000) : ''
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    const url = m && m[1] ? m[1].trim() : null
    if (url && /^https?:\/\//i.test(url)) return url
  } catch (_) {
    /* skip */
  }
  return null
}

async function enrichItemImage(item) {
  let image = pickImageFromRssItem(item)
  if (!image && item.link) {
    image = await fetchOgImage(item.link)
  }
  if (image) {
    item.thumbnail = image
    item.image = image
  }
  return item
}

function resetOgImageBudget() {
  ogImageBudget = 12
}

// --- Bellingcat (investigations) ---
const BELLINGCAT_FEED = 'https://www.bellingcat.com/feed/'

async function fetchBellingcat() {
  try {
    const feed = await parser.parseURL(BELLINGCAT_FEED)
    const items = []
    for (const raw of feed.items || []) {
      const item = await enrichItemImage({
        source: 'bellingcat',
        type: 'investigation',
        title: raw.title || '',
        link: raw.link || raw.guid || '',
        pubDate: raw.pubDate || '',
        contentSnippet: (raw.contentSnippet || (raw.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
        enclosure: raw.enclosure,
        enclosures: raw.enclosures,
        mediaThumbnail: raw.mediaThumbnail,
        mediaContent: raw.mediaContent,
        mediaGroup: raw.mediaGroup,
        contentEncoded: raw.contentEncoded,
        content: raw.content,
        description: raw.description,
      })
      items.push(item)
    }
    for (const item of items) {
      const tagged = await geotagArticle({ ...item })
      const event = normalizeToEvent(
        { ...tagged, coordinates: tagged.coordinates, lat: tagged.coordinates?.[1], lon: tagged.coordinates?.[0], country: tagged.country, confidence: tagged.confidence },
        'conflict',
        'bellingcat'
      )
      ingestEvent(event, { extraTags: ['osint', 'investigation', 'analysis'] })
    }
    return items.length
  } catch (err) {
    console.warn('[osint] Bellingcat:', err.message)
    return 0
  }
}

// --- CISA (cyber advisories RSS + Known Exploited Vulnerabilities JSON) ---
const CISA_ADVISORIES_RSS = 'https://www.cisa.gov/cybersecurity-advisories/all.xml'
const CISA_KEV_JSON = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'

async function fetchCISAAdvisories() {
  try {
    const feed = await parser.parseURL(CISA_ADVISORIES_RSS)
    const items = []
    for (const raw of feed.items || []) {
      items.push(await enrichItemImage({
        source: 'cisa',
        type: 'advisory',
        title: raw.title || '',
        link: raw.link || raw.guid || '',
        pubDate: raw.pubDate || '',
        contentSnippet: (raw.contentSnippet || (raw.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
        enclosure: raw.enclosure,
        enclosures: raw.enclosures,
        mediaThumbnail: raw.mediaThumbnail,
        mediaContent: raw.mediaContent,
        mediaGroup: raw.mediaGroup,
        contentEncoded: raw.contentEncoded,
        content: raw.content,
        description: raw.description,
      }))
    }
    for (const item of items) {
      const event = normalizeToEvent({ ...item, country: 'US', confidence: 'high' }, 'infrastructure', 'cisa')
      ingestEvent(event, { extraTags: ['cybersecurity', 'infrastructure', 'vulnerability'] })
    }
    return items.length
  } catch (err) {
    console.warn('[osint] CISA advisories:', err.message)
    return 0
  }
}

async function fetchCISAKEV() {
  try {
    const res = await axios.get(CISA_KEV_JSON, { timeout: 15000, headers: REQUEST_HEADERS })
    const json = res.data || {}
    const vulns = json.vulnerabilities || []
    const crypto = require('crypto')
    for (const v of vulns) {
      const title = `${v.cveID || 'CVE'} – ${(v.vendorProject || '')} ${(v.product || '')}`.trim()
      const description = (v.shortDescription || '').slice(0, 500)
      const id = crypto.createHash('sha256').update(`cisa_kev|${v.cveID}|${v.vendorProject}|${v.product}`).digest('hex').slice(0, 32)
      const event = normalizeToEvent(
        {
          id,
          title,
          description,
          link: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog`,
          pubDate: v.dateAdded || v.dueDate,
          cveID: v.cveID,
          vendorProject: v.vendorProject,
          product: v.product,
          dueDate: v.dueDate,
          country: 'US',
          confidence: 'high',
        },
        'infrastructure',
        'cisa'
      )
      ingestEvent(event, { extraTags: ['cybersecurity', 'infrastructure', 'vulnerability'] })
    }
    return vulns.length
  } catch (err) {
    console.warn('[osint] CISA KEV:', err.message)
    return 0
  }
}

async function fetchCISA() {
  const [a, b] = await Promise.all([fetchCISAAdvisories(), fetchCISAKEV()])
  return a + b
}

// --- Deutsche Welle (international news) ---
const DW_FEED = 'https://rss.dw.com/xml/rss-en-all'

async function fetchDW() {
  try {
    const feed = await parser.parseURL(DW_FEED)
    const items = []
    for (const raw of feed.items || []) {
      items.push(await enrichItemImage({
        source: 'dw',
        title: raw.title || '',
        link: raw.link || raw.guid || '',
        pubDate: raw.pubDate || '',
        contentSnippet: (raw.contentSnippet || (raw.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
        enclosure: raw.enclosure,
        enclosures: raw.enclosures,
        mediaThumbnail: raw.mediaThumbnail,
        mediaContent: raw.mediaContent,
        mediaGroup: raw.mediaGroup,
        contentEncoded: raw.contentEncoded,
        content: raw.content,
        description: raw.description,
      }))
    }
    for (const item of items) {
      const tagged = await geotagArticle({ ...item })
      const event = normalizeToEvent(
        { ...tagged, coordinates: tagged.coordinates, lat: tagged.coordinates?.[1], lon: tagged.coordinates?.[0], country: tagged.country, confidence: tagged.confidence },
        'news',
        'dw'
      )
      ingestEvent(event, { extraTags: ['news', 'geopolitics'] })
    }
    return items.length
  } catch (err) {
    console.warn('[osint] DW:', err.message)
    return 0
  }
}

// --- Institute for the Study of War ---
const ISW_FEED = 'https://www.understandingwar.org/feed'
async function fetchISW() {
  try {
    const feed = await parser.parseURL(ISW_FEED)
    const items = await mapFeedItemsWithImages(feed, 'isw', 'analysis')
    for (const item of items) {
      const tagged = await geotagArticle({ ...item })
      const event = normalizeToEvent(
        { ...tagged, coordinates: tagged.coordinates, lat: tagged.coordinates?.[1], lon: tagged.coordinates?.[0], country: tagged.country, confidence: tagged.confidence },
        'conflict',
        'isw'
      )
      ingestEvent(event, { extraTags: ['osint', 'conflict', 'analysis'] })
    }
    return items.length
  } catch (err) {
    console.warn('[osint] ISW:', err.message)
    return 0
  }
}

// --- Defense One ---
const DEFENSEONE_FEED = 'https://www.defenseone.com/rss/all/'
async function fetchDefenseOne() {
  try {
    const feed = await parser.parseURL(DEFENSEONE_FEED)
    const items = await mapFeedItemsWithImages(feed, 'defenseone', 'news')
    for (const item of items) {
      const tagged = await geotagArticle({ ...item })
      const event = normalizeToEvent(
        { ...tagged, coordinates: tagged.coordinates, lat: tagged.coordinates?.[1], lon: tagged.coordinates?.[0], country: tagged.country, confidence: tagged.confidence },
        'conflict',
        'defenseone'
      )
      ingestEvent(event, { extraTags: ['osint', 'defense', 'policy'] })
    }
    return items.length
  } catch (err) {
    console.warn('[osint] Defense One:', err.message)
    return 0
  }
}

// --- War on the Rocks ---
const WARONTHEROCKS_FEED = 'https://warontherocks.com/feed/'
async function fetchWarOnTheRocks() {
  try {
    const feed = await parser.parseURL(WARONTHEROCKS_FEED)
    const items = await mapFeedItemsWithImages(feed, 'warontherocks', 'analysis')
    for (const item of items) {
      const tagged = await geotagArticle({ ...item })
      const event = normalizeToEvent(
        { ...tagged, coordinates: tagged.coordinates, lat: tagged.coordinates?.[1], lon: tagged.coordinates?.[0], country: tagged.country, confidence: tagged.confidence },
        'conflict',
        'warontherocks'
      )
      ingestEvent(event, { extraTags: ['osint', 'defense', 'analysis'] })
    }
    return items.length
  } catch (err) {
    console.warn('[osint] War on the Rocks:', err.message)
    return 0
  }
}

// --- Defense News ---
const DEFENSENEWS_FEED = 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml'
async function fetchDefenseNews() {
  try {
    const feed = await parser.parseURL(DEFENSENEWS_FEED)
    const items = await mapFeedItemsWithImages(feed, 'defensenews', 'news')
    for (const item of items) {
      const tagged = await geotagArticle({ ...item })
      const event = normalizeToEvent(
        { ...tagged, coordinates: tagged.coordinates, lat: tagged.coordinates?.[1], lon: tagged.coordinates?.[0], country: tagged.country, confidence: tagged.confidence },
        'conflict',
        'defensenews'
      )
      ingestEvent(event, { extraTags: ['osint', 'defense', 'industry'] })
    }
    return items.length
  } catch (err) {
    console.warn('[osint] Defense News:', err.message)
    return 0
  }
}

// --- The War Zone (The Drive) ---
const THEWARZONE_FEED = 'https://www.thedrive.com/the-war-zone/feed'
async function fetchTheWarZone() {
  try {
    const feed = await parser.parseURL(THEWARZONE_FEED)
    const items = await mapFeedItemsWithImages(feed, 'thewarzone', 'news')
    for (const item of items) {
      const tagged = await geotagArticle({ ...item })
      const event = normalizeToEvent(
        { ...tagged, coordinates: tagged.coordinates, lat: tagged.coordinates?.[1], lon: tagged.coordinates?.[0], country: tagged.country, confidence: tagged.confidence },
        'conflict',
        'thewarzone'
      )
      ingestEvent(event, { extraTags: ['osint', 'defense', 'military'] })
    }
    return items.length
  } catch (err) {
    console.warn('[osint] The War Zone:', err.message)
    return 0
  }
}

/**
 * Shared RSS → geotag → ingest helper for additional free no-key feeds.
 * Uses axios + browser UA first (GDACS 406 resilience); never throws — returns 0.
 */
async function ingestRssSource({ url, source, eventType = 'conflict', tags = ['osint'], label = source }) {
  try {
    let feed
    try {
      const res = await axios.get(url, {
        timeout: 12000,
        headers: REQUEST_HEADERS,
        responseType: 'text',
        decompress: true,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 406,
      })
      if (res.status === 406 && (!res.data || String(res.data).length < 40)) {
        throw new Error('HTTP 406')
      }
      const body = typeof res.data === 'string' ? res.data : String(res.data || '')
      feed = await parser.parseString(body)
    } catch (_) {
      feed = await parser.parseURL(url)
    }
    const items = []
    for (const raw of feed.items || []) {
      items.push(await enrichItemImage({
        source,
        title: raw.title || '',
        link: raw.link || raw.guid || '',
        pubDate: raw.pubDate || '',
        contentSnippet: (raw.contentSnippet || (raw.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
        enclosure: raw.enclosure,
        enclosures: raw.enclosures,
        mediaThumbnail: raw.mediaThumbnail,
        mediaContent: raw.mediaContent,
        mediaGroup: raw.mediaGroup,
        contentEncoded: raw.contentEncoded,
        content: raw.content,
        description: raw.description,
      }))
    }
    for (const item of items) {
      const tagged = await geotagArticle({ ...item })
      const event = normalizeToEvent(
        {
          ...tagged,
          coordinates: tagged.coordinates,
          lat: tagged.coordinates?.[1],
          lon: tagged.coordinates?.[0],
          country: tagged.country,
          confidence: tagged.confidence,
        },
        eventType,
        source
      )
      ingestEvent(event, { extraTags: tags })
    }
    return items.length
  } catch (err) {
    console.warn(`[osint] ${label}:`, err.message)
    return 0
  }
}

/** Map RSS feed items → OSINT rows with image enrichment (for dedicated fetchers). */
async function mapFeedItemsWithImages(feed, source, type = null) {
  const items = []
  for (const raw of feed.items || []) {
    const row = {
      source,
      title: raw.title || '',
      link: raw.link || raw.guid || '',
      pubDate: raw.pubDate || '',
      contentSnippet: (raw.contentSnippet || (raw.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
      enclosure: raw.enclosure,
      enclosures: raw.enclosures,
      mediaThumbnail: raw.mediaThumbnail,
      mediaContent: raw.mediaContent,
      mediaGroup: raw.mediaGroup,
      contentEncoded: raw.contentEncoded,
      content: raw.content,
      description: raw.description,
    }
    if (type) row.type = type
    items.push(await enrichItemImage(row))
  }
  return items
}

async function fetchWHO() {
  return ingestRssSource({
    url: 'https://www.who.int/rss-feeds/news-english.xml',
    source: 'who',
    eventType: 'disaster',
    tags: ['osint', 'health', 'outbreak'],
    label: 'WHO',
  })
}

async function fetchBreakingDefense() {
  return ingestRssSource({
    url: 'https://breakingdefense.com/feed/',
    source: 'breakingdefense',
    eventType: 'conflict',
    tags: ['osint', 'defense', 'policy'],
    label: 'Breaking Defense',
  })
}

async function fetchDefenseScoop() {
  return ingestRssSource({
    url: 'https://www.defensescoop.com/feed/',
    source: 'defensescoop',
    eventType: 'conflict',
    tags: ['osint', 'defense', 'tech'],
    label: 'DefenseScoop',
  })
}

async function fetchStimson() {
  return ingestRssSource({
    url: 'https://www.stimson.org/feed/',
    source: 'stimson',
    eventType: 'conflict',
    tags: ['osint', 'policy', 'analysis'],
    label: 'Stimson',
  })
}

async function fetchGdacsRss() {
  return ingestRssSource({
    url: 'https://www.gdacs.org/xml/rss.xml',
    source: 'gdacs-rss',
    eventType: 'disaster',
    tags: ['osint', 'disaster', 'alert'],
    label: 'GDACS RSS',
  })
}

async function fetchVolcanoRss() {
  return ingestRssSource({
    url: 'https://volcano.si.edu/news/WeeklyVolcanoRSS.xml',
    source: 'smithsonian-volcano',
    eventType: 'disaster',
    tags: ['osint', 'volcano', 'hazard'],
    label: 'Smithsonian Volcano',
  })
}

async function fetchPtwcTsunami() {
  // Atom feed from NWS National Tsunami Warning Center
  return ingestRssSource({
    url: 'https://www.tsunami.gov/events/xml/PAAQAtom.xml',
    source: 'ptwc',
    eventType: 'disaster',
    tags: ['osint', 'tsunami', 'hazard'],
    label: 'PTWC Tsunami',
  })
}

async function fetchNhcOsint() {
  // Ingest NHC basins as OSINT text events; map layer uses hazards.getNhcTropical for coords
  const basins = [
    { url: 'https://www.nhc.noaa.gov/index-at.xml', name: 'NHC Atlantic' },
    { url: 'https://www.nhc.noaa.gov/index-ep.xml', name: 'NHC East Pacific' },
    { url: 'https://www.nhc.noaa.gov/index-cp.xml', name: 'NHC Central Pacific' },
  ]
  let total = 0
  for (const b of basins) {
    total += await ingestRssSource({
      url: b.url,
      source: 'nhc',
      eventType: 'disaster',
      tags: ['osint', 'hurricane', 'tropical', 'hazard'],
      label: b.name,
    })
  }
  return total
}

// --- Unified OSINT API: return from DB (scheduled jobs populate it) ---
const OSINT_SOURCES = [
  'bellingcat',
  'cisa',
  'dw',
  'isw',
  'defenseone',
  'warontherocks',
  'defensenews',
  'thewarzone',
  'who',
  'breakingdefense',
  'defensescoop',
  'stimson',
  'gdacs-rss',
  'smithsonian-volcano',
  'ptwc',
  'nhc',
]

function getOsintFromDb(limit = 100) {
  const rows = getEvents(limit, null, null, null, null, OSINT_SOURCES)
  const features = rows.map((row) => eventToFeature(row))
  const result = { type: 'FeatureCollection', features }
  if (features.length > 0) {
    try {
      const apiResultCache = require('./apiResultCache')
      apiResultCache.set('osint', 'feature-collection', { payload: result, fetchedAt: Date.now() }, apiResultCache.TTL.DAILY)
    } catch (_) { /* optional */ }
  }
  return result
}

/** Last-good OSINT FeatureCollection from disk (when DB is empty on cold start). */
function getOsintLastGood(limit = 100) {
  const live = getOsintFromDb(limit)
  if (live.features?.length) return live
  try {
    const apiResultCache = require('./apiResultCache')
    const hit = apiResultCache.getStale('osint', 'feature-collection', apiResultCache.TTL.WEEKLY)
    if (hit?.value?.payload?.features?.length) {
      const feats = hit.value.payload.features.slice(0, limit)
      return { type: 'FeatureCollection', features: feats, _fromDisk: true }
    }
  } catch (_) { /* optional */ }
  return live
}

async function fetchAllOsint() {
  resetOgImageBudget()
  const [
    b, c, d, i, o, w, n, z,
    who, bd, ds, st, gd, vo, pt, nhc,
  ] = await Promise.all([
    fetchBellingcat(),
    fetchCISA(),
    fetchDW(),
    fetchISW(),
    fetchDefenseOne(),
    fetchWarOnTheRocks(),
    fetchDefenseNews(),
    fetchTheWarZone(),
    fetchWHO(),
    fetchBreakingDefense(),
    fetchDefenseScoop(),
    fetchStimson(),
    fetchGdacsRss(),
    fetchVolcanoRss(),
    fetchPtwcTsunami(),
    fetchNhcOsint(),
  ])
  return {
    bellingcat: b,
    cisa: c,
    dw: d,
    isw: i,
    defenseone: o,
    warontherocks: w,
    defensenews: n,
    thewarzone: z,
    who,
    breakingdefense: bd,
    defensescoop: ds,
    stimson: st,
    gdacsRss: gd,
    volcanoRss: vo,
    ptwc: pt,
    nhc,
  }
}

module.exports = {
  fetchBellingcat,
  fetchCISA,
  fetchCISAAdvisories,
  fetchCISAKEV,
  fetchDW,
  fetchISW,
  fetchDefenseOne,
  fetchWarOnTheRocks,
  fetchDefenseNews,
  fetchTheWarZone,
  fetchWHO,
  fetchBreakingDefense,
  fetchDefenseScoop,
  fetchStimson,
  fetchGdacsRss,
  fetchVolcanoRss,
  fetchPtwcTsunami,
  fetchNhcOsint,
  fetchAllOsint,
  getOsintFromDb,
  getOsintLastGood,
  OSINT_SOURCES,
}
