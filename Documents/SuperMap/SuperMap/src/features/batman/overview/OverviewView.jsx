/**
 * Batman Mode Overview — the discovery surface.
 *
 * Empty on arrival: a search box, object types, tags, saved searches and a
 * collapsed situation strip. Results appear only when the visitor searches or
 * narrows. The strategic desk is a lens here, opened deliberately, not a page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSuperMapAccount } from '../../accounts/SuperMapAccounts'
import { OBJECT_KINDS, getDiscoveryIndex, facetCounts, searchIndex } from './discoveryIndex'
import FacetRail from './FacetRail'
import ResultsGrid from './ResultsGrid'
import ObjectBrowser from './ObjectBrowser'
import StrategicLens from './StrategicLens'
import DataFreshness from '../../../components/DataFreshness'
import { subscribeHome, startHomePolling } from '../../../lib/homeStore'
import { subscribeConsole, startConsole } from '../../../lib/consoleStore'
import { requestAddToCase } from '../caseStore'

const SAVED_KEY = 'supermap.batman.savedSearches.v1'
const RECENT_KEY = 'supermap.batman.recentSearches.v1'
const DEFAULT_FILTERS = {
  kind: [], source: [], theater: [], tag: [], time: 'any', minConfidence: 0,
}

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null')
    return Array.isArray(parsed) ? parsed : fallback
  } catch { return fallback }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
}

function toggle(list, value) {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

const TIME_MS = { any: 0, '24h': 86400000, '7d': 604800000, '30d': 2592000000 }

export default function OverviewView({ onGoCases }) {
  const { user } = useSuperMapAccount()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [indexVersion, setIndexVersion] = useState(0)
  const [selected, setSelected] = useState(null)
  const [lensOpen, setLensOpen] = useState(false)
  const [saved, setSaved] = useState(() => readJson(SAVED_KEY, []))
  const [recent, setRecent] = useState(() => readJson(RECENT_KEY, []))
  const [situation, setSituation] = useState({ posture: null, convergence: [] })

  useEffect(() => {
    startHomePolling()
    startConsole()
    const stopHome = subscribeHome(() => setIndexVersion((n) => n + 1))
    const stopConsole = subscribeConsole((state) => {
      setSituation({ posture: state.posture || null, convergence: state.convergence || [] })
      setIndexVersion((n) => n + 1)
    })
    return () => { stopHome(); stopConsole() }
  }, [])

  const index = useMemo(
    () => getDiscoveryIndex({ userUid: user?.uid || null, force: indexVersion > 0 }),
    // indexVersion signals the underlying stores changed; the index is cached inside.
    [user?.uid, indexVersion],
  )

  const results = useMemo(() => {
    const base = query.trim() ? searchIndex(index, query) : index.records
    const minTime = TIME_MS[filters.time] || 0
    return base.filter((row) => {
      if (filters.kind.length && !filters.kind.includes(row.kind)) return false
      if (filters.source.length && !filters.source.includes(row.source)) return false
      if (filters.theater.length && !filters.theater.includes(row.theater)) return false
      if (filters.tag.length && !filters.tag.some((tag) => row.tags.includes(tag))) return false
      if (minTime && row.t && index.builtAt - row.t > minTime) return false
      if (filters.minConfidence && row.confidence < filters.minConfidence) return false
      return true
    })
  }, [index, query, filters])

  const active = Boolean(query.trim())
    || filters.kind.length > 0 || filters.source.length > 0
    || filters.theater.length > 0 || filters.tag.length > 0
    || filters.time !== 'any' || filters.minConfidence > 0

  const scopedCounts = useMemo(() => ({
    tags: facetCounts(index.records, 'tags').slice(0, 18),
    kinds: facetCounts(index.records, 'kind'),
  }), [index])

  const onToggle = useCallback((field, value) => {
    setFilters((prev) => {
      if (field === 'time' || field === 'minConfidence') return { ...prev, [field]: value }
      return { ...prev, [field]: toggle(prev[field], value) }
    })
  }, [])

  const clear = useCallback(() => {
    setQuery('')
    setFilters(DEFAULT_FILTERS)
    setSelected(null)
  }, [])

  const runSearch = (event) => {
    event.preventDefault()
    const q = query.trim()
    if (!q) return
    setRecent((prev) => {
      const next = [q, ...prev.filter((entry) => entry !== q)].slice(0, 8)
      writeJson(RECENT_KEY, next)
      return next
    })
  }

  const saveSearch = () => {
    const entry = {
      id: `search-${Date.now()}`,
      query: query.trim(),
      filters: { ...filters, kind: [...filters.kind], source: [...filters.source], theater: [...filters.theater], tag: [...filters.tag] },
      createdAtMs: Date.now(),
    }
    if (!entry.query && !Object.values(entry.filters).some((v) => (Array.isArray(v) ? v.length : v !== 'any' && v !== 0))) return
    const next = [entry, ...saved].slice(0, 20)
    writeJson(SAVED_KEY, next)
    setSaved(next)
  }

  const applySaved = (entry) => {
    setQuery(entry.query || '')
    setFilters({ ...DEFAULT_FILTERS, ...entry.filters })
  }

  const removeSaved = (id) => {
    const next = saved.filter((entry) => entry.id !== id)
    writeJson(SAVED_KEY, next)
    setSaved(next)
  }

  const openInMap = (object) => {
    if (object.lat == null || object.lon == null) return
    window.dispatchEvent(new CustomEvent('supermap:show-place', {
      detail: { lat: object.lat, lon: object.lon, title: object.title },
    }))
  }

  const posture = situation.posture
  return (
    <div className="bm-overview">
      <form className="bm-search" onSubmit={runSearch} role="search">
        <span aria-hidden>⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search everything — a name, place, event, source…"
          aria-label="Search all published data"
          autoComplete="off"
        />
        <button type="submit" className="batman-btn">Search</button>
        <button type="button" className="batman-btn batman-btn-ghost" onClick={saveSearch}>Save search</button>
      </form>

      <div className="bm-types" aria-label="Object types">
        {OBJECT_KINDS.map((kind) => {
          const count = scopedCounts.kinds.find((entry) => entry.value === kind.id)?.count || 0
          const on = filters.kind.includes(kind.id)
          return (
            <button
              key={kind.id}
              type="button"
              className={`bm-type ${on ? 'is-on' : ''}`}
              aria-pressed={on}
              onClick={() => onToggle('kind', kind.id)}
            >
              <span aria-hidden>{kind.icon}</span>
              <span>{kind.label}</span>
              <b>{count}</b>
            </button>
          )
        })}
      </div>

      <section className="bm-cloud" aria-label="Common tags">
        {scopedCounts.tags.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className={filters.tag.includes(entry.value) ? 'is-on' : ''}
            onClick={() => onToggle('tag', entry.value)}
          >
            {entry.value} <b>{entry.count}</b>
          </button>
        ))}
      </section>

      {(saved.length || recent.length) ? (
        <section className="bm-searches">
          {saved.length ? (
            <div className="bm-saved">
              <h3>Saved searches</h3>
              {saved.map((entry) => (
                <div key={entry.id} className="bm-saved-row">
                  <button type="button" onClick={() => applySaved(entry)}>
                    {entry.query || 'Filtered view'}
                    <em>{entry.filters.kind.length ? entry.filters.kind.join(', ') : 'all types'}</em>
                  </button>
                  <button type="button" className="bm-saved-x" onClick={() => removeSaved(entry.id)} aria-label="Remove saved search">✕</button>
                </div>
              ))}
            </div>
          ) : null}
          {recent.length ? (
            <div className="bm-recent">
              <h3>Recent</h3>
              {recent.map((entry) => <button type="button" key={entry} onClick={() => setQuery(entry)}>{entry}</button>)}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={`bm-situation ${lensOpen ? 'is-open' : ''}`}>
        <button type="button" className="bm-situation-toggle" onClick={() => setLensOpen(!lensOpen)} aria-expanded={lensOpen}>
          <span className="bm-situation-dot" style={{ background: posture?.color || '#8494b3' }} aria-hidden />
          <strong>Situation at a glance</strong>
          {posture ? <span>{posture.band} · {posture.score}/100</span> : <span>reading published feeds…</span>}
          {situation.convergence?.length ? <em>{situation.convergence.length} places where reports line up</em> : null}
          <span className="bm-situation-chevron">{lensOpen ? '▴' : '▾'}</span>
        </button>
        <div className="bm-situation-meta"><DataFreshness /></div>
        {lensOpen ? <StrategicLens onAddToCase={(item) => requestAddToCase(item)} /> : null}
      </section>

      <div className="bm-discovery-body">
        {active ? <FacetRail scoped={results} filters={filters} onToggle={onToggle} onClear={clear} indexSize={index.records.length} /> : null}
        <ResultsGrid rows={active ? results : []} active={active} onOpen={setSelected} onClear={clear} />
      </div>

      {selected ? (
        <ObjectBrowser
          object={selected}
          index={index}
          onClose={() => setSelected(null)}
          onOpen={(row) => setSelected(row)}
          onOpenInMap={openInMap}
        />
      ) : null}

      <footer className="bm-overview-foot">
        <p>Everything here comes from published data already in the app. Nothing is invented, and nothing on this page writes to a case until you choose Add to Case.</p>
        <button type="button" className="batman-btn" onClick={onGoCases}>Go to Cases →</button>
      </footer>
    </div>
  )
}
