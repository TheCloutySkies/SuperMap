/**
 * Console sources: quota-free feeds, cache-first, never an upstream call on a
 * request. The collector owns freshness; a visitor reads the seeded or in-memory
 * last-good and gets `{empty:true, warming:true}` while a source is still filling.
 */
const express = require('express')
const apiResultCache = require('../services/apiResultCache')
const singleFlight = require('../services/singleFlight')
const freeSources = require('../services/freeSources')

const router = express.Router()

const DISPLAY_CACHE = 'public, max-age=300, stale-while-revalidate=3600'
const STALE_TTL_SEC = 7 * 24 * 60 * 60

function warming(res, source, error) {
  res.set('Cache-Control', 'no-store')
  return res.json({
    empty: true,
    warming: true,
    source: source.name,
    error: error || null,
    retryAfter: 60,
  })
}

function served(source) {
  return async (req, res) => {
    const hit = apiResultCache.getFresh(source.name, source.name)
      || apiResultCache.getStale(source.name, source.name, STALE_TTL_SEC)
    if (hit?.value) {
      res.set('Cache-Control', DISPLAY_CACHE)
      res.set('X-Console-Source', hit.fresh ? 'fresh' : 'last-good')
      return res.json({ ...hit.value, _cacheAgeMs: hit.ageMs, _cached: true })
    }

    try {
      const value = await singleFlight.singleFlight(`console:${source.name}`, async () => {
        const out = await source.fetch({})
        const data = out?.data != null ? out.data : out
        if (data == null) return null
        apiResultCache.set(source.name, source.name, data, source.ttlSec)
        return data
      })
      if (value) {
        res.set('Cache-Control', DISPLAY_CACHE)
        res.set('X-Console-Source', 'live')
        return res.json(value)
      }
    } catch (err) {
      const stale = apiResultCache.getStale(source.name, source.name, STALE_TTL_SEC)
      if (stale?.value) {
        res.set('Cache-Control', DISPLAY_CACHE)
        return res.json({ ...stale.value, _cached: true, _stale: true, error: err.message })
      }
      return warming(res, source, err.message)
    }
    return warming(res, source, 'still filling')
  }
}

/** Which sources exist, and which optional tokens are present (names only). */
router.get('/status', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({
    keys: freeSources.tokenStatus(),
    sources: freeSources.SOURCES.map((source) => ({ key: source.key, name: source.name, gateHours: source.gateHours })),
  })
})

router.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ sources: freeSources.SOURCES.map((source) => source.key) })
})

router.get('/:key', (req, res, next) => {
  const source = freeSources.BY_KEY.get(req.params.key)
  if (!source) return res.status(404).json({ error: 'unknown console source' })
  return served(source)(req, res, next)
})

module.exports = router
