async function fetchJsonWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(id)
  }
}

export async function fetchMilitaryAircraft() {
  const data = await fetchJsonWithTimeout('https://api.adsb.lol/v2/mil', 15000)
  const aircraft = Array.isArray(data?.ac) ? data.ac : []
  return {
    type: 'FeatureCollection',
    features: aircraft
      .filter((a) => a.lat != null && a.lon != null)
      .map((a) => ({
        type: 'Feature',
        properties: {
          title: a.flight?.trim() || a.r || 'MIL',
          hex: a.hex || '',
          type: a.t || '',
          alt: a.alt_baro || a.alt_geom || 0,
          speed: a.gs || 0,
          source: 'adsb.lol/mil',
        },
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      })),
  }
}

export async function fetchUkraineFrontline() {
  const data = await fetchJsonWithTimeout('https://deepstatemap.live/api/history/last', 15000)
  if (data?.type === 'FeatureCollection') return data
  if (data?.geojson) return data.geojson
  if (Array.isArray(data?.features)) return { type: 'FeatureCollection', features: data.features }
  throw new Error('No frontline data')
}

export async function fetchSpaceWeather() {
  const rows = await fetchJsonWithTimeout('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', 10000)
  if (!Array.isArray(rows) || rows.length < 2) return { kp: 0, label: 'Quiet' }
  const latest = rows[rows.length - 1]
  const kp = parseFloat(latest[1]) || 0
  let label = 'Quiet'
  if (kp >= 5) label = `Storm G${Math.min(5, Math.floor(kp) - 4)}`
  else if (kp >= 4) label = 'Active'
  else if (kp >= 3) label = 'Unsettled'
  return { kp, label, time: latest[0] }
}

export async function fetchInternetOutages() {
  const data = await fetchJsonWithTimeout('https://api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/country?datasource=bgp&from=-1h&until=now', 12000)
  const entries = Array.isArray(data?.data) ? data.data : []
  const features = entries
    .filter((e) => e.entity?.code && e.scores?.length)
    .map((e) => {
      const score = e.scores[e.scores.length - 1]
      const level = score?.score ?? 1
      if (level > 0.8) return null
      const countryCoords = COUNTRY_CENTROIDS[e.entity.code?.toUpperCase()]
      if (!countryCoords) return null
      return {
        type: 'Feature',
        properties: {
          title: `${e.entity.name || e.entity.code} Internet Outage`,
          country: e.entity.code,
          level: Math.round((1 - level) * 100),
          source: 'IODA',
        },
        geometry: { type: 'Point', coordinates: countryCoords },
      }
    })
    .filter(Boolean)
  return { type: 'FeatureCollection', features }
}

const COUNTRY_CENTROIDS = {
  US: [-98.58, 39.83], GB: [-3.44, 55.38], UA: [31.17, 48.38], RU: [105.32, 61.52],
  CN: [104.2, 35.86], IN: [78.96, 20.59], IR: [53.69, 32.43], IL: [34.85, 31.05],
  DE: [10.45, 51.17], FR: [2.21, 46.23], TR: [35.24, 38.96], SA: [45.08, 23.89],
  SY: [38.99, 34.8], IQ: [43.68, 33.22], AF: [67.71, 33.94], PK: [69.35, 30.38],
  BR: [-51.93, -14.24], NG: [8.68, 9.08], EG: [30.8, 26.82], JP: [138.25, 36.2],
  KR: [127.77, 35.91], AU: [133.78, -25.27], MX: [-102.55, 23.63], ZA: [22.94, -30.56],
  ET: [40.49, 9.15], SD: [30.22, 12.86], YE: [48.52, 15.55], MM: [95.96, 21.91],
  VE: [-66.59, 6.42], CU: [-77.78, 21.52], KP: [127.51, 40.34],
}
