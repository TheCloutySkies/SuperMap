/**
 * Read the entity graph that the ingest pipeline already maintains in SQLite.
 *
 * No visitor-triggered upstream work here: this reads local tables only. The
 * snapshot collector publishes /api/entities like every other source, and a
 * browser falls back to this route only when the snapshot is unavailable.
 */
const express = require('express')
const crypto = require('crypto')
const { getDb } = require('../database')

const router = express.Router()
const cacheTtlMs = 10 * 60 * 1000
let cache = { at: 0, data: null }

const THEATER_HINTS = [
  [/ukrain|russia|moscow|kyiv|kiev|donetsk|kharkiv|odesa|belgorod/i, 'ukraine'],
  [/israel|gaza|iran|lebanon|syria|yemen|hezbollah|hamas/i, 'mideast'],
  [/taiwan|china|beijing|japan|tokyo|korea|philippines/i, 'pacific'],
  [/india|pakistan|kashmir|afghan|kabul|bangladesh/i, 'southAsia'],
  [/congo|sudan|nigeria|sahel|ethiopia|somalia|mali|libya|kenya/i, 'africa'],
  [/united states|washington|pentagon|mexico|brazil|venezuela|colombia/i, 'americas'],
  [/poland|baltic|estonia|latvia|lithuania|stockholm|finland|nato/i, 'baltic'],
]

function theaterFor(name, metadata) {
  const hay = `${name} ${metadata?.country || ''} ${metadata?.countryCode || ''}`
  for (const [pattern, theater] of THEATER_HINTS) if (pattern.test(hay)) return theater
  return 'global'
}

function aliasesOf(raw) {
  if (!raw) return []
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(value) ? value.map(String).slice(0, 12) : []
  } catch { return [] }
}

function coordinatesOf(name, metadata) {
  const lat = Number(metadata?.lat ?? metadata?.latitude)
  const lon = Number(metadata?.lon ?? metadata?.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon }
  return {}
}

function listEntities({ type = null, limit = 600 } = {}) {
  const db = getDb()
  const allowed = new Set(['person', 'organization', 'company', 'city', 'country', 'region', 'airport', 'facility', 'infrastructure', 'place'])
  const wanted = type && allowed.has(String(type).toLowerCase()) ? String(type).toLowerCase() : null
  const rows = db.prepare(`
    SELECT e.id, e.name, e.type, e.aliases, e.metadata,
           COUNT(ee.event_id) AS eventCount,
           MAX(ev.timestamp) AS lastSeen
    FROM entities e
    LEFT JOIN event_entities ee ON ee.entity_id = e.id
    LEFT JOIN events ev ON ev.id = ee.event_id
    ${wanted ? 'WHERE e.type = ?' : ''}
    GROUP BY e.id
    ORDER BY eventCount DESC, lastSeen DESC, e.name ASC
    LIMIT ?
  `).all(...(wanted ? [wanted] : []), Math.min(2000, Math.max(1, Number(limit) || 600)))

  return rows.map((row) => {
    let metadata = {}
    try { metadata = row.metadata ? JSON.parse(row.metadata) : {} } catch { metadata = {} }
    const aliases = aliasesOf(row.aliases)
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      aliases,
      eventCount: Number(row.eventCount) || 0,
      lastSeen: Number(row.lastSeen) || null,
      theater: theaterFor(row.name, metadata),
      ...coordinatesOf(row.name, metadata),
    }
  })
}

function getEntityEvents(entityId, limit = 40) {
  if (!entityId) return []
  return getDb().prepare(`
    SELECT e.id, e.title, e.type, e.timestamp, e.lat, e.lon, e.source
    FROM events e
    JOIN event_entities ee ON ee.event_id = e.id
    WHERE ee.entity_id = ?
    ORDER BY e.timestamp DESC
    LIMIT ?
  `).all(String(entityId), Math.min(200, Math.max(1, Number(limit) || 40)))
}

/**
 * Re-extract entities from already-ingested events. The ingest pipeline does
 * this for every new event; this pass covers rows ingested before the person
 * extractor existed and is called by the collector, never by a visitor.
 */
function refreshEntityGraph({ limit = 1500 } = {}) {
  const { getEvents } = require('../database')
  const { extractEntities } = require('../services/entityExtraction')
  const { ensureEntity, linkEventEntity } = require('../database')
  const rows = getEvents(Math.min(5000, Math.max(1, Number(limit) || 1500)))
  let added = 0
  for (const row of rows) {
    const text = [row.title, row.description].filter(Boolean).join(' ')
    for (const entity of extractEntities(text)) {
      const id = ensureEntity(entity.name, entity.type)
      if (id) { linkEventEntity(row.id, id); added += 1 }
    }
  }
  cache = { at: 0, data: null }
  return { events: rows.length, links: added }
}

router.get('/', (req, res) => {
  if (cache.data && Date.now() - cache.at < cacheTtlMs) {
    res.set('X-Entity-Source', 'memory')
    return res.json({ ...cache.data, _cached: true })
  }
  const data = { entities: listEntities({ type: req.query.type, limit: req.query.limit }) }
  cache = { at: Date.now(), data }
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
  res.set('X-Entity-Source', 'database')
  return res.json(data)
})

router.get('/:id/events', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300')
  return res.json({ events: getEntityEvents(req.params.id, req.query.limit) })
})

module.exports = router
module.exports.listEntities = listEntities
module.exports.getEntityEvents = getEntityEvents
module.exports.refreshEntityGraph = refreshEntityGraph
