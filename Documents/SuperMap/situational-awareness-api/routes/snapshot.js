/**
 * Sources that used to be fetched straight from the browser.
 *
 * Two jobs: the snapshot collector calls these once per run, and a visitor falls
 * back here when a snapshot is unavailable. Keep them cheap — the collector owns
 * freshness, so these handler caches are only short absorption.
 */
const express = require('express')
const NodeCache = require('node-cache')
const snapshotSources = require('../services/snapshotSources')

const router = express.Router()
const cache = new NodeCache({ stdTTL: 10 * 60, checkperiod: 120 })

const DISPLAY_CACHE = 'public, max-age=300, stale-while-revalidate=3600'

function setDisplayHeaders(res) {
  res.set('Cache-Control', DISPLAY_CACHE)
}

function served(name, buildWith) {
  return async (req, res) => {
    // The collector passes the ETag it stored last run, so an unchanged feed is a 304.
    const etag = req.query._etag || null
    const lastModified = req.query._lastModified || null
    const hit = cache.get(name)
    if (hit && !etag && !lastModified) {
      setDisplayHeaders(res)
      res.set('X-Snapshot-Source', 'memory')
      return res.json({ ...hit, _cached: true })
    }
    try {
      const out = await buildWith({ etag, lastModified })
      if (out?.notModified) {
        res.set('X-Snapshot-Not-Modified', '1')
        return res.status(304).end()
      }
      const data = out?.data != null ? out.data : out
      if (data != null) cache.set(name, data)
      setDisplayHeaders(res)
      res.set('X-Snapshot-Source', 'live')
      if (out?.etag) res.set('X-Source-ETag', String(out.etag))
      if (out?.lastModified) res.set('X-Source-Last-Modified', String(out.lastModified))
      return res.json(data)
    } catch (err) {
      const status = err?.gated ? 503 : 502
      console.warn(`[API /${name}]`, err.message)
      return res.status(status).json({ error: err.message, gated: !!err.gated, source: name })
    }
  }
}

/** Planetary K index for the space-weather readout. */
router.get('/space-weather', served('space-weather', (cond) => snapshotSources.getSpaceWeather(cond)))

/** IODA internet outages (country alerts; the browser maps them to points). */
router.get('/outages/internet', served('outages-internet', (cond) => snapshotSources.getInternetOutages(cond)))

/** DeepState frontline geometry. */
router.get('/frontline', served('frontline', (cond) => snapshotSources.getUkraineFrontline(cond)))

/** Liveuamap RSS items, parsed server-side. */
router.get('/liveuamap', served('liveuamap', (cond) => snapshotSources.getLiveuamap(cond)))

/** ATLAS data centers. */
router.get('/map/datacenters', served('datacenters', (cond) => snapshotSources.getDatacenters(cond)))

/** EFF Atlas of Surveillance raw CSV + city coordinates. */
router.get('/map/surveillance', served('surveillance', (cond) => snapshotSources.getSurveillance(cond)))

/** NASA FIRMS fires as points; the map key stays on the server. */
router.get('/map/fires', served('firms', (cond) => snapshotSources.getFirms(cond)))

/** Utility power outages. */
router.get('/utility-outages', served('utility-outages', (cond) => snapshotSources.getUtilityOutages(cond)))

/** One hazard collection for the community map. */
router.get('/hazards/major', served('major-hazards', (cond) => snapshotSources.getMajorHazards(cond)))

/** What this instance was seeded with, and how old it is (for diagnosis). */
router.get('/snapshot/status', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  try {
    const snapshotSeed = require('../services/snapshotSeed')
    return res.json(snapshotSeed.getSeedStatus())
  } catch (err) {
    return res.json({ seeded: false, error: err.message })
  }
})

module.exports = router
