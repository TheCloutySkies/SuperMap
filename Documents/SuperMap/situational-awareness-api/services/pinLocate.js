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
  return sidc.length >= 10 && sidc.length <= 20 ? sidc : ''
}

function categoryFrom(kind, text, suggested) {
  if (CATEGORY_SET.has(suggested)) return suggested
  for (const [category, pattern] of RULES) {
    if (pattern.test(text)) return category
  }
  if (kind === 'x') return 'x'
  return 'news'
}

function heuristic(text, kind) {
  const places = extractPlaces(text).map(tidyPlace).filter((name) => name.length > 2)
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
  const candidates = [reading.query, reading.place, ...extractPlaces(text).reverse()].map(tidyPlace)
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
    if (reading && (reading.place || reading.query)) engine = 'genkit'
    else reading = null
  }
  if (!reading) reading = heuristic(text, sourceKind)
  const category = categoryFrom(sourceKind, text, reading.category)
  const sidc = cleanSidc(reading.sidc) || DEFAULT_SIDC[category]
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
