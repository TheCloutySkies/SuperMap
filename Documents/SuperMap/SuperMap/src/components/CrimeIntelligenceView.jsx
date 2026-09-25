import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildCrimeStateChoropleth } from '../services/crimeLayers'
import { CITY_COORDS, coordsForCity, stateAbbrFromName } from '../services/crimeCentroids'
import { LEVEL_THRESHOLDS, levelFromRatio } from '../lib/crimeLevels'
import './CrimeIntelligenceView.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env.DEV ? '' : 'http://localhost:3001')

const SEGMENTS = [
  { id: 'national', label: 'National' },
  { id: 'states', label: 'States' },
  { id: 'cities', label: 'Cities' },
  { id: 'map', label: 'Map' },
  { id: 'offenders', label: 'Offenders' },
  { id: 'ask', label: 'ThiellBot' },
]

const CRIME_METRIC_OPTIONS = [
  { id: 'violentRate', label: 'Violent', countKey: 'violentCrime', rateKey: 'violentRate' },
  { id: 'homicideRate', label: 'Homicide', countKey: 'homicide', rateKey: 'homicideRate' },
  { id: 'propertyRate', label: 'Property', countKey: 'propertyCrime', rateKey: 'propertyRate' },
  { id: 'burglary', label: 'Burglary', countKey: 'burglary', rateKey: null },
  { id: 'larceny', label: 'Larceny', countKey: 'larceny', rateKey: null },
  { id: 'motorVehicleTheft', label: 'Motor vehicle theft', countKey: 'motorVehicleTheft', rateKey: null },
  { id: 'rape', label: 'Rape', countKey: 'rape', rateKey: null },
  { id: 'robbery', label: 'Robbery', countKey: 'robbery', rateKey: null },
  { id: 'aggravatedAssault', label: 'Aggravated assault', countKey: 'aggravatedAssault', rateKey: null },
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

/** Never render objects / JSON dumps as React children. */
function scalar(v) {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'object') {
    if (typeof v.total === 'number') return v.total
    if (typeof v.count === 'number') return v.count
    if (typeof v.rate === 'number') return v.rate
    if (typeof v.pct === 'number') return v.pct
    return null
  }
  return null
}

function fmtScalar(v, digits = 0) {
  const n = scalar(v)
  if (n == null) return '—'
  if (typeof n === 'number') return fmt(n, digits)
  return String(n)
}

function rowLabel(row, fallback = 'Item') {
  if (row == null) return fallback
  if (typeof row === 'string') return row
  if (typeof row !== 'object') return String(row)
  return String(
    row.offense || row.name || row.label || row.weapon || row.relationship
    || row.age || row.type || row.circumstance || row.race || fallback,
  )
}

function levelColor(id) {
  switch (id) {
    case 'low': return '#3d9a6a'
    case 'medium': return '#c9a227'
    case 'high': return '#e07a3a'
    case 'extreme': return '#e04545'
    default: return '#6b7c72'
  }
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
  return `${ring
    .map((coord, i) => {
      const [x, y] = project(coord, width, height)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')} Z`
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

function meanOf(values) {
  const nums = values.map(Number).filter((n) => Number.isFinite(n))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function LevelBadge({ level, hint }) {
  if (!level || level.id === 'unknown') {
    return <span className="ci-level ci-level--unknown">—</span>
  }
  return (
    <span
      className={`ci-level ci-level--${level.id}`}
      title={hint || (level.ratio != null ? `${fmt(level.ratio * 100, 0)}% of reference` : undefined)}
    >
      {level.label}
    </span>
  )
}

function TrendChart({
  series = [],
  year,
  onYearChange,
  valueKey = 'rate',
  accent = '#3d9a6a',
  unit = '/ 100k',
}) {
  const years = series.map((p) => Number(p.year)).filter((y) => Number.isFinite(y))
  const minY = years.length ? Math.min(...years) : 0
  const maxY = years.length ? Math.max(...years) : 0
  const activeYear = year ?? maxY
  const vals = series.map((p) => Number(p[valueKey])).filter((n) => Number.isFinite(n))
  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 1
  const span = Math.max(max - min, 1e-6)
  const w = 640
  const h = 180
  const pad = { t: 12, r: 12, b: 28, l: 8 }
  const iw = w - pad.l - pad.r
  const ih = h - pad.t - pad.b

  const coords = series.map((p, i) => {
    const x = pad.l + (series.length <= 1 ? iw / 2 : (i / (series.length - 1)) * iw)
    const v = Number(p[valueKey])
    const y = pad.t + ih - ((Number.isFinite(v) ? v : min) - min) / span * ih
    return { x, y, year: p.year, value: v }
  })

  const path = coords.length > 1
    ? coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
    : ''

  const active = coords.find((c) => Number(c.year) === Number(activeYear)) || coords[coords.length - 1]
  const exact = Number.isFinite(active?.value) ? active.value : null

  if (series.length < 1) {
    return <p className="ci-muted">No trend series for this metric.</p>
  }

  return (
    <div className="ci-chart">
      <div className="ci-chart-readout" aria-live="polite">
        <span className="ci-chart-year">{activeYear}</span>
        <span className="ci-chart-value">{exact != null ? fmt(exact, exact < 20 ? 2 : 1) : '—'}</span>
        <span className="ci-chart-unit">{unit}</span>
      </div>
      <svg className="ci-chart-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Crime trend chart">
        <defs>
          <linearGradient id="ciChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {coords.length > 1 && (
          <path
            d={`${path} L${coords[coords.length - 1].x.toFixed(1)},${(pad.t + ih).toFixed(1)} L${coords[0].x.toFixed(1)},${(pad.t + ih).toFixed(1)} Z`}
            fill="url(#ciChartFill)"
          />
        )}
        {path && <path d={path} fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" />}
        {active && (
          <g>
            <line
              x1={active.x}
              x2={active.x}
              y1={pad.t}
              y2={pad.t + ih}
              stroke="rgba(120, 220, 170, 0.35)"
              strokeDasharray="3 4"
            />
            <circle cx={active.x} cy={active.y} r="5.5" fill={accent} stroke="#0a1610" strokeWidth="2" />
          </g>
        )}
        <text x={pad.l} y={h - 6} className="ci-chart-axis">{minY}</text>
        <text x={w - pad.r} y={h - 6} textAnchor="end" className="ci-chart-axis">{maxY}</text>
      </svg>
      {years.length > 1 && (
        <label className="ci-year-slider">
          <span className="ci-sr-only">Year</span>
          <input
            type="range"
            min={minY}
            max={maxY}
            step={1}
            value={activeYear}
            onChange={(e) => onYearChange?.(Number(e.target.value))}
          />
          <div className="ci-year-slider-ends" aria-hidden>
            <span>{minY}</span>
            <span>{maxY}</span>
          </div>
        </label>
      )}
    </div>
  )
}

function MetricPicker({ options, value, onChange }) {
  return (
    <div className="ci-metric-row" role="tablist" aria-label="Crime metric">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          className={`ci-metric-chip ${value === opt.id ? 'is-active' : ''}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function UsCrimeMap({ features, cities, selectedAbbr, selectedCitySlug, onSelectState, onSelectCity }) {
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
      aria-label="U.S. crime map — tap a state or city"
    >
      {features.map((f, i) => {
        const abbr = f.properties?.abbr
        const name = f.properties?.name || abbr || `state-${i}`
        const rate = f.properties?.violentRate
        const paths = geomToPaths(f.geometry, width, height)
        const active = selectedAbbr && String(abbr).toUpperCase() === String(selectedAbbr).toUpperCase()
        if (abbr === 'AK' || abbr === 'HI') return null
        const fill = levelColor(levelFromRatio(rate, 359.1).id) // national violent ~fallback; parent passes better via features
        const levelId = f.properties?.levelId
        return paths.map((d, pi) => (
          <path
            key={`${abbr || name}-${pi}`}
            d={d}
            className={`ci-state-path ${active ? 'is-active' : ''}`}
            fill={levelId ? levelColor(levelId) : fill}
            stroke={active ? '#b8f0d0' : 'rgba(0,0,0,0.4)'}
            strokeWidth={active ? 2.2 : 0.55}
            onClick={() => abbr && onSelectState?.(abbr)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && abbr) {
                e.preventDefault()
                onSelectState?.(abbr)
              }
            }}
            tabIndex={abbr ? 0 : -1}
            role="button"
            aria-label={`${name}`}
          >
            <title>{name}</title>
          </path>
        ))
      })}
      {(cities || []).map((c) => {
        const coords = coordsForCity(c) || (CITY_COORDS[c.slug] ? CITY_COORDS[c.slug] : null)
        if (!coords) return null
        const [lat, lon] = coords
        if (lat > 50 || lat < 24 || lon < -125 || lon > -66) return null
        const [x, y] = project([lon, lat], width, height)
        const active = selectedCitySlug && c.slug === selectedCitySlug
        return (
          <g
            key={c.slug}
            className={`ci-city-dot ${active ? 'is-active' : ''}`}
            transform={`translate(${x}, ${y})`}
            onClick={(e) => {
              e.stopPropagation()
              onSelectCity?.(c.slug)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onSelectCity?.(c.slug)
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`${c.city}, ${c.state}`}
          >
            <circle r={active ? 6 : 4} />
            <title>{`${c.city}, ${c.state}`}</title>
          </g>
        )
      })}
    </svg>
  )
}

function SexOffendersMap({
  features,
  markers,
  selectedId,
  center,
  radiusDeg = 0.35,
  onSelect,
}) {
  const width = 720
  const height = 420
  const focus = center && Number.isFinite(center.lat) && Number.isFinite(center.lon)
  const bounds = focus
    ? {
      minLon: center.lon - radiusDeg * 1.4,
      maxLon: center.lon + radiusDeg * 1.4,
      minLat: center.lat - radiusDeg,
      maxLat: center.lat + radiusDeg,
    }
    : { minLon: -125, maxLon: -66, minLat: 24.5, maxLat: 49.5 }

  const projLocal = ([lon, lat]) => {
    const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * width
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height
    return [x, y]
  }

  const ringToLocal = (ring) => {
    if (!ring?.length) return ''
    return `${ring
      .map((coord, i) => {
        const [x, y] = projLocal(coord)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')} Z`
  }

  const geomPaths = (geometry) => {
    if (!geometry) return []
    if (geometry.type === 'Polygon') return [ringToLocal(geometry.coordinates[0])]
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.map((poly) => ringToLocal(poly[0])).filter(Boolean)
    }
    return []
  }

  return (
    <svg
      className="ci-choropleth ci-offender-map"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Sex offender map — tap a marker for that person only"
    >
      {(features || []).map((f, i) => {
        const abbr = f.properties?.abbr
        if (abbr === 'AK' || abbr === 'HI') return null
        const paths = geomPaths(f.geometry)
        return paths.map((d, pi) => (
          <path
            key={`bg-${abbr || i}-${pi}`}
            d={d}
            className="ci-state-path ci-state-path--mute"
            fill="#0d2218"
            stroke="rgba(100, 200, 150, 0.18)"
            strokeWidth={0.6}
          />
        ))
      })}
      {(markers || []).map((m) => {
        const lat = Number(m.lat)
        const lon = Number(m.lon)
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
        if (lat < bounds.minLat || lat > bounds.maxLat || lon < bounds.minLon || lon > bounds.maxLon) {
          return null
        }
        const [x, y] = projLocal([lon, lat])
        const active = selectedId != null && Number(selectedId) === Number(m.id)
        return (
          <g
            key={m.id}
            className={`ci-offender-dot ${active ? 'is-active' : ''}`}
            transform={`translate(${x}, ${y})`}
            onClick={(e) => {
              e.stopPropagation()
              onSelect?.(m.id)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onSelect?.(m.id)
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`Registered person ${m.id}`}
          >
            <circle r={active ? 7 : 3.2} />
          </g>
        )
      })}
    </svg>
  )
}

function OffenderSummary({ person, onClear }) {
  if (!person) return null
  const addr = [person.address_line1, person.city, person.state_id || person.source_state, person.zip_code]
    .filter(Boolean)
    .join(', ')
  const aliases = Array.isArray(person.aliases)
    ? person.aliases.map((a) => [a.first_name, a.middle_name, a.last_name].filter(Boolean).join(' ')).filter(Boolean)
    : []
  const offenses = Array.isArray(person.offense_details) ? person.offense_details : []

  return (
    <article className="ci-offender-card ci-enter" id="ci-offender-summary">
      <header className="ci-detail-head">
        <h3>{person.full_name || `${person.first_name || ''} ${person.last_name || ''}`.trim() || `ID ${person.id}`}</h3>
        <button type="button" className="ci-advanced-btn" onClick={onClear}>Clear</button>
      </header>
      <div className="ci-offender-layout">
        {person.offender_image_url ? (
          <img
            className="ci-offender-photo"
            src={person.offender_image_url}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="ci-offender-photo ci-offender-photo--empty" aria-hidden>No photo</div>
        )}
        <dl className="ci-dl">
          <div><dt>Age / sex</dt><dd>{fmtScalar(person.age, 0)} · {person.sex || '—'}</dd></div>
          <div><dt>Risk / tier</dt><dd>{person.risk_level || person.tier_level || '—'}</dd></div>
          <div><dt>Status</dt><dd>{person.status || person.designation || '—'}</dd></div>
          <div><dt>State</dt><dd>{person.state_id || person.source_state || '—'}</dd></div>
          <div><dt>Registry ID</dt><dd>{person.registration_id || '—'}</dd></div>
          <div><dt>Address</dt><dd>{addr || '—'}</dd></div>
          {person.date_of_birth && <div><dt>DOB</dt><dd>{String(person.date_of_birth)}</dd></div>}
          {person.race && <div><dt>Race</dt><dd>{String(person.race)}</dd></div>}
          {(person.height || person.weight) && (
            <div><dt>Height / weight</dt><dd>{person.height || '—'} / {person.weight || '—'}</dd></div>
          )}
        </dl>
      </div>
      {aliases.length > 0 && (
        <p className="ci-muted">Aliases: {aliases.slice(0, 8).join('; ')}</p>
      )}
      {person.offense && <p><strong>Offense:</strong> {String(person.offense)}</p>}
      {offenses.length > 0 && (
        <ul className="ci-simple-list">
          {offenses.slice(0, 12).map((o, i) => (
            <li key={i}>
              <span>{typeof o === 'string' ? o : (o.description || o.offense || oLabel(o))}</span>
              <strong>{o.date || o.conviction_date || ''}</strong>
            </li>
          ))}
        </ul>
      )}
      {(person.tracking_url || person.tip_submission_url) && (
        <p className="ci-offender-links">
          {person.tracking_url && (
            <a href={person.tracking_url} target="_blank" rel="noopener noreferrer">Registry record</a>
          )}
          {person.tip_submission_url && (
            <a href={person.tip_submission_url} target="_blank" rel="noopener noreferrer">Submit tip</a>
          )}
        </p>
      )}
      <p className="ci-muted ci-fineprint">
        Public registry data via CommunityGuardAPI / NSOPW. For lawful awareness only.
      </p>
    </article>
  )
}

function oLabel(o) {
  if (o == null || typeof o !== 'object') return '—'
  return String(o.name || o.label || o.type || 'Offense')
}

function ArrestOffenseTable({ rows }) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return <p className="ci-muted">No arrest offense totals.</p>
  return (
    <div className="ci-table-wrap">
      <table className="ci-table">
        <thead>
          <tr>
            <th>Offense</th>
            <th>Total</th>
            <th>Male</th>
            <th>Female</th>
          </tr>
        </thead>
        <tbody>
          {list.slice(0, 24).map((row, i) => (
            <tr key={`${rowLabel(row)}-${i}`}>
              <td>{rowLabel(row, `Offense ${i + 1}`)}</td>
              <td>{fmtScalar(row.total ?? row.count, 0)}</td>
              <td>{fmtScalar(row.male, 0)}</td>
              <td>{fmtScalar(row.female, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SimpleStatList({ rows, labelKey, valueKey = 'count' }) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return null
  return (
    <ul className="ci-simple-list">
      {list.slice(0, 12).map((row, i) => (
        <li key={`${rowLabel(row, labelKey)}-${i}`}>
          <span>{rowLabel(row, `Item ${i + 1}`)}</span>
          <strong>{fmtScalar(row[valueKey] ?? row.total ?? row.pct, typeof row.pct === 'number' ? 1 : 0)}</strong>
        </li>
      ))}
    </ul>
  )
}

export default function CrimeIntelligenceView() {
  const panelRef = useRef(null)
  const [segment, setSegment] = useState('national')
  const [stats, setStats] = useState(null)
  const [trends, setTrends] = useState([])
  const [states, setStates] = useState([])
  const [types, setTypes] = useState([])
  const [arrests, setArrests] = useState(null)
  const [homicide, setHomicide] = useState(null)
  const [mapFeatures, setMapFeatures] = useState([])
  const [attribution, setAttribution] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const [nationalMetric, setNationalMetric] = useState('violentRate')
  const [nationalYear, setNationalYear] = useState(null)

  const [selectedAbbr, setSelectedAbbr] = useState('')
  const [stateDetail, setStateDetail] = useState(null)
  const [stateLoading, setStateLoading] = useState(false)
  const [stateMetric, setStateMetric] = useState('violentRate')
  const [stateYear, setStateYear] = useState(null)
  const [stateAdvanced, setStateAdvanced] = useState(false)
  const [stateExpanded, setStateExpanded] = useState(false)
  const [stateLimit, setStateLimit] = useState(10)
  const [stateSort, setStateSort] = useState('name') // 'name' | 'violent'

  const [selectedCitySlug, setSelectedCitySlug] = useState(null)
  const [cityDetail, setCityDetail] = useState(null)
  const [cityQ, setCityQ] = useState('')
  const [cityResults, setCityResults] = useState([])
  const [cityLoading, setCityLoading] = useState(false)
  const [cityAdvanced, setCityAdvanced] = useState(false)

  const [offenderMetro, setOffenderMetro] = useState('washington-dc')
  const [offenderMarkers, setOffenderMarkers] = useState([])
  const [offenderMetros, setOffenderMetros] = useState([])
  const [offenderMeta, setOffenderMeta] = useState(null)
  const [offenderLoading, setOffenderLoading] = useState(false)
  const [selectedOffenderId, setSelectedOffenderId] = useState(null)
  const [offenderPerson, setOffenderPerson] = useState(null)
  const [offenderPersonLoading, setOffenderPersonLoading] = useState(false)

  const [askInput, setAskInput] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  const [askMessages, setAskMessages] = useState([
    {
      role: 'assistant',
      text: 'I\'m ThiellBot. Ask about a U.S. state or city — e.g. “How does Texas compare on violent crime?” or “Memphis rates”. Answers use PlainCrime + FBI UCR data.',
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
      buildCrimeStateChoropleth('violentRate').catch(() => null),
    ])
      .then(([s, t, st, ty, a, h, choropleth]) => {
        if (cancelled) return
        setStats(s.data)
        const trendRows = Array.isArray(t.data) ? t.data : []
        setTrends(trendRows)
        setStates(Array.isArray(st.data) ? st.data : [])
        setTypes(Array.isArray(ty.data) ? ty.data : [])
        setArrests(a.data)
        setHomicide(h.data)
        setMapFeatures(choropleth?.features || [])
        setAttribution(s.meta?.attribution || st.meta?.attribution)
        if (trendRows.length) {
          setNationalYear(Number(trendRows[trendRows.length - 1].year))
        }
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

  const national = stats?.national2024
  const nationalViolentAvg = useMemo(
    () => meanOf(trends.map((t) => t.violentRate)) ?? national?.violentRate ?? 359.1,
    [trends, national],
  )
  const nationalPropertyAvg = useMemo(
    () => meanOf(trends.map((t) => t.propertyRate)) ?? national?.propertyRate ?? 1760,
    [trends, national],
  )
  const nationalHomicideAvg = useMemo(
    () => meanOf(trends.map((t) => t.homicideRate)) ?? national?.homicideRate ?? 5,
    [trends, national],
  )

  /** Current-year national rates as comparison baseline for states/cities. */
  const nationalNow = useMemo(() => ({
    violentRate: Number(national?.violentRate) || nationalViolentAvg,
    propertyRate: Number(national?.propertyRate) || nationalPropertyAvg,
    homicideRate: Number(national?.homicideRate) || nationalHomicideAvg,
  }), [national, nationalViolentAvg, nationalPropertyAvg, nationalHomicideAvg])

  const sortedStates = useMemo(() => {
    const list = [...states]
    if (stateSort === 'violent') {
      list.sort((a, b) => (Number(b.violentRate) || 0) - (Number(a.violentRate) || 0))
    } else {
      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    }
    return list
  }, [states, stateSort])

  const visibleStates = useMemo(
    () => sortedStates.slice(0, stateLimit),
    [sortedStates, stateLimit],
  )

  const featuredCities = useMemo(() => {
    const top = stats?.topCitiesByViolentRate || []
    const safe = stats?.safestCities || []
    const merged = [...top.slice(0, 12), ...safe.slice(0, 8)]
    const seen = new Set()
    return merged.filter((c) => {
      if (!c.slug || seen.has(c.slug)) return false
      seen.add(c.slug)
      return true
    })
  }, [stats])

  const mapCities = useMemo(() => {
    const list = [...featuredCities]
    if (cityDetail?.slug && !list.some((c) => c.slug === cityDetail.slug)) {
      list.push(cityDetail)
    }
    return list
  }, [featuredCities, cityDetail])

  const mapFeaturesWithLevel = useMemo(() => {
    const ref = nationalNow.violentRate
    return (mapFeatures || []).map((f) => {
      const rate = f.properties?.violentRate
      const level = levelFromRatio(rate, ref)
      return {
        ...f,
        properties: {
          ...f.properties,
          levelId: level.id,
        },
      }
    })
  }, [mapFeatures, nationalNow])

  const typeByMetric = useMemo(() => {
    const map = new Map()
    for (const t of types) {
      const key = t.key || t.slug
      if (key) map.set(key, t)
      if (t.slug === 'violent-crime') map.set('violentRate', t)
      if (t.slug === 'property-crime') map.set('propertyRate', t)
      if (t.slug === 'murder') map.set('homicideRate', t)
    }
    return map
  }, [types])

  const nationalSeries = useMemo(() => {
    const type = typeByMetric.get(nationalMetric)
    if (type?.nationalHistory?.length) {
      return type.nationalHistory.map((h) => ({
        year: h.year,
        rate: h.rate,
        count: h.count,
      }))
    }
    const metric = CRIME_METRIC_OPTIONS.find((m) => m.id === nationalMetric)
    if (!metric) return []
    return trends.map((t) => ({
      year: t.year,
      rate: metric.rateKey ? t[metric.rateKey] : null,
      count: t[metric.countKey],
      value: metric.rateKey ? t[metric.rateKey] : t[metric.countKey],
    })).filter((p) => Number.isFinite(Number(p.rate ?? p.value ?? p.count)))
      .map((p) => ({ year: p.year, rate: p.rate ?? p.value ?? p.count }))
  }, [nationalMetric, typeByMetric, trends])

  const nationalMetricOptions = useMemo(() => {
    const fromTypes = types
      .filter((t) => Array.isArray(t.nationalHistory) && t.nationalHistory.length > 1)
      .map((t) => ({
        id: t.slug === 'violent-crime' ? 'violentRate'
          : t.slug === 'property-crime' ? 'propertyRate'
            : t.slug === 'murder' ? 'homicideRate'
              : (t.key || t.slug),
        label: t.name || t.label || t.slug,
      }))
    if (fromTypes.length) return fromTypes
    return CRIME_METRIC_OPTIONS.filter((m) => m.rateKey)
  }, [types])

  useEffect(() => {
    if (!nationalSeries.length) return
    const years = nationalSeries.map((p) => Number(p.year))
    const maxY = Math.max(...years)
    if (nationalYear == null || !years.includes(Number(nationalYear))) {
      setNationalYear(maxY)
    }
  }, [nationalSeries, nationalYear])

  const goSegment = useCallback((id) => {
    setSegment(id)
    if (id !== 'states') {
      setStateExpanded(false)
    }
    requestAnimationFrame(() => {
      panelRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
    })
  }, [])

  const loadState = useCallback(async (abbr, { open = true, expand = true } = {}) => {
    const a = String(abbr || '').toUpperCase()
    if (!a) return
    setSelectedAbbr(a)
    setStateAdvanced(false)
    if (expand) setStateExpanded(true)
    if (open) goSegment('states')
    setStateLoading(true)
    try {
      const payload = await getJson(`/api/crime/states/${encodeURIComponent(a)}`)
      const data = payload.data
      setStateDetail(data)
      const years = Array.isArray(data?.years) ? data.years : []
      if (years.length) setStateYear(Number(years[years.length - 1].year))
      else if (data?.year) setStateYear(Number(data.year))
      requestAnimationFrame(() => {
        document.getElementById('ci-state-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        panelRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
      })
    } catch (err) {
      setError(err.message || 'State load failed')
    } finally {
      setStateLoading(false)
    }
  }, [goSegment])

  const exitStateExpand = useCallback(() => {
    setStateExpanded(false)
    setStateAdvanced(false)
    setStateDetail(null)
    setSelectedAbbr('')
    requestAnimationFrame(() => {
      document.getElementById('ci-state-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      panelRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
    })
  }, [])

  const openCity = useCallback(async (slug, { open = true } = {}) => {
    if (!slug) return
    setSelectedCitySlug(slug)
    setCityAdvanced(false)
    if (open) goSegment('cities')
    setCityLoading(true)
    try {
      const payload = await getJson(`/api/crime/cities/${encodeURIComponent(slug)}`)
      setCityDetail(payload.data)
      requestAnimationFrame(() => {
        document.getElementById('ci-city-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch (err) {
      setError(err.message || 'City load failed')
    } finally {
      setCityLoading(false)
    }
  }, [goSegment])

  const searchCities = useCallback(async (q) => {
    setCityLoading(true)
    try {
      const params = new URLSearchParams({ limit: '16', q: q || '' })
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

  // Sex offenders: load markers from on-disk pack only (no live upstream calls).
  useEffect(() => {
    if (segment !== 'offenders') return undefined
    let cancelled = false
    setOffenderLoading(true)
    const qs = offenderMetro ? `?metro=${encodeURIComponent(offenderMetro)}` : ''
    getJson(`/api/crime/sex-offenders/markers${qs}`)
      .then((payload) => {
        if (cancelled) return
        setOffenderMarkers(Array.isArray(payload.data) ? payload.data : [])
        setOffenderMeta(payload.meta || null)
        setOffenderMetros(Array.isArray(payload.meta?.metros) ? payload.meta.metros : [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Offender pack load failed')
      })
      .finally(() => {
        if (!cancelled) setOffenderLoading(false)
      })
    return () => { cancelled = true }
  }, [segment, offenderMetro])

  const selectOffender = useCallback(async (id) => {
    if (id == null) return
    setSelectedOffenderId(id)
    setOffenderPerson(null)
    setOffenderPersonLoading(true)
    try {
      const payload = await getJson(`/api/crime/sex-offenders/${encodeURIComponent(id)}`)
      setOffenderPerson(payload.data)
      requestAnimationFrame(() => {
        document.getElementById('ci-offender-summary')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    } catch (err) {
      setError(err.message || 'Could not load person')
    } finally {
      setOffenderPersonLoading(false)
    }
  }, [])

  const clearOffender = useCallback(() => {
    setSelectedOffenderId(null)
    setOffenderPerson(null)
  }, [])

  const offenderCenter = useMemo(() => {
    const m = offenderMetros.find((x) => x.id === offenderMetro)
    if (m) return { lat: m.lat, lon: m.lon }
    return null
  }, [offenderMetros, offenderMetro])

  // Keep States list as the default — do not auto-open a state.
  // Expanded full-view only via box click / map tap.

  useEffect(() => {
    if (segment === 'states' && selectedAbbr && stateExpanded && !stateDetail && !stateLoading) {
      loadState(selectedAbbr, { open: false, expand: true })
    }
  }, [segment, selectedAbbr, stateExpanded, stateDetail, stateLoading, loadState])

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
        { role: 'assistant', text: String(data.answer || ''), provider: data.provider, matched: data.matched },
      ])
      const abbr = data.matched?.states?.[0]
      const slug = data.matched?.cities?.[0]
      if (slug) openCity(slug)
      else if (abbr) loadState(abbr)
    } catch (err) {
      setAskMessages((prev) => [
        ...prev,
        { role: 'assistant', text: err.message || 'Ask failed', provider: 'error' },
      ])
    } finally {
      setAskBusy(false)
    }
  }, [askInput, askBusy, openCity, loadState])

  const stateSeries = useMemo(() => {
    const years = Array.isArray(stateDetail?.years) ? stateDetail.years : []
    const metric = CRIME_METRIC_OPTIONS.find((m) => m.id === stateMetric) || CRIME_METRIC_OPTIONS[0]
    return years
      .map((y) => ({
        year: y.year,
        rate: metric.rateKey ? y[metric.rateKey] : y[metric.countKey],
      }))
      .filter((p) => Number.isFinite(Number(p.rate)))
  }, [stateDetail, stateMetric])

  const stateMetricOptions = useMemo(() => {
    const years = Array.isArray(stateDetail?.years) ? stateDetail.years : []
    if (!years.length) return CRIME_METRIC_OPTIONS.filter((m) => m.rateKey)
    const sample = years[years.length - 1] || {}
    return CRIME_METRIC_OPTIONS.filter((m) => {
      const key = m.rateKey || m.countKey
      return sample[key] != null || years.some((y) => y[key] != null)
    })
  }, [stateDetail])

  useEffect(() => {
    if (!stateSeries.length) return
    const years = stateSeries.map((p) => Number(p.year))
    if (stateYear == null || !years.includes(Number(stateYear))) {
      setStateYear(Math.max(...years))
    }
  }, [stateSeries, stateYear])

  const nationalLevels = useMemo(() => {
    const v = levelFromRatio(national?.violentRate, nationalViolentAvg)
    const p = levelFromRatio(national?.propertyRate, nationalPropertyAvg)
    const h = levelFromRatio(national?.homicideRate, nationalHomicideAvg)
    return { violent: v, property: p, homicide: h }
  }, [national, nationalViolentAvg, nationalPropertyAvg, nationalHomicideAvg])

  const activeStateYearPoint = useMemo(() => {
    if (!stateDetail) return null
    const years = Array.isArray(stateDetail.years) ? stateDetail.years : []
    return years.find((y) => Number(y.year) === Number(stateYear)) || stateDetail
  }, [stateDetail, stateYear])

  const stateLevels = useMemo(() => {
    if (!activeStateYearPoint) return null
    return {
      violent: levelFromRatio(activeStateYearPoint.violentRate, nationalNow.violentRate),
      property: levelFromRatio(activeStateYearPoint.propertyRate, nationalNow.propertyRate),
      homicide: levelFromRatio(activeStateYearPoint.homicideRate, nationalNow.homicideRate),
    }
  }, [activeStateYearPoint, nationalNow])

  const cityLevels = useMemo(() => {
    if (!cityDetail) return null
    return {
      violent: levelFromRatio(cityDetail.violentRate, nationalNow.violentRate),
      property: levelFromRatio(cityDetail.propertyRate, nationalNow.propertyRate),
      homicide: levelFromRatio(cityDetail.murderRate ?? cityDetail.homicideRate, nationalNow.homicideRate),
    }
  }, [cityDetail, nationalNow])

  const cityCompositionSeries = useMemo(() => {
    const c = cityDetail?.composition
    if (!c) return []
    return [
      { year: 'Murder', rate: Number(c.murderPct) || 0 },
      { year: 'Rape', rate: Number(c.rapePct) || 0 },
      { year: 'Robbery', rate: Number(c.robberyPct) || 0 },
      { year: 'Assault', rate: Number(c.assaultPct) || 0 },
    ]
  }, [cityDetail])

  const onMapState = useCallback((abbr) => {
    loadState(abbr, { open: true })
  }, [loadState])

  const onMapCity = useCallback((slug) => {
    openCity(slug, { open: true })
  }, [openCity])

  const arrestBySex = Array.isArray(arrests?.bySex) ? arrests.bySex : []
  const arrestEstimates = Array.isArray(arrests?.nationalEstimates) ? arrests.nationalEstimates : []

  return (
    <div className="ci-view" role="region" aria-label="Crime Intelligence">
      <header className="ci-topbar">
        <div className="ci-brand">
          <h1>Crime</h1>
          <p>PlainCrime + FBI UCR · vs national averages</p>
        </div>
        <nav className="ci-segments" aria-label="Crime sections">
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={segment === s.id ? 'is-active' : ''}
              onClick={() => goSegment(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="ci-scroll" ref={panelRef}>
        {loading && <p className="ci-muted ci-enter">Loading crime pack…</p>}
        {error && <p className="ci-error ci-enter">{error}</p>}

        {segment === 'national' && !loading && (
          <section className="ci-panel ci-enter" aria-labelledby="ci-national-title">
            <div className="ci-section-head">
              <h2 id="ci-national-title">National</h2>
              <p>
                Levels vs long-run national averages
                {' '}
                (Low &lt;{LEVEL_THRESHOLDS.low}× · Medium &lt;{LEVEL_THRESHOLDS.medium}× · High &lt;{LEVEL_THRESHOLDS.high}× · Extreme ≥{LEVEL_THRESHOLDS.high}×).
              </p>
            </div>

            <div className="ci-level-strip">
              <div className="ci-level-card">
                <span className="ci-stat-label">Violent / 100k</span>
                <span className="ci-stat-value">{fmt(national?.violentRate, 1)}</span>
                <LevelBadge
                  level={nationalLevels.violent}
                  hint={`vs long-run avg ${fmt(nationalViolentAvg, 1)}`}
                />
              </div>
              <div className="ci-level-card">
                <span className="ci-stat-label">Property / 100k</span>
                <span className="ci-stat-value">{fmt(national?.propertyRate, 1)}</span>
                <LevelBadge
                  level={nationalLevels.property}
                  hint={`vs long-run avg ${fmt(nationalPropertyAvg, 1)}`}
                />
              </div>
              <div className="ci-level-card">
                <span className="ci-stat-label">Homicide / 100k</span>
                <span className="ci-stat-value">{fmt(national?.homicideRate, 1)}</span>
                <LevelBadge
                  level={nationalLevels.homicide}
                  hint={`vs long-run avg ${fmt(nationalHomicideAvg, 2)}`}
                />
              </div>
            </div>

            <MetricPicker
              options={nationalMetricOptions}
              value={nationalMetric}
              onChange={setNationalMetric}
            />
            <TrendChart
              series={nationalSeries}
              year={nationalYear}
              onYearChange={setNationalYear}
              valueKey="rate"
            />

            <details className="ci-advanced">
              <summary>Advanced</summary>
              <div className="ci-advanced-body">
                <h3>Arrest offense totals</h3>
                <ArrestOffenseTable rows={arrestBySex.length ? arrestBySex : arrestEstimates} />
                <h3>Homicide weapons</h3>
                <SimpleStatList rows={homicide?.weaponBreakdown} valueKey="count" />
                <h3>Circumstances</h3>
                <SimpleStatList rows={homicide?.circumstanceBreakdown} valueKey="count" />
                <h3>Victim–offender relationship</h3>
                <SimpleStatList rows={homicide?.relationship} valueKey="count" />
              </div>
            </details>
          </section>
        )}

        {segment === 'states' && !loading && (
          <section id="ci-state-panel" className="ci-panel ci-enter" aria-labelledby="ci-states-title">
            {!stateExpanded ? (
              <>
                <div className="ci-section-head">
                  <h2 id="ci-states-title">States</h2>
                  <p>Tap a state box for full database stats. Limit how many show at once.</p>
                </div>

                <div className="ci-state-controls" role="group" aria-label="State list controls">
                  <div className="ci-limit-row">
                    <span className="ci-control-label">Show</span>
                    {[10, 25, 50].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`ci-metric-chip ${stateLimit === n ? 'is-active' : ''}`}
                        aria-pressed={stateLimit === n}
                        onClick={() => setStateLimit(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="ci-limit-row">
                    <span className="ci-control-label">Sort</span>
                    <button
                      type="button"
                      className={`ci-metric-chip ${stateSort === 'name' ? 'is-active' : ''}`}
                      aria-pressed={stateSort === 'name'}
                      onClick={() => setStateSort('name')}
                    >
                      Name
                    </button>
                    <button
                      type="button"
                      className={`ci-metric-chip ${stateSort === 'violent' ? 'is-active' : ''}`}
                      aria-pressed={stateSort === 'violent'}
                      onClick={() => setStateSort('violent')}
                    >
                      Violent rate
                    </button>
                  </div>
                </div>

                <p className="ci-muted">
                  Showing {Math.min(visibleStates.length, stateLimit)} of {sortedStates.length} states
                </p>

                <div className="ci-state-box-grid">
                  {visibleStates.map((s) => {
                    const level = levelFromRatio(s.violentRate, nationalNow.violentRate)
                    return (
                      <button
                        key={s.abbr}
                        type="button"
                        className="ci-state-box"
                        onClick={() => loadState(s.abbr, { open: false, expand: true })}
                      >
                        <span className="ci-state-box-name">{s.name}</span>
                        <span className="ci-state-box-abbr">{s.abbr}</span>
                        <span className="ci-state-box-rate">{fmt(s.violentRate, 1)} / 100k</span>
                        <LevelBadge level={level} />
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="ci-state-expand-bar">
                  <button
                    type="button"
                    className="ci-exit-btn"
                    onClick={exitStateExpand}
                    aria-label="Exit state view"
                  >
                    ← Exit
                  </button>
                  <p className="ci-muted">Full state database view</p>
                </div>

                {stateLoading && <p className="ci-muted">Loading state…</p>}

                {stateDetail && !stateLoading && (
                  <div className="ci-detail ci-detail--open ci-detail--full">
                    <header className="ci-detail-head">
                      <h2 id="ci-states-title">{stateDetail.name} <span className="ci-muted">({stateDetail.abbr})</span></h2>
                      <span className="ci-muted">{stateYear || stateDetail.year}</span>
                    </header>

                    <div className="ci-level-strip">
                      <div className="ci-level-card">
                        <span className="ci-stat-label">Violent</span>
                        <span className="ci-stat-value">{fmt(activeStateYearPoint?.violentRate, 1)}</span>
                        <LevelBadge level={stateLevels?.violent} />
                      </div>
                      <div className="ci-level-card">
                        <span className="ci-stat-label">Property</span>
                        <span className="ci-stat-value">{fmt(activeStateYearPoint?.propertyRate, 1)}</span>
                        <LevelBadge level={stateLevels?.property} />
                      </div>
                      <div className="ci-level-card">
                        <span className="ci-stat-label">Homicide</span>
                        <span className="ci-stat-value">{fmt(activeStateYearPoint?.homicideRate, 2)}</span>
                        <LevelBadge level={stateLevels?.homicide} />
                      </div>
                    </div>

                    <MetricPicker
                      options={stateMetricOptions.map((m) => ({ id: m.id, label: m.label }))}
                      value={stateMetric}
                      onChange={setStateMetric}
                    />
                    <TrendChart
                      series={stateSeries}
                      year={stateYear}
                      onYearChange={setStateYear}
                      valueKey="rate"
                    />

                    <button
                      type="button"
                      className={`ci-advanced-btn ${stateAdvanced ? 'is-open' : ''}`}
                      onClick={() => setStateAdvanced((v) => !v)}
                    >
                      {stateAdvanced ? 'Hide advanced' : 'Advanced'}
                    </button>

                    {stateAdvanced && (
                      <div className="ci-advanced-body ci-enter">
                        <dl className="ci-dl">
                          <div><dt>Population</dt><dd>{fmt(activeStateYearPoint?.population ?? stateDetail.population, 0)}</dd></div>
                          <div><dt>Violent count</dt><dd>{fmt(activeStateYearPoint?.violentCrime ?? stateDetail.violentCrime, 0)}</dd></div>
                          <div><dt>Property count</dt><dd>{fmt(activeStateYearPoint?.propertyCrime ?? stateDetail.propertyCrime, 0)}</dd></div>
                          <div><dt>Homicide count</dt><dd>{fmt(activeStateYearPoint?.homicide ?? stateDetail.homicide, 0)}</dd></div>
                          <div>
                            <dt>YoY violent</dt>
                            <dd>
                              {activeStateYearPoint?.violentChange != null
                                ? `${activeStateYearPoint.violentChange > 0 ? '+' : ''}${fmt(activeStateYearPoint.violentChange, 1)}%`
                                : '—'}
                            </dd>
                          </div>
                          <div>
                            <dt>YoY property</dt>
                            <dd>
                              {activeStateYearPoint?.propertyChange != null
                                ? `${activeStateYearPoint.propertyChange > 0 ? '+' : ''}${fmt(activeStateYearPoint.propertyChange, 1)}%`
                                : '—'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    )}

                    <button type="button" className="ci-exit-btn ci-exit-btn--footer" onClick={exitStateExpand}>
                      ← Exit to state list
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {segment === 'cities' && !loading && (
          <section id="ci-city-panel" className="ci-panel ci-enter" aria-labelledby="ci-cities-title">
            <div className="ci-section-head">
              <h2 id="ci-cities-title">Cities</h2>
              <p>Search or pick a featured city — one at a time.</p>
            </div>

            <div className="ci-city-search">
              <input
                type="search"
                value={cityQ}
                onChange={(e) => setCityQ(e.target.value)}
                placeholder="Search cities…"
                aria-label="Search cities"
              />
              {cityLoading && <span className="ci-muted">…</span>}
            </div>

            {cityResults.length > 0 && (
              <ul className="ci-city-results">
                {cityResults.map((c) => (
                  <li key={c.slug}>
                    <button type="button" onClick={() => openCity(c.slug, { open: false })}>
                      <strong>{c.city}</strong>
                      <span className="ci-muted">, {c.state}</span>
                      <LevelBadge level={levelFromRatio(c.violentRate, nationalNow.violentRate)} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="ci-chip-row">
              {featuredCities.slice(0, 10).map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  className={`ci-chip ${selectedCitySlug === c.slug ? 'is-active' : ''}`}
                  onClick={() => openCity(c.slug, { open: false })}
                >
                  {c.city}
                </button>
              ))}
            </div>

            {cityDetail ? (
              <div className="ci-detail ci-detail--open">
                <header className="ci-detail-head">
                  <h3>{cityDetail.city}, {cityDetail.state}</h3>
                  <span className="ci-muted">{cityDetail.year || '—'}</span>
                </header>

                <div className="ci-level-strip">
                  <div className="ci-level-card">
                    <span className="ci-stat-label">Violent</span>
                    <span className="ci-stat-value">{fmt(cityDetail.violentRate, 1)}</span>
                    <LevelBadge level={cityLevels?.violent} />
                  </div>
                  <div className="ci-level-card">
                    <span className="ci-stat-label">Property</span>
                    <span className="ci-stat-value">{fmt(cityDetail.propertyRate, 1)}</span>
                    <LevelBadge level={cityLevels?.property} />
                  </div>
                  <div className="ci-level-card">
                    <span className="ci-stat-label">Murder</span>
                    <span className="ci-stat-value">{fmt(cityDetail.murderRate, 2)}</span>
                    <LevelBadge level={cityLevels?.homicide} />
                  </div>
                </div>

                {cityCompositionSeries.length > 0 && (
                  <>
                    <h4 className="ci-subhead">Violent composition (%)</h4>
                    <div className="ci-comp-bars" aria-label="Violent crime composition">
                      {cityCompositionSeries.map((row) => (
                        <div key={row.year} className="ci-comp-row">
                          <span>{row.year}</span>
                          <div className="ci-comp-track">
                            <div className="ci-comp-fill" style={{ width: `${Math.min(100, row.rate)}%` }} />
                          </div>
                          <strong>{fmt(row.rate, 1)}%</strong>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <button
                  type="button"
                  className={`ci-advanced-btn ${cityAdvanced ? 'is-open' : ''}`}
                  onClick={() => setCityAdvanced((v) => !v)}
                >
                  {cityAdvanced ? 'Hide advanced' : 'Advanced'}
                </button>

                {cityAdvanced && (
                  <div className="ci-advanced-body ci-enter">
                    <dl className="ci-dl">
                      <div><dt>Population</dt><dd>{fmt(cityDetail.population, 0)}</dd></div>
                      <div><dt>Trajectory</dt><dd>{cityDetail.trajectory || '—'}</dd></div>
                      <div>
                        <dt>YoY violent</dt>
                        <dd>
                          {cityDetail.violentChange != null
                            ? `${cityDetail.violentChange > 0 ? '+' : ''}${fmt(cityDetail.violentChange, 1)}%`
                            : '—'}
                        </dd>
                      </div>
                      <div><dt>Safety %ile</dt><dd>{fmt(cityDetail.safetyPercentile, 0)}</dd></div>
                      <div>
                        <dt>Years</dt>
                        <dd>{(cityDetail.yearsAvailable || []).join(', ') || '—'}</dd>
                      </div>
                    </dl>
                    {cityDetail.csv2024 && (
                      <dl className="ci-dl">
                        <div><dt>Violent (2024)</dt><dd>{fmt(cityDetail.csv2024.violent_crime, 0)}</dd></div>
                        <div><dt>Murder</dt><dd>{fmt(cityDetail.csv2024.murder, 0)}</dd></div>
                        <div><dt>Robbery</dt><dd>{fmt(cityDetail.csv2024.robbery, 0)}</dd></div>
                        <div><dt>Assault</dt><dd>{fmt(cityDetail.csv2024.aggravated_assault, 0)}</dd></div>
                        <div><dt>Property</dt><dd>{fmt(cityDetail.csv2024.property_crime, 0)}</dd></div>
                        <div><dt>Burglary</dt><dd>{fmt(cityDetail.csv2024.burglary, 0)}</dd></div>
                        <div><dt>Larceny</dt><dd>{fmt(cityDetail.csv2024.larceny, 0)}</dd></div>
                        <div><dt>MVT</dt><dd>{fmt(cityDetail.csv2024.motor_vehicle_theft, 0)}</dd></div>
                      </dl>
                    )}
                    {stateAbbrFromName(cityDetail.state) && (
                      <button
                        type="button"
                        className="ci-linkish"
                        onClick={() => loadState(stateAbbrFromName(cityDetail.state))}
                      >
                        Open {cityDetail.state} state summary →
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="ci-muted">Select or search a city to open its summary.</p>
            )}
          </section>
        )}

        {segment === 'map' && !loading && (
          <section className="ci-panel ci-enter" aria-labelledby="ci-map-title">
            <div className="ci-section-head">
              <h2 id="ci-map-title">Map</h2>
              <p>Tap a state or city marker — opens that summary. No layer toggles.</p>
            </div>
            <div className={`ci-map-wrap ${selectedAbbr || selectedCitySlug ? 'has-selection' : ''}`}>
              <UsCrimeMap
                features={mapFeaturesWithLevel}
                cities={mapCities}
                selectedAbbr={selectedAbbr}
                selectedCitySlug={selectedCitySlug}
                onSelectState={onMapState}
                onSelectCity={onMapCity}
              />
              <div className="ci-map-legend" aria-hidden>
                <span style={{ background: levelColor('low') }} />Low
                <span style={{ background: levelColor('medium') }} />Med
                <span style={{ background: levelColor('high') }} />High
                <span style={{ background: levelColor('extreme') }} />Extreme
              </div>
            </div>
          </section>
        )}

        {segment === 'offenders' && (
          <section className="ci-panel ci-enter" aria-labelledby="ci-offenders-title">
            <div className="ci-section-head">
              <h2 id="ci-offenders-title">Sex offenders</h2>
              <p>
                Metro pack cached on the server — no live API calls while browsing.
                Tap a marker to open that person only under the map.
              </p>
            </div>

            <label className="ci-select-wrap">
              <span>Metro (10 mi seed radius)</span>
              <select
                value={offenderMetro}
                onChange={(e) => {
                  clearOffender()
                  setOffenderMetro(e.target.value)
                }}
                aria-label="Select metro"
              >
                {(offenderMetros.length
                  ? offenderMetros
                  : [{ id: 'washington-dc', name: 'Washington, DC' }]
                ).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.count != null ? ` (${m.count})` : ''}
                  </option>
                ))}
              </select>
            </label>

            {offenderLoading && <p className="ci-muted">Loading markers…</p>}
            {!offenderLoading && offenderMeta && (
              <p className="ci-muted">
                {fmt(offenderMeta.count, 0)} markers
                {offenderMeta.seededAt ? ` · seeded ${String(offenderMeta.seededAt).slice(0, 10)}` : ''}
                {offenderMeta.radiusMiles != null ? ` · ${offenderMeta.radiusMiles} mi` : ''}
              </p>
            )}

            <div className={`ci-map-wrap ${selectedOffenderId ? 'has-selection' : ''}`}>
              <SexOffendersMap
                features={mapFeatures}
                markers={offenderMarkers}
                selectedId={selectedOffenderId}
                center={offenderCenter}
                onSelect={selectOffender}
              />
            </div>

            {!selectedOffenderId && !offenderPersonLoading && (
              <p className="ci-muted ci-offender-hint">
                No names or addresses shown until you select a marker.
              </p>
            )}
            {offenderPersonLoading && <p className="ci-muted">Loading person…</p>}
            {offenderPerson && (
              <OffenderSummary person={offenderPerson} onClear={clearOffender} />
            )}
          </section>
        )}

        {segment === 'ask' && (
          <section className="ci-panel ci-enter" aria-labelledby="ci-ask-title">
            <div className="ci-section-head">
              <h2 id="ci-ask-title">ThiellBot</h2>
              <p>Ask ThiellBot natural-language questions over the crime pack.</p>
            </div>
            <div className="ci-ask-panel">
              <div className="ci-ask-thread" aria-live="polite">
                {askMessages.map((m, i) => (
                  <div key={i} className={`ci-ask-msg ci-ask-msg--${m.role}`}>
                    {m.role === 'assistant' && (
                      <span className="ci-ask-name">ThiellBot</span>
                    )}
                    <p>{typeof m.text === 'string' ? m.text : fmtScalar(m.text)}</p>
                    {m.provider && m.role === 'assistant' && m.provider !== 'system' && (
                      <span className="ci-ask-provider">via {String(m.provider)}</span>
                    )}
                  </div>
                ))}
              </div>
              <form className="ci-ask-form" onSubmit={askCrime}>
                <input
                  type="search"
                  value={askInput}
                  onChange={(e) => setAskInput(e.target.value)}
                  placeholder="Ask ThiellBot about a state, city, or national trend…"
                  aria-label="Ask ThiellBot a question"
                  disabled={askBusy}
                />
                <button type="submit" disabled={askBusy || !askInput.trim()}>
                  {askBusy ? 'Thinking…' : 'Ask'}
                </button>
              </form>
            </div>
          </section>
        )}

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
