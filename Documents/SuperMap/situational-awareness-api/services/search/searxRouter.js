const axios = require('axios')
const { parseSearxResults } = require('./resultParser')
const { getCachedSearch, setCachedSearch } = require('./searchCache')

const INSTANCES_URL = 'https://searx.space/data/instances.json'
const MAX_RETRIES = 3
const REQUEST_TIMEOUT_MS = 5000

let instancePool = []
let lastFetchTs = 0
const INSTANCE_REFRESH_MS = 10 * 60 * 1000 // 10 minutes

async function refreshInstancesIfNeeded() {
  const now = Date.now()
  if (now - lastFetchTs < INSTANCE_REFRESH_MS && instancePool.length > 0) return

  try {
    const { data } = await axios.get(INSTANCES_URL, { timeout: REQUEST_TIMEOUT_MS })
    const list = []

    for (const [baseUrl, meta] of Object.entries(data.instances || {})) {
      const info = meta && meta.info
      if (!info) continue

      const isNormal = info.network_type === 'normal'
      const isPublic = !info.private
      const uptime = typeof info.uptime === 'number' ? info.uptime : 0

      if (isNormal && isPublic && uptime > 90) {
        list.push(baseUrl.replace(/\/+$/, ''))
      }
    }

    if (list.length) {
      instancePool = list
      lastFetchTs = now
    }
  } catch (err) {
    console.warn('[searxRouter] Failed to refresh instances', err.message)
  }
}

function pickRandomInstance(used = new Set()) {
  const available = instancePool.filter((url) => !used.has(url))
  if (!available.length) return null
  const idx = Math.floor(Math.random() * available.length)
  return available[idx]
}

async function performSearxSearch(query) {
  const q = String(query || '').trim()
  if (!q) return { query: '', instance: null, results: [] }

  const cached = getCachedSearch(q)
  if (cached) return cached

  await refreshInstancesIfNeeded()
  if (!instancePool.length) {
    return { error: 'search unavailable' }
  }

  const tried = new Set()
  let lastError = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const instanceBase = pickRandomInstance(tried)
    if (!instanceBase) break
    tried.add(instanceBase)

    try {
      const { data } = await axios.get(`${instanceBase}/search`, {
        params: { q, format: 'json' },
        headers: { Accept: 'application/json' },
        timeout: REQUEST_TIMEOUT_MS,
      })

      const normalizedResults = parseSearxResults(data, instanceBase)
      const payload = { query: data.query || q, instance: instanceBase, results: normalizedResults }
      setCachedSearch(q, payload)
      return payload
    } catch (err) {
      lastError = err
    }
  }

  console.warn('[searxRouter] All SearXNG instances failed', lastError && lastError.message)
  return { error: 'search unavailable' }
}

module.exports = {
  performSearxSearch,
}

