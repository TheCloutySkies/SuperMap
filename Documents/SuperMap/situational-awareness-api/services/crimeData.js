/**
 * Crime / FBI UCR data loader (PlainCrime-derived static files).
 * Caches parsed JSON in memory on first read.
 */
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data', 'crime')

const ATTRIBUTION = {
  source: 'PlainCrime + FBI UCR',
  license: 'PlainCrime CC BY 4.0; FBI UCR public domain',
  cite: 'PlainCrime, "U.S. City Crime Dataset". https://plaincrime.com/data/fbi-ucr-city-crime',
  note: 'Offense counts and rates from FBI Uniform Crime Reporting. Attribute PlainCrime + FBI UCR.',
}

const cache = new Map()

function dataPath(filename) {
  return path.join(DATA_DIR, filename)
}

function loadJson(filename) {
  if (cache.has(filename)) return cache.get(filename)
  const full = dataPath(filename)
  if (!fs.existsSync(full)) {
    const err = new Error(`Crime data file missing: ${filename}`)
    err.code = 'CRIME_DATA_MISSING'
    throw err
  }
  const raw = fs.readFileSync(full, 'utf8')
  const parsed = JSON.parse(raw)
  cache.set(filename, parsed)
  return parsed
}

function withMeta(payload, extra = {}) {
  return {
    ...extra,
    data: payload,
    meta: {
      attribution: ATTRIBUTION,
      generatedAt: new Date().toISOString(),
      ...extra.meta,
    },
  }
}

function getStats() {
  return withMeta(loadJson('stats.json'))
}

function getNationalTrends() {
  return withMeta(loadJson('national-trends.json'))
}

function getCrimeTypes() {
  return withMeta(loadJson('crime-types.json'))
}

function getArrests() {
  return withMeta(loadJson('arrest-data.json'))
}

function getHomicide() {
  return withMeta(loadJson('homicide-data.json'))
}

function getHateCrime() {
  return withMeta(loadJson('hate-crime-by-state.json'))
}

function getStateByAbbr(abbr) {
  const needle = String(abbr || '').trim().toUpperCase()
  if (!needle) return null
  const summary = loadJson('state-summary.json')
  const base = summary.find((s) => String(s.abbr || '').toUpperCase() === needle)
  if (!base) return null
  let years = []
  try {
    const trends = loadJson('state-trends.json')
    const row = trends.find((s) => String(s.abbr || '').toUpperCase() === needle)
    years = Array.isArray(row?.years) ? row.years : []
  } catch {
    years = []
  }
  return withMeta({ ...base, years }, { meta: { abbr: needle, yearCount: years.length } })
}

function getStateSummary(year) {
  const summary = loadJson('state-summary.json')
  if (!year) return withMeta(summary, { meta: { year: 2024, count: summary.length } })

  const y = Number(year)
  try {
    const trends = loadJson('state-trends.json')
    const fromTrends = trends.map((row) => {
      const series = row.years || row.series || []
      const point = series.find((s) => Number(s.year) === y)
      if (!point) return null
      const base = summary.find((s) => s.abbr === row.abbr) || {}
      return {
        abbr: row.abbr,
        name: row.name,
        population: point.population || base.population,
        violentCrime: point.violentCrime,
        violentRate: point.violentRate,
        propertyCrime: point.propertyCrime,
        propertyRate: point.propertyRate,
        homicide: point.homicide,
        homicideRate: point.homicideRate,
        violentChange: point.violentChange,
        propertyChange: point.propertyChange,
        year: y,
      }
    }).filter(Boolean)
    if (fromTrends.length) {
      return withMeta(fromTrends, { meta: { year: y, count: fromTrends.length, source: 'state-trends' } })
    }
  } catch {
    /* fall through */
  }

  try {
    const history = loadJson('state_crime.json')
    const rows = history
      .filter((r) => Number(r.Year) === y)
      .map((r) => {
        const rates = r.Data?.Rates || {}
        const base = summary.find((s) => s.name === r.State) || {}
        return {
          abbr: base.abbr,
          name: r.State,
          population: r.Data?.Population || base.population,
          violentRate: rates.Violent?.All,
          propertyRate: rates.Property?.All,
          homicideRate: rates.Violent?.Murder,
          year: y,
        }
      })
    if (rows.length) {
      return withMeta(rows, { meta: { year: y, count: rows.length, source: 'state_crime' } })
    }
  } catch {
    /* fall through */
  }

  return withMeta(summary, { meta: { year: 2024, count: summary.length, note: `No rows for year ${y}; returned latest summary` } })
}

function normalizeCity(c) {
  return c
}

function searchCities({ q = '', state = '', limit = 50, offset = 0 } = {}) {
  const cities = loadJson('city-index.json')
  const query = String(q || '').trim().toLowerCase()
  const stateFilter = String(state || '').trim().toLowerCase()
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const off = Math.max(Number(offset) || 0, 0)

  let filtered = cities
  if (stateFilter) {
    filtered = filtered.filter((c) => {
      const st = String(c.state || '').toLowerCase()
      const abbr = String(c.abbr || '').toLowerCase()
      return st === stateFilter || abbr === stateFilter || st.includes(stateFilter)
    })
  }
  if (query) {
    filtered = filtered.filter((c) => {
      const hay = `${c.city || ''} ${c.state || ''} ${c.slug || ''}`.toLowerCase()
      return hay.includes(query)
    })
  }

  const total = filtered.length
  const slice = filtered.slice(off, off + lim).map(normalizeCity)
  return withMeta(slice, {
    meta: {
      total,
      limit: lim,
      offset: off,
      q: query || undefined,
      state: stateFilter || undefined,
    },
  })
}

function dataDirExists() {
  return fs.existsSync(DATA_DIR)
}

/** Optional CSV enrichment (2024 PlainCrime city rows) keyed by city|state lower. */
let csvByKey = null
let csvBySlug = null

function slugifyCity(city, state) {
  return `${String(city || '').trim()}-${String(state || '').trim()}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function ensureCsvIndex() {
  if (csvByKey) return
  csvByKey = new Map()
  csvBySlug = new Map()
  const full = dataPath('plaincrime-city-crime.csv')
  if (!fs.existsSync(full)) return
  const raw = fs.readFileSync(full, 'utf8')
  const lines = raw.split(/\r?\n/).filter((line) => line && !line.startsWith('#'))
  if (lines.length < 2) return
  const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const idx = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase())
  const iCity = ['city_name', 'city', 'City'].map(idx).find((i) => i >= 0)
  const iState = ['state_abbr', 'state', 'State'].map(idx).find((i) => i >= 0)
  if (iCity == null || iState == null || iCity < 0 || iState < 0) return

  let summaryByAbbr = null
  try {
    summaryByAbbr = new Map(loadJson('state-summary.json').map((s) => [String(s.abbr || '').toUpperCase(), s.name]))
  } catch (_) {
    summaryByAbbr = new Map()
  }

  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split(',')
    if (cols.length < header.length) continue
    const row = {}
    for (let i = 0; i < header.length; i++) row[header[i]] = cols[i]?.trim().replace(/^"|"$/g, '')
    const city = row.city_name || row.city || row.City || cols[iCity]
    const stateAbbr = (row.state_abbr || row.state || row.State || cols[iState] || '').toUpperCase()
    const stateName = summaryByAbbr.get(stateAbbr) || stateAbbr
    if (!city || !stateAbbr) continue
    const normalized = {
      ...row,
      city,
      state: stateName,
      stateAbbr,
      population: row.population != null ? Number(row.population) : undefined,
      violent_crime: row.violent_crime != null ? Number(row.violent_crime) : undefined,
      murder: row.murder != null ? Number(row.murder) : undefined,
      rape: row.rape != null ? Number(row.rape) : undefined,
      robbery: row.robbery != null ? Number(row.robbery) : undefined,
      aggravated_assault: row.aggravated_assault != null ? Number(row.aggravated_assault) : undefined,
      property_crime: row.property_crime != null ? Number(row.property_crime) : undefined,
      burglary: row.burglary != null ? Number(row.burglary) : undefined,
      larceny: row.larceny != null ? Number(row.larceny) : undefined,
      motor_vehicle_theft: row.motor_vehicle_theft != null ? Number(row.motor_vehicle_theft) : undefined,
      arson: row.arson != null ? Number(row.arson) : undefined,
      year: row.year != null ? Number(row.year) : undefined,
    }
    const key = `${String(city).toLowerCase()}|${String(stateName).toLowerCase()}`
    const keyAbbr = `${String(city).toLowerCase()}|${stateAbbr.toLowerCase()}`
    const slug = slugifyCity(city, stateName)
    csvByKey.set(key, normalized)
    csvByKey.set(keyAbbr, normalized)
    csvBySlug.set(slug, normalized)
  }
}

function getCityCsvExtras(slugOrCity, state) {
  ensureCsvIndex()
  if (!csvBySlug) return null
  if (state) {
    const key = `${String(slugOrCity).toLowerCase()}|${String(state).toLowerCase()}`
    return csvByKey.get(key) || null
  }
  const slug = String(slugOrCity || '').toLowerCase()
  return csvBySlug.get(slug) || null
}

function getCityBySlug(slug) {
  const cities = loadJson('city-index.json')
  const needle = String(slug || '').trim().toLowerCase()
  const city = cities.find((c) => String(c.slug || '').toLowerCase() === needle)
  if (!city) return null
  const csv = getCityCsvExtras(city.slug) || getCityCsvExtras(city.city, city.state)
  return withMeta({ ...city, csv2024: csv || undefined })
}

module.exports = {
  ATTRIBUTION,
  DATA_DIR,
  dataDirExists,
  getStats,
  getNationalTrends,
  getStateSummary,
  getStateByAbbr,
  searchCities,
  getCityBySlug,
  getCrimeTypes,
  getArrests,
  getHomicide,
  getHateCrime,
  getCityCsvExtras,
  loadJson,
}
