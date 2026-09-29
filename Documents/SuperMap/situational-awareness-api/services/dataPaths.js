/**
 * Data root for last-good caches + SQLite.
 *
 * Render Free (default, first-class): filesystem is ephemeral. Work around
 * with in-memory last-good for process life, frontend localStorage seeds,
 * MediaStack/RSS regenerable catch-up, staggered boot, and keepalive
 * hitting /api/home (see docs/RENDER_PERSISTENT_DISK.md).
 *
 * Optional: set DATA_DIR to a durable path if you already have one —
 * not required and not the recommended free-tier path.
 *
 * Static versioned packs (data/crime, data/sex-offenders) stay in-repo
 * and are NOT redirected.
 */

const fs = require('fs')
const path = require('path')

const API_ROOT = path.join(__dirname, '..')
const REPO_DATA = path.join(API_ROOT, 'data')

let logged = false

function envDataDir() {
  const raw = String(process.env.DATA_DIR || process.env.RENDER_DISK_PATH || '').trim()
  return raw ? path.resolve(raw) : null
}

function getDataRoot() {
  const fromEnv = envDataDir()
  return fromEnv || REPO_DATA
}

function isDurable() {
  return !!envDataDir()
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Join under the durable data root (creates root). */
function resolveData(...parts) {
  const root = ensureDir(getDataRoot())
  if (parts.length === 0) return root
  const full = path.join(root, ...parts)
  const parent = path.dirname(full)
  if (parent && parent !== root) ensureDir(parent)
  return full
}

/** api-cache JSON namespaces (home/news/stocks/gas/osint last-good). */
function apiCacheDir() {
  return ensureDir(resolveData('api-cache'))
}

function mediastackCachePath() {
  return resolveData('mediastack-cache.json')
}

function threatSummaryPath() {
  return resolveData('last-threat-summary.json')
}

function keywordTagsPath() {
  return resolveData('keyword-tags.json')
}

/**
 * SQLite path. With DATA_DIR → <DATA_DIR>/osint.db (survives deploys).
 * Without → legacy <api-root>/osint.db for local/dev.
 * One-time copy from legacy → durable when durable is empty.
 */
function sqlitePath() {
  const durableRoot = envDataDir()
  const legacy = path.join(API_ROOT, 'osint.db')
  if (!durableRoot) return legacy

  ensureDir(durableRoot)
  const target = path.join(durableRoot, 'osint.db')
  try {
    if (!fs.existsSync(target) && fs.existsSync(legacy)) {
      fs.copyFileSync(legacy, target)
      console.log('[dataPaths] migrated osint.db →', target)
    }
  } catch (err) {
    console.warn('[dataPaths] sqlite migrate:', err.message)
  }
  return target
}

/** Optional user config under durable root; falls back to config/user-config.json. */
function userConfigPath() {
  const durableRoot = envDataDir()
  const legacy = path.join(API_ROOT, 'config', 'user-config.json')
  if (!durableRoot) return legacy
  const target = path.join(durableRoot, 'user-config.json')
  try {
    if (!fs.existsSync(target) && fs.existsSync(legacy)) {
      fs.copyFileSync(legacy, target)
    }
  } catch (_) { /* optional */ }
  return target
}

function logOnce() {
  if (logged) return
  logged = true
  const root = getDataRoot()
  console.log(
    '[dataPaths] root=',
    root,
    'durable=',
    isDurable(),
    isDurable()
      ? '(DATA_DIR set — durable across deploys)'
      : '(ephemeral free-tier — memory + keepalive + MediaStack/RSS catch-up)',
  )
}

module.exports = {
  API_ROOT,
  REPO_DATA,
  getDataRoot,
  isDurable,
  resolveData,
  apiCacheDir,
  mediastackCachePath,
  threatSummaryPath,
  keywordTagsPath,
  sqlitePath,
  userConfigPath,
  logOnce,
  ensureDir,
}
