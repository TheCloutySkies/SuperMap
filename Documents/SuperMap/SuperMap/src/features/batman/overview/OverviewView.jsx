/**
 * Batman Mode Overview — a record-centric console.
 *
 * Empty on arrival: one search field, an object navigator and a collapsed
 * situation strip. Results appear only when the visitor searches or narrows.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, ChevronDown, ChevronUp, Bookmark, Trash2, Clock3 } from 'lucide-react'
import { useSuperMapAccount } from '../../accounts/SuperMapAccounts'
import {
  getDiscoveryIndex, searchIndex,
  startDiscoverySources, subscribePins, setDiscoveryVault, readLocalVault,
} from './discoveryIndex'
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
const TIME_MS = { any: 0, '24h': 86400000, '7d': 604800000, '30d': 2592000000 }

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

export default function OverviewView({ onGoCases }) {
  const { user, vault } = useSuperMapAccount()
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
    const bump = () => setIndexVersion((n) => n + 1)
    const stopHome = subscribeHome(bump)
    const stopConsole = subscribeConsole((state) => {
      setSituation({ posture: state.posture || null, convergence: state.convergence || [] })
      bump()
    })
    const stopEntities = startDiscoverySources()
    const stopPins = subscribePins(bump)
    window.addEventListener('supermap:discovery-changed', bump)
    const onKey = (event) => { if (event.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => {
      stopHome(); stopConsole(); stopEntities(); stopPins()
      window.removeEventListener('supermap:discovery-changed', bump)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    setDiscoveryVault(vault || readLocalVault(), user?.uid || null)
    const timer = setTimeout(() => setIndexVersion((n) => n + 1), 0)
    return () => clearTimeout(timer)
  }, [vault, user?.uid])

  const index = useMemo(
    () => getDiscoveryIndex({ userUid: user?.uid || null, force: indexVersion > 0 }),
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
    <div className="gm-console">
      <div className="gm-app-tabs" role="tablist" aria-label="Batman Mode applications">
        <button type="button" className="is-on" role="tab" aria-selected="true">Search</button>
        <button type="button" role="tab" aria-selected={lensOpen} onClick={() => setLensOpen(true)}>Situation</button>
        <button type="button" role="tab" aria-selected="false" onClick={() => {
          const withCoords = index.records.filter((row) => row.lat != null)
          if (withCoords.length) openInMap(withCoords[0])
        }}>Map</button>
        <button type="button" role="tab" aria-selected="false" onClick={() => selected && setSelected(selected)}>Browser</button>
        <button type="button" className="gm-app-cases" onClick={onGoCases}>Cases</button>
      </div>

      <form className="gm-search" onSubmit={runSearch} role="search">
        <Search size={16} strokeWidth={1.5} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search all indexed records"
          aria-label="Search all published records"
          autoComplete="off"
        />
        <button type="submit" className="gm-btn gm-btn-primary">Search</button>
        <button type="button" className="gm-btn" onClick={saveSearch}><Bookmark size={14} strokeWidth={1.5} aria-hidden /> Save</button>
      </form>

      {(saved.length || recent.length) ? (
        <div className="gm-query-strips">
          {saved.length ? (
            <div className="gm-query-strip">
              <span className="gm-query-label">Saved queries</span>
              {saved.map((entry) => (
                <span className="gm-query-row" key={entry.id}>
                  <button type="button" onClick={() => applySaved(entry)}>{entry.query || 'Filtered view'}</button>
                  <button type="button" className="gm-icon-btn" onClick={() => removeSaved(entry.id)} aria-label="Remove saved query"><Trash2 size={12} strokeWidth={1.5} /></button>
                </span>
              ))}
            </div>
          ) : null}
          {recent.length ? (
            <div className="gm-query-strip">
              <span className="gm-query-label"><Clock3 size={12} strokeWidth={1.5} aria-hidden /> Recent</span>
              {recent.map((entry) => <button type="button" key={entry} onClick={() => setQuery(entry)}>{entry}</button>)}
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="gm-situation">
        <button type="button" onClick={() => setLensOpen(!lensOpen)} aria-expanded={lensOpen}>
          <span>Situation at a glance</span>
          {posture ? <span className="gm-num">{posture.band} · {posture.score}/100</span> : <span className="gm-hint">reading published data…</span>}
          {situation.convergence?.length ? <span className="gm-num">{situation.convergence.length} converging theaters</span> : null}
          <span className="gm-situation-toggle">{lensOpen ? <ChevronUp size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}</span>
        </button>
        <div className="gm-situation-meta"><DataFreshness /></div>
        {lensOpen ? <StrategicLens onAddToCase={requestAddToCase} /> : null}
      </section>

      <div className="gm-panes">
        <FacetRail
          records={results} filters={filters}
          onToggle={onToggle} onClear={clear} active={active}
        />
        <ResultsGrid
          rows={active ? results : []} active={active} indexSize={index.records.length}
          selectedId={selected?.id || null} onSelect={setSelected} onClear={clear}
        />
        <ObjectBrowser object={selected} index={index} onOpen={setSelected} onOpenInMap={openInMap} />
      </div>

      <footer className="gm-console-foot">
        <span>All records come from published sources. Nothing is displayed until you search or narrow.</span>
        <button type="button" className="gm-btn" onClick={onGoCases}>Open Cases</button>
      </footer>
    </div>
  )
}
