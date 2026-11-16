/**
 * Major-event feeds for the community map.
 * ACLED: armed events in the last 14 days with 5 or more fatalities, when credentials are set.
 * GDELT: the last day of located events. Fights are conflicts. Threats, protests, and coercion are reports.
 */

const axios = require('axios')
const zlib = require('zlib')
const NodeCache = require('node-cache')

const cache = new NodeCache({ stdTTL: 6 * 60 * 60, checkperiod: 120 })
const ARMED_TYPES = new Set(['Battles', 'Explosions/Remote violence', 'Violence against civilians'])
const EMPTY = { type: 'FeatureCollection', features: [] }

let acledToken = null
let acledWarned = false
let lastAcled = null

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

const EVENT_LABELS = {
  13: 'Threat',
  14: 'Protest',
  15: 'Military posture',
  16: 'Diplomatic break',
  17: 'Coercion',
  18: 'Assault',
  19: 'Fight',
  20: 'Mass violence',
}
const CONFLICT_HOURS = 24

function unzipText(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) throw new Error('Not a zip')
  const method = buf.readUInt16LE(8)
  const compressed = buf.readUInt32LE(18)
  const nameLen = buf.readUInt16LE(26)
  const extraLen = buf.readUInt16LE(28)
  const start = 30 + nameLen + extraLen
  if (!compressed || start + compressed > buf.length) throw new Error('Zip entry has no size')
  const slice = buf.subarray(start, start + compressed)
  return (method === 0 ? slice : zlib.inflateRawSync(slice)).toString('utf8')
}

function labelActor(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length < 2) return ''
  if (text.length <= 4 && text === text.toUpperCase()) return text
  return text.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (_match, lead, letter) => lead + letter.toUpperCase())
}

function stampToDate(stamp) {
  return new Date(Date.UTC(
    Number(stamp.slice(0, 4)),
    Number(stamp.slice(4, 6)) - 1,
    Number(stamp.slice(6, 8)),
    Number(stamp.slice(8, 10)),
    Number(stamp.slice(10, 12)),
    Number(stamp.slice(12, 14)),
  ))
}

function dateToStamp(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
}

function conflictRows(csv) {
  const rows = []
  for (const line of String(csv || '').split('\n')) {
    if (!line) continue
    const column = line.split('\t')
    if (column.length < 61) continue
    const label = EVENT_LABELS[column[28]]
    if (!label) continue
    const layer = Number(column[28]) >= 18 ? 'conflict' : 'report'
    const geoType = Number(column[51])
    if (geoType < 1 || geoType > 5) continue
    const lat = Number(column[56])
    const lon = Number(column[57])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) continue
    const articles = Number(column[33]) || 0
    const mentions = Number(column[31]) || 0
    if (articles < 5 && mentions < 20) continue
    const place = String(column[52] || '').replace(/\s+/g, ' ').trim()
    const actors = [labelActor(column[6]), labelActor(column[16])].filter(Boolean)
    const day = column[1]
    const date = /^\d{8}$/.test(day) ? `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}` : ''
    const where = place ? place.split(',')[0] : ''
    rows.push({
      articles,
      layer,
      key: `${label}:${lat.toFixed(1)}:${lon.toFixed(1)}`,
      feature: {
        type: 'Feature',
        properties: {
          kind: layer,
          source: 'GDELT',
          title: layer === 'report'
            ? `${label} reported${where ? ` in ${where}` : ''}`
            : (actors.length ? `${label}: ${actors.join(' and ')}` : `${label}${where ? ` in ${where}` : ''}`),
          type: layer === 'report' ? 'News report' : label,
          place,
          date,
          actor: actors.join(', '),
          notes: articles ? `Covered by ${articles} articles.` : '',
          link: column[60] || 'https://www.gdeltproject.org/',
        },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      },
    })
  }
  return rows
}

async function latestConflictStamp() {
  try {
    const { data, status } = await axios.get('https://data.gdeltproject.org/gdeltv2/lastupdate.txt', {
      timeout: 15000,
      responseType: 'text',
      validateStatus: () => true,
    })
    const match = status === 200 ? String(data).match(/(\d{14})\.export\.CSV\.zip/) : null
    if (match) return match[1]
  } catch (error) {
    console.warn('[GDELT export]', error.message)
  }
  const now = new Date()
  now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 15) * 15, 0, 0)
  return dateToStamp(now)
}

async function fetchConflictFile(stamp) {
  const url = `https://data.gdeltproject.org/gdeltv2/${stamp}.export.CSV.zip`
  try {
    const { data, status } = await axios.get(url, {
      timeout: 20000,
      responseType: 'arraybuffer',
      validateStatus: () => true,
      headers: { 'User-Agent': 'SuperMap/1.0 (community map; +https://goodpalantir.cloutyskies.org)' },
    })
    if (status !== 200 || !data) return []
    return conflictRows(unzipText(Buffer.from(data)))
  } catch (error) {
    console.warn('[GDELT export]', stamp, error.message)
    return []
  }
}

function packEvents(rows) {
  const best = new Map()
  rows.forEach((row) => {
    const previous = best.get(row.key)
    if (!previous || row.articles > previous.articles) best.set(row.key, row)
  })
  return [...best.values()]
    .sort((a, b) => b.articles - a.articles)
    .slice(0, 200)
    .map((row) => row.feature)
}

async function loadRecentEvents() {
  const cached = cache.get('gdelt-events')
  if (cached) return cached
  const latest = await latestConflictStamp()
  const start = stampToDate(latest)
  const stamps = Array.from({ length: CONFLICT_HOURS * 4 }, (_item, index) => (
    dateToStamp(new Date(start.getTime() - index * 15 * 60 * 1000))
  ))
  const batches = (await mapPool(stamps, 8, fetchConflictFile)).flat()
  const result = {
    conflicts: { type: 'FeatureCollection', features: packEvents(batches.filter((row) => row.layer === 'conflict')) },
    reports: { type: 'FeatureCollection', features: packEvents(batches.filter((row) => row.layer === 'report')) },
  }
  const count = result.conflicts.features.length + result.reports.features.length
  cache.set('gdelt-events', result, count ? 30 * 60 : 5 * 60)
  return result
}

async function gdeltConflictGeoJson() {
  return (await loadRecentEvents()).conflicts
}

async function gdeltGeoJson() {
  try {
    return await (await loadRecentEvents()).reports
  } catch (error) {
    console.warn('[GDELT]', error.message)
    return emptyCollection()
  }
}

async function conflictGeoJson() {
  const [acled, gdelt] = await Promise.all([
    acledGeoJson().catch(() => emptyCollection()),
    gdeltConflictGeoJson().catch(() => emptyCollection()),
  ])
  return {
    type: 'FeatureCollection',
    features: [...(acled.features || []), ...(gdelt.features || [])],
  }
}

module.exports = {
  EMPTY,
  acledFeature,
  acledGeoJson,
  conflictGeoJson,
  gdeltGeoJson,
}
