/**
 * Weather backends: Open-Meteo suite, NWS (User-Agent SuperMapWeather),
 * OpenWeatherMap tiles, Windy Map Forecast (WINDY_API) for wind visualization.
 * Keys stay in env — never hardcode secrets here.
 */

const axios = require('axios')
const NodeCache = require('node-cache')

const cache = new NodeCache({ stdTTL: 10 * 60, checkperiod: 120 })

const OM = {
  forecast: 'https://api.open-meteo.com/v1/forecast',
  historical: 'https://historical-forecast-api.open-meteo.com/v1/forecast',
  marine: 'https://marine-api.open-meteo.com/v1/marine',
  airQuality: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  flood: 'https://flood-api.open-meteo.com/v1/flood',
  satellite: 'https://satellite-api.open-meteo.com/v1/archive',
}

const RAINVIEWER_API = 'https://api.rainviewer.com/public/weather-maps.json'

function nwsUserAgent() {
  const raw = String(process.env.NWS_USER_AGENT || '').trim()
  if (raw) return raw
  return 'SuperMapWeather (goodpalantir@cloutyskies.org)'
}

function owmKey() {
  return String(process.env.OPENWEATHERMAP_API_KEY || '').trim()
}

/** Map Forecast API key (client-side windyInit). Env: WINDY_API on Render. */
function windyKey() {
  return String(process.env.WINDY_API || process.env.WINDY_API_KEY || '').trim()
}

function parseLatLon(query = {}) {
  const lat = Number(query.lat ?? query.latitude)
  const lon = Number(query.lon ?? query.lng ?? query.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { lat, lon }
}

function cacheGet(key) {
  return cache.get(key)
}

function cacheSet(key, value, ttl) {
  if (ttl != null) cache.set(key, value, ttl)
  else cache.set(key, value)
  return value
}

async function getJson(url, params, headers = {}, timeout = 20000) {
  const res = await axios.get(url, {
    params,
    timeout,
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    validateStatus: (s) => s >= 200 && s < 500,
  })
  if (res.status >= 400) {
    const err = new Error(res.data?.reason || res.data?.error || `HTTP ${res.status}`)
    err.status = res.status
    err.body = res.data
    throw err
  }
  return res.data
}

/** Open-Meteo forecast (+ optional OWM enrich). */
async function getForecast({ lat, lon, days = 7, timezone } = {}) {
  const d = Math.min(16, Math.max(1, Number(days) || 7))
  const tz = timezone || 'auto'
  const cacheKey = `fc:${lat.toFixed(3)},${lon.toFixed(3)}:${d}:${tz}`
  const hit = cacheGet(cacheKey)
  if (hit) return { ...hit, _cached: true }

  const om = await getJson(OM.forecast, {
    latitude: lat,
    longitude: lon,
    timezone: tz,
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'cloud_cover',
      'pressure_msl',
    ].join(','),
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'cloud_cover',
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'apparent_temperature_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'sunrise',
      'sunset',
    ].join(','),
    forecast_days: d,
    wind_speed_unit: 'kmh',
  })

  let openWeather = null
  const key = owmKey()
  if (key) {
    try {
      const [current, forecast] = await Promise.all([
        getJson('https://api.openweathermap.org/data/2.5/weather', {
          lat,
          lon,
          units: 'metric',
          appid: key,
        }).catch(() => null),
        getJson('https://api.openweathermap.org/data/2.5/forecast', {
          lat,
          lon,
          units: 'metric',
          appid: key,
        }).catch(() => null),
      ])
      openWeather = { current, forecast }
    } catch (err) {
      console.warn('[weather] OWM supplement:', err.message)
    }
  }

  const payload = {
    lat,
    lon,
    days: d,
    source: 'open-meteo',
    openMeteo: om,
    openWeatherMap: openWeather,
    owmConfigured: Boolean(key),
  }
  return cacheSet(cacheKey, payload)
}

async function getHistorical({ lat, lon, startDate, endDate, timezone } = {}) {
  const end = endDate || new Date().toISOString().slice(0, 10)
  const start = startDate || (() => {
    const d = new Date(end)
    d.setUTCDate(d.getUTCDate() - 7)
    return d.toISOString().slice(0, 10)
  })()
  const cacheKey = `hist:${lat.toFixed(3)},${lon.toFixed(3)}:${start}:${end}`
  const hit = cacheGet(cacheKey)
  if (hit) return { ...hit, _cached: true }

  const om = await getJson(OM.historical, {
    latitude: lat,
    longitude: lon,
    start_date: start,
    end_date: end,
    timezone: timezone || 'auto',
    hourly: [
      'temperature_2m',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
    ].join(','),
  })

  return cacheSet(cacheKey, {
    lat,
    lon,
    startDate: start,
    endDate: end,
    source: 'open-meteo-historical-forecast',
    openMeteo: om,
  })
}

async function getMarine({ lat, lon, days = 7 } = {}) {
  const d = Math.min(8, Math.max(1, Number(days) || 7))
  const cacheKey = `marine:${lat.toFixed(3)},${lon.toFixed(3)}:${d}`
  const hit = cacheGet(cacheKey)
  if (hit) return { ...hit, _cached: true }

  const om = await getJson(OM.marine, {
    latitude: lat,
    longitude: lon,
    timezone: 'auto',
    current: [
      'wave_height',
      'wave_direction',
      'wave_period',
      'ocean_current_velocity',
      'ocean_current_direction',
    ].join(','),
    hourly: [
      'wave_height',
      'wave_direction',
      'wave_period',
      'wind_wave_height',
      'swell_wave_height',
      'sea_surface_temperature',
    ].join(','),
    forecast_days: d,
  })

  return cacheSet(cacheKey, {
    lat,
    lon,
    source: 'open-meteo-marine',
    openMeteo: om,
  })
}

async function getAirQuality({ lat, lon, days = 5 } = {}) {
  const d = Math.min(7, Math.max(1, Number(days) || 5))
  const cacheKey = `aq:${lat.toFixed(3)},${lon.toFixed(3)}:${d}`
  const hit = cacheGet(cacheKey)
  if (hit) return { ...hit, _cached: true }

  const om = await getJson(OM.airQuality, {
    latitude: lat,
    longitude: lon,
    timezone: 'auto',
    current: [
      'european_aqi',
      'us_aqi',
      'pm10',
      'pm2_5',
      'carbon_monoxide',
      'nitrogen_dioxide',
      'ozone',
      'sulphur_dioxide',
    ].join(','),
    hourly: [
      'pm10',
      'pm2_5',
      'european_aqi',
      'us_aqi',
      'ozone',
      'nitrogen_dioxide',
    ].join(','),
    forecast_days: d,
  })

  return cacheSet(cacheKey, {
    lat,
    lon,
    source: 'open-meteo-air-quality',
    openMeteo: om,
  })
}

async function getFlood({ lat, lon, days = 7 } = {}) {
  const d = Math.min(92, Math.max(1, Number(days) || 7))
  const cacheKey = `flood:${lat.toFixed(3)},${lon.toFixed(3)}:${d}`
  const hit = cacheGet(cacheKey)
  if (hit) return { ...hit, _cached: true }

  const om = await getJson(OM.flood, {
    latitude: lat,
    longitude: lon,
    daily: [
      'river_discharge',
      'river_discharge_mean',
      'river_discharge_median',
      'river_discharge_max',
      'river_discharge_min',
    ].join(','),
    forecast_days: d,
  })

  return cacheSet(cacheKey, {
    lat,
    lon,
    source: 'open-meteo-flood',
    openMeteo: om,
  })
}

async function getSatelliteRadiation({ lat, lon, startDate, endDate } = {}) {
  const end = endDate || new Date().toISOString().slice(0, 10)
  const start = startDate || (() => {
    const d = new Date(end)
    d.setUTCDate(d.getUTCDate() - 3)
    return d.toISOString().slice(0, 10)
  })()
  const cacheKey = `sat:${lat.toFixed(3)},${lon.toFixed(3)}:${start}:${end}`
  const hit = cacheGet(cacheKey)
  if (hit) return { ...hit, _cached: true }

  const om = await getJson(OM.satellite, {
    latitude: lat,
    longitude: lon,
    start_date: start,
    end_date: end,
    hourly: [
      'shortwave_radiation',
      'direct_radiation',
      'diffuse_radiation',
      'direct_normal_irradiance',
      'terrestrial_radiation',
    ].join(','),
  })

  return cacheSet(cacheKey, {
    lat,
    lon,
    startDate: start,
    endDate: end,
    source: 'open-meteo-satellite-radiation',
    openMeteo: om,
  })
}

/** NWS alerts for a point (+ optional forecast office metadata). */
async function getAlerts({ lat, lon } = {}) {
  const cacheKey = `nws:${lat.toFixed(2)},${lon.toFixed(2)}`
  const hit = cacheGet(cacheKey)
  if (hit) return { ...hit, _cached: true }

  const ua = nwsUserAgent()
  const headers = {
    'User-Agent': ua,
    Accept: 'application/geo+json, application/json',
  }

  let point = null
  let alerts = { type: 'FeatureCollection', features: [] }
  let forecast = null

  try {
    point = await getJson(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      {},
      headers,
    )
  } catch (err) {
    console.warn('[weather] NWS points:', err.message)
  }

  try {
    const data = await getJson(
      'https://api.weather.gov/alerts/active',
      { point: `${lat.toFixed(4)},${lon.toFixed(4)}` },
      headers,
    )
    alerts = {
      type: 'FeatureCollection',
      features: Array.isArray(data?.features) ? data.features : [],
    }
  } catch (err) {
    console.warn('[weather] NWS alerts:', err.message)
  }

  const forecastUrl = point?.properties?.forecast
  if (forecastUrl) {
    try {
      forecast = await getJson(forecastUrl, {}, headers)
    } catch (err) {
      console.warn('[weather] NWS forecast:', err.message)
    }
  }

  return cacheSet(cacheKey, {
    lat,
    lon,
    source: 'nws',
    userAgent: ua.split('(')[0].trim(),
    point,
    alerts,
    forecast,
  })
}

/** RainViewer + OWM tile templates for client radar layers. */
async function getRadarMeta() {
  const cacheKey = 'radar-meta'
  const hit = cacheGet(cacheKey)
  if (hit) return { ...hit, _cached: true }

  let rainviewer = null
  try {
    const data = await getJson(RAINVIEWER_API, {}, {}, 10000)
    const host = String(data.host || 'https://tilecache.rainviewer.com').replace(/\/$/, '')
    const past = data.radar?.past
    const latest = Array.isArray(past) && past.length ? past[past.length - 1] : null
    const path = latest?.path || '/v2/radar/0'
    rainviewer = {
      host,
      path,
      timestamp: latest?.time || null,
      precipTiles: `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`,
      attribution: '© RainViewer',
    }
  } catch (err) {
    console.warn('[weather] RainViewer:', err.message)
  }

  const key = owmKey()
  const owmTiles = key
    ? {
        precipitation: `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${key}`,
        wind: `https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${key}`,
        temperature: `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${key}`,
        clouds: `https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${key}`,
        attribution: '© OpenWeatherMap',
      }
    : null

  const windy = windyKey()

  return cacheSet(cacheKey, {
    rainviewer,
    openWeatherMapTiles: owmTiles,
    owmConfigured: Boolean(key),
    windyConfigured: Boolean(windy),
    windProvider: windy ? 'windy-map-forecast' : (owmTiles?.wind ? 'openweathermap' : null),
    layers: {
      precip: Boolean(rainviewer || owmTiles?.precipitation),
      // Wind visualization prefers Windy Map Forecast (WINDY_API); OWM tiles are fallback only.
      wind: Boolean(windy || owmTiles?.wind),
      temp: Boolean(owmTiles?.temperature),
      severe: true,
      tropical: true,
    },
  }, 5 * 60)
}

/**
 * Client config for Windy Map Forecast API (libBoot + windyInit).
 * Map Forecast keys are designed for browser use (domain-restricted at Windy).
 * Never log the key. Returns configured:false when WINDY_API is unset.
 */
function getWindyClientConfig() {
  const key = windyKey()
  if (!key) {
    return {
      configured: false,
      provider: 'windy-map-forecast',
      docs: 'https://api.windy.com/map-forecast/docs',
      env: 'WINDY_API',
    }
  }
  return {
    configured: true,
    provider: 'windy-map-forecast',
    key,
    libBootUrl: 'https://api.windy.com/assets/map-forecast/libBoot.js',
    leafletCss: 'https://unpkg.com/leaflet@1.4.0/dist/leaflet.css',
    leafletJs: 'https://unpkg.com/leaflet@1.4.0/dist/leaflet.js',
    docs: 'https://api.windy.com/map-forecast/docs',
    env: 'WINDY_API',
    defaultOverlay: 'wind',
    particlesAnim: 'on',
  }
}

module.exports = {
  parseLatLon,
  nwsUserAgent,
  windyKey,
  getForecast,
  getHistorical,
  getMarine,
  getAirQuality,
  getFlood,
  getSatelliteRadiation,
  getAlerts,
  getRadarMeta,
  getWindyClientConfig,
}
