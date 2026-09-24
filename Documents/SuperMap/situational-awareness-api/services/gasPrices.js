/**
 * US retail gasoline prices — free sources, no user setup required.
 *
 * Priority:
 *  1. EIA Open Data API v2 when EIA_API_KEY is set
 *  2. EIA public weekly gasdiesel HTML page (no key)
 *  3. GasBuddy GraphQL (no key; best-effort)
 */

const axios = require('axios')

const UNIT = 'USD/gal'
const EIA_GASOLINE_PRODUCTS = ['EPM0U', 'EPM0R']
const EIA_V2_BASE = 'https://api.eia.gov/v2/petroleum/pri/gnd/data/'
const EIA_GASDIESEL_URL = 'https://www.eia.gov/petroleum/gasdiesel/'

const US_GAS_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
]

/** Representative ZIP per state for GasBuddy fallback. */
const GASBUDDY_STATE_ZIPS = {
  AL: '35203', AK: '99501', AZ: '85001', AR: '72201', CA: '90210', CO: '80202', CT: '06101', DE: '19901',
  DC: '20001', FL: '33101', GA: '30301', HI: '96801', ID: '83701', IL: '60601', IN: '46201', IA: '50301',
  KS: '66101', KY: '40201', LA: '70112', ME: '04101', MD: '21201', MA: '02101', MI: '48201', MN: '55401',
  MS: '39101', MO: '63101', MT: '59101', NE: '68101', NV: '89101', NH: '03431', NJ: '07101', NM: '87101',
  NY: '10001', NC: '28201', ND: '58102', OH: '43201', OK: '73101', OR: '97201', PA: '19101', RI: '02901',
  SC: '29201', SD: '57101', TN: '37201', TX: '75201', UT: '84101', VT: '05401', VA: '23219', WA: '98101',
  WV: '25301', WI: '53201', WY: '82001',
}

/** Map state → EIA PADD region key used in gasdiesel HTML. */
const STATE_TO_PADD = {
  CT: 'padd1a', ME: 'padd1a', MA: 'padd1a', NH: 'padd1a', RI: 'padd1a', VT: 'padd1a',
  DE: 'padd1b', DC: 'padd1b', MD: 'padd1b', NJ: 'padd1b', NY: 'padd1b', PA: 'padd1b',
  FL: 'padd1c', GA: 'padd1c', NC: 'padd1c', SC: 'padd1c', VA: 'padd1c', WV: 'padd1c',
  IL: 'padd2', IN: 'padd2', IA: 'padd2', KS: 'padd2', KY: 'padd2', MI: 'padd2', MN: 'padd2',
  MO: 'padd2', NE: 'padd2', ND: 'padd2', OH: 'padd2', OK: 'padd2', SD: 'padd2', TN: 'padd2', WI: 'padd2',
  AL: 'padd3', AR: 'padd3', LA: 'padd3', MS: 'padd3', NM: 'padd3', TX: 'padd3',
  CO: 'padd4', ID: 'padd4', MT: 'padd4', UT: 'padd4', WY: 'padd4',
  AK: 'padd5', AZ: 'padd5', CA: 'padd5', HI: 'padd5', NV: 'padd5', OR: 'padd5', WA: 'padd5',
}

const STATE_NAME_TO_CODE = Object.fromEntries(US_GAS_STATES.map((s) => [s.name.toLowerCase(), s.code]))

function nowUpdatedAt() {
  return new Date().toLocaleTimeString(undefined, { timeStyle: 'short' })
}

function roundPrice(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return null
  return Number(v.toFixed(2))
}

function cleanHtmlText(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function paddKeyFromLabel(label) {
  const t = String(label || '').toLowerCase()
  if (t.includes('new england') || t.includes('padd1a')) return 'padd1a'
  if (t.includes('central atlantic') || t.includes('padd1b')) return 'padd1b'
  if (t.includes('lower atlantic') || t.includes('padd1c')) return 'padd1c'
  if (t.includes('east coast') || /\bpadd\s*1\b/.test(t)) return 'padd1'
  if (t.includes('midwest') || t.includes('padd2')) return 'padd2'
  if (t.includes('gulf coast') || t.includes('padd3')) return 'padd3'
  if (t.includes('rocky mountain') || t.includes('padd4')) return 'padd4'
  if (t.includes('west coast') && t.includes('california')) return 'padd5_less_ca'
  if (t.includes('west coast') || t.includes('padd5')) return 'padd5'
  if (t === 'u.s.' || t === 'us' || t.startsWith('u.s')) return 'national'
  return null
}

function parseGasdieselTables(html) {
  const tables = String(html || '').match(/<table[\s\S]*?<\/table>/gi) || []
  const parseTable = (tableHtml) => {
    const rows = []
    const trs = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || []
    for (const tr of trs) {
      const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [])
        .map((c) => cleanHtmlText(c.replace(/^<t[dh][^>]*>|<\/t[dh]>$/gi, '')))
        .filter(Boolean)
      if (cells.length < 2) continue
      const name = cells[0]
      const nums = cells.slice(1)
        .map((c) => c.replace(/[^0-9.\-]/g, ''))
        .filter((c) => /^-?\d+\.\d+$/.test(c))
        .map(Number)
      if (!name || !nums.length) continue
      // Latest week is the 3rd price column when present (prior, prior, current).
      const price = nums.length >= 3 ? nums[2] : nums[nums.length - 1]
      rows.push({ name, price: roundPrice(price), history: nums })
    }
    return rows
  }

  const regionRows = tables[0] ? parseTable(tables[0]) : []
  const stateRows = tables[1] ? parseTable(tables[1]) : []

  let national = null
  const padd = {}
  const regions = []
  for (const row of regionRows) {
    const key = paddKeyFromLabel(row.name)
    if (key === 'national') {
      national = row.price
      continue
    }
    if (!key || key === 'padd5_less_ca') continue
    padd[key] = row.price
    if (['padd1', 'padd2', 'padd3', 'padd4', 'padd5'].includes(key) && row.price != null) {
      const short = row.name.replace(/\s*\(PADD[^)]*\)/i, '').trim()
      regions.push({ name: short, price: row.price, padd: key })
    }
  }

  const statesByCode = {}
  for (const row of stateRows) {
    const code = STATE_NAME_TO_CODE[row.name.toLowerCase()]
    if (code && row.price != null) statesByCode[code] = row.price
  }

  return { national, regions, padd, statesByCode, source: 'eia-gasdiesel-html' }
}

let gasdieselCache = { at: 0, data: null }
const GASDIESEL_TTL_MS = 60 * 60 * 1000 // HTML updates weekly; cache 1h

async function fetchEiaGasdieselHtml() {
  if (gasdieselCache.data && Date.now() - gasdieselCache.at < GASDIESEL_TTL_MS) {
    return gasdieselCache.data
  }
  const res = await axios.get(EIA_GASDIESEL_URL, {
    timeout: 15000,
    headers: {
      'User-Agent': 'SuperMap/1.0 (gas prices; https://github.com/supermap)',
      Accept: 'text/html,application/xhtml+xml',
    },
    responseType: 'text',
  })
  const parsed = parseGasdieselTables(typeof res.data === 'string' ? res.data : String(res.data || ''))
  if (parsed.national == null && !Object.keys(parsed.statesByCode).length) {
    throw new Error('EIA gasdiesel HTML parse returned no prices')
  }
  gasdieselCache = { at: Date.now(), data: parsed }
  return parsed
}

function payloadFromGasdiesel(parsed, stateCode) {
  const updatedAt = nowUpdatedAt()
  const national = parsed.national
  const regions = Array.isArray(parsed.regions) ? parsed.regions : []
  const payload = {
    national,
    unit: UNIT,
    regions,
    states: [],
    source: parsed.source || 'eia-gasdiesel-html',
    updatedAt,
  }
  if (!stateCode) return payload
  const st = US_GAS_STATES.find((s) => s.code === stateCode)
  if (!st) return payload
  const direct = parsed.statesByCode?.[stateCode]
  if (direct != null) {
    payload.states = [{ code: stateCode, name: st.name, price: direct }]
    return payload
  }
  const paddKey = STATE_TO_PADD[stateCode]
  const paddPrice = paddKey ? parsed.padd?.[paddKey] : null
  if (paddPrice != null) {
    payload.states = [{
      code: stateCode,
      name: st.name,
      price: paddPrice,
      useRegionalFallback: true,
      region: paddKey,
    }]
    return payload
  }
  if (national != null) {
    payload.states = [{ code: stateCode, name: st.name, price: national, useNationalFallback: true }]
  }
  return payload
}

async function fetchEiaApi(stateCode) {
  const EIA_KEY = (process.env.EIA_API_KEY || '').trim()
  if (!EIA_KEY) return null

  let nationalVal = null
  let statePrice = null
  const eiaV2XParams = JSON.stringify({
    frequency: 'weekly',
    data: ['value'],
    facets: {},
    start: null,
    end: null,
    sort: [{ column: 'duoarea', direction: 'desc' }],
    offset: 0,
    length: 5000,
  })
  const eiaV2Query = new URLSearchParams({
    frequency: 'weekly',
    'data[0]': 'value',
    'sort[0][column]': 'duoarea',
    'sort[0][direction]': 'desc',
    offset: '0',
    length: '5000',
    api_key: EIA_KEY,
  })
  const duoareaState = stateCode ? `S${stateCode}` : null
  const stateFacetXParams = stateCode
    ? JSON.stringify({
      frequency: 'weekly',
      data: ['value'],
      facets: { duoarea: [duoareaState] },
      start: null,
      end: null,
      sort: [{ column: 'period', direction: 'desc' }],
      offset: 0,
      length: 100,
    })
    : null
  const stateQuery = stateCode
    ? new URLSearchParams({
      frequency: 'weekly',
      'data[0]': 'value',
      'sort[0][column]': 'period',
      'sort[0][direction]': 'desc',
      offset: '0',
      length: '100',
      api_key: EIA_KEY,
    })
    : null

  const nationalPromise = axios.get(`${EIA_V2_BASE}?${eiaV2Query.toString()}`, {
    timeout: 22000,
    headers: {
      'X-Params': eiaV2XParams,
      Accept: 'application/json',
      'User-Agent': 'SuperMap/1.0 (EIA Open Data)',
    },
  })
  const statePromise = stateCode && stateFacetXParams && stateQuery
    ? axios.get(`${EIA_V2_BASE}?${stateQuery.toString()}`, {
      timeout: 22000,
      headers: {
        'X-Params': stateFacetXParams,
        Accept: 'application/json',
        'User-Agent': 'SuperMap/1.0 (EIA Open Data)',
      },
    })
    : Promise.resolve({ data: null })

  const [v2Res, v2StateRes] = await Promise.all([nationalPromise, statePromise])
  const v2Rows = Array.isArray(v2Res.data?.response?.data ?? v2Res.data?.data)
    ? (v2Res.data?.response?.data ?? v2Res.data?.data)
    : []
  const nationalRow = v2Rows.find(
    (r) => (r.duoarea === 'NUS' || (r['area-name'] && String(r['area-name']).toUpperCase() === 'U.S.'))
      && EIA_GASOLINE_PRODUCTS.includes(r.product)
  ) || v2Rows.find((r) => r.duoarea === 'NUS' || (r['area-name'] && String(r['area-name']).toUpperCase() === 'U.S.'))
  if (nationalRow && (nationalRow.value != null || nationalRow.Value != null)) {
    nationalVal = roundPrice(nationalRow.value ?? nationalRow.Value)
  }
  if (stateCode && v2StateRes?.data) {
    const raw = v2StateRes.data
    const v2StateRows = Array.isArray(raw?.response?.data ?? raw?.data)
      ? (raw?.response?.data ?? raw?.data)
      : []
    const stateRow = v2StateRows.find((r) => EIA_GASOLINE_PRODUCTS.includes(r.product))
      || v2StateRows.find((r) => r.duoarea === duoareaState)
      || v2StateRows.find((r) => r.value != null || r.Value != null)
    if (stateRow && (stateRow.value != null || stateRow.Value != null)) {
      statePrice = roundPrice(stateRow.value ?? stateRow.Value)
    }
  }
  if (stateCode && statePrice == null) {
    const stateRow = v2Rows.find((r) => r.duoarea === duoareaState && EIA_GASOLINE_PRODUCTS.includes(r.product))
      || v2Rows.find((r) => r.duoarea === duoareaState)
    if (stateRow && (stateRow.value != null || stateRow.Value != null)) {
      statePrice = roundPrice(stateRow.value ?? stateRow.Value)
    }
  }

  if (nationalVal == null && statePrice == null) return null

  const updatedAt = nowUpdatedAt()
  const payload = {
    national: nationalVal,
    unit: UNIT,
    regions: [],
    states: [],
    source: 'eia-api',
    updatedAt,
  }
  if (stateCode) {
    const st = US_GAS_STATES.find((s) => s.code === stateCode)
    if (st) {
      if (statePrice != null) {
        payload.states = [{ code: stateCode, name: st.name, price: statePrice }]
      } else if (nationalVal != null) {
        payload.states = [{ code: stateCode, name: st.name, price: nationalVal, useNationalFallback: true }]
      }
    }
  }
  return payload
}

function parseGasBuddyTrends(data) {
  const loc = data?.data?.locationBySearchTerm
  const trends = loc?.trends ?? loc?.trend
  const arr = Array.isArray(trends) ? trends : (trends ? [trends] : [])
  const first = arr[0]
  if (!first) return null
  const price = first.today != null ? Number(first.today)
    : (first.todayLow != null ? Number(first.todayLow) : null)
  if (price == null || Number.isNaN(price)) return null
  return { price: roundPrice(price), areaName: first.areaName || '' }
}

async function fetchGasBuddyPrice(searchTerm) {
  const body = {
    operationName: 'LocationBySearchTerm',
    variables: { fuel: 1, maxAge: 0, search: String(searchTerm || '') },
    query: `query LocationBySearchTerm($search: String, $fuel: Int, $maxAge: Int) {
  locationBySearchTerm(search: $search, fuel: $fuel, maxAge: $maxAge) {
    trends { areaName country today todayLow }
  }
}`,
  }
  const urls = ['https://www.gasbuddy.com/graphql', 'https://gasbuddy.com/graphql']
  const opts = {
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: 'https://www.gasbuddy.com',
      Referer: 'https://www.gasbuddy.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'apollographql-client-name': 'web',
    },
    validateStatus: () => true,
  }
  for (const url of urls) {
    try {
      const res = await axios.post(url, body, opts)
      if (typeof res.data === 'string' && /bad request/i.test(res.data)) continue
      if (res.data?.errors?.length) {
        console.warn('[gasPrices] GasBuddy GraphQL:', res.data.errors[0]?.message || res.data.errors)
        continue
      }
      const parsed = parseGasBuddyTrends(res.data)
      if (parsed) return { ...parsed, areaName: parsed.areaName || searchTerm }
    } catch (err) {
      console.warn('[gasPrices] GasBuddy', url, err.message)
    }
  }
  return null
}

/**
 * Resolve gas prices for optional state / zip.
 * Always tries free EIA HTML when API key missing or API returns empty.
 */
async function getGasPrices({ stateCode = '', zip = '' } = {}) {
  const code = String(stateCode || '').trim().toUpperCase().slice(0, 2)
  const zipCode = String(zip || '').trim().slice(0, 10)
  const updatedAt = nowUpdatedAt()

  // 1) EIA API when key present
  try {
    const apiPayload = await fetchEiaApi(code)
    if (apiPayload && (apiPayload.national != null || (apiPayload.states && apiPayload.states.length))) {
      return apiPayload
    }
  } catch (err) {
    console.warn('[gasPrices] EIA API:', err.message)
  }

  // 2) EIA public HTML (no key) — primary free path
  try {
    const parsed = await fetchEiaGasdieselHtml()
    const payload = payloadFromGasdiesel(parsed, code || null)
    if (payload.national != null || (payload.states && payload.states.length)) {
      return payload
    }
  } catch (err) {
    console.warn('[gasPrices] EIA gasdiesel HTML:', err.message)
  }

  // 3) GasBuddy best-effort
  const defaultZip = (process.env.GASBUDDY_DEFAULT_ZIP || '10001').trim()
  const searchTerm = code && GASBUDDY_STATE_ZIPS[code]
    ? GASBUDDY_STATE_ZIPS[code]
    : (zipCode || defaultZip)
  try {
    const gasbuddy = await fetchGasBuddyPrice(searchTerm)
    if (gasbuddy) {
      const st = code ? US_GAS_STATES.find((s) => s.code === code) : null
      return {
        national: gasbuddy.price,
        unit: UNIT,
        regions: [],
        states: code && st ? [{ code, name: st.name, price: gasbuddy.price }] : [],
        source: 'gasbuddy',
        updatedAt,
      }
    }
  } catch (err) {
    console.warn('[gasPrices] GasBuddy:', err.message)
  }

  return {
    national: null,
    unit: UNIT,
    regions: [],
    states: [],
    gasUnavailable: true,
    source: 'none',
    updatedAt,
  }
}

module.exports = {
  US_GAS_STATES,
  getGasPrices,
  fetchEiaGasdieselHtml,
  parseGasdieselTables,
}
