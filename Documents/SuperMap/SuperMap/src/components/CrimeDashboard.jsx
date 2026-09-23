import { useCallback, useEffect, useMemo, useState } from 'react'
import './CrimeDashboard.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env.DEV ? '' : 'http://localhost:3001')

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'rankings', label: 'Rankings' },
  { id: 'types', label: 'Crime types' },
  { id: 'arrests', label: 'Arrests' },
  { id: 'homicide', label: 'Homicide' },
  { id: 'hate', label: 'Hate crime' },
  { id: 'cities', label: 'City search' },
]

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

function fmt(n, digits = 0) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

function Sparkline({ points = [], stroke = '#c9a227' }) {
  const vals = points.map((p) => Number(p)).filter((n) => Number.isFinite(n))
  if (vals.length < 2) return <div className="crime-sparkline crime-sparkline--empty" />
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = Math.max(max - min, 1)
  const w = 160
  const h = 36
  const d = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w
      const y = h - ((v - min) / span) * (h - 4) - 2
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className="crime-sparkline" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" />
    </svg>
  )
}

function RankTable({ rows, rateKey = 'violentRate', labelKey = 'city' }) {
  if (!rows?.length) return <p className="crime-muted">No ranking data.</p>
  return (
    <table className="crime-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Place</th>
          <th>Rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.slug || r.abbr || `${r.city || r.state}-${i}`}>
            <td>{i + 1}</td>
            <td>
              {r[labelKey] || r.name || r.city}
              {r.state && labelKey === 'city' ? <span className="crime-muted">, {r.state}</span> : null}
              {r.abbr && !r.city ? <span className="crime-muted"> ({r.abbr})</span> : null}
            </td>
            <td>{fmt(r[rateKey], 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function CrimeDashboard({ onFlyToCity }) {
  const [section, setSection] = useState('overview')
  const [stats, setStats] = useState(null)
  const [trends, setTrends] = useState([])
  const [types, setTypes] = useState([])
  const [arrests, setArrests] = useState(null)
  const [homicide, setHomicide] = useState(null)
  const [hate, setHate] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const [cityQ, setCityQ] = useState('')
  const [cityState, setCityState] = useState('')
  const [cityResults, setCityResults] = useState([])
  const [cityTotal, setCityTotal] = useState(0)
  const [cityLoading, setCityLoading] = useState(false)
  const [selectedCity, setSelectedCity] = useState(null)
  const [attribution, setAttribution] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      getJson('/api/crime/stats'),
      getJson('/api/crime/national-trends'),
      getJson('/api/crime/types'),
      getJson('/api/crime/arrests'),
      getJson('/api/crime/homicide'),
      getJson('/api/crime/hate-crime'),
    ])
      .then(([s, t, ty, a, h, hc]) => {
        if (cancelled) return
        setStats(s.data)
        setTrends(Array.isArray(t.data) ? t.data : [])
        setTypes(Array.isArray(ty.data) ? ty.data : [])
        setArrests(a.data)
        setHomicide(h.data)
        setHate(Array.isArray(hc.data) ? hc.data : [])
        setAttribution(s.meta?.attribution || t.meta?.attribution)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load crime data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const searchCities = useCallback(async (q, state, offset = 0) => {
    setCityLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (state) params.set('state', state)
      params.set('limit', '25')
      params.set('offset', String(offset))
      const payload = await getJson(`/api/crime/cities?${params}`)
      setCityResults(Array.isArray(payload.data) ? payload.data : [])
      setCityTotal(payload.meta?.total || 0)
      if (payload.meta?.attribution) setAttribution(payload.meta.attribution)
    } catch (err) {
      setError(err.message || 'City search failed')
    } finally {
      setCityLoading(false)
    }
  }, [])

  useEffect(() => {
    if (section !== 'cities') return
    const t = setTimeout(() => searchCities(cityQ, cityState, 0), 250)
    return () => clearTimeout(t)
  }, [section, cityQ, cityState, searchCities])

  const recentViolent = useMemo(
    () => trends.slice(-20).map((r) => r.violentRate),
    [trends],
  )

  const n2024 = stats?.national2024
  const n2023 = stats?.national2023

  const openCity = async (slug) => {
    try {
      const payload = await getJson(`/api/crime/cities/${encodeURIComponent(slug)}`)
      setSelectedCity(payload.data)
      if (onFlyToCity && payload.data) onFlyToCity(payload.data)
    } catch (err) {
      setError(err.message || 'City detail failed')
    }
  }

  return (
    <aside className="crime-dashboard" aria-label="Crime analytics">
      <header className="crime-dashboard-header">
        <h2>Crime Map</h2>
        <p className="crime-dashboard-sub">FBI UCR rates · state choropleth + city search</p>
      </header>

      <nav className="crime-dashboard-tabs" aria-label="Crime sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={section === s.id ? 'active' : ''}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="crime-dashboard-body">
        {loading && <p className="crime-muted">Loading crime datasets…</p>}
        {error && <p className="crime-error">{error}</p>}

        {!loading && section === 'overview' && n2024 && (
          <div className="crime-panel">
            <h3>National 2024 snapshot</h3>
            <div className="crime-stat-grid">
              <div className="crime-stat">
                <span className="crime-stat-label">Violent rate</span>
                <span className="crime-stat-value">{fmt(n2024.violentRate, 1)}</span>
                <span className="crime-stat-hint">per 100k · YoY {stats?.trends?.violentYoY ?? '—'}%</span>
              </div>
              <div className="crime-stat">
                <span className="crime-stat-label">Homicide rate</span>
                <span className="crime-stat-value">{fmt(n2024.homicideRate, 2)}</span>
                <span className="crime-stat-hint">{fmt(n2024.homicide)} incidents</span>
              </div>
              <div className="crime-stat">
                <span className="crime-stat-label">Property rate</span>
                <span className="crime-stat-value">{fmt(n2024.propertyRate, 1)}</span>
                <span className="crime-stat-hint">YoY {stats?.trends?.propertyYoY ?? '—'}%</span>
              </div>
              <div className="crime-stat">
                <span className="crime-stat-label">Coverage</span>
                <span className="crime-stat-value">{fmt(stats.totalCities)}</span>
                <span className="crime-stat-hint">cities · {stats.totalStates} states</span>
              </div>
            </div>
            <div className="crime-trend-block">
              <div className="crime-trend-label">Violent rate trend (recent years)</div>
              <Sparkline points={recentViolent} />
              {n2023 && (
                <p className="crime-muted">
                  2023 violent rate {fmt(n2023.violentRate, 1)} → 2024 {fmt(n2024.violentRate, 1)}
                </p>
              )}
            </div>
          </div>
        )}

        {!loading && section === 'rankings' && stats && (
          <div className="crime-panel crime-panel--split">
            <div>
              <h3>Highest city violent rates</h3>
              <RankTable rows={stats.topCitiesByViolentRate} />
            </div>
            <div>
              <h3>Safest cities</h3>
              <RankTable rows={stats.safestCities} />
            </div>
            <div>
              <h3>Highest state violent rates</h3>
              <RankTable rows={stats.topStatesByViolentRate} labelKey="name" />
            </div>
            <div>
              <h3>Safest states</h3>
              <RankTable rows={stats.safestStates} labelKey="name" />
            </div>
          </div>
        )}

        {!loading && section === 'types' && (
          <div className="crime-panel">
            <h3>Offense types (national)</h3>
            <ul className="crime-type-list">
              {types.map((t) => {
                const hist = (t.nationalHistory || []).slice(-15).map((h) => h.value)
                return (
                  <li key={t.slug}>
                    <div className="crime-type-row">
                      <strong>{t.name}</strong>
                      <span>{fmt(t.latest?.value)}</span>
                    </div>
                    <Sparkline points={hist} stroke="#7dd3fc" />
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {!loading && section === 'arrests' && arrests && (
          <div className="crime-panel">
            <h3>Arrests</h3>
            <div className="crime-stat-grid">
              <div className="crime-stat">
                <span className="crime-stat-label">Total (est.)</span>
                <span className="crime-stat-value">{fmt(arrests.nationalEstimates?.totalArrests)}</span>
              </div>
              <div className="crime-stat">
                <span className="crime-stat-label">Violent</span>
                <span className="crime-stat-value">{fmt(arrests.nationalEstimates?.violentArrests)}</span>
              </div>
              <div className="crime-stat">
                <span className="crime-stat-label">Property</span>
                <span className="crime-stat-value">{fmt(arrests.nationalEstimates?.propertyArrests)}</span>
              </div>
              <div className="crime-stat">
                <span className="crime-stat-label">Drug</span>
                <span className="crime-stat-value">{fmt(arrests.nationalEstimates?.drugArrests)}</span>
              </div>
            </div>
            <h4>By sex</h4>
            <ul className="crime-simple-list">
              {(arrests.bySex || []).map((r) => (
                <li key={r.sex}><span>{r.sex}</span><span>{fmt(r.pct, 1)}%</span></li>
              ))}
            </ul>
            <h4>By age</h4>
            <ul className="crime-simple-list">
              {(arrests.byAge || []).map((r) => (
                <li key={r.group}><span>{r.group}</span><span>{fmt(r.pct, 1)}%</span></li>
              ))}
            </ul>
          </div>
        )}

        {!loading && section === 'homicide' && homicide && (
          <div className="crime-panel">
            <h3>Homicide breakdown</h3>
            <p className="crime-muted">
              Victims {fmt(homicide.totalVictims)} · Offenders {fmt(homicide.totalOffenders)}
            </p>
            <h4>Weapons</h4>
            <ul className="crime-simple-list">
              {(homicide.weaponBreakdown || []).map((w) => (
                <li key={w.weapon}>
                  <span>{w.weapon}</span>
                  <span>{fmt(w.pct, 1)}% ({fmt(w.count)})</span>
                </li>
              ))}
            </ul>
            <h4>Circumstances</h4>
            <ul className="crime-simple-list">
              {(homicide.circumstanceBreakdown || []).map((c) => (
                <li key={c.circumstance}>
                  <span>{c.circumstance}</span>
                  <span>{fmt(c.pct, 1)}%</span>
                </li>
              ))}
            </ul>
            <h4>Victim / offender relationship</h4>
            <ul className="crime-simple-list">
              {(homicide.relationship || []).map((r) => (
                <li key={r.rel}>
                  <span>{r.rel}</span>
                  <span>{fmt(r.pct, 1)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && section === 'hate' && (
          <div className="crime-panel">
            <h3>Hate crime by state</h3>
            <table className="crime-table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>Total</th>
                  <th>Race/Eth.</th>
                  <th>Religion</th>
                  <th>SO</th>
                </tr>
              </thead>
              <tbody>
                {[...hate].sort((a, b) => (b.totalIncidents || 0) - (a.totalIncidents || 0)).slice(0, 25).map((h) => (
                  <tr key={h.abbr || h.state}>
                    <td>{h.state}</td>
                    <td>{fmt(h.totalIncidents)}</td>
                    <td>{fmt(h.raceEthnicity)}</td>
                    <td>{fmt(h.religion)}</td>
                    <td>{fmt(h.sexualOrientation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section === 'cities' && (
          <div className="crime-panel">
            <h3>City search</h3>
            <div className="crime-search-row">
              <input
                type="search"
                placeholder="City name…"
                value={cityQ}
                onChange={(e) => setCityQ(e.target.value)}
                aria-label="Search cities"
              />
              <input
                type="text"
                placeholder="State…"
                value={cityState}
                onChange={(e) => setCityState(e.target.value)}
                aria-label="Filter by state"
              />
            </div>
            <p className="crime-muted">
              {cityLoading ? 'Searching…' : `${fmt(cityTotal)} matches`} · no lat/lon in index — select to geocode
            </p>
            <ul className="crime-city-results">
              {cityResults.map((c) => (
                <li key={c.slug}>
                  <button type="button" onClick={() => openCity(c.slug)}>
                    <strong>{c.city}</strong>
                    <span className="crime-muted">{c.state}</span>
                    <span>V {fmt(c.violentRate, 1)}</span>
                    <span>P {fmt(c.propertyRate, 1)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {selectedCity && (
              <div className="crime-city-detail">
                <h4>{selectedCity.city}, {selectedCity.state}</h4>
                <ul className="crime-simple-list">
                  <li><span>Population</span><span>{fmt(selectedCity.population)}</span></li>
                  <li><span>Violent rate</span><span>{fmt(selectedCity.violentRate, 1)}</span></li>
                  <li><span>Murder rate</span><span>{fmt(selectedCity.murderRate, 2)}</span></li>
                  <li><span>Property rate</span><span>{fmt(selectedCity.propertyRate, 1)}</span></li>
                  <li><span>YoY violent</span><span>{fmt(selectedCity.violentChange, 1)}% ({selectedCity.trajectory})</span></li>
                  <li><span>Safety percentile</span><span>{fmt(selectedCity.safetyPercentile)}</span></li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="crime-dashboard-footer">
        Source: {attribution?.source || 'PlainCrime + FBI UCR'}
        {attribution?.license ? ` · ${attribution.license}` : ''}
      </footer>
    </aside>
  )
}
