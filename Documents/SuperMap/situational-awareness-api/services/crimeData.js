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

function getCityBySlug(slug) {
  const cities = loadJson('city-index.json')
  const needle = String(slug || '').trim().toLowerCase()
  const city = cities.find((c) => String(c.slug || '').toLowerCase() === needle)
  if (!city) return null
  return withMeta(city)
}

function dataDirExists() {
  return fs.existsSync(DATA_DIR)
}

module.exports = {
  ATTRIBUTION,
  DATA_DIR,
  dataDirExists,
  getStats,
  getNationalTrends,
  getStateSummary,
  searchCities,
  getCityBySlug,
  getCrimeTypes,
  getArrests,
  getHomicide,
  getHateCrime,
  loadJson,
}
