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

const REQUEST_HEADERS = { 'User-Agent': 'SuperMap-OSINT/1.0 (https://github.com/supermap)' }
const parser = new Parser({ timeout: 12000, headers: REQUEST_HEADERS })

// --- Bellingcat (investigations) ---
const BELLINGCAT_FEED = 'https://www.bellingcat.com/feed/'

async function fetchBellingcat() {
  try {
    const feed = await parser.parseURL(BELLINGCAT_FEED)
    const items = (feed.items || []).map((item) => ({
      source: 'bellingcat',
      type: 'investigation',
      title: item.title || '',
      link: item.link || item.guid || '',
      pubDate: item.pubDate || '',
      contentSnippet: (item.contentSnippet || (item.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
    }))
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
    const items = (feed.items || []).map((item) => ({
      source: 'cisa',
      type: 'advisory',
      title: item.title || '',
      link: item.link || item.guid || '',
      pubDate: item.pubDate || '',
      contentSnippet: (item.contentSnippet || (item.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
    }))
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
    const items = (feed.items || []).map((item) => ({
      source: 'dw',
      title: item.title || '',
      link: item.link || item.guid || '',
      pubDate: item.pubDate || '',
      contentSnippet: (item.contentSnippet || (item.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
    }))
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
    const items = (feed.items || []).map((item) => ({
      source: 'isw',
      type: 'analysis',
      title: item.title || '',
      link: item.link || item.guid || '',
      pubDate: item.pubDate || '',
      contentSnippet: (item.contentSnippet || (item.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
    }))
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
    const items = (feed.items || []).map((item) => ({
      source: 'defenseone',
      type: 'news',
      title: item.title || '',
      link: item.link || item.guid || '',
      pubDate: item.pubDate || '',
      contentSnippet: (item.contentSnippet || (item.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
    }))
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
    const items = (feed.items || []).map((item) => ({
      source: 'warontherocks',
      type: 'analysis',
      title: item.title || '',
      link: item.link || item.guid || '',
      pubDate: item.pubDate || '',
      contentSnippet: (item.contentSnippet || (item.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
    }))
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
    const items = (feed.items || []).map((item) => ({
      source: 'defensenews',
      type: 'news',
      title: item.title || '',
      link: item.link || item.guid || '',
      pubDate: item.pubDate || '',
      contentSnippet: (item.contentSnippet || (item.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
    }))
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
    const items = (feed.items || []).map((item) => ({
      source: 'thewarzone',
      type: 'news',
      title: item.title || '',
      link: item.link || item.guid || '',
      pubDate: item.pubDate || '',
      contentSnippet: (item.contentSnippet || (item.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
    }))
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
 */
async function ingestRssSource({ url, source, eventType = 'conflict', tags = ['osint'], label = source }) {
  try {
    const feed = await parser.parseURL(url)
    const items = (feed.items || []).map((item) => ({
      source,
      title: item.title || '',
      link: item.link || item.guid || '',
      pubDate: item.pubDate || '',
      contentSnippet: (item.contentSnippet || (item.content || '').replace(/<[^>]+>/g, ' ')).slice(0, 500),
    }))
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
  return { type: 'FeatureCollection', features }
}

async function fetchAllOsint() {
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
  OSINT_SOURCES,
}
