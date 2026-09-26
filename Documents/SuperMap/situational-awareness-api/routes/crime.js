const express = require('express')
const crimeData = require('../services/crimeData')
const sexOffenders = require('../services/sexOffenders')
const { askCrime } = require('../services/crimeAsk')

const router = express.Router()

function handle(res, fn) {
  try {
    const result = fn()
    if (result == null) {
      return res.status(404).json({ error: 'Not found', meta: { attribution: crimeData.ATTRIBUTION } })
    }
    return res.json(result)
  } catch (err) {
    if (err.code === 'CRIME_DATA_MISSING') {
      return res.status(503).json({ error: err.message, meta: { attribution: crimeData.ATTRIBUTION } })
    }
    console.error('[API /crime]', err.message)
    return res.status(500).json({ error: err.message || 'Crime data error' })
  }
}

router.get('/stats', (_req, res) => handle(res, () => crimeData.getStats()))

router.get('/national-trends', (_req, res) => handle(res, () => crimeData.getNationalTrends()))

router.get('/states', (req, res) => {
  handle(res, () => crimeData.getStateSummary(req.query.year))
})

router.get('/states/:abbr', (req, res) => {
  handle(res, () => crimeData.getStateByAbbr(req.params.abbr))
})

router.get('/cities', (req, res) => {
  handle(res, () => crimeData.searchCities({
    q: req.query.q,
    state: req.query.state,
    limit: req.query.limit,
    offset: req.query.offset,
  }))
})

router.get('/cities/:slug', (req, res) => {
  handle(res, () => crimeData.getCityBySlug(req.params.slug))
})

router.get('/types', (_req, res) => handle(res, () => crimeData.getCrimeTypes()))

router.get('/arrests', (_req, res) => handle(res, () => crimeData.getArrests()))

router.get('/homicide', (_req, res) => handle(res, () => crimeData.getHomicide()))

router.get('/hate-crime', (_req, res) => handle(res, () => crimeData.getHateCrime()))

/**
 * Sex offenders — served from on-disk pack only (no live CommunityGuard calls).
 * Seed: node scripts/seed-sex-offenders.js
 */
router.get('/sex-offenders/status', (_req, res) => handle(res, () => sexOffenders.getPackStatus()))

router.get('/sex-offenders/coverage', (req, res) => {
  try {
    return res.json(sexOffenders.checkCoverage({
      lat: req.query.lat,
      lon: req.query.lon ?? req.query.lng,
    }))
  } catch (err) {
    if (err.code === 'BAD_REQUEST') {
      return res.status(400).json({ error: err.message })
    }
    console.error('[API /crime/sex-offenders/coverage]', err.message)
    return res.status(500).json({ error: err.message || 'Coverage check failed' })
  }
})

router.get('/sex-offenders/nearby', (req, res) => {
  try {
    return res.json(sexOffenders.getNearbyMarkers({
      lat: req.query.lat,
      lon: req.query.lon ?? req.query.lng,
      radiusMiles: req.query.radiusMiles ?? req.query.radius,
    }))
  } catch (err) {
    if (err.code === 'BAD_REQUEST') {
      return res.status(400).json({ error: err.message })
    }
    console.error('[API /crime/sex-offenders/nearby]', err.message)
    return res.status(500).json({ error: err.message || 'Nearby lookup failed' })
  }
})

router.get('/sex-offenders/markers', (req, res) => {
  handle(res, () => sexOffenders.getMarkers({
    metro: req.query.metro,
    pinsOnly: req.query.pinsOnly,
    lat: req.query.lat,
    lon: req.query.lon ?? req.query.lng,
    radiusMiles: req.query.radiusMiles ?? req.query.radius,
  }))
})

router.get('/sex-offenders/:id', (req, res) => {
  handle(res, () => sexOffenders.getOffenderById(req.params.id))
})

/**
 * POST /api/crime/ask
 * Body: { question: string }
 * RAG-lite over crime pack → Groq → Ollama → heuristic.
 */
router.post('/ask', async (req, res) => {
  try {
    const question = req.body?.question ?? req.body?.q ?? req.query?.q
    const result = await askCrime(question)
    return res.json({ data: result, meta: result.meta })
  } catch (err) {
    if (err.code === 'BAD_REQUEST') {
      return res.status(400).json({ error: err.message, meta: { attribution: crimeData.ATTRIBUTION } })
    }
    if (err.code === 'CRIME_DATA_MISSING') {
      return res.status(503).json({ error: err.message, meta: { attribution: crimeData.ATTRIBUTION } })
    }
    console.error('[API /crime/ask]', err.message)
    return res.status(500).json({ error: err.message || 'Crime ask failed' })
  }
})

module.exports = router
