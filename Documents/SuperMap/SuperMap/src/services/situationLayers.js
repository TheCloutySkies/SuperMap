import { fetchGdacsEvents, fetchUsgsVolcanoes } from './layerServices'
import { ensurePinEmoji } from '../lib/mapEmoji'
import { ensureSidcIcon, EARTHQUAKE_SIDC, WILDFIRE_SIDC } from '../lib/milSymbols'

const API_BASE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : ''

export const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] }

function apiUrl(path) {
  return `${API_BASE}${path}`
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export async function fetchAcledEvents() {
  const data = await fetchJson(apiUrl('/api/conflicts/acled'))
  return data?.type === 'FeatureCollection' ? data : EMPTY_COLLECTION
}

export async function fetchGdeltReports() {
  const data = await fetchJson(apiUrl('/api/conflicts/gdelt'))
  return data?.type === 'FeatureCollection' ? data : EMPTY_COLLECTION
}

function gdacsLevel(properties = {}) {
  return String(properties.alertlevel || properties.episodealertlevel || properties.alertLevel || '').toLowerCase()
}

function quakeFeatures(collection) {
  return (collection?.features || []).map((feature) => {
    const props = feature.properties || {}
    const coords = feature.geometry?.coordinates
    if (!coords || coords.length < 2) return null
    const when = props.time ? new Date(props.time).toISOString().slice(0, 16).replace('T', ' ') : ''
    return {
      type: 'Feature',
      properties: {
        kind: 'quake',
        source: 'USGS',
        title: props.title || props.place || 'Earthquake',
        type: props.mag != null ? `M${props.mag}` : 'Earthquake',
        place: props.place || '',
        date: when,
        link: props.url || 'https://earthquake.usgs.gov/',
        sidc: EARTHQUAKE_SIDC,
        icon: EARTHQUAKE_SIDC,
      },
      geometry: { type: 'Point', coordinates: [Number(coords[0]), Number(coords[1])] },
    }
  }).filter(Boolean)
}

function isWildfire(props) {
  const type = String(props.eventtype || '').trim().toUpperCase()
  if (type === 'WF') return true
  const name = `${props.eventname || ''} ${props.name || ''}`.toLowerCase()
  return /forest fire|wild[\s-]?fire|bushfire|brush fire/.test(name)
}

const DISASTER_LABELS = {
  TC: 'Tropical cyclone',
  EQ: 'Earthquake',
  FL: 'Flood',
  WF: 'Wildfire',
  VO: 'Volcanic eruption',
  DR: 'Drought',
  TS: 'Tsunami',
}

function cleanSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function namedStorm(eventname) {
  const stem = String(eventname || '').trim().replace(/-\d{2,4}$/, '')
  if (!/^[A-Za-z]{3,}$/.test(stem)) return ''
  return stem.charAt(0) + stem.slice(1).toLowerCase()
}

function feedDate(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return cleanSpace(text.replace('T', ' '))
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function disasterWhen(from, to) {
  const start = feedDate(from)
  const end = feedDate(to)
  if (start && end && start !== end) return `${start} – ${end}`
  return start || end
}

function windNote(severity) {
  const speed = Number(severity?.severity)
  const unit = String(severity?.severityunit || '')
  if (!Number.isFinite(speed) || speed < 30 || !/km/i.test(unit)) return ''
  const rounded = Math.round(speed)
  let kind = 'a tropical depression'
  if (rounded >= 252) kind = 'a category 5 hurricane'
  else if (rounded >= 209) kind = 'a category 4 hurricane'
  else if (rounded >= 178) kind = 'a category 3 hurricane'
  else if (rounded >= 154) kind = 'a category 2 hurricane'
  else if (rounded >= 119) kind = 'a category 1 hurricane'
  else if (rounded >= 63) kind = 'a tropical storm'
  return `Winds reached ${rounded} km/h, ${kind}.`
}

function severityNote(props) {
  if (String(props.eventtype || '').toUpperCase() === 'TC') return windNote(props.severitydata)
  const text = cleanSpace(props.severitydata?.severitytext)
  if (!text || /^magnitude\s*0\b/i.test(text)) return ''
  return /[.!?]$/.test(text) ? text : `${text}.`
}

function disasterTitle(props, label) {
  const code = String(props.eventtype || '').toUpperCase()
  const storm = namedStorm(props.eventname)
  if (code === 'TC' && storm) return `Tropical cyclone ${storm}`
  const name = cleanSpace(props.name)
  if (name && !/^[A-Z0-9-]{2,16}$/.test(name)) return name
  if (storm && label) return `${label} ${storm}`
  return name || label || 'Disaster'
}

function disasterLink(url) {
  if (!url) return 'https://www.gdacs.org/'
  if (typeof url === 'string') return url
  return url.report || url.details || 'https://www.gdacs.org/'
}

function disasterFeatures(collection) {
  return (collection?.features || []).map((feature) => {
    const props = feature.properties || {}
    const level = gdacsLevel(props)
    if (level !== 'orange' && level !== 'red') return null
    const coords = feature.geometry?.coordinates
    if (!coords || coords.length < 2) return null
    const wildfire = isWildfire(props)
    const code = String(props.eventtype || '').trim().toUpperCase()
    const label = DISASTER_LABELS[code] || ''
    const title = disasterTitle(props, label)
    return {
      type: 'Feature',
      properties: {
        kind: 'disaster',
        source: 'GDACS',
        title,
        type: title.toLowerCase().includes(label.toLowerCase()) ? '' : label,
        place: cleanSpace(props.country),
        date: disasterWhen(props.fromdate, props.todate),
        notes: severityNote(props),
        alert: level,
        link: disasterLink(props.url || props.link),
        sidc: wildfire ? WILDFIRE_SIDC : '',
        icon: wildfire ? WILDFIRE_SIDC : (level === 'red' ? 'hazard-red' : 'hazard-orange'),
      },
      geometry: { type: 'Point', coordinates: [Number(coords[0]), Number(coords[1])] },
    }
  }).filter(Boolean)
}

function volcanoFeatures(collection) {
  return (collection?.features || []).map((feature) => {
    const props = feature.properties || {}
    const coords = feature.geometry?.coordinates
    if (!coords || coords.length < 2) return null
    return {
      type: 'Feature',
      properties: {
        kind: 'volcano',
        source: 'USGS',
        title: props.title || props.name || 'Volcano',
        type: 'Volcano',
        place: props.name || '',
        date: '',
        notes: props.synopsis || '',
        link: props.link || 'https://volcanoes.usgs.gov/',
        icon: '🌋',
      },
      geometry: feature.geometry,
    }
  }).filter(Boolean)
}

export async function fetchMajorHazards() {
  const [quakes, disasters, volcanoes] = await Promise.all([
    fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson').catch(() => EMPTY_COLLECTION),
    fetchGdacsEvents(null).catch(() => EMPTY_COLLECTION),
    fetchUsgsVolcanoes(null).catch(() => EMPTY_COLLECTION),
  ])
  return {
    type: 'FeatureCollection',
    features: [
      ...quakeFeatures(quakes),
      ...disasterFeatures(disasters),
      ...volcanoFeatures(volcanoes),
    ],
  }
}

function paintDisc(map, id, color) {
  if (!map || map.hasImage?.(id)) return
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, 64, 64)
  ctx.beginPath()
  ctx.arc(32, 32, 18, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = '#0b1220'
  ctx.stroke()
  try { map.addImage(id, ctx.getImageData(0, 0, 64, 64), { pixelRatio: 2 }) } catch { /* already added */ }
}

export function stampHazardIcons(map, collection) {
  paintDisc(map, 'hazard-orange', '#f97316')
  paintDisc(map, 'hazard-red', '#ef4444')
  const features = (collection?.features || []).map((feature) => {
    const icon = feature.properties?.icon || 'hazard-orange'
    const sidc = feature.properties?.sidc
    const iconImage = sidc
      ? ensureSidcIcon(map, sidc)
      : (icon.startsWith('hazard-') ? icon : ensurePinEmoji(map, icon))
    return { ...feature, properties: { ...(feature.properties || {}), iconImage } }
  })
  return { type: 'FeatureCollection', features }
}

export function kmBetween(lon1, lat1, lon2, lat2) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function nearestCorroboration(lon, lat, conflicts, reports) {
  let best = null
  const consider = (features, line) => {
    ;(features || []).forEach((feature) => {
      const coords = feature?.geometry?.coordinates
      if (!coords || coords.length < 2) return
      const km = kmBetween(lon, lat, Number(coords[0]), Number(coords[1]))
      if (!Number.isFinite(km) || km > 25) return
      if (!best || km < best.km) best = { km, line, title: feature.properties?.title || '' }
    })
  }
  consider(conflicts, 'Corroborated by ACLED')
  consider(reports, 'Corroborated by a news report')
  return best
}
