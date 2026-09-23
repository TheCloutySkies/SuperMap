/**
 * Crime map layer helpers — US state choropleth joined to /api/crime/states
 */
const API_BASE = (import.meta.env?.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env?.DEV ? '' : 'http://localhost:3001')

const US_STATES_GEOJSON_URL =
  'https://cdn.jsdelivr.net/gh/PublicaMundi/MappingAPI@master/data/geojson/us-states.json'

let statesGeoJsonCache = null

export async function fetchUsStatesGeoJson() {
  if (statesGeoJsonCache) return statesGeoJsonCache
  const res = await fetch(US_STATES_GEOJSON_URL)
  if (!res.ok) throw new Error(`US states GeoJSON ${res.status}`)
  statesGeoJsonCache = await res.json()
  return statesGeoJsonCache
}

export async function fetchCrimeStates(year) {
  const qs = year ? `?year=${encodeURIComponent(year)}` : ''
  const res = await fetch(`${API_BASE}/api/crime/states${qs}`)
  if (!res.ok) throw new Error(`Crime states ${res.status}`)
  return res.json()
}

/** Join state-summary rates onto US states polygons for choropleth fill. */
export async function buildCrimeStateChoropleth(metric = 'violentRate', year) {
  const [geo, payload] = await Promise.all([fetchUsStatesGeoJson(), fetchCrimeStates(year)])
  const rows = Array.isArray(payload?.data) ? payload.data : []
  const byName = new Map()
  const byAbbr = new Map()
  for (const row of rows) {
    if (row.name) byName.set(String(row.name).toLowerCase(), row)
    if (row.abbr) byAbbr.set(String(row.abbr).toUpperCase(), row)
  }

  const features = (geo.features || []).map((f) => {
    const props = f.properties || {}
    const name = props.name || props.NAME || props.STATE_NAME || ''
    const abbr = props.abbr || props.postal_ABBR || props.STUSPS || ''
    const row = byName.get(String(name).toLowerCase()) || byAbbr.get(String(abbr).toUpperCase()) || null
    const rate = row ? Number(row[metric]) : null
    return {
      ...f,
      properties: {
        ...props,
        name: row?.name || name,
        abbr: row?.abbr || abbr,
        violentRate: row?.violentRate ?? null,
        propertyRate: row?.propertyRate ?? null,
        homicideRate: row?.homicideRate ?? null,
        violentCrime: row?.violentCrime ?? null,
        propertyCrime: row?.propertyCrime ?? null,
        homicide: row?.homicide ?? null,
        violentChange: row?.violentChange ?? null,
        propertyChange: row?.propertyChange ?? null,
        population: row?.population ?? null,
        year: row?.year ?? null,
        rateValue: Number.isFinite(rate) ? rate : null,
        metric,
      },
    }
  })

  return {
    type: 'FeatureCollection',
    features,
    meta: payload?.meta,
  }
}

/** Color steps for violent crime rate per 100k (approximate FBI scale). */
export const CRIME_RATE_COLOR_EXPRESSION = [
  'interpolate',
  ['linear'],
  ['coalesce', ['get', 'rateValue'], 0],
  0, '#1a2e1a',
  150, '#3d7a3d',
  300, '#c9a227',
  450, '#d97706',
  600, '#dc2626',
  900, '#7f1d1d',
]
