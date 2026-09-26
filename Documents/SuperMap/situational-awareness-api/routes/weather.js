const express = require('express')
const weather = require('../services/weather')

const router = express.Router()

function requireLatLon(req, res) {
  const coords = weather.parseLatLon(req.query)
  if (!coords) {
    res.status(400).json({ error: 'lat and lon required (valid numbers)' })
    return null
  }
  return coords
}

function wrap(name, handler) {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (err) {
      console.error(`[API /weather/${name}]`, err.message)
      const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502
      res.status(status >= 500 ? 502 : status).json({
        error: err.message || `${name} failed`,
        details: err.body || undefined,
      })
    }
  }
}

/** GET /api/weather/forecast?lat&lon&days= */
router.get('/forecast', wrap('forecast', async (req, res) => {
  const coords = requireLatLon(req, res)
  if (!coords) return
  const days = req.query.days != null ? Number(req.query.days) : 7
  const data = await weather.getForecast({
    ...coords,
    days,
    timezone: req.query.timezone || req.query.tz,
  })
  res.json(data)
}))

/** GET /api/weather/historical?lat&lon&startDate&endDate */
router.get('/historical', wrap('historical', async (req, res) => {
  const coords = requireLatLon(req, res)
  if (!coords) return
  const data = await weather.getHistorical({
    ...coords,
    startDate: req.query.startDate || req.query.start,
    endDate: req.query.endDate || req.query.end,
    timezone: req.query.timezone || req.query.tz,
  })
  res.json(data)
}))

/** GET /api/weather/marine?lat&lon */
router.get('/marine', wrap('marine', async (req, res) => {
  const coords = requireLatLon(req, res)
  if (!coords) return
  const data = await weather.getMarine({
    ...coords,
    days: req.query.days != null ? Number(req.query.days) : 7,
  })
  res.json(data)
}))

/** GET /api/weather/air-quality?lat&lon */
router.get('/air-quality', wrap('air-quality', async (req, res) => {
  const coords = requireLatLon(req, res)
  if (!coords) return
  const data = await weather.getAirQuality({
    ...coords,
    days: req.query.days != null ? Number(req.query.days) : 5,
  })
  res.json(data)
}))

/** GET /api/weather/flood?lat&lon */
router.get('/flood', wrap('flood', async (req, res) => {
  const coords = requireLatLon(req, res)
  if (!coords) return
  const data = await weather.getFlood({
    ...coords,
    days: req.query.days != null ? Number(req.query.days) : 7,
  })
  res.json(data)
}))

/** GET /api/weather/satellite-radiation?lat&lon */
router.get('/satellite-radiation', wrap('satellite-radiation', async (req, res) => {
  const coords = requireLatLon(req, res)
  if (!coords) return
  const data = await weather.getSatelliteRadiation({
    ...coords,
    startDate: req.query.startDate || req.query.start,
    endDate: req.query.endDate || req.query.end,
  })
  res.json(data)
}))

/** GET /api/weather/alerts?lat&lon — NWS with SuperMapWeather User-Agent */
router.get('/alerts', wrap('alerts', async (req, res) => {
  const coords = requireLatLon(req, res)
  if (!coords) return
  const data = await weather.getAlerts(coords)
  res.json(data)
}))

/** GET /api/weather/radar/meta — RainViewer + OWM tile helpers + Windy flags */
router.get('/radar/meta', wrap('radar/meta', async (_req, res) => {
  const data = await weather.getRadarMeta()
  res.json(data)
}))

/**
 * GET /api/weather/windy/config
 * Returns Map Forecast client bootstrap (key when WINDY_API is set).
 * Used by Weather radar wind layer via windyInit({ key, overlay: 'wind' }).
 */
router.get('/windy/config', wrap('windy/config', async (_req, res) => {
  res.json(weather.getWindyClientConfig())
}))

module.exports = router
