/**
 * Major-event feeds for the community map.
 * ACLED: armed events in the last 14 days with 5 or more fatalities.
 * GDELT: one hourly article search, geocoded with the same place search as the map.
 */

const axios = require('axios')
const NodeCache = require('node-cache')
const { searchPlaces } = require('./placeSearch')

const cache = new NodeCache({ stdTTL: 6 * 60 * 60, checkperiod: 120 })
const GDELT_TTL_SECONDS = 60 * 60
const ARMED_TYPES = new Set(['Battles', 'Explosions/Remote violence', 'Violence against civilians'])
const EMPTY = { type: 'FeatureCollection', features: [] }

let acledToken = null
let acledWarned = false
let lastAcled = null
let lastGdelt = null

function emptyCollection() {
  return { type: 'FeatureCollection', features: [] }
}

function dayStamp(date) {
  return date.toISOString().slice(0, 10)
}

function noteText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500)
}

function acledFeature(row) {
  const lat = Number(row.latitude)
  const lon = Number(row.longitude)
  const fatalities = Number(row.fatalities)
  if (!ARMED_TYPES.has(row.event_type)) return null
  if (!Number.isFinite(fatalities) || fatalities < 5) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const place = [row.location, row.country].filter(Boolean).join(', ')
  const subtype = row.sub_event_type ? ` · ${row.sub_event_type}` : ''
  return {
    type: 'Feature',
    id: row.event_id_cnty || undefined,
    properties: {
      kind: 'conflict',
      source: 'ACLED',
      title: place || row.event_type,
      type: `${row.event_type}${subtype}`,
      place,
      date: row.event_date || '',
      fatalities,
      actor: row.actor1 || '',
      notes: noteText(row.notes),
      link: 'https://acleddata.com/',
    },
    geometry: { type: 'Point', coordinates: [lon, lat] },
  }
}

async function readAcledToken() {
  const username = String(process.env.ACLED_USERNAME || '').trim()
  const password = String(process.env.ACLED_PASSWORD || '').trim()
  if (!username || !password) {
    if (!acledWarned) {
      console.warn('[ACLED] not configured')
      acledWarned = true
    }
    return null
  }
  if (acledToken && acledToken.expiresAt > Date.now() + 60 * 1000) return acledToken.access
  const body = new URLSearchParams({
    username,
    password,
    grant_type: 'password',
    client_id: 'acled',
    scope: 'authenticated',
  })
  const { data } = await axios.post('https://acleddata.com/oauth/token', body.toString(), {
    timeout: 20000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  const access = data?.access_token
  if (!access) throw new Error('ACLED token response had no access_token')
  const expiresIn = Number(data.expires_in) || 24 * 60 * 60
  acledToken = { access, expiresAt: Date.now() + expiresIn * 1000 }
  return access
}

async function fetchAcledRows(token) {
  const end = new Date()
  const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000)
  const { data, status } = await axios.get('https://acleddata.com/api/acled/read', {
    timeout: 45000,
    headers: { Authorization: `Bearer ${token}` },
    params: {
      event_date: `${dayStamp(start)}|${dayStamp(end)}`,
      event_date_where: 'BETWEEN',
      event_type: 'Battles|Explosions/Remote violence|Violence against civilians',
      fatalities: 5,
      fatalities_where: '>=',
      limit: 5000,
      fields: 'event_id_cnty|event_date|event_type|sub_event_type|country|actor1|location|latitude|longitude|fatalities|notes',
    },
    validateStatus: () => true,
  })
  if (status !== 200 || !Array.isArray(data?.data)) {
    const message = data?.message || data?.error || `HTTP ${status}`
    throw new Error(`ACLED read failed: ${message}`)
  }
  return data.data
}

async function acledGeoJson() {
  const cached = cache.get('acled')
  if (cached) return cached
  const token = await readAcledToken()
  if (!token) return lastAcled || emptyCollection()
  try {
    const features = (await fetchAcledRows(token)).map(acledFeature).filter(Boolean)
    const collection = { type: 'FeatureCollection', features }
    cache.set('acled', collection)
    lastAcled = collection
    return collection
  } catch (error) {
    console.warn('[ACLED]', error.message)
    return lastAcled || emptyCollection()
  }
}

function gdeltQuery() {
  return '(invasion OR airstrike OR missile OR ceasefire OR mobilization OR coup OR earthquake OR tsunami OR cyclone OR evacuation) sourcelang:english'
}

async function geocodeArticle(article) {
  const title = String(article?.title || '').replace(/\s+/g, ' ').trim()
  if (!title) return null
  let places = []
  try {
    places = await searchPlaces(title, 1)
  } catch (error) {
    console.warn('[GDELT] geocode:', error.message)
    return null
  }
  const place = places[0]
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return null
  return {
    type: 'Feature',
    properties: {
      kind: 'report',
      source: article.domain || article.sourcecountry || 'GDELT',
      title,
      type: 'News report',
      place: place.display_name || place.name || '',
      date: article.seendate || '',
      link: article.url || '',
    },
    geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      out[index] = await fn(items[index])
    }
  }
  const workers = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return out
}

async function fetchGdeltArticles() {
  const request = () => axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
    timeout: 25000,
    headers: { 'User-Agent': 'SuperMap/1.0 (community map; contact via the site)' },
    params: {
      query: gdeltQuery(),
      mode: 'artlist',
      maxrecords: 25,
      format: 'json',
      timespan: '24h',
    },
    validateStatus: () => true,
  })
  let response = await request()
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 6000))
    response = await request()
  }
  return response
}

async function gdeltGeoJson() {
  const cached = cache.get('gdelt')
  if (cached) return cached
  try {
    const { data, status } = await fetchGdeltArticles()
    if (status !== 200 || !Array.isArray(data?.articles)) {
      throw new Error(`GDELT HTTP ${status}`)
    }
    const features = (await mapPool(data.articles, 4, geocodeArticle)).filter(Boolean)
    const collection = { type: 'FeatureCollection', features }
    cache.set('gdelt', collection, GDELT_TTL_SECONDS)
    lastGdelt = collection
    return collection
  } catch (error) {
    console.warn('[GDELT]', error.message)
    return lastGdelt || emptyCollection()
  }
}

module.exports = {
  EMPTY,
  acledFeature,
  acledGeoJson,
  gdeltGeoJson,
}
