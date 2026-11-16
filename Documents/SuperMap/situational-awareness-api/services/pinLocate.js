/**
 * Turn a headline into a map draft.
 * Genkit (Gemini) reads the text first. A place-name pass covers the
 * case where no model key is configured.
 */

const { locatePin, readImagePlace, hasGenkit } = require('./thielGenkit')
const { extractPlaces } = require('./geotagger')
const { searchPlaces } = require('./placeSearch')
const { pickHeadlinePlace, distanceKm } = require('./headlinePlaces')

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
  ['attack', /\b(attacks?|strikes?|struck|striking|shelling|missiles?|airstrikes?|shots?)\b/i],
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

const NOT_A_PLACE = /^(zelenskyy?|putin|biden|trump|netanyahu|khamenei|starshield|starlink|nato)$/i

function writtenPlaces(text) {
  const found = []
  const pattern = /\b(?:in|at|near|outside|around|over|across|hits|hit|from|on|to)\s+([A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,2})/gu
  for (const match of String(text || '').matchAll(pattern)) found.push(match[1])
  return [...extractPlaces(text), ...found]
    .map(tidyPlace)
    .filter((name) => name.length > 2 && !blankPlace(name) && !NOT_A_PLACE.test(name))
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

function sameCountry(hit, country) {
  if (!country) return true
  const blob = `${hit?.display_name || ''} ${hit?.name || ''}`.toLowerCase()
  return blob.includes(String(country).toLowerCase())
}

async function geocodeFirst(names, country) {
  const tried = new Set()
  let guess = ''
  const wanted = String(country || '').trim()
  for (const name of names) {
    const base = tidyPlace(name)
    if (!base || blankPlace(base) || NOT_A_PLACE.test(base)) continue
    const queries = [base]
    if (wanted && !base.toLowerCase().includes(wanted.toLowerCase())) queries.push(`${base}, ${wanted}`)
    for (const query of queries) {
      if (tried.has(query.toLowerCase())) continue
      tried.add(query.toLowerCase())
      if (!guess) guess = query
      const rows = await searchPlaces(query, 5)
      const hit = rows.find((row) => sameCountry(row, wanted))
      if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lon)) {
        return { lat: hit.lat, lon: hit.lon, query, label: hit.display_name || hit.name || query }
      }
    }
  }
  return { lat: null, lon: null, query: guess, label: guess }
}

function pointFrom(picked, hit) {
  const near = hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lon)
    && (!Number.isFinite(picked.lat) || distanceKm(picked, hit) <= 80)
  if (near) {
    return { lat: hit.lat, lon: hit.lon, query: picked.query || hit.query, label: picked.label || hit.label, zoom: picked.zoom || 11 }
  }
  if (Number.isFinite(picked?.lat) && Number.isFinite(picked?.lon)) {
    return { lat: picked.lat, lon: picked.lon, query: picked.query, label: picked.label, zoom: picked.zoom }
  }
  return null
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
  const picked = pickHeadlinePlace(text)
  let located = { lat: null, lon: null, query: '', label: '', zoom: null }
  let engine = 'places'
  let reading = null

  if (picked && Number.isFinite(picked.lat) && !picked.facility) {
    located = { lat: picked.lat, lon: picked.lon, query: picked.query, label: picked.label, zoom: picked.zoom }
  } else if (picked) {
    const hit = await geocodeFirst([picked.query, picked.label], picked.country)
    const point = pointFrom(picked, hit)
    if (point) located = point
  }

  if (!Number.isFinite(located.lat)) {
    const country = picked?.country || ''
    const placed = await geocodeFirst(named, country)
    if (Number.isFinite(placed.lat)) {
      located = { ...placed, zoom: 10 }
    } else {
      const model = await Promise.race([
        hasGenkit()
          ? locatePin({ title: headline, summary: body, url, kind: sourceKind }).catch(() => null)
          : Promise.resolve(null),
        new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
      ])
      reading = usefulReading(model)
      if (reading && !NOT_A_PLACE.test(reading.place || '') && !NOT_A_PLACE.test(reading.query || '')) {
        const modelHit = await geocodeFirst([reading.query, reading.place], country)
        if (Number.isFinite(modelHit.lat)) {
          located = { ...modelHit, zoom: 10 }
          engine = 'genkit'
        }
      }
    }
  }
  if (!Number.isFinite(located.lat) && !named.length && !picked && image) {
    const seen = usefulReading(await readImagePlace(image).catch(() => null))
    if (seen) {
      const photoHit = await geocodeFirst([seen.query, seen.place])
      if (Number.isFinite(photoHit.lat)) {
        located = { ...photoHit, zoom: 10 }
        engine = 'image'
        reading = reading || { ...seen, category: '', sidc: '', reasoning: `The photo names ${photoHit.query}.` }
      } else if (!reading) {
        reading = { ...seen, category: '', sidc: '', reasoning: '' }
        located = { ...located, query: photoHit.query || located.query }
      }
    }
  }
  if (!reading) {
    reading = picked
      ? { place: picked.label, query: picked.query, category: '', sidc: '', reasoning: picked.reasoning }
      : heuristic(text, sourceKind)
  }
  const category = categoryFrom(sourceKind, text, reading.category)
  const modelCategory = CATEGORY_SET.has(reading.category) ? reading.category : ''
  const sidc = modelCategory && modelCategory !== category
    ? DEFAULT_SIDC[category]
    : (cleanSidc(reading.sidc) || DEFAULT_SIDC[category])
  const place = picked?.label || located.label || reading.place || located.query || ''
  let reasoning = reading.reasoning || (place ? `The headline names ${place}.` : '')
  if (Number.isFinite(located.lat) && /no place (name )?stood out/i.test(reasoning)) {
    reasoning = `The headline names ${place}.`
  }
  return {
    place,
    query: located.query || reading.query || reading.place || '',
    category,
    sidc,
    reasoning,
    lat: Number.isFinite(located.lat) ? located.lat : null,
    lon: Number.isFinite(located.lon) ? located.lon : null,
    zoom: Number.isFinite(located.lat) ? (located.zoom || 10) : null,
    engine,
    genkit: hasGenkit(),
  }
}

module.exports = { locateHeadline, CATEGORIES, DEFAULT_SIDC }
