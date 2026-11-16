/**
 * Turn a headline into a map draft.
 * Genkit (Gemini) reads the text first. A place-name pass covers the
 * case where no model key is configured.
 */

const { locatePin, hasGenkit } = require('./thielGenkit')
const { extractPlaces, geocodePlace } = require('./geotagger')

const CATEGORIES = ['x', 'news', 'conflict', 'attack', 'planes', 'cars', 'drones', 'ships', 'explosion', 'outage']
const CATEGORY_SET = new Set(CATEGORIES)

const DEFAULT_SIDC = {
  x: 'SFGPU------',
  news: 'SFGPU------',
  conflict: 'SHGPUCI----',
  attack: 'SHAPMFA----',
  planes: 'SFAPMF-----',
  cars: 'SFGPEVCA---',
  drones: 'SHAPMFQ----',
  ships: 'SFSPCL-----',
  explosion: 'EHIPBA----',
  outage: 'SFGPIUE----',
}

const RULES = [
  ['drones', /\b(drone|uav|uas|unmanned)\b/i],
  ['planes', /\b(plane|aircraft|jet|helicopter|air ?strike|fighter)\b/i],
  ['ships', /\b(ship|vessel|warship|navy|frigate|destroyer|carrier)\b/i],
  ['cars', /\b(car|vehicle|truck|convoy|automobile)\b/i],
  ['explosion', /\b(explos|blast|bomb|ied|detonat)\w*/i],
  ['outage', /\b(outage|blackout|power cut|electricity)\b/i],
  ['attack', /\b(attack|strike|shelling|missile|airstrike|shot)\b/i],
  ['conflict', /\b(war|front|troops|battle|clash|offensive|advance|retreat)\b/i],
]

function tidyPlace(name) {
  return String(name || '')
    .replace(/[’']s\b/gi, '')
    .replace(/[’']/g, '')
    .replace(/[.,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanSidc(value) {
  const sidc = String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (!/^[SEGIOW]/.test(sidc)) return ''
  return sidc.length >= 10 && sidc.length <= 20 ? sidc : ''
}

function categoryFrom(kind, text, suggested) {
  for (const [category, pattern] of RULES) {
    if (pattern.test(text)) return category
  }
  if (CATEGORY_SET.has(suggested)) return suggested
  if (kind === 'x') return 'x'
  return 'news'
}

function blankPlace(value) {
  const text = tidyPlace(value).toLowerCase()
  if (!text || text.length < 2) return true
  return /^(unknown|n\/a|none|unspecified|not sure)$/.test(text)
    || /\b(cannot|can't|unable|no location|not enough)\b/.test(text)
}

function writtenPlaces(text) {
  const found = []
  const pattern = /\b(?:in|at|near|outside|around|over|across|hits|hit|from|on|to)\s+([A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,2})/gu
  for (const match of String(text || '').matchAll(pattern)) found.push(match[1])
  return [...extractPlaces(text), ...found].map(tidyPlace).filter((name) => name.length > 2 && !blankPlace(name))
}

function heuristic(text, kind) {
  const places = writtenPlaces(text)
  const category = categoryFrom(kind, text, '')
  const place = places[places.length - 1] || ''
  return {
    place,
    query: place,
    category,
    sidc: '',
    reasoning: place
      ? `The headline names ${place}. Drag the pin if that is only the nearest city.`
      : 'No place name stood out in the headline. Click the map to drop the pin.',
  }
}

async function geocodeReading(reading, text) {
  const tried = new Set()
  const place = tidyPlace(reading.place)
  const query = tidyPlace(reading.query)
  const shortQuery = query && query.split(' ').length <= 6
  const candidates = [...(shortQuery ? [query, place] : [place, query]), ...writtenPlaces(text).reverse()].map(tidyPlace)
  for (const name of candidates) {
    const query = String(name || '').trim()
    if (!query || tried.has(query.toLowerCase())) continue
    tried.add(query.toLowerCase())
    const hit = await geocodePlace(query)
    if (hit?.coords) return { hit, query }
  }
  return { hit: null, query: String(reading.query || reading.place || '').trim() }
}

async function locateHeadline({ title, summary, url, kind } = {}) {
  const headline = String(title || '').trim()
  const body = String(summary || '').trim()
  const text = [headline, body].filter(Boolean).join('\n')
  const sourceKind = String(kind || '').toLowerCase()
  let reading = null
  let engine = 'places'
  if (hasGenkit()) {
    reading = await locatePin({ title: headline, summary: body, url, kind: sourceKind })
    if (reading) {
      if (blankPlace(reading.place)) reading.place = ''
      if (blankPlace(reading.query)) reading.query = ''
      if (/\b(cannot|can't|unable|no location|not enough)\b/i.test(reading.reasoning || '') && (reading.place || reading.query)) {
        reading.reasoning = `The headline names ${reading.place || reading.query}.`
      }
    }
    if (reading && (reading.place || reading.query)) engine = 'genkit'
    else reading = null
  }
  if (!reading) reading = heuristic(text, sourceKind)
  const category = categoryFrom(sourceKind, text, reading.category)
  const modelCategory = CATEGORY_SET.has(reading.category) ? reading.category : ''
  const sidc = modelCategory && modelCategory !== category
    ? DEFAULT_SIDC[category]
    : (cleanSidc(reading.sidc) || DEFAULT_SIDC[category])
  const { hit, query } = await geocodeReading(reading, text)
  return {
    place: reading.place || query || '',
    query,
    category,
    sidc,
    reasoning: reading.reasoning || '',
    lat: hit ? hit.coords[1] : null,
    lon: hit ? hit.coords[0] : null,
    engine,
    genkit: hasGenkit(),
  }
}

module.exports = { locateHeadline, CATEGORIES, DEFAULT_SIDC }
