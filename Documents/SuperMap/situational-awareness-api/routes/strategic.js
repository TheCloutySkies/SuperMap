/**
 * Strategic sources: cache-first, never an upstream call on a request.
 *
 * The collector owns freshness; a visitor reads the seeded or in-memory last-good
 * and gets `{empty:true, warming:true}` while a source is still filling.
 */
const express = require('express')
const apiResultCache = require('../services/apiResultCache')
const strategicSources = require('../services/strategicSources')

const router = express.Router()

const DISPLAY_CACHE = 'public, max-age=300, stale-while-revalidate=3600'
const TTL_SEC = 4 * 60 * 60
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
    if (!source) return res.status(404).json({ error: 'unknown strategic source' })
    const hit = apiResultCache.getFresh(source.name, source.name)
      || apiResultCache.getStale(source.name, source.name, STALE_TTL_SEC)
    if (hit?.value) {
      res.set('Cache-Control', DISPLAY_CACHE)
      res.set('X-Strategic-Source', hit.fresh ? 'fresh' : 'last-good')
      return res.json({
        ...hit.value,
        _cacheAgeMs: hit.ageMs,
        _cached: true,
      })
    }

    // Nothing cached yet: one shared build, bounded, then hand back the last-good.
    try {
      const value = await require('../services/singleFlight').singleFlight(
        `strategic:${source.name}`,
        async () => {
          const out = await source.fetch({})
          const data = out?.data != null ? out.data : out
          if (data == null) return null
          apiResultCache.set(source.name, source.name, data, source.ttlSec || TTL_SEC)
          return data
        },
      )
      if (value) {
        res.set('Cache-Control', DISPLAY_CACHE)
        res.set('X-Strategic-Source', 'live')
        return res.json(value)
      }
    } catch (err) {
      const gated = !!err?.gated
      const stale = apiResultCache.getStale(source.name, source.name, STALE_TTL_SEC)
      if (stale?.value) {
        res.set('Cache-Control', DISPLAY_CACHE)
        return res.json({ ...stale.value, _cached: true, _stale: true, error: err.message })
      }
      return warming(res, source, gated ? `${source.name} needs a key` : err.message)
    }
    return warming(res, source, 'still filling')
  }
}

router.get('/warspotting', served(strategicSources.BY_NAME.get('strategic-warspotting')))
router.get('/satellites', served(strategicSources.BY_NAME.get('strategic-satellites')))
router.get('/launches', served(strategicSources.BY_NAME.get('strategic-launches')))
router.get('/briefs', served(strategicSources.BY_NAME.get('strategic-briefs')))
router.get('/ucdp', served(strategicSources.BY_NAME.get('strategic-ucdp')))
router.get('/censorship', served(strategicSources.BY_NAME.get('strategic-censorship')))
router.get('/kev', served(strategicSources.BY_NAME.get('strategic-kev')))
router.get('/ransomware', served(strategicSources.BY_NAME.get('strategic-ransomware')))
router.get('/radiation', served(strategicSources.BY_NAME.get('strategic-radiation')))
router.get('/balloons', served(strategicSources.BY_NAME.get('strategic-balloons')))

/** Everything the strategic desk needs, in one response. */
router.get('/', async (req, res) => {
  res.set('Cache-Control', DISPLAY_CACHE)
  const out = {}
  const errors = []
  for (const source of strategicSources.SOURCES) {
    const hit = apiResultCache.getStale(source.name, source.name, STALE_TTL_SEC)
    if (hit?.value) {
      out[source.name.replace(/^strategic-/, '')] = hit.value
      continue
    }
    errors.push(source.name)
  }
  res.set('X-Strategic-Missing', errors.join(',') || '')
  res.json({ data: out, missing: errors, fetchedAt: new Date().toISOString() })
})

/** Optional-key status, so the desk can explain a gated panel. */
router.get('/status', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ keys: strategicSources.keyStatus(), sources: strategicSources.SOURCES.map((s) => s.name) })
})

module.exports = router
