/**
 * US retail regular gasoline + on-highway diesel prices — free, no user setup.
 *
 * Sources (in order):
 *  1. EIA Open Data API v2 when EIA_API_KEY is set (gasoline primary)
 *  2. EIA public weekly Gasoline and Diesel Fuel Update HTML (no key)
 *
 * Intentionally omitted:
 *  - Hardcoded / seed national averages (misleading when live fetch fails)
 *  - Serving previous process snapshots as current after a failed refresh
 *  - GasBuddy ZIP spot prices presented as a US national average
 *
 * On total failure the API returns gasUnavailable + error — UI must show that honestly.
 */

const axios = require('axios')

const UNIT = 'USD/gal'
const EIA_GASOLINE_PRODUCTS = ['EPM0U', 'EPM0R']
const EIA_DIESEL_PRODUCTS = ['EPD2D']
const EIA_V2_BASE = 'https://api.eia.gov/v2/petroleum/pri/gnd/data/'
const EIA_GASDIESEL_URLS = [
  'https://www.eia.gov/petroleum/gasdiesel/',
  'https://www.eia.gov/petroleum/gasdiesel/index.php',
]

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

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

const PADD_LABELS = {
  padd1: 'East Coast',
  padd1a: 'New England',
  padd1b: 'Central Atlantic',
  padd1c: 'Lower Atlantic',
  padd2: 'Midwest',
  padd3: 'Gulf Coast',
  padd4: 'Rocky Mountain',
  padd5: 'West Coast',
}

const STATE_NAME_TO_CODE = Object.fromEntries(US_GAS_STATES.map((s) => [s.name.toLowerCase(), s.code]))
const STATE_CODE_TO_NAME = Object.fromEntries(US_GAS_STATES.map((s) => [s.code, s.name]))

/** In-process cache of last *successful live* parse only (not served after a failed refresh). */
let liveHtmlCache = { at: 0, data: null }
const LIVE_HTML_TTL_MS = 30 * 60 * 1000

function roundPrice(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return null
  return Number(v.toFixed(3))
}

function formatDisplayPrice(n) {
  const v = roundPrice(n)
  return v == null ? null : Number(v.toFixed(2))
}

function cleanHtmlText(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractReleaseDate(html) {
  const m = String(html || '').match(
    /Release Date:\s*<\/[^>]+>\s*<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)</i,
  ) || String(html || '').match(/Release Date:\s*(?:<\/[^>]+>\s*)*([^<\n]+)/i)
  if (!m) return null
  const raw = cleanHtmlText(m[1])
  if (!raw || /next release/i.test(raw)) return null
  return raw
}

function isWeekHeader(cell) {
  // EIA week headers look like 09/21/26 or 09/21/2026
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(String(cell || '').trim())
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

function parseTableRows(tableHtml) {
  const trs = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || []
  const rows = []
  for (const tr of trs) {
    const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [])
      .map((c) => cleanHtmlText(c.replace(/^<t[dh][^>]*>|<\/t[dh]>$/gi, '')))
      .filter(Boolean)
    if (cells.length) rows.push(cells)
  }
  return rows
}

/**
 * Find the latest weekly price column from EIA header row.
 * Headers: [09/07/26, 09/14/26, 09/21/26, 2 year ago, year ago, week ago]
 * → use the last MM/DD/YY column (not the change columns).
 */
function findLatestWeekColumn(headerCells) {
  let latestIdx = -1
  let weekEnding = null
  headerCells.forEach((cell, i) => {
    if (isWeekHeader(cell)) {
      latestIdx = i
      weekEnding = cell.trim()
    }
  })
  return { latestIdx, weekEnding }
}

function classifyTable(rows) {
  const names = rows
    .map((r) => String(r[0] || '').trim())
    .filter((n) => n && !isWeekHeader(n) && !/change from/i.test(n))
  const hasNational = names.some((n) => paddKeyFromLabel(n) === 'national')
  const hasPadd = names.some((n) => {
    const k = paddKeyFromLabel(n)
    return k && k !== 'national' && k !== 'padd5_less_ca'
  })
  const stateHits = names.filter((n) => STATE_NAME_TO_CODE[n.toLowerCase()]).length
  if (hasNational || hasPadd) return 'regional'
  if (stateHits >= 2) return 'states'
  return 'unknown'
}

function parseRegionalBlock(rows, priceCol) {
  let national = null
  const padd = {}
  const regions = []
  const statesByCode = {}

  for (const cells of rows) {
    const name = cells[0]
    if (!name || isWeekHeader(name) || /change from/i.test(name)) continue
    const raw = cells[priceCol + 1]
    const price = formatDisplayPrice(raw)
    if (price == null) continue

    const stateCode = STATE_NAME_TO_CODE[name.toLowerCase()]
    if (stateCode) {
      statesByCode[stateCode] = price
      continue
    }

    const key = paddKeyFromLabel(name)
    if (key === 'national') {
      national = price
      continue
    }
    if (!key || key === 'padd5_less_ca') continue
    padd[key] = price
    if (['padd1', 'padd2', 'padd3', 'padd4', 'padd5'].includes(key)) {
      regions.push({
        name: PADD_LABELS[key] || name.replace(/\s*\(PADD[^)]*\)/i, '').trim(),
        price,
        padd: key,
      })
    }
  }

  return { national, regions, padd, statesByCode }
}

function parseStatesBlock(rows, priceCol) {
  const statesByCode = {}
  let inCities = false
  for (const cells of rows) {
    const name = cells[0]
    if (!name || isWeekHeader(name) || /change from/i.test(name)) continue
    if (/^cities$/i.test(name)) {
      inCities = true
      continue
    }
    if (inCities) continue
    const raw = cells[priceCol + 1]
    const price = formatDisplayPrice(raw)
    const code = STATE_NAME_TO_CODE[name.toLowerCase()]
    if (code && price != null) statesByCode[code] = price
  }
  return statesByCode
}

function emptyFuelBlock() {
  return {
    national: null,
    regions: [],
    padd: {},
    statesByCode: {},
  }
}

/**
 * Parse EIA gasdiesel HTML into gasoline + diesel blocks.
 * Table order on the live page is typically:
 *  0) Regular gasoline by PADD
 *  1) Regular gasoline by selected states (+ cities)
 *  2) On-highway diesel by PADD (+ California)
 */
function parseGasdieselTables(html) {
  const tables = String(html || '').match(/<table[\s\S]*?<\/table>/gi) || []
  if (!tables.length) {
    throw new Error('EIA gasdiesel page has no tables')
  }

  const releaseDate = extractReleaseDate(html)
  const parsedTables = tables.map((t) => parseTableRows(t)).filter((rows) => rows.length)

  let weekEnding = null
  let priceCol = -1
  for (const rows of parsedTables) {
    const header = rows.find((r) => r.some(isWeekHeader)) || []
    const found = findLatestWeekColumn(header)
    if (found.latestIdx >= 0) {
      priceCol = found.latestIdx
      weekEnding = found.weekEnding
      break
    }
  }
  if (priceCol < 0) {
    throw new Error('EIA gasdiesel table missing week-date headers')
  }

  let gasoline = emptyFuelBlock()
  let diesel = emptyFuelBlock()
  let sawRegional = 0
  let sawStates = 0

  for (const rows of parsedTables) {
    const kind = classifyTable(rows)
    if (kind === 'regional') {
      const block = parseRegionalBlock(rows, priceCol)
      if (sawRegional === 0) {
        gasoline = { ...gasoline, ...block, statesByCode: { ...gasoline.statesByCode, ...block.statesByCode } }
      } else {
        diesel = { ...diesel, ...block, statesByCode: { ...diesel.statesByCode, ...block.statesByCode } }
      }
      sawRegional += 1
    } else if (kind === 'states') {
      const statesByCode = parseStatesBlock(rows, priceCol)
      // First state table is regular gasoline; later ones (rare) treat as diesel.
      if (sawStates === 0) {
        gasoline = { ...gasoline, statesByCode: { ...gasoline.statesByCode, ...statesByCode } }
      } else {
        diesel = { ...diesel, statesByCode: { ...diesel.statesByCode, ...statesByCode } }
      }
      sawStates += 1
    }
  }

  if (
    gasoline.national == null
    && !gasoline.regions.length
    && !Object.keys(gasoline.statesByCode).length
    && diesel.national == null
    && !diesel.regions.length
    && !Object.keys(diesel.statesByCode).length
  ) {
    throw new Error('EIA gasdiesel parse returned no prices')
  }

  return {
    gasoline,
    diesel,
    // Backward-compatible top-level gasoline fields for older callers/tests
    national: gasoline.national,
    regions: gasoline.regions,
    padd: gasoline.padd,
    statesByCode: gasoline.statesByCode,
    source: 'eia-weekly-gasdiesel',
    sourceLabel: 'EIA Gasoline and Diesel Fuel Update (weekly retail)',
    releaseDate,
    weekEnding,
    asOf: weekEnding || releaseDate || null,
  }
}

async function fetchEiaGasdieselHtml({ force = false } = {}) {
  if (!force && liveHtmlCache.data && Date.now() - liveHtmlCache.at < LIVE_HTML_TTL_MS) {
    return { ...liveHtmlCache.data, _fromLiveCache: true }
  }

  let lastErr = null
  for (const url of EIA_GASDIESEL_URLS) {
    try {
      const res = await axios.get(url, {
        timeout: 20000,
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.eia.gov/',
        },
        responseType: 'text',
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400,
      })
      const html = typeof res.data === 'string' ? res.data : String(res.data || '')
      const parsed = parseGasdieselTables(html)
      liveHtmlCache = { at: Date.now(), data: parsed }
      return parsed
    } catch (err) {
      lastErr = err
      console.warn('[gasPrices] EIA HTML', url, err.message)
    }
  }
  throw lastErr || new Error('EIA gasdiesel fetch failed')
}

function stateEntry(code, price, extra = {}) {
  return {
    code,
    name: STATE_CODE_TO_NAME[code] || code,
    price,
    ...extra,
  }
}

/**
 * Highest / lowest among published EIA state series.
 * Diesel weekly HTML typically only lists California as a state — then fall back
 * to top-level PADD regions so the UI still has a clear pair (labeled as region).
 */
function computeExtremes(statesByCode, regions) {
  const stateList = Object.entries(statesByCode || {})
    .map(([code, price]) => stateEntry(code, price, { kind: 'state' }))
    .filter((s) => s.price != null)
    .sort((a, b) => a.price - b.price)

  if (stateList.length >= 2) {
    return {
      scope: 'state',
      highest: stateList[stateList.length - 1],
      lowest: stateList[0],
    }
  }

  const regionList = (Array.isArray(regions) ? regions : [])
    .filter((r) => r && r.price != null && r.name)
    .map((r) => ({
      code: r.padd || null,
      name: r.name,
      price: r.price,
      kind: 'region',
    }))
    .sort((a, b) => a.price - b.price)

  if (regionList.length >= 2) {
    return {
      scope: 'region',
      highest: regionList[regionList.length - 1],
      lowest: regionList[0],
      // Preserve any single published state (e.g. CA diesel) for callers
      publishedStates: stateList,
    }
  }

  if (stateList.length === 1) {
    return {
      scope: 'state',
      highest: stateList[0],
      lowest: stateList[0],
    }
  }

  return null
}

function resolvePaddPrice(fuelBlock, stateCode) {
  const paddKey = STATE_TO_PADD[stateCode]
  if (!paddKey || !fuelBlock?.padd) return null
  if (fuelBlock.padd[paddKey] != null) return { price: fuelBlock.padd[paddKey], regionKey: paddKey }
  const parent = paddKey.replace(/[abc]$/, '')
  if (fuelBlock.padd[parent] != null) return { price: fuelBlock.padd[parent], regionKey: parent }
  return null
}

/**
 * Build a state price map for extremes.
 * Gasoline: published state series only.
 * Diesel: EIA usually publishes California only — fill other EIA weekly state
 * geographies (same set as gasoline state table) from that state's PADD diesel
 * so both views can show most/least expensive *states* honestly as regional
 * survey coverage (same rule as the state dropdown fallback).
 */
function statesForExtremes(fuelBlock, seedStateCodes = []) {
  const out = { ...(fuelBlock?.statesByCode || {}) }
  const seeds = seedStateCodes.length
    ? seedStateCodes
    : Object.keys(out)
  for (const code of seeds) {
    if (out[code] != null) continue
    const resolved = resolvePaddPrice(fuelBlock, code)
    if (resolved) out[code] = resolved.price
  }
  return out
}

function resolveSelectedState(fuelBlock, stateCode) {
  if (!stateCode) {
    return { states: [], stateUnavailable: false }
  }
  const st = US_GAS_STATES.find((s) => s.code === stateCode)
  if (!st) return { states: [], stateUnavailable: false }

  const direct = fuelBlock.statesByCode?.[stateCode]
  if (direct != null) {
    return {
      states: [{ code: stateCode, name: st.name, price: direct, series: 'state' }],
      stateUnavailable: false,
    }
  }

  const resolved = resolvePaddPrice(fuelBlock, stateCode)
  if (resolved) {
    return {
      states: [{
        code: stateCode,
        name: st.name,
        price: resolved.price,
        series: 'regional',
        useRegionalFallback: true,
        region: resolved.regionKey,
        regionLabel: PADD_LABELS[resolved.regionKey] || resolved.regionKey,
      }],
      stateUnavailable: false,
    }
  }

  return { states: [], stateUnavailable: true }
}

function buildFuelPayload(fuelBlock, stateCode, { extremeSeedCodes = [] } = {}) {
  const national = fuelBlock?.national ?? null
  const regions = Array.isArray(fuelBlock?.regions) ? fuelBlock.regions : []
  const statesByCode = fuelBlock?.statesByCode || {}
  const selected = resolveSelectedState(fuelBlock || emptyFuelBlock(), stateCode)
  const extremeStates = statesForExtremes(fuelBlock || emptyFuelBlock(), extremeSeedCodes)
  // Prefer state extremes (≥2). Fall back to PADD regions only if we still lack a pair.
  let extremes = computeExtremes(extremeStates, [])
  if (!extremes || extremes.scope !== 'state') {
    extremes = computeExtremes(statesByCode, regions)
  }
  const ok = national != null || regions.length > 0 || Object.keys(statesByCode).length > 0
    || selected.states.length > 0

  return {
    ok,
    national,
    regions,
    states: selected.states,
    stateUnavailable: selected.stateUnavailable,
    extremes,
    publishedStateCount: Object.keys(statesByCode).length,
  }
}

function buildPayloadFromParsed(parsed, stateCode) {
  const gasBlock = parsed.gasoline || {
    national: parsed.national,
    regions: parsed.regions,
    padd: parsed.padd,
    statesByCode: parsed.statesByCode,
  }
  const dieselBlock = parsed.diesel || emptyFuelBlock()
  const gasSeeds = Object.keys(gasBlock.statesByCode || {})
  const gasoline = buildFuelPayload(gasBlock, stateCode, { extremeSeedCodes: gasSeeds })
  const diesel = buildFuelPayload(dieselBlock, stateCode, {
    // Use gasoline's published state geographies so diesel can show state extremes
    extremeSeedCodes: gasSeeds.length ? gasSeeds : Object.keys(dieselBlock.statesByCode || {}),
  })

  const payload = {
    ok: Boolean(gasoline.ok || diesel.ok),
    national: gasoline.national,
    unit: UNIT,
    regions: gasoline.regions,
    states: gasoline.states,
    stateUnavailable: gasoline.stateUnavailable,
    extremes: gasoline.extremes,
    gasoline,
    diesel,
    fuels: ['gasoline', 'diesel'],
    source: parsed.source,
    sourceLabel: parsed.sourceLabel,
    releaseDate: parsed.releaseDate || null,
    weekEnding: parsed.weekEnding || null,
    asOf: parsed.asOf || null,
    fetchedAt: new Date().toISOString(),
  }

  return payload
}

async function fetchEiaApi(stateCode) {
  const EIA_KEY = (process.env.EIA_API_KEY || '').trim()
  if (!EIA_KEY) return null

  let nationalVal = null
  let statePrice = null
  let period = null
  let dieselNational = null
  let dieselStatePrice = null
  let dieselPeriod = null

  const eiaV2XParams = JSON.stringify({
    frequency: 'weekly',
    data: ['value'],
    facets: {},
    start: null,
    end: null,
    sort: [{ column: 'period', direction: 'desc' }],
    offset: 0,
    length: 5000,
  })
  const eiaV2Query = new URLSearchParams({
    frequency: 'weekly',
    'data[0]': 'value',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    offset: '0',
    length: '5000',
    api_key: EIA_KEY,
  })
  const duoareaState = stateCode ? `S${stateCode}` : null

  const res = await axios.get(`${EIA_V2_BASE}?${eiaV2Query.toString()}`, {
    timeout: 20000,
    headers: {
      'X-Params': eiaV2XParams,
      Accept: 'application/json',
      'User-Agent': BROWSER_UA,
    },
  })
  const v2Rows = Array.isArray(res.data?.response?.data ?? res.data?.data)
    ? (res.data?.response?.data ?? res.data?.data)
    : []

  const nationalRow = v2Rows.find(
    (r) => (r.duoarea === 'NUS' || String(r['area-name'] || '').toUpperCase() === 'U.S.')
      && EIA_GASOLINE_PRODUCTS.includes(r.product),
  ) || v2Rows.find((r) => r.duoarea === 'NUS' && EIA_GASOLINE_PRODUCTS.includes(r.product))

  if (nationalRow && (nationalRow.value != null || nationalRow.Value != null)) {
    nationalVal = formatDisplayPrice(nationalRow.value ?? nationalRow.Value)
    period = nationalRow.period || null
  }

  const dieselNationalRow = v2Rows.find(
    (r) => (r.duoarea === 'NUS' || String(r['area-name'] || '').toUpperCase() === 'U.S.')
      && EIA_DIESEL_PRODUCTS.includes(r.product),
  )
  if (dieselNationalRow && (dieselNationalRow.value != null || dieselNationalRow.Value != null)) {
    dieselNational = formatDisplayPrice(dieselNationalRow.value ?? dieselNationalRow.Value)
    dieselPeriod = dieselNationalRow.period || null
  }

  if (stateCode) {
    const stateRow = v2Rows.find((r) => r.duoarea === duoareaState && EIA_GASOLINE_PRODUCTS.includes(r.product))
      || v2Rows.find((r) => r.duoarea === duoareaState && !EIA_DIESEL_PRODUCTS.includes(r.product))
    if (stateRow && (stateRow.value != null || stateRow.Value != null)) {
      statePrice = formatDisplayPrice(stateRow.value ?? stateRow.Value)
      period = stateRow.period || period
    }
    const dieselStateRow = v2Rows.find((r) => r.duoarea === duoareaState && EIA_DIESEL_PRODUCTS.includes(r.product))
    if (dieselStateRow && (dieselStateRow.value != null || dieselStateRow.Value != null)) {
      dieselStatePrice = formatDisplayPrice(dieselStateRow.value ?? dieselStateRow.Value)
      dieselPeriod = dieselStateRow.period || dieselPeriod
    }
  }

  if (nationalVal == null && statePrice == null && dieselNational == null && dieselStatePrice == null) {
    return null
  }

  const gasolineStatesByCode = {}
  if (stateCode && statePrice != null) gasolineStatesByCode[stateCode] = statePrice
  const dieselStatesByCode = {}
  if (stateCode && dieselStatePrice != null) dieselStatesByCode[stateCode] = dieselStatePrice

  // API path rarely includes full PADD/state matrices; prefer HTML scrape for those.
  // Still return a usable dual-fuel shell when the key path wins for national.
  const parsedLike = {
    gasoline: {
      national: nationalVal,
      regions: [],
      padd: {},
      statesByCode: gasolineStatesByCode,
    },
    diesel: {
      national: dieselNational,
      regions: [],
      padd: {},
      statesByCode: dieselStatesByCode,
    },
    source: 'eia-api-v2',
    sourceLabel: 'EIA Open Data API (weekly retail gasoline/diesel)',
    releaseDate: null,
    weekEnding: period || dieselPeriod || null,
    asOf: period || dieselPeriod || null,
  }

  return buildPayloadFromParsed(parsedLike, stateCode || null)
}

function unavailable(error, detail = null) {
  return {
    ok: false,
    national: null,
    unit: UNIT,
    regions: [],
    states: [],
    extremes: null,
    gasoline: { ok: false, national: null, regions: [], states: [], extremes: null, stateUnavailable: false, publishedStateCount: 0 },
    diesel: { ok: false, national: null, regions: [], states: [], extremes: null, stateUnavailable: false, publishedStateCount: 0 },
    fuels: ['gasoline', 'diesel'],
    gasUnavailable: true,
    error: error || 'Gas price data unavailable',
    detail,
    source: null,
    sourceLabel: null,
    asOf: null,
    weekEnding: null,
    releaseDate: null,
    fetchedAt: new Date().toISOString(),
  }
}

/**
 * Resolve gas prices. Never invents or resurrects stale national averages.
 */
async function getGasPrices({ stateCode = '', zip: _zip = '' } = {}) {
  const code = String(stateCode || '').trim().toUpperCase().slice(0, 2)
  const errors = []

  // 1) Official EIA API when key present
  try {
    const apiPayload = await fetchEiaApi(code)
    if (apiPayload && (apiPayload.national != null || (apiPayload.states && apiPayload.states.length)
      || apiPayload.diesel?.national != null || apiPayload.diesel?.states?.length)) {
      return apiPayload
    }
  } catch (err) {
    errors.push(`eia-api: ${err.message}`)
    console.warn('[gasPrices] EIA API:', err.message)
  }

  // 2) Public weekly HTML (no key) — primary free path (gasoline + diesel)
  try {
    const parsed = await fetchEiaGasdieselHtml()
    return buildPayloadFromParsed(parsed, code || null)
  } catch (err) {
    errors.push(`eia-html: ${err.message}`)
    console.warn('[gasPrices] EIA gasdiesel HTML:', err.message)
  }

  return unavailable(
    'Could not load live EIA weekly retail gasoline prices.',
    errors.join('; ') || null,
  )
}

module.exports = {
  US_GAS_STATES,
  getGasPrices,
  fetchEiaGasdieselHtml,
  parseGasdieselTables,
  buildPayloadFromParsed,
  computeExtremes,
  unavailable,
}
