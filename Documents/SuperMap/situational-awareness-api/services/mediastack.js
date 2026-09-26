/**
 * MediaStack live news fetcher with on-disk cache.
 * Pulls only when explicitly requested (scheduled 08:00 / 15:00 America/New_York).
 * On quota exhaustion: flag + keep last-good cache; do not spam retries.
 */

const fs = require('fs')
const path = require('path')
const axios = require('axios')

const CACHE_PATH = path.join(__dirname, '../data/mediastack-cache.json')
const API_URL = 'http://api.mediastack.com/v1/news'
const DEFAULT_LIMIT = 100

/** Hours (0–23) in America/New_York when a pull is allowed. */
const PULL_HOURS_ET = [8, 15]

let memoryCache = null
let pullInFlight = null

function emptyCache() {
  return {
    articles: [],
    fetchedAt: null,
    quotaExhausted: false,
    lastError: null,
    lastPullHourKey: null,
  }
}

function ensureDataDir() {
  const dir = path.dirname(CACHE_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function loadCacheFromDisk() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return emptyCache()
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
    return {
      articles: Array.isArray(raw.articles) ? raw.articles : [],
      fetchedAt: raw.fetchedAt || null,
      quotaExhausted: !!raw.quotaExhausted,
      lastError: raw.lastError || null,
      lastPullHourKey: raw.lastPullHourKey || null,
    }
  } catch (err) {
    console.warn('[mediastack] cache read failed:', err.message)
    return emptyCache()
  }
}

function saveCache(cache) {
  ensureDataDir()
  memoryCache = cache
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8')
  } catch (err) {
    console.warn('[mediastack] cache write failed:', err.message)
  }
}

function getCache() {
  if (!memoryCache) memoryCache = loadCacheFromDisk()
  return memoryCache
}

function getApiKey() {
  return (process.env.MEDIASTACK_API_KEY || '').trim()
}

/**
 * Current calendar hour key in America/New_York, e.g. "2026-09-26T08".
 */
function etHourKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type) => parts.find((p) => p.type === type)?.value
  const year = get('year')
  const month = get('month')
  const day = get('day')
  let hour = get('hour')
  // Some engines return "24" for midnight; normalize.
  if (hour === '24') hour = '00'
  return `${year}-${month}-${day}T${hour}`
}

function etHourNumber(date = new Date()) {
  const key = etHourKey(date)
  const hour = Number(key.slice(-2))
  return Number.isFinite(hour) ? hour : -1
}

/** True if current ET hour is a scheduled pull window and we have not pulled this hour. */
function isPullWindowDue(date = new Date()) {
  const hour = etHourNumber(date)
  if (!PULL_HOURS_ET.includes(hour)) return false
  const cache = getCache()
  const key = etHourKey(date)
  return cache.lastPullHourKey !== key
}

function mapArticle(raw) {
  if (!raw || typeof raw !== 'object') return null
  const title = String(raw.title || '').trim()
  const link = String(raw.url || '').trim()
  if (!title || !link) return null
  const publisher = String(raw.source || '').trim() || 'Unknown'
  const image = typeof raw.image === 'string' && raw.image.startsWith('http') ? raw.image : null
  return {
    title,
    link,
    pubDate: raw.published_at || new Date().toISOString(),
    source: publisher,
    contentSnippet: String(raw.description || '').replace(/<[^>]+>/g, ' ').slice(0, 500),
    thumbnail: image,
    image,
    category: raw.category || 'general',
    language: raw.language || 'en',
    country: raw.country || 'us',
    author: raw.author || null,
    fromMediaStack: true,
  }
}

function isQuotaError(err, body) {
  const code = body?.error?.code ?? err?.response?.data?.error?.code
  if (code === 104 || code === '104') return true
  const msg = String(body?.error?.info || body?.error?.message || err?.message || '').toLowerCase()
  return /usage.?limit|quota|rate.?limit|monthly/.test(msg)
}

/**
 * Fetch live news from MediaStack and persist cache.
 * Skips HTTP when quotaExhausted unless forceResetQuota.
 * @param {{ force?: boolean, forceResetQuota?: boolean, hourKey?: string }} opts
 */
async function pullMediaStack(opts = {}) {
  if (pullInFlight) return pullInFlight

  pullInFlight = (async () => {
    const cache = getCache()
    const key = getApiKey()
    if (!key) {
      console.warn('[mediastack] MEDIASTACK_API_KEY not set — serving disk cache only')
      return cache
    }

    if (cache.quotaExhausted && !opts.forceResetQuota) {
      return cache
    }

    try {
      const res = await axios.get(API_URL, {
        timeout: 20000,
        params: {
          access_key: key,
          countries: 'us',
          languages: 'en',
          // Prefer geopolitics / hard news over sports & celebrity noise
          categories: 'general,business,health,science,technology,-sports,-entertainment',
          limit: DEFAULT_LIMIT,
          sort: 'published_desc',
        },
        validateStatus: () => true,
      })

      const body = res.data || {}
      if (body.error || res.status >= 400) {
        if (isQuotaError(null, body) || res.status === 429) {
          const next = {
            ...cache,
            quotaExhausted: true,
            lastError: body.error?.info || body.error?.message || 'MediaStack quota exhausted',
            lastPullHourKey: opts.hourKey || etHourKey(),
          }
          saveCache(next)
          console.warn('[mediastack] quota exhausted — keeping last-good cache')
          return next
        }
        const next = {
          ...cache,
          lastError: body.error?.info || body.error?.message || `HTTP ${res.status}`,
          lastPullHourKey: opts.hourKey || etHourKey(),
        }
        saveCache(next)
        console.warn('[mediastack] pull failed:', next.lastError)
        return next
      }

      const articles = (Array.isArray(body.data) ? body.data : [])
        .map(mapArticle)
        .filter(Boolean)

      const next = {
        articles,
        fetchedAt: new Date().toISOString(),
        quotaExhausted: false,
        lastError: null,
        lastPullHourKey: opts.hourKey || etHourKey(),
      }
      saveCache(next)
      console.log('[mediastack] cached', articles.length, 'articles')
      return next
    } catch (err) {
      if (isQuotaError(err, err?.response?.data)) {
        const next = {
          ...cache,
          quotaExhausted: true,
          lastError: err.message,
          lastPullHourKey: opts.hourKey || etHourKey(),
        }
        saveCache(next)
        console.warn('[mediastack] quota exhausted (exception) — keeping last-good cache')
        return next
      }
      const next = {
        ...cache,
        lastError: err.message,
        lastPullHourKey: opts.hourKey || etHourKey(),
      }
      saveCache(next)
      console.warn('[mediastack] pull error:', err.message)
      return next
    } finally {
      pullInFlight = null
    }
  })()

  return pullInFlight
}

/** Run a pull only if we are in an 08:00 or 15:00 ET window and have not pulled this hour. */
async function maybeScheduledPull() {
  if (!isPullWindowDue()) return getCache()
  return pullMediaStack({ hourKey: etHourKey() })
}

function getCachedArticles() {
  return getCache().articles || []
}

function isQuotaExhausted() {
  return !!getCache().quotaExhausted
}

function getStatus() {
  const c = getCache()
  return {
    articleCount: (c.articles || []).length,
    fetchedAt: c.fetchedAt,
    quotaExhausted: !!c.quotaExhausted,
    lastError: c.lastError,
    lastPullHourKey: c.lastPullHourKey,
    pullHoursEt: PULL_HOURS_ET,
    hasApiKey: !!getApiKey(),
  }
}

/** Clear quota flag (e.g. new billing month) without forcing an immediate HTTP pull. */
function clearQuotaFlag() {
  const c = getCache()
  if (!c.quotaExhausted) return c
  const next = { ...c, quotaExhausted: false, lastError: null }
  saveCache(next)
  return next
}

module.exports = {
  pullMediaStack,
  maybeScheduledPull,
  getCachedArticles,
  getCache,
  isQuotaExhausted,
  getStatus,
  isPullWindowDue,
  etHourKey,
  etHourNumber,
  PULL_HOURS_ET,
  clearQuotaFlag,
  mapArticle,
}
