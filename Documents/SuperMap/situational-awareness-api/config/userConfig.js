/**
 * User-editable config (X handles, subreddits). Persisted to user-config.json.
 * Merges with built-in defaults. Used by osintXFeedService and redditCommentsIngestor.
 */

const fs = require('fs')
const path = require('path')

const CONFIG_PATH = path.join(__dirname, 'user-config.json')

const { OSINT_X_FEEDS_DEFAULT } = require('./osintXFeeds')
const DEFAULT_OSINT_X = OSINT_X_FEEDS_DEFAULT

const DEFAULT_SUBREDDITS = [
  'UkraineWarVideoReport', 'CombatFootage', 'war', 'Military', 'CredibleDefense',
  'LessCredibleDefense', 'osint', 'intelligence', 'intel', 'OSINTUkraine',
  'cybersecurity', 'netsec', 'hacking', 'Malware', 'worldnews', 'news',
  'InternationalNews', 'BreakingNews', 'energy', 'telecom', 'GIS', 'satellite',
  'drones', 'technology',
]

const DEFAULT_STOCK_TICKERS = [
  { symbol: 'SPY', name: 'S&P 500' },
  { symbol: 'CL=F', name: 'Oil (WTI)' },
  { symbol: 'GC=F', name: 'Gold' },
  { symbol: 'BINANCE:BTCUSDT', name: 'Bitcoin' },
]

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return {}
    console.warn('[userConfig] read failed:', err.message)
    return {}
  }
}

function writeConfig(data) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8')
  } catch (err) {
    console.warn('[userConfig] write failed:', err.message)
    throw err
  }
}

function getConfig() {
  const user = readConfig()
  return {
    osintXHandles: Array.isArray(user.osintXHandles) ? user.osintXHandles : DEFAULT_OSINT_X,
    subreddits: Array.isArray(user.subreddits) ? user.subreddits : DEFAULT_SUBREDDITS,
    stockTickers: Array.isArray(user.stockTickers) && user.stockTickers.length > 0
      ? user.stockTickers
      : DEFAULT_STOCK_TICKERS,
    defaultOsintXHandles: DEFAULT_OSINT_X,
  }
}

function setConfig(updates) {
  const current = readConfig()
  if (updates.osintXHandles !== undefined) current.osintXHandles = updates.osintXHandles
  if (updates.subreddits !== undefined) current.subreddits = updates.subreddits
  if (updates.stockTickers !== undefined) current.stockTickers = updates.stockTickers
  writeConfig(current)
  return getConfig()
}

/** Nitter mirror list: try in order; if one fails, use next. Set NITTER_MIRRORS in .env (comma-separated) to override. */
function getNitterMirrors() {
  const env = process.env.NITTER_MIRRORS
  if (env && typeof env === 'string') {
    return env.split(',').map((b) => b.trim().replace(/\/$/, '')).filter(Boolean)
  }
  const single = process.env.NITTER_BASE
  if (single) {
    return [single.replace(/\/$/, '')]
  }
  return [
    'https://nitter.net',
    'https://nitter.poast.org',
    'https://nitter.privacydev.net',
  ]
}

/** Normalize X handle for Nitter RSS URL: trim, strip @, allow only [a-zA-Z0-9_]. */
function normalizeHandle(handle) {
  if (handle == null || typeof handle !== 'string') return ''
  const s = handle.trim().replace(/^@/, '')
  return s.replace(/[^a-zA-Z0-9_]/g, '')
}

function getOsintXFeeds() {
  const { osintXHandles } = getConfig()
  const list = Array.isArray(osintXHandles) ? osintXHandles : []
  return list
    .map((entry) => {
      const raw = entry.handle != null ? String(entry.handle).trim().replace(/^@/, '') : ''
      const handle = raw.replace(/[^a-zA-Z0-9_]/g, '') || raw
      if (!handle) return null
      if (handle.toLowerCase() === 'alarabiya_brk') return null
      return {
        name: entry.name || handle,
        handle,
        priority: entry.priority || 'medium',
      }
    })
    .filter(Boolean)
}

function getSubreddits() {
  const { subreddits } = getConfig()
  return subreddits
}

function getStockTickers() {
  const { stockTickers } = getConfig()
  return Array.isArray(stockTickers) && stockTickers.length > 0 ? stockTickers : DEFAULT_STOCK_TICKERS
}

module.exports = { getConfig, setConfig, getOsintXFeeds, getNitterMirrors, getSubreddits, getStockTickers }
