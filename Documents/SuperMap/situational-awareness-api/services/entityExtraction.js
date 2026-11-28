/**
 * Lightweight entity extraction: locations and common types via compromise + dictionary.
 * Entity types: city, country, airport, company, person, facility, organization, etc.
 */

const nlp = require('compromise')

const ENTITY_TYPES = [
  'city',
  'country',
  'region',
  'airport',
  'company',
  'person',
  'facility',
  'infrastructure',
  'organization',
]

function extractPlaces(text) {
  if (!text || typeof text !== 'string') return []
  try {
    const doc = nlp(text)
    const out = doc.places().out('array')
    const arr = Array.isArray(out) ? out : (typeof out === 'string' ? [out] : [])
    return [...new Set(arr.filter((p) => p && String(p).trim().length > 1))]
  } catch (err) {
    return []
  }
}

function extractOrganizations(text) {
  if (!text || typeof text !== 'string') return []
  try {
    const doc = nlp(text)
    const out = doc.organizations().out('array')
    const arr = Array.isArray(out) ? out : (typeof out === 'string' ? [out] : [])
    return [...new Set(arr.filter((p) => p && String(p).trim().length > 1))]
  } catch (err) {
    return []
  }
}

/** Named people, conservative: compromise's person tagger, full names only. */
function extractPeople(text) {
  if (!text || typeof text !== 'string') return []
  try {
    const out = nlp(text).people().out('array')
    const arr = Array.isArray(out) ? out : (typeof out === 'string' ? [out] : [])
    return [...new Set(arr
      .map((name) => String(name).replace(/[“”"',]/g, '').trim())
      .filter((name) => name.length >= 4 && name.length <= 60 && /\s/.test(name) && !/^\d/.test(name)))]
  } catch {
    return []
  }
}

/**
 * Extract entities from text. Returns [{ type, name }].
 * Uses compromise for places and organizations; type inferred heuristically.
 */
function extractEntities(text) {
  if (!text || typeof text !== 'string') return []
  const entities = []
  const seen = new Set()

  const add = (name, type) => {
    const key = `${type}:${name.toLowerCase().trim()}`
    if (seen.has(key)) return
    seen.add(key)
    if (name.trim().length < 2) return
    entities.push({ type, name: name.trim() })
  }

  const places = extractPlaces(text)
  places.forEach((p) => add(p, 'city'))

  const orgs = extractOrganizations(text)
  orgs.forEach((o) => add(o, 'organization'))

  const people = extractPeople(text)
  people.forEach((name) => add(name, 'person'))

  return entities
}

module.exports = {
  extractEntities,
  extractPlaces,
  extractOrganizations,
  extractPeople,
  ENTITY_TYPES,
}
