const API_BASE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : ''

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
  try {
    const data = API_BASE
      ? await fetchJsonWithTimeout(`${API_BASE}/api/adsb/mil`, 15000)
      : await fetchJsonWithTimeout('https://api.adsb.lol/v2/mil', 15000)
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
  } catch (err) {
    console.warn('[SuperMap Mil Aircraft]', err?.message || err)
    return { type: 'FeatureCollection', features: [] }
  }
}

export async function fetchUkraineFrontline() {
  try {
    const data = await fetchJsonWithTimeout('https://deepstatemap.live/api/history/last', 15000)
    if (data?.type === 'FeatureCollection') return data
    if (data?.geojson) return data.geojson
    if (Array.isArray(data?.features)) return { type: 'FeatureCollection', features: data.features }
    return { type: 'FeatureCollection', features: [] }
  } catch (err) {
    console.warn('[SuperMap Ukraine Frontline]', err?.message || err)
    return { type: 'FeatureCollection', features: [] }
  }
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
  // IODA API is sometimes unavailable/changes; avoid spamming logs/retries on failures.
  // Cool down for a bit after any non-success to prevent repeated 404/400 floods.
  if (typeof globalThis !== 'undefined') {
    if (!globalThis.__supermapIodaState) globalThis.__supermapIodaState = { cooldownUntil: 0, lastWarnAt: 0 }
    const s = globalThis.__supermapIodaState
    if (Date.now() < (s.cooldownUntil || 0)) return { type: 'FeatureCollection', features: [] }
  }
  try {
    const now = Math.floor(Date.now() / 1000)
    const from = now - 60 * 60 // last hour
    const url = `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts?entityType=country&datasource=bgp&from=${from}&until=${now}&limit=500`
    const data = await fetchJsonWithTimeout(url, 12000)
    const entries = Array.isArray(data?.data) ? data.data : []

    const features = entries
      .filter((e) => e?.entity?.code)
      .map((e) => {
        const code = String(e.entity.code || '').toUpperCase()
        const countryCoords = COUNTRY_CENTROIDS[code]
        if (!countryCoords) return null

        const historyValue = Number(e.historyValue)
        const value = Number(e.value)
        const drop = historyValue > 0 && Number.isFinite(value) ? 1 - value / historyValue : 0
        const severity = Math.max(0, Math.min(100, Math.round(drop * 100)))

        // Only show meaningful disruptions; avoid "normal" spam.
        const levelText = String(e.level || '').toLowerCase()
        if (levelText && levelText !== 'critical' && severity < 10) return null

        return {
          type: 'Feature',
          properties: {
            title: `${e.entity?.name || code} Internet Outage`,
            country: code,
            level: severity,
            datasource: e.datasource || 'bgp',
            iodaLevel: e.level || '',
            time: e.time || null,
            source: 'IODA',
          },
          geometry: { type: 'Point', coordinates: countryCoords },
        }
      })
      .filter(Boolean)

    return { type: 'FeatureCollection', features }
  } catch (err) {
    if (typeof globalThis !== 'undefined') {
      const s = globalThis.__supermapIodaState || (globalThis.__supermapIodaState = { cooldownUntil: 0, lastWarnAt: 0 })
      s.cooldownUntil = Date.now() + 10 * 60 * 1000
      const msg = String(err?.message || err || '')
      // Warn at most once per cooldown window.
      if (Date.now() - (s.lastWarnAt || 0) > 10 * 60 * 1000) {
        s.lastWarnAt = Date.now()
        console.warn('[SuperMap IODA]', msg)
      }
    } else {
      console.warn('[SuperMap IODA]', err?.message || err)
    }
    return { type: 'FeatureCollection', features: [] }
  }
}

const COUNTRY_CENTROIDS = {
  US: [-98.58, 39.83], GB: [-3.44, 55.38], UK: [-3.44, 55.38], UA: [31.17, 48.38], RU: [105.32, 61.52],
  CN: [104.2, 35.86], IN: [78.96, 20.59], IR: [53.69, 32.43], IL: [34.85, 31.05],
  DE: [10.45, 51.17], FR: [2.21, 46.23], TR: [35.24, 38.96], SA: [45.08, 23.89],
  SY: [38.99, 34.8], IQ: [43.68, 33.22], AF: [67.71, 33.94], PK: [69.35, 30.38],
  BR: [-51.93, -14.24], NG: [8.68, 9.08], EG: [30.8, 26.82], JP: [138.25, 36.2],
  KR: [127.77, 35.91], AU: [133.78, -25.27], MX: [-102.55, 23.63], ZA: [22.94, -30.56],
  ET: [40.49, 9.15], SD: [30.22, 12.86], YE: [48.52, 15.55], MM: [95.96, 21.91],
  VE: [-66.59, 6.42], CU: [-77.78, 21.52], KP: [127.51, 40.34],
  CA: [-106.35, 56.13], NL: [5.29, 52.13], IT: [12.57, 41.87], ES: [-3.75, 40.46],
  PL: [19.39, 51.92], ID: [113.92, -0.79], MY: [101.98, 4.21], TH: [100.99, 15.87],
  VN: [108.28, 14.06], PH: [121.77, 12.88], NZ: [174.89, -40.9], AR: [-63.62, -38.42],
  CO: [-74.3, 4.57], CL: [-71.54, -35.68], PE: [-75.0, -9.19], KE: [37.91, -0.02],
  GH: [-1.62, 7.95], TZ: [34.89, -6.37], DZ: [2.63, 28.03], MA: [-7.09, 31.79],
  RO: [24.97, 45.94], CZ: [15.47, 49.82], GR: [21.82, 39.08], PT: [-8.22, 39.4],
  HU: [19.5, 47.16], SE: [18.64, 60.13], NO: [8.47, 60.47], FI: [26.27, 64.5],
  IE: [-8.24, 53.41], CH: [8.23, 46.82], AT: [14.55, 47.52], BE: [4.47, 50.5],
  BG: [25.49, 42.73], HR: [15.98, 45.1], RS: [20.83, 44.02],
  KZ: [67.3, 48.02], UZ: [64.43, 41.38], QA: [51.18, 25.29], AE: [53.85, 23.42],
  BD: [90.36, 23.68], LK: [80.77, 7.87], NP: [84.12, 28.39], TW: [120.96, 23.7],
  HK: [114.16, 22.28], SG: [103.82, 1.35],
}
