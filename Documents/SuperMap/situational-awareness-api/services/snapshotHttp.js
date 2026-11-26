/**
 * Fetch discipline for the snapshot collector and its sources.
 *
 * Fixed per-day upstream budget means the collector must be polite: a small
 * global concurrency ceiling, one request per host at a time, 30s timeouts,
 * two retries with full jitter, `Retry-After` honoured, and conditional GETs so
 * an unchanged feed costs a 304 instead of a full download.
 */
const axios = require('axios')

const GLOBAL_LIMIT = 4
const PER_HOST_LIMIT = 1
const DEFAULT_TIMEOUT_MS = 30000
const MAX_RETRIES = 2
const UA = 'SuperMap/1.0 (+https://github.com/TheCloutySkies/SuperMap)'

let active = 0
const activePerHost = new Map()
const waiting = []

function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return 'invalid'
  }
}

function canStart(host) {
  if (active >= GLOBAL_LIMIT) return false
  return (activePerHost.get(host) || 0) < PER_HOST_LIMIT
}

function pump() {
  for (let i = 0; i < waiting.length; i += 1) {
    const slot = waiting[i]
    if (!canStart(slot.host)) continue
    waiting.splice(i, 1)
    i -= 1
    active += 1
    activePerHost.set(slot.host, (activePerHost.get(slot.host) || 0) + 1)
    slot.resolve()
  }
}

function acquire(host) {
  if (canStart(host)) {
    active += 1
    activePerHost.set(host, (activePerHost.get(host) || 0) + 1)
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waiting.push({ host, resolve })
  })
}

function release(host) {
  active = Math.max(0, active - 1)
  const next = Math.max(0, (activePerHost.get(host) || 1) - 1)
  if (next === 0) activePerHost.delete(host)
  else activePerHost.set(host, next)
  pump()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Full jitter: a storm of retries must not look like a burst to any host. */
function backoffMs(attempt) {
  const ceiling = Math.min(20000, 750 * 2 ** attempt)
  return Math.round(Math.random() * ceiling)
}

async function withSlot(host, fn) {
  await acquire(host)
  try {
    return await fn()
  } finally {
    release(host)
  }
}

/**
 * GET a URL with conditional headers and retries.
 * @returns {Promise<{ data?: any, etag?: string|null, lastModified?: string|null, notModified?: boolean, status?: number }>}
 */
async function fetchWithEtag(url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  headers = {},
  etag = null,
  lastModified = null,
  responseType = 'json',
  retries = MAX_RETRIES,
} = {}) {
  const host = hostOf(url)
  return withSlot(host, async () => {
    let lastError = null
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const reqHeaders = {
          'User-Agent': UA,
          Accept: responseType === 'text'
            ? 'text/csv,text/plain,application/xml;q=0.9,*/*;q=0.8'
            : 'application/json',
          ...headers,
        }
        if (etag) reqHeaders['If-None-Match'] = etag
        if (lastModified) reqHeaders['If-Modified-Since'] = lastModified
        const res = await axios.get(url, {
          timeout: timeoutMs,
          headers: reqHeaders,
          responseType,
          validateStatus: (s) => s >= 200 && s < 400,
        })
        if (res.status === 304) return { notModified: true, etag, lastModified, status: 304 }
        return {
          data: res.data,
          etag: res.headers?.etag || null,
          lastModified: res.headers?.['last-modified'] || null,
          status: res.status || 200,
          notModified: false,
        }
      } catch (err) {
        lastError = err
        const status = err?.response?.status
        const retryAfter = Number(err?.response?.headers?.['retry-after'])
        // A 4xx that is not rate limiting will not improve: stop retrying.
        if (status && status >= 400 && status < 500 && status !== 429) break
        if (attempt >= retries) break
        if (status === 429) {
          await sleep(Number.isFinite(retryAfter) ? Math.min(90000, retryAfter * 1000) : 5000 + backoffMs(attempt))
        } else {
          await sleep(backoffMs(attempt))
        }
      }
    }
    throw lastError || new Error('fetch failed')
  })
}

module.exports = {
  fetchWithEtag,
  hostOf,
  GLOBAL_LIMIT,
  PER_HOST_LIMIT,
  DEFAULT_TIMEOUT_MS,
}
