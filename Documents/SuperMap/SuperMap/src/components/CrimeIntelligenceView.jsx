import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildCrimeStateChoropleth } from '../services/crimeLayers'
import './CrimeIntelligenceView.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env.DEV ? '' : 'http://localhost:3001')

const NAV_SECTIONS = [
  { id: 'ask', label: 'Ask' },
  { id: 'map', label: 'Map' },
  { id: 'states', label: 'States' },
  { id: 'cities', label: 'Cities' },
  { id: 'trends', label: 'Trends' },
  { id: 'types', label: 'Types' },
  { id: 'arrests', label: 'Arrests' },
  { id: 'homicide', label: 'Homicide' },
  { id: 'hate', label: 'Hate' },
  { id: 'rankings', label: 'Rankings' },
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

function rateColor(rate) {
  const v = Number(rate) || 0
  if (v < 150) return '#3d7a3d'
  if (v < 300) return '#c9a227'
  if (v < 450) return '#d97706'
  if (v < 600) return '#dc2626'
  return '#7f1d1d'
}

function project([lon, lat], width, height) {
  const minLon = -125
  const maxLon = -66
  const minLat = 24.5
  const maxLat = 49.5
  const x = ((lon - minLon) / (maxLon - minLon)) * width
  const y = ((maxLat - lat) / (maxLat - minLat)) * height
  return [x, y]
}

function ringToPath(ring, width, height) {
  if (!ring?.length) return ''
  return ring
    .map((coord, i) => {
      const [x, y] = project(coord, width, height)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ') + ' Z'
}

function geomToPaths(geometry, width, height) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') {
    return [ringToPath(geometry.coordinates[0], width, height)]
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((poly) => ringToPath(poly[0], width, height)).filter(Boolean)
  }
  return []
}

function Sparkline({ points = [], stroke = '#c9a227' }) {
  const vals = points.map((p) => Number(p)).filter((n) => Number.isFinite(n))
  if (vals.length < 2) return <div className="ci-sparkline ci-sparkline--empty" />
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = Math.max(max - min, 1)
  const w = 200
  const h = 44
  const d = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w
      const y = h - ((v - min) / span) * (h - 4) - 2
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className="ci-sparkline" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" />
    </svg>
  )
}

function UsChoropleth({ features, selectedAbbr, onSelectState }) {
  const width = 720
  const height = 420
  if (!features?.length) {
    return <div className="ci-map-empty">Loading map…</div>
  }
  return (
    <svg
      className="ci-choropleth"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="U.S. violent crime rate choropleth"
    >
      {features.map((f, i) => {
        const abbr = f.properties?.abbr
        const name = f.properties?.name || abbr || `state-${i}`
        const rate = f.properties?.violentRate
        const paths = geomToPaths(f.geometry, width, height)
        const active = selectedAbbr && String(abbr).toUpperCase() === String(selectedAbbr).toUpperCase()
        // Skip AK/HI for compact CONUS projection (tiny/off-canvas)
        if (abbr === 'AK' || abbr === 'HI') return null
        return paths.map((d, pi) => (
          <path
            key={`${abbr || name}-${pi}`}
            d={d}
            className={`ci-state-path ${active ? 'is-active' : ''}`}
            fill={rateColor(rate)}
            stroke={active ? '#f5e6b8' : 'rgba(0,0,0,0.35)'}
            strokeWidth={active ? 2 : 0.6}
            onClick={() => abbr && onSelectState?.(abbr)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && abbr) {
                e.preventDefault()
                onSelectState?.(abbr)
              }
            }}
            tabIndex={abbr ? 0 : -1}
            role="button"
            aria-label={`${name}: violent rate ${fmt(rate, 1)} per 100k`}
          >
            <title>{`${name} — ${fmt(rate, 1)} / 100k`}</title>
          </path>
        ))
      })}
    </svg>
  )
}

export default function CrimeIntelligenceView() {
  const scrollRef = useRef(null)
  const [spyId, setSpyId] = useState('ask')
  const [stats, setStats] = useState(null)
  const [trends, setTrends] = useState([])
  const [states, setStates] = useState([])
  const [types, setTypes] = useState([])
  const [arrests, setArrests] = useState(null)
  const [homicide, setHomicide] = useState(null)
  const [hate, setHate] = useState([])
  const [mapFeatures, setMapFeatures] = useState([])
  const [attribution, setAttribution] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const [selectedAbbr, setSelectedAbbr] = useState(null)
  const [selectedCitySlug, setSelectedCitySlug] = useState(null)
  const [cityDetail, setCityDetail] = useState(null)
  const [cityQ, setCityQ] = useState('')
  const [cityResults, setCityResults] = useState([])
  const [cityLoading, setCityLoading] = useState(false)

  const [askInput, setAskInput] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  const [askMessages, setAskMessages] = useState([
    {
      role: 'assistant',
      text: 'Ask about a U.S. state or city — e.g. “How does Texas compare on violent crime?” or “Memphis rates”. Answers use PlainCrime + FBI UCR data (Groq → Ollama → heuristics).',
      provider: 'system',
    },
  ])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      getJson('/api/crime/stats'),
      getJson('/api/crime/national-trends'),
      getJson('/api/crime/states'),
      getJson('/api/crime/types'),
      getJson('/api/crime/arrests'),
      getJson('/api/crime/homicide'),
      getJson('/api/crime/hate-crime'),
      buildCrimeStateChoropleth('violentRate').catch(() => null),
    ])
      .then(([s, t, st, ty, a, h, hc, choropleth]) => {
        if (cancelled) return
        setStats(s.data)
        setTrends(Array.isArray(t.data) ? t.data : [])
        setStates(Array.isArray(st.data) ? st.data : [])
        setTypes(Array.isArray(ty.data) ? ty.data : [])
        setArrests(a.data)
        setHomicide(h.data)
        setHate(Array.isArray(hc.data) ? hc.data : [])
        setMapFeatures(choropleth?.features || [])
        setAttribution(s.meta?.attribution || st.meta?.attribution)
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

  const scrollToId = useCallback((id) => {
    const root = scrollRef.current
    const el = root?.querySelector?.(`#${id}`) || document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const selectState = useCallback((abbr) => {
    const a = String(abbr || '').toUpperCase()
    setSelectedAbbr(a)
    requestAnimationFrame(() => scrollToId(`state-${a}`))
  }, [scrollToId])

  const openCity = useCallback(async (slug) => {
    if (!slug) return
    setSelectedCitySlug(slug)
    setCityLoading(true)
    try {
      const payload = await getJson(`/api/crime/cities/${encodeURIComponent(slug)}`)
      setCityDetail(payload.data)
      requestAnimationFrame(() => scrollToId(`city-${slug}`))
    } catch (err) {
      setError(err.message || 'City load failed')
    } finally {
      setCityLoading(false)
    }
  }, [scrollToId])

  const searchCities = useCallback(async (q) => {
    setCityLoading(true)
    try {
      const params = new URLSearchParams({ limit: '20', q: q || '' })
      const payload = await getJson(`/api/crime/cities?${params}`)
      setCityResults(Array.isArray(payload.data) ? payload.data : [])
    } catch (err) {
      setError(err.message || 'City search failed')
    } finally {
      setCityLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      if (cityQ.trim().length >= 2) searchCities(cityQ.trim())
      else setCityResults([])
    }, 280)
    return () => clearTimeout(t)
  }, [cityQ, searchCities])

  const askCrime = useCallback(async (e) => {
    e?.preventDefault?.()
    const question = askInput.trim()
    if (!question || askBusy) return
    setAskBusy(true)
    setAskMessages((prev) => [...prev, { role: 'user', text: question }])
    setAskInput('')
    try {
      const res = await fetch(`${API_BASE}/api/crime/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || `Ask failed (${res.status})`)
      const data = payload.data || payload
      setAskMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.answer, provider: data.provider, matched: data.matched },
      ])
      const abbr = data.matched?.states?.[0]
      const slug = data.matched?.cities?.[0]
      if (slug) openCity(slug)
      else if (abbr) selectState(abbr)
    } catch (err) {
      setAskMessages((prev) => [
        ...prev,
        { role: 'assistant', text: err.message || 'Ask failed', provider: 'error' },
      ])
    } finally {
      setAskBusy(false)
    }
  }, [askInput, askBusy, openCity, selectState])

  // Scroll spy
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return undefined
    const ids = [
      'ci-ask', 'ci-map', 'ci-states', 'ci-cities', 'ci-trends',
      'ci-types', 'ci-arrests', 'ci-homicide', 'ci-hate', 'ci-rankings',
    ]
    const mapNav = {
      'ci-ask': 'ask', 'ci-map': 'map', 'ci-states': 'states', 'ci-cities': 'cities',
      'ci-trends': 'trends', 'ci-types': 'types', 'ci-arrests': 'arrests',
      'ci-homicide': 'homicide', 'ci-hate': 'hate', 'ci-rankings': 'rankings',
    }
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((en) => en.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible?.target?.id && mapNav[visible.target.id]) {
          setSpyId(mapNav[visible.target.id])
        }
      },
      { root, rootMargin: '-10% 0px -55% 0px', threshold: [0.15, 0.4, 0.7] },
    )
    ids.forEach((id) => {
      const el = root.querySelector(`#${id}`)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [loading])

  const national = stats?.national2024
  const violentSeries = useMemo(
    () => trends.map((t) => t.violentRate).filter((n) => Number.isFinite(Number(n))),
    [trends],
  )
  const propertySeries = useMemo(
    () => trends.map((t) => t.propertyRate).filter((n) => Number.isFinite(Number(n))),
    [trends],
  )

  const featuredCities = useMemo(() => {
    const top = stats?.topCitiesByViolentRate || []
    const safe = stats?.safestCities || []
    const merged = [...top.slice(0, 6), ...safe.slice(0, 4)]
    const seen = new Set()
    return merged.filter((c) => {
      if (!c.slug || seen.has(c.slug)) return false
      seen.add(c.slug)
      return true
    })
  }, [stats])

  const sortedStates = useMemo(
    () => [...states].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [states],
  )

  const hateSorted = useMemo(
    () => [...hate].sort((a, b) => (Number(b.incidents || b.total || b.count) || 0) - (Number(a.incidents || a.total || a.count) || 0)),
    [hate],
  )

  return (
    <div className="ci-view" role="region" aria-label="Crime Intelligence">
      <header className="ci-topbar">
        <div className="ci-brand">
          <h1>Crime Intelligence</h1>
          <p>FBI UCR via PlainCrime — national snapshot, state &amp; city detail, Ask Crime</p>
        </div>
        <nav className="ci-spy" aria-label="Crime sections">
          {NAV_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={spyId === s.id ? 'is-active' : ''}
              onClick={() => scrollToId(`ci-${s.id}`)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="ci-scroll" ref={scrollRef}>
        {loading && <p className="ci-muted ci-enter">Loading crime pack…</p>}
        {error && <p className="ci-error ci-enter">{error}</p>}

        <section id="ci-ask" className="ci-hero ci-enter">
          <div className="ci-hero-stats">
            <div className="ci-stat">
              <span className="ci-stat-label">Violent / 100k</span>
              <span className="ci-stat-value">{fmt(national?.violentRate, 1)}</span>
              <span className="ci-stat-sub">
                {national?.violentChange != null
                  ? `${national.violentChange > 0 ? '+' : ''}${fmt(national.violentChange, 1)}% YoY`
                  : 'National 2024'}
              </span>
            </div>
            <div className="ci-stat">
              <span className="ci-stat-label">Property / 100k</span>
              <span className="ci-stat-value">{fmt(national?.propertyRate, 1)}</span>
              <span className="ci-stat-sub">
                {national?.propertyChange != null
                  ? `${national.propertyChange > 0 ? '+' : ''}${fmt(national.propertyChange, 1)}% YoY`
                  : 'National 2024'}
              </span>
            </div>
            <div className="ci-stat">
              <span className="ci-stat-label">Homicide / 100k</span>
              <span className="ci-stat-value">{fmt(national?.homicideRate, 1)}</span>
              <span className="ci-stat-sub">{fmt(stats?.totalCities, 0)} cities · {fmt(stats?.totalStates, 0)} states</span>
            </div>
            <div className="ci-stat ci-stat--spark">
              <span className="ci-stat-label">Violent trend</span>
              <Sparkline points={violentSeries} />
            </div>
          </div>

          <div className="ci-ask-panel">
            <h2>Ask Crime</h2>
            <div className="ci-ask-thread" aria-live="polite">
              {askMessages.map((m, i) => (
                <div key={i} className={`ci-ask-msg ci-ask-msg--${m.role}`}>
                  <p>{m.text}</p>
                  {m.provider && m.role === 'assistant' && m.provider !== 'system' && (
                    <span className="ci-ask-provider">via {m.provider}</span>
                  )}
                </div>
              ))}
            </div>
            <form className="ci-ask-form" onSubmit={askCrime}>
              <input
                type="search"
                value={askInput}
                onChange={(e) => setAskInput(e.target.value)}
                placeholder="Ask about a state, city, or national trend…"
                aria-label="Ask Crime question"
                disabled={askBusy}
              />
              <button type="submit" disabled={askBusy || !askInput.trim()}>
                {askBusy ? 'Thinking…' : 'Ask'}
              </button>
            </form>
          </div>
        </section>

        <section id="ci-map" className="ci-section ci-enter ci-enter-delay">
          <div className="ci-section-head">
            <h2>State rates map</h2>
            <p>Click a state to jump to its summary. Color = violent crime rate per 100k.</p>
          </div>
          <div className={`ci-map-wrap ${selectedAbbr ? 'has-selection' : ''}`}>
            <UsChoropleth
              features={mapFeatures}
              selectedAbbr={selectedAbbr}
              onSelectState={selectState}
            />
            <div className="ci-map-legend" aria-hidden>
              <span style={{ background: '#3d7a3d' }} />&lt;150
              <span style={{ background: '#c9a227' }} />300
              <span style={{ background: '#d97706' }} />450
              <span style={{ background: '#dc2626' }} />600+
            </div>
          </div>
          {selectedAbbr && (
            <p className="ci-muted">
              Selected <strong>{selectedAbbr}</strong> — scrolling to summary.
            </p>
          )}
        </section>

        <section id="ci-states" className="ci-section ci-enter">
          <div className="ci-section-head">
            <h2>State summaries</h2>
            <p>Latest year rates for all states and DC. Click a chip or map state to focus.</p>
          </div>
          <div className="ci-chip-row">
            {sortedStates.map((s) => (
              <button
                key={s.abbr}
                type="button"
                className={`ci-chip ${selectedAbbr === s.abbr ? 'is-active' : ''}`}
                onClick={() => selectState(s.abbr)}
              >
                {s.abbr}
              </button>
            ))}
          </div>
          <div className="ci-state-grid">
            {sortedStates.map((s) => (
              <article
                key={s.abbr}
                id={`state-${s.abbr}`}
                className={`ci-state-card ${selectedAbbr === s.abbr ? 'is-active' : ''}`}
              >
                <header>
                  <h3>{s.name} <span className="ci-muted">({s.abbr})</span></h3>
                  <span className="ci-pill" style={{ borderColor: rateColor(s.violentRate) }}>
                    {fmt(s.violentRate, 1)} violent
                  </span>
                </header>
                <dl className="ci-dl">
                  <div><dt>Property</dt><dd>{fmt(s.propertyRate, 1)}</dd></div>
                  <div><dt>Homicide</dt><dd>{fmt(s.homicideRate, 1)}</dd></div>
                  <div><dt>YoY violent</dt><dd>{s.violentChange != null ? `${s.violentChange > 0 ? '+' : ''}${fmt(s.violentChange, 1)}%` : '—'}</dd></div>
                  <div><dt>Population</dt><dd>{fmt(s.population, 0)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section id="ci-cities" className="ci-section ci-enter">
          <div className="ci-section-head">
            <h2>City detail</h2>
            <p>Search the city index or pick a featured chip. Detail scrolls here.</p>
          </div>
          <div className="ci-chip-row">
            {featuredCities.map((c) => (
              <button
                key={c.slug}
                type="button"
                className={`ci-chip ${selectedCitySlug === c.slug ? 'is-active' : ''}`}
                onClick={() => openCity(c.slug)}
              >
                {c.city}
              </button>
            ))}
          </div>
          <div className="ci-city-search">
            <input
              type="search"
              value={cityQ}
              onChange={(e) => setCityQ(e.target.value)}
              placeholder="Search cities…"
              aria-label="Search cities"
            />
            {cityLoading && <span className="ci-muted">Searching…</span>}
          </div>
          {cityResults.length > 0 && (
            <ul className="ci-city-results">
              {cityResults.map((c) => (
                <li key={c.slug}>
                  <button type="button" onClick={() => openCity(c.slug)}>
                    <strong>{c.city}</strong>
                    <span className="ci-muted">, {c.state}</span>
                    <span className="ci-rate">{fmt(c.violentRate, 1)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div id={selectedCitySlug ? `city-${selectedCitySlug}` : 'city-detail'} className="ci-city-detail">
            {cityDetail ? (
              <article className="ci-city-card is-active">
                <header>
                  <h3>{cityDetail.city}, {cityDetail.state}</h3>
                  <span className="ci-pill" style={{ borderColor: rateColor(cityDetail.violentRate) }}>
                    {fmt(cityDetail.violentRate, 1)} violent · {cityDetail.trajectory || '—'}
                  </span>
                </header>
                <dl className="ci-dl">
                  <div><dt>Property</dt><dd>{fmt(cityDetail.propertyRate, 1)}</dd></div>
                  <div><dt>Murder</dt><dd>{fmt(cityDetail.murderRate, 2)}</dd></div>
                  <div><dt>YoY violent</dt><dd>{cityDetail.violentChange != null ? `${cityDetail.violentChange > 0 ? '+' : ''}${fmt(cityDetail.violentChange, 1)}%` : '—'}</dd></div>
                  <div><dt>Safety %ile</dt><dd>{fmt(cityDetail.safetyPercentile, 0)}</dd></div>
                  <div><dt>Population</dt><dd>{fmt(cityDetail.population, 0)}</dd></div>
                  <div><dt>Years</dt><dd>{(cityDetail.yearsAvailable || []).join(', ') || '—'}</dd></div>
                </dl>
                {cityDetail.composition && (
                  <p className="ci-muted">
                    Composition — murder {fmt(cityDetail.composition.murderPct, 1)}%, rape {fmt(cityDetail.composition.rapePct, 1)}%,
                    robbery {fmt(cityDetail.composition.robberyPct, 1)}%, assault {fmt(cityDetail.composition.assaultPct, 1)}%.
                  </p>
                )}
                {cityDetail.csv2024 && (
                  <div className="ci-csv-block">
                    <h4>2024 offense counts (CSV)</h4>
                    <dl className="ci-dl">
                      <div><dt>Violent</dt><dd>{fmt(cityDetail.csv2024.violent_crime, 0)}</dd></div>
                      <div><dt>Murder</dt><dd>{fmt(cityDetail.csv2024.murder, 0)}</dd></div>
                      <div><dt>Robbery</dt><dd>{fmt(cityDetail.csv2024.robbery, 0)}</dd></div>
                      <div><dt>Assault</dt><dd>{fmt(cityDetail.csv2024.aggravated_assault, 0)}</dd></div>
                      <div><dt>Property</dt><dd>{fmt(cityDetail.csv2024.property_crime, 0)}</dd></div>
                      <div><dt>Burglary</dt><dd>{fmt(cityDetail.csv2024.burglary, 0)}</dd></div>
                      <div><dt>Larceny</dt><dd>{fmt(cityDetail.csv2024.larceny, 0)}</dd></div>
                      <div><dt>MVT</dt><dd>{fmt(cityDetail.csv2024.motor_vehicle_theft, 0)}</dd></div>
                    </dl>
                  </div>
                )}
              </article>
            ) : (
              <p className="ci-muted">Select a city chip or search to open detail.</p>
            )}
          </div>
        </section>

        <section id="ci-trends" className="ci-section ci-enter">
          <div className="ci-section-head">
            <h2>National trends</h2>
            <p>Long-run violent and property rates from the national series.</p>
          </div>
          <div className="ci-trend-row">
            <div>
              <h3>Violent</h3>
              <Sparkline points={violentSeries} stroke="#dc2626" />
            </div>
            <div>
              <h3>Property</h3>
              <Sparkline points={propertySeries} stroke="#58a6ff" />
            </div>
          </div>
          <div className="ci-table-wrap">
            <table className="ci-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Violent</th>
                  <th>Property</th>
                  <th>Homicide</th>
                </tr>
              </thead>
              <tbody>
                {[...trends].slice(-12).reverse().map((t) => (
                  <tr key={t.year}>
                    <td>{t.year}</td>
                    <td>{fmt(t.violentRate, 1)}</td>
                    <td>{fmt(t.propertyRate, 1)}</td>
                    <td>{fmt(t.homicideRate, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="ci-types" className="ci-section ci-enter">
          <div className="ci-section-head">
            <h2>Crime types</h2>
            <p>Offense categories and national history where available.</p>
          </div>
          <div className="ci-type-grid">
            {types.map((t) => (
              <article key={t.id || t.name || t.key} className="ci-type-card">
                <h3>{t.name || t.label || t.id}</h3>
                <p className="ci-stat-value">{fmt(t.nationalRate ?? t.rate ?? t.latestRate, 1)}</p>
                <p className="ci-muted">per 100k · {t.change != null || t.yoy != null ? `${(t.change ?? t.yoy) > 0 ? '+' : ''}${fmt(t.change ?? t.yoy, 1)}%` : '—'}</p>
                {Array.isArray(t.nationalHistory) && t.nationalHistory.length > 1 && (
                  <Sparkline points={t.nationalHistory.map((h) => h.rate ?? h.violentRate ?? h.value)} />
                )}
              </article>
            ))}
          </div>
        </section>

        <section id="ci-arrests" className="ci-section ci-enter">
          <div className="ci-section-head">
            <h2>Arrests</h2>
            <p>National estimates and demographic breakdowns from the arrest pack.</p>
          </div>
          {arrests?.nationalEstimates ? (
            <pre className="ci-json-lite">{JSON.stringify(arrests.nationalEstimates, null, 2)}</pre>
          ) : (
            <p className="ci-muted">No national arrest estimates.</p>
          )}
          {arrests?.bySex && (
            <dl className="ci-dl">
              {Object.entries(arrests.bySex).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{typeof v === 'object' ? JSON.stringify(v) : fmt(v, 0)}</dd></div>
              ))}
            </dl>
          )}
          {arrests?.byAge && (
            <div className="ci-table-wrap">
              <table className="ci-table">
                <thead><tr><th>Age</th><th>Value</th></tr></thead>
                <tbody>
                  {Object.entries(arrests.byAge).slice(0, 12).map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td>{typeof v === 'object' ? JSON.stringify(v) : fmt(v, 0)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section id="ci-homicide" className="ci-section ci-enter">
          <div className="ci-section-head">
            <h2>Homicide</h2>
            <p>Weapons, circumstances, and relationship breakdowns.</p>
          </div>
          <div className="ci-homicide-grid">
            {['weapons', 'byWeapon', 'circumstances', 'relationship'].map((key) => {
              const block = homicide?.[key]
              if (!block) return null
              const entries = Array.isArray(block)
                ? block.map((row, i) => [row.name || row.label || row.type || `#${i}`, row.count ?? row.total ?? row.pct ?? row])
                : Object.entries(block)
              return (
                <div key={key}>
                  <h3>{key}</h3>
                  <ul className="ci-simple-list">
                    {entries.slice(0, 10).map(([k, v]) => (
                      <li key={String(k)}>
                        <span>{k}</span>
                        <strong>{typeof v === 'object' ? JSON.stringify(v) : fmt(v, typeof v === 'number' && v < 100 ? 1 : 0)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>

        <section id="ci-hate" className="ci-section ci-enter">
          <div className="ci-section-head">
            <h2>Hate crime by state</h2>
            <p>Incidents from the hate-crime pack (click state to sync map).</p>
          </div>
          <div className="ci-table-wrap">
            <table className="ci-table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>Incidents</th>
                </tr>
              </thead>
              <tbody>
                {hateSorted.slice(0, 30).map((row, i) => {
                  const abbr = row.abbr || row.stateAbbr
                  const name = row.name || row.state || abbr || `row-${i}`
                  const count = row.incidents ?? row.total ?? row.count ?? row.hateCrimes
                  return (
                    <tr
                      key={abbr || name}
                      className={selectedAbbr && abbr === selectedAbbr ? 'is-active' : ''}
                      onClick={() => abbr && selectState(abbr)}
                      style={{ cursor: abbr ? 'pointer' : 'default' }}
                    >
                      <td>{name}{abbr ? ` (${abbr})` : ''}</td>
                      <td>{fmt(count, 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section id="ci-rankings" className="ci-section ci-enter">
          <div className="ci-section-head">
            <h2>Rankings</h2>
            <p>Highest and lowest violent rates — click a city to open detail.</p>
          </div>
          <div className="ci-rank-grid">
            <div>
              <h3>Highest violent (cities)</h3>
              <ul className="ci-simple-list">
                {(stats?.topCitiesByViolentRate || []).slice(0, 10).map((c) => (
                  <li key={c.slug}>
                    <button type="button" className="ci-linkish" onClick={() => openCity(c.slug)}>
                      {c.city}, {c.state}
                    </button>
                    <strong>{fmt(c.violentRate, 1)}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Safest cities</h3>
              <ul className="ci-simple-list">
                {(stats?.safestCities || []).slice(0, 10).map((c) => (
                  <li key={c.slug}>
                    <button type="button" className="ci-linkish" onClick={() => openCity(c.slug)}>
                      {c.city}, {c.state}
                    </button>
                    <strong>{fmt(c.violentRate, 1)}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Highest violent (states)</h3>
              <ul className="ci-simple-list">
                {(stats?.topStatesByViolentRate || []).slice(0, 10).map((s) => (
                  <li key={s.abbr}>
                    <button type="button" className="ci-linkish" onClick={() => selectState(s.abbr)}>
                      {s.name}
                    </button>
                    <strong>{fmt(s.violentRate, 1)}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Safest states</h3>
              <ul className="ci-simple-list">
                {(stats?.safestStates || []).slice(0, 10).map((s) => (
                  <li key={s.abbr}>
                    <button type="button" className="ci-linkish" onClick={() => selectState(s.abbr)}>
                      {s.name}
                    </button>
                    <strong>{fmt(s.violentRate, 1)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <footer className="ci-footer ci-muted">
          {attribution
            ? `${attribution.source} · ${attribution.license}. ${attribution.cite || ''}`
            : 'PlainCrime + FBI UCR'}
          {stats?.lastUpdated ? ` · Pack updated ${stats.lastUpdated}` : ''}
        </footer>
      </div>
    </div>
  )
}
