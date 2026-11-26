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

/**
 * Serve an X/Twitter image from our own origin.
 *
 * Strict browsers (LibreWolf with uBlock Origin, EasyPrivacy) block requests to
 * pbs.twimg.com outright, so the gallery is blank there. The browser loads the
 * CDN URL first and only falls back here when that image fails, so normal
 * visitors never spend API traffic on images. Cached in memory for a day.
 */
const IMAGE_HOSTS = new Set(['pbs.twimg.com'])
const IMAGE_MAX_BYTES = 8 * 1024 * 1024
const imageCache = new Map()
const IMAGE_CACHE_LIMIT = 240

router.get('/media/x', async (req, res) => {
  const raw = String(req.query.u || '')
  let target
  try {
    target = new URL(raw)
  } catch {
    return res.status(400).json({ error: 'u must be an absolute URL' })
  }
  if (target.protocol !== 'https:' || !IMAGE_HOSTS.has(target.hostname)) {
    return res.status(400).json({ error: 'only https://pbs.twimg.com is proxied' })
  }
  const key = target.toString()
  const hit = imageCache.get(key)
  if (hit) {
    res.set('Content-Type', hit.type)
    res.set('Cache-Control', 'public, max-age=86400, immutable')
    res.set('X-Media-Source', 'memory')
    return res.end(hit.body)
  }
  try {
    const upstream = await fetch(key, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        Referer: 'https://x.com/',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!upstream.ok) {
      console.warn('[API /media/x]', upstream.status, key)
      return res.status(502).json({ error: `upstream HTTP ${upstream.status}` })
    }
    const type = upstream.headers.get('content-type') || 'image/jpeg'
    if (!/^image\//i.test(type)) return res.status(502).json({ error: 'upstream did not return an image' })
    const body = Buffer.from(await upstream.arrayBuffer())
    if (body.length > IMAGE_MAX_BYTES) return res.status(502).json({ error: 'image too large' })
    if (imageCache.size >= IMAGE_CACHE_LIMIT) {
      const oldest = imageCache.keys().next().value
      imageCache.delete(oldest)
    }
    imageCache.set(key, { type, body })
    res.set('Content-Type', type)
    res.set('Cache-Control', 'public, max-age=86400, immutable')
    res.set('X-Media-Source', 'upstream')
    return res.end(body)
  } catch (err) {
    console.warn('[API /media/x]', err.message)
    return res.status(502).json({ error: err.message })
  }
})

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
