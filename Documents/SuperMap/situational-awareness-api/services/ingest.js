const crypto = require('crypto')
const {
  insertOrIgnore,
  ensureEntity,
  linkEventTag,
  linkEventEntity,
} = require('../database')
const { addToIndex } = require('./searchIndex')
const { tagEvent } = require('./tagging')
const { extractEntities } = require('./entityExtraction')

/**
 * Normalize a record to the events table schema and optionally to GeoJSON feature.
 * @param {object} raw - Raw item from a service
 * @param {string} type - One of: news, conflict, infrastructure, disaster
 * @param {string} source - Source name
 * @returns {{ id, type, title, description, lat, lon, timestamp, source, raw_data }}
 */
function normalizeToEvent(raw, type, source) {
  const title = raw.title || raw.name || raw.declarationTitle || ''
  const description = raw.description || raw.contentSnippet || raw.content || raw.summary || ''
  const link = raw.link || raw.url || raw.guid || ''
  const pubDate = raw.pubDate || raw.pubDate || raw.declaredDate || raw.time
  const timestamp = pubDate ? new Date(pubDate).getTime() : (raw.timestamp != null ? raw.timestamp : null)
  let lat = raw.lat ?? raw.latitude
  let lon = raw.lon ?? raw.longitude
  if (Array.isArray(raw.coordinates)) {
    lon = raw.coordinates[0]
    lat = raw.coordinates[1]
  }
  if (raw.geometry?.coordinates?.length >= 2) {
    lon = raw.geometry.coordinates[0]
    lat = raw.geometry.coordinates[1]
  }
  const id = raw.id || crypto.createHash('sha256').update(`${source}|${title}|${timestamp}`).digest('hex').slice(0, 32)
  return {
    id,
    type,
    title,
    description: description.slice(0, 2000),
    lat: lat != null ? Number(lat) : null,
    lon: lon != null ? Number(lon) : null,
    timestamp,
    source,
    raw_data: JSON.stringify({ ...raw, link }),
  }
}

/**
 * Insert into SQLite, link tags/entities, and add to FlexSearch index.
 * @param {object} event - Normalized event
 * @param {{ extraTags?: string[] }} options - Optional extraTags (e.g. source-based: osint, investigation)
 */
function ingestEvent(event, options = {}) {
  insertOrIgnore(event)
  const text = [event.title, event.description].filter(Boolean).join(' ')
  const baseTags = tagEvent(event)
  const extraTags = Array.isArray(options.extraTags) ? options.extraTags : []
  const tags = [...new Set([...baseTags, ...extraTags])]
  tags.forEach((t) => linkEventTag(event.id, t))
  const entities = extractEntities(text)
  const entityIds = []
  for (const e of entities) {
    const id = ensureEntity(e.name, e.type)
    if (id) {
      entityIds.push(id)
      linkEventEntity(event.id, id)
    }
  }
  addToIndex(event.type, {
    ...event,
    tags,
    entities: entities.map((e) => e.name),
  })
}

/**
 * Convert an event row to a GeoJSON Feature. Geometry is null if no coordinates.
 */
function eventToFeature(event) {
  let raw = {}
  try {
    raw = event.raw_data ? JSON.parse(event.raw_data) : {}
  } catch (_) {}
  const props = {
    id: event.id,
    title: event.title,
    type: event.type,
    source: event.source,
    timestamp: event.timestamp,
    link: raw.link || raw.url,
    description: event.description,
  }
  if (event.lat != null && event.lon != null) {
    return {
      type: 'Feature',
      id: event.id,
      properties: props,
      geometry: { type: 'Point', coordinates: [Number(event.lon), Number(event.lat)] },
    }
  }
  return { type: 'Feature', id: event.id, properties: props, geometry: null }
}

module.exports = { normalizeToEvent, ingestEvent, eventToFeature }
