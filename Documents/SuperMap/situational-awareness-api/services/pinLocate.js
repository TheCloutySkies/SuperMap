/**
 * Turn a headline into a map draft.
 * Genkit (Gemini) reads the text first. A place-name pass covers the
 * case where no model key is configured.
 */

const { locatePin, readImagePlace, hasGenkit } = require('./thielGenkit')
const { extractPlaces } = require('./geotagger')
const { searchPlaces } = require('./placeSearch')

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

async function geocodeFirst(names) {
  const tried = new Set()
  let guess = ''
  for (const name of names) {
    const query = tidyPlace(name)
    if (!query || blankPlace(query) || tried.has(query.toLowerCase())) continue
    tried.add(query.toLowerCase())
    if (!guess) guess = query
    const rows = await searchPlaces(query, 1)
    const hit = rows[0]
    if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lon)) {
      return { lat: hit.lat, lon: hit.lon, query, label: hit.display_name || hit.name || query }
    }
  }
  return { lat: null, lon: null, query: guess, label: guess }
}

function usefulReading(reading) {
  if (!reading) return null
  const next = { ...reading }
  if (blankPlace(next.place)) next.place = ''
  if (blankPlace(next.query)) next.query = ''
  if (!next.place && !next.query) return null
  if (/\b(cannot|can't|unable|no location|not enough)\b/i.test(next.reasoning || '')) {
    next.reasoning = `The headline names ${next.place || next.query}.`
  }
  return next
}

async function locateHeadline({ title, summary, url, kind, image } = {}) {
  const headline = String(title || '').trim()
  const body = String(summary || '').trim()
  const text = [headline, body].filter(Boolean).join('\n')
  const sourceKind = String(kind || '').toLowerCase()
  const named = writtenPlaces(text)
  const modelPromise = hasGenkit()
    ? locatePin({ title: headline, summary: body, url, kind: sourceKind }).catch(() => null)
    : Promise.resolve(null)
  const [model, placed] = await Promise.all([
    Promise.race([
      modelPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
    ]),
    geocodeFirst(named),
  ])
  let reading = usefulReading(model)
  let located = placed
  let engine = 'places'
  if (!Number.isFinite(located.lat) && reading) {
    const modelHit = await geocodeFirst([reading.query, reading.place])
    if (Number.isFinite(modelHit.lat)) {
      located = modelHit
      engine = 'genkit'
    }
  } else if (reading && Number.isFinite(located.lat)) {
    engine = 'genkit'
  }
  if (!Number.isFinite(located.lat) && !named.length && image) {
    const seen = usefulReading(await readImagePlace(image).catch(() => null))
    if (seen) {
      const photoHit = await geocodeFirst([seen.query, seen.place])
      if (Number.isFinite(photoHit.lat)) {
        located = photoHit
        engine = 'image'
        reading = reading || { ...seen, category: '', sidc: '', reasoning: `The photo names ${photoHit.query}.` }
      } else if (!reading) {
        reading = { ...seen, category: '', sidc: '', reasoning: '' }
        located = { ...located, query: photoHit.query || located.query }
      }
    }
  }
  if (!reading) reading = heuristic(text, sourceKind)
  const category = categoryFrom(sourceKind, text, reading.category)
  const modelCategory = CATEGORY_SET.has(reading.category) ? reading.category : ''
  const sidc = modelCategory && modelCategory !== category
    ? DEFAULT_SIDC[category]
    : (cleanSidc(reading.sidc) || DEFAULT_SIDC[category])
  const place = located.label || reading.place || located.query || ''
  return {
    place,
    query: located.query || reading.query || reading.place || '',
    category,
    sidc,
    reasoning: reading.reasoning || (place ? `The headline names ${place}.` : ''),
    lat: Number.isFinite(located.lat) ? located.lat : null,
    lon: Number.isFinite(located.lon) ? located.lon : null,
    engine,
    genkit: hasGenkit(),
  }
}

module.exports = { locateHeadline, CATEGORIES, DEFAULT_SIDC }
