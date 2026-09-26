/**
 * Hourly keyword-count tags across news / OSINT / X / MediaStack titles.
 * Persisted to disk and injected into the threat-summary prompt.
 */

const fs = require('fs')
const path = require('path')

const CACHE_PATH = path.join(__dirname, '../data/keyword-tags.json')

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'as', 'by',
  'from', 'with', 'about', 'into', 'over', 'after', 'before', 'between', 'under',
  'is', 'are', 'was', 'were', 'be', 'been', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'he', 'she',
  'we', 'you', 'i', 'his', 'her', 'our', 'your', 'not', 'no', 'yes', 'so', 'if',
  'than', 'then', 'there', 'here', 'when', 'where', 'what', 'who', 'how', 'why',
  'which', 'while', 'also', 'just', 'more', 'most', 'some', 'any', 'all', 'each',
  'new', 'news', 'says', 'said', 'say', 'amid', 'via', 'per', 'vs', 'vs.',
  'update', 'live', 'breaking', 'latest', 'today', 'yesterday', 'week', 'year',
  'u.s', 'us', 'uk', 'eu',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'st', 'nd', 'rd', 'th', '1st', '2nd', '3rd', '25th', '26th',
  'image', 'photo', 'video', 'watch', 'read', 'report', 'reports', 'reported',
  'force', 'state', 'training', 'stock', 'stocks', 'shares',
])

/** Proper nouns / geopolitics worth keeping even if short. */
const KEEP = new Set([
  'iran', 'israel', 'gaza', 'ukraine', 'russia', 'china', 'taiwan', 'nato', 'hamas',
  'hezbollah', 'syria', 'yemen', 'iraq', 'korea', 'putin', 'trump', 'biden', 'xi',
  'cyber', 'nuclear', 'missile', 'drone', 'sanctions', 'ceasefire', 'invasion',
  'congress', 'pentagon', 'kremlin', 'idf', 'un', 'who', 'imf', 'opec',
])

let memory = null

function emptyState() {
  return { tags: [], updatedAt: null, titleCount: 0 }
}

function load() {
  if (memory) return memory
  try {
    if (!fs.existsSync(CACHE_PATH)) {
      memory = emptyState()
      return memory
    }
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
    memory = {
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      updatedAt: raw.updatedAt || null,
      titleCount: raw.titleCount || 0,
    }
    return memory
  } catch {
    memory = emptyState()
    return memory
  }
}

function save(state) {
  memory = state
  try {
    const dir = path.dirname(CACHE_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CACHE_PATH, JSON.stringify(state, null, 2), 'utf8')
  } catch (err) {
    console.warn('[keyword-tags] write failed:', err.message)
  }
}

function tokenizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)
}

function isSignificantToken(tok) {
  if (KEEP.has(tok)) return true
  if (STOP.has(tok)) return false
  if (tok.length < 3) return false
  if (/^\d+$/.test(tok)) return false
  return true
}

/**
 * Count how many distinct headlines contain each significant term.
 * @param {string[]} titles
 * @returns {{ term: string, count: number }[]}
 */
function countKeywords(titles) {
  const uniqueTitles = [...new Set(titles.map((t) => String(t || '').trim()).filter(Boolean))]
  const counts = new Map()

  for (const title of uniqueTitles) {
    const tokens = new Set(tokenizeTitle(title).filter(isSignificantToken))
    for (const tok of tokens) {
      counts.set(tok, (counts.get(tok) || 0) + 1)
    }
  }

  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .filter((t) => t.count >= 2)
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, 60)
}

function collectTitlesFromNewsCache(newsService) {
  const titles = []
  try {
    const cached = newsService.getNewsCached?.()
    const features = cached?.features || []
    for (const f of features) {
      const t = f?.properties?.title
      if (t) titles.push(t)
    }
  } catch (_) { /* optional */ }
  return titles
}

function collectTitlesFromOsint(osintService) {
  const titles = []
  try {
    const data = osintService.getOsintFromDb?.(200)
    const features = data?.features || []
    for (const f of features) {
      const t = f?.properties?.title
      if (t) titles.push(t)
    }
  } catch (_) { /* optional */ }
  return titles
}

function collectTitlesFromDbEvents() {
  const titles = []
  try {
    const { getEvents } = require('../database')
    const since = Date.now() - 48 * 60 * 60 * 1000
    // Recent news + OSINT + X-style rows already ingested
    const rows = getEvents(300, since, null, null)
    for (const row of rows || []) {
      if (row?.title) titles.push(String(row.title).slice(0, 400))
    }
  } catch (_) { /* optional */ }
  return titles
}

function collectTitlesFromMediaStack(mediastack) {
  try {
    return (mediastack.getCachedArticles?.() || []).map((a) => a.title).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Refresh keyword tags from all available title sources.
 */
async function refreshKeywordTags() {
  const newsService = require('./news')
  const osintService = require('./osint')
  const mediastack = require('./mediastack')

  const titles = [
    ...collectTitlesFromNewsCache(newsService),
    ...collectTitlesFromOsint(osintService),
    ...collectTitlesFromDbEvents(),
    ...collectTitlesFromMediaStack(mediastack),
  ]

  const tags = countKeywords(titles)
  const state = {
    tags,
    updatedAt: new Date().toISOString(),
    titleCount: [...new Set(titles.filter(Boolean))].length,
  }
  save(state)
  console.log('[keyword-tags] refreshed', tags.length, 'tags from', state.titleCount, 'titles')
  return state
}

function getKeywordTags() {
  return load()
}

/** Compact string for LLM prompt injection. */
function formatTagsForPrompt(max = 25) {
  const { tags } = load()
  if (!tags.length) return ''
  const top = tags.slice(0, max).map((t) => `${t.term}×${t.count}`).join(', ')
  return `Headline keyword counts (distinct titles containing each term): ${top}.`
}

module.exports = {
  refreshKeywordTags,
  getKeywordTags,
  formatTagsForPrompt,
  countKeywords,
  tokenizeTitle,
}
