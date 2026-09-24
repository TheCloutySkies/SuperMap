const crypto = require('crypto')
const {
  insertOrIgnore,
  mergeEventRawData,
  ensureEntity,
  linkEventTag,
  linkEventEntity,
} = require('../database')
const { addToIndex } = require('./searchIndex')
const { tagEvent } = require('./tagging')
const { extractEntities } = require('./entityExtraction')
const {
  assessItemHeuristic,
  riskTagName,
  readRiskScore,
} = require('./riskScoring')

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
 * Apply assessment (tags + risk_score) onto event.raw_data and return merged tag list.
 */
function applyAssessmentToEvent(event, assessment, extraTags = []) {
  let raw = {}
  try {
    raw = event.raw_data ? JSON.parse(event.raw_data) : {}
  } catch (_) {
    raw = {}
  }
  const risk_score = assessment.risk_score
  raw.risk_score = risk_score
  raw.risk_label = assessment.risk_label
  raw.assessment_source = assessment.assessment_source || 'heuristic'
  if (assessment.rationale) raw.risk_rationale = assessment.rationale
  event.raw_data = JSON.stringify(raw)

  const tags = [
    ...new Set([
      ...(assessment.tags || []),
      ...extraTags,
      riskTagName(risk_score),
    ]),
  ]
  return { tags, risk_score, risk_label: assessment.risk_label }
}

/**
 * Insert into SQLite, link tags/entities, and add to FlexSearch index.
 * @param {object} event - Normalized event
 * @param {{ extraTags?: string[], assessment?: object, skipHeuristicAssess?: boolean }} options
 */
function ingestEvent(event, options = {}) {
  const extraTags = Array.isArray(options.extraTags) ? options.extraTags : []
  let assessment = options.assessment
  if (!assessment && !options.skipHeuristicAssess) {
    assessment = assessItemHeuristic({
      title: event.title,
      description: event.description,
      source: event.source,
    })
  }
  if (!assessment) {
    assessment = {
      tags: tagEvent(event),
      risk_score: 1,
      risk_label: 'LOW',
      assessment_source: 'heuristic',
    }
  }

  const { tags, risk_score, risk_label } = applyAssessmentToEvent(event, assessment, [
    ...tagEvent(event),
    ...extraTags,
  ])

  insertOrIgnore(event)
  // Re-ingest / update path: persist latest risk fields even if row already existed
  mergeEventRawData(event.id, {
    risk_score,
    risk_label,
    assessment_source: assessment.assessment_source || 'heuristic',
    risk_rationale: assessment.rationale || undefined,
  })

  tags.forEach((t) => linkEventTag(event.id, t))
  const text = [event.title, event.description].filter(Boolean).join(' ')
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
  return { tags, risk_score, risk_label }
}

/**
 * Convert an event row to a GeoJSON Feature. Geometry is null if no coordinates.
 */
function eventToFeature(event) {
  let raw = {}
  try {
    raw = event.raw_data ? JSON.parse(event.raw_data) : {}
  } catch (_) {}
  const videoUrl = raw.videoUrl || (Array.isArray(raw.videos) && raw.videos[0]) || null
  const risk_score = readRiskScore(raw) ?? (raw.risk_score != null ? Number(raw.risk_score) : null)
  const props = {
    id: event.id,
    title: event.title,
    type: event.type,
    source: event.source,
    timestamp: event.timestamp,
    link: raw.link || raw.url,
    description: event.description,
    thumbnail: raw.thumbnail || raw.image || raw.thumbnailUrl || null,
    videoUrl: videoUrl || undefined,
  }
  if (risk_score != null) {
    props.risk_score = risk_score
    props.risk_label = raw.risk_label || undefined
    props.alertLevel = risk_score >= 4 ? 'high' : risk_score >= 3 ? 'medium' : 'low'
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

module.exports = { normalizeToEvent, ingestEvent, eventToFeature, applyAssessmentToEvent }
