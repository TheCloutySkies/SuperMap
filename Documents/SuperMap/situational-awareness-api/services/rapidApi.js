/**
 * RapidAPI proxy service. Uses RAPIDAPI_KEY (Yahoo/others) and RAPIDAPI_GOOGLE_SEARCH_KEY from env.
 * Yahoo Finance: minimal v2 tickers call, 6h cache (100 req/month budget).
 */

const axios = require('axios')

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || ''
const RAPIDAPI_GOOGLE_SEARCH_KEY = (process.env.RAPIDAPI_GOOGLE_SEARCH_KEY || process.env.RAPIDAPI_KEY || '').trim()

function headers(host, key = RAPIDAPI_KEY) {
  const k = (key || RAPIDAPI_KEY || '').trim()
  if (!k) return null
  return {
    'x-rapidapi-host': host,
    'x-rapidapi-key': k,
  }
}

function apiError(err) {
  const data = err.response?.data
  const msg = data?.message ?? data?.error ?? data?.body?.error ?? err.message
  if (err.response?.status && err.response.status !== 200) {
    console.warn('[rapidApi]', err.response.status, typeof data === 'object' ? JSON.stringify(data).slice(0, 200) : msg)
  }
  return msg
}

function requireKey(res) {
  if (!RAPIDAPI_KEY || !RAPIDAPI_KEY.trim()) {
    res.status(503).json({ error: 'RAPIDAPI_KEY not configured. Set in .env.' })
    return false
  }
  return true
}

function requireGoogleSearchKey(res) {
  const key = RAPIDAPI_GOOGLE_SEARCH_KEY || RAPIDAPI_KEY
  if (!key || !String(key).trim()) {
    res.status(503).json({ error: 'RAPIDAPI_GOOGLE_SEARCH_KEY or RAPIDAPI_KEY not configured. Set in .env.' })
    return false
  }
  return true
}

/** GET Flock cameras by city. RapidAPI disabled to avoid 403/429; use free alternatives. */
async function fetchFlockCameras(city = 'SanDiego') {
  return { type: 'FeatureCollection', features: [] }
  const h = headers('flock-camera-location.p.rapidapi.com')
  if (!h) return { type: 'FeatureCollection', features: [] }
  const citySlug = (city && String(city).trim()) || 'SanDiego'
  try {
    const res = await axios.get(
      `https://flock-camera-location.p.rapidapi.com/city/${encodeURIComponent(citySlug)}`,
      { headers: h, timeout: 15000, validateStatus: (s) => s >= 200 && s < 500 }
    )
    if (res.status !== 200) {
      console.warn('[rapidApi] Flock non-200:', res.status, res.data)
      return { type: 'FeatureCollection', features: [] }
    }
    const data = res.data
    const arr = Array.isArray(data) ? data : data?.data ?? data?.features ?? []
    const features = arr
      .filter((c) => c.latitude != null && c.longitude != null)
      .map((c) => ({
        type: 'Feature',
        properties: c,
        geometry: {
          type: 'Point',
          coordinates: [parseFloat(c.longitude), parseFloat(c.latitude)],
        },
      }))
    return { type: 'FeatureCollection', features }
  } catch (err) {
    console.warn('[rapidApi] Flock:', err.message)
    return { type: 'FeatureCollection', features: [] }
  }
}

// Yahoo Finance: single v2 tickers call, 6h cache to stay within ~100 req/month
const YAHOO_TICKERS_CACHE_MS = 6 * 60 * 60 * 1000
let yahooTickersCache = null
let yahooTickersCacheTime = 0

function normalizeTicker(row) {
  return {
    symbol: row.symbol ?? row.ticker ?? row.code ?? '—',
    shortName: row.shortName ?? row.name ?? row.title ?? '',
    regularMarketPrice: row.regularMarketPrice ?? row.price ?? row.close ?? row.currentPrice,
    regularMarketChangePercent: row.regularMarketChangePercent ?? row.changePercent ?? row.changesPercentage ?? row.regularMarketChange?.percentage,
  }
}

/** GET Yahoo Finance v2 tickers. RapidAPI disabled. */
async function fetchFinanceScreener(list = 'day_gainers') {
  return { body: null, error: 'RapidAPI disabled' }
  const h = headers('yahoo-finance15.p.rapidapi.com')
  if (!h) return { body: null, error: 'No key' }
  const now = Date.now()
  if (yahooTickersCache && now - yahooTickersCacheTime < YAHOO_TICKERS_CACHE_MS) {
    return { body: { body: yahooTickersCache } }
  }
  try {
    const res = await axios.get('https://yahoo-finance15.p.rapidapi.com/api/v2/markets/tickers', {
      params: { page: 1, type: 'STOCKS' },
      headers: h,
      timeout: 15000,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    const data = res.data
    if (res.status !== 200) return { body: null, error: apiError({ response: res, message: data?.message || data?.error || 'Tickers failed' }) }
    const raw = data?.body ?? data?.data ?? data?.tickers ?? (Array.isArray(data) ? data : [])
    const rows = Array.isArray(raw) ? raw.map(normalizeTicker) : []
    yahooTickersCache = rows
    yahooTickersCacheTime = now
    return { body: { body: rows } }
  } catch (err) {
    console.warn('[rapidApi] Finance tickers:', err.response?.data || err.message)
    return { body: null, error: apiError(err) }
  }
}

/** GET Yahoo Finance search. RapidAPI disabled. */
async function fetchFinanceSearch(search = '') {
  return { body: null, error: 'RapidAPI disabled' }
  const h = headers('yahoo-finance15.p.rapidapi.com')
  if (!h) return { body: null, error: 'No key' }
  const q = String(search).trim() || 'AA'
  try {
    const res = await axios.get('https://yahoo-finance15.p.rapidapi.com/api/v1/markets/search', {
      params: { search: q },
      headers: h,
      timeout: 15000,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    const data = res.data
    if (res.status !== 200) return { body: null, error: apiError({ response: res, message: data?.message || data?.error || 'Search failed' }) }
    return { body: data }
  } catch (err) {
    console.warn('[rapidApi] Finance search:', err.response?.data || err.message)
    return { body: null, error: apiError(err) }
  }
}

/** GET Real-time news by topic/section. RapidAPI disabled. */
async function fetchTopicNews(params = {}) {
  return { body: null, error: 'RapidAPI disabled' }
  const h = headers('real-time-news-data.p.rapidapi.com')
  if (!h) return { body: null, error: 'No key' }
  const {
    topic = 'TECHNOLOGY',
    section,
    limit = '50',
    country = 'US',
    lang = 'en',
  } = params
  const queryParams = { topic, limit, country, lang }
  if (section) queryParams.section = section
  try {
    const res = await axios.get('https://real-time-news-data.p.rapidapi.com/topic-news-by-section', {
      params: queryParams,
      headers: h,
      timeout: 15000,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    const data = res.data
    if (res.status !== 200) return { body: null, error: apiError({ response: res, message: data?.message || data?.error || 'Topic news failed' }) }
    return { body: data }
  } catch (err) {
    console.warn('[rapidApi] Topic news:', err.response?.data || err.message)
    return { body: null, error: apiError(err) }
  }
}

/** GET Google Search. RapidAPI disabled. */
async function fetchGoogleSearch(query = '') {
  return { body: null, error: 'RapidAPI disabled' }
  const key = RAPIDAPI_GOOGLE_SEARCH_KEY || RAPIDAPI_KEY
  const h = key && key.trim() ? { 'x-rapidapi-host': 'unlimited-google-search1.p.rapidapi.com', 'x-rapidapi-key': key.trim() } : null
  if (!h) return { body: null, error: 'No key' }
  const q = String(query).trim()
  if (!q) return { body: null, error: 'Query required' }
  try {
    const res = await axios.get('https://unlimited-google-search1.p.rapidapi.com/api/search', {
      params: {
        query: q,
        filter: '0',
        nfpr: '0',
        tbm: '', // web results; use 'isch' for image search
        append: '0',
        safe: 'active',
        google_domain: 'google.com',
        start: '0',
        hl: 'en',
        gl: 'us',
      },
      headers: h,
      timeout: 20000,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    const data = res.data
    if (res.status !== 200) return { body: null, error: apiError({ response: res, message: data?.message || data?.error || 'Search failed' }) }
    const results = data?.data ?? data?.results ?? data?.organic_results ?? data?.results?.organic ?? (Array.isArray(data) ? data : [])
    const normalized = Array.isArray(results) ? results.map((r) => ({
      title: r.title ?? r.name,
      link: r.link ?? r.url ?? r.image,
      snippet: r.snippet ?? r.description,
    })) : []
    return { body: { data: normalized } }
  } catch (err) {
    console.warn('[rapidApi] Google search:', err.response?.data || err.message)
    return { body: null, error: apiError(err) }
  }
}

/** GET Meteostat hourly. RapidAPI disabled. */
async function fetchMeteostatHourly(params = {}) {
  return { body: null, error: 'RapidAPI disabled' }
  const h = headers('meteostat.p.rapidapi.com')
  if (!h) return { body: null, error: 'No key' }
  const station = params.station || '10637'
  const start = params.start || new Date().toISOString().slice(0, 10)
  const end = params.end || start
  const tz = params.tz || 'America/New_York'
  try {
    const res = await axios.get('https://meteostat.p.rapidapi.com/stations/hourly', {
      params: { station, start, end, tz },
      headers: h,
      timeout: 15000,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    if (res.status !== 200) return { body: null, error: apiError({ response: res, message: res.data?.message || res.data?.error || 'Hourly failed' }) }
    return { body: res.data }
  } catch (err) {
    console.warn('[rapidApi] Meteostat hourly:', err.response?.data || err.message)
    return { body: null, error: apiError(err) }
  }
}

/** Nearest Meteostat station. RapidAPI disabled. */
async function fetchMeteostatNearest(lat, lon) {
  return { body: null, error: 'RapidAPI disabled' }
  const h = headers('meteostat.p.rapidapi.com')
  if (!h) return { body: null, error: 'No key' }
  const latNum = lat != null ? Number(lat) : 40
  const lonNum = lon != null ? Number(lon) : -74
  try {
    const res = await axios.get('https://meteostat.p.rapidapi.com/stations/nearby', {
      params: { lat: latNum, lon: lonNum, limit: 1 },
      headers: h,
      timeout: 10000,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    if (res.status !== 200) return { body: null, error: apiError({ response: res, message: res.data?.message || res.data?.error || 'Nearby failed' }) }
    return { body: res.data }
  } catch (err) {
    console.warn('[rapidApi] Meteostat nearby:', err.response?.data || err.message)
    return { body: null, error: apiError(err) }
  }
}

/** ADS-B aircraft. RapidAPI disabled; use Military Aircraft (adsb.lol) layer instead. */
async function fetchAdsbAircraft(lat, lon) {
  return { body: { type: 'FeatureCollection', features: [] }, error: 'RapidAPI disabled' }
  const h = headers('aircraftscatter.p.rapidapi.com')
  if (!h) return { body: { type: 'FeatureCollection', features: [] }, error: 'No key' }
  const latNum = Number(lat)
  const lonNum = Number(lon)
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return { body: { type: 'FeatureCollection', features: [] }, error: 'Invalid lat/lon' }
  }
  try {
    const res = await axios.get(`https://aircraftscatter.p.rapidapi.com/lat/${latNum}/lon/${lonNum}/`, {
      headers: h,
      timeout: 12000,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    const data = res.data
    if (res.status !== 200) return { body: { type: 'FeatureCollection', features: [] }, error: apiError({ response: res, message: data?.message || data?.error || 'ADS-B failed' }) }
    const arr = Array.isArray(data) ? data : []
    const features = arr
      .filter((a) => a.lat != null && a.lon != null)
      .map((a) => ({
        type: 'Feature',
        properties: a,
        geometry: { type: 'Point', coordinates: [parseFloat(a.lon), parseFloat(a.lat)] },
      }))
    return { body: { type: 'FeatureCollection', features } }
  } catch (err) {
    return { body: { type: 'FeatureCollection', features: [] }, error: apiError(err) }
  }
}

module.exports = {
  requireKey,
  requireGoogleSearchKey,
  fetchFlockCameras,
  fetchFinanceScreener,
  fetchFinanceSearch,
  fetchTopicNews,
  fetchGoogleSearch,
  fetchMeteostatHourly,
  fetchMeteostatNearest,
  fetchAdsbAircraft,
}
