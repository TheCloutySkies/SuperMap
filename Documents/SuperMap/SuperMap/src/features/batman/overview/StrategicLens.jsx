/**
 * The strategic desk, folded into Batman Mode Overview as a lens.
 * It reuses the existing components unchanged; it only mounts them on demand,
 * and adds an Add-to-Case action to the evidence drawer.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Plus } from 'lucide-react'
import SituationBrief from '../../../components/strategic/SituationBrief'
import ConvergenceStrip from '../../../components/strategic/ConvergenceStrip'
import SignalBoard from '../../../components/strategic/SignalBoard'
import SignalDrawer from '../../../components/strategic/SignalDrawer'
import TrendCharts from '../../../components/strategic/TrendCharts'
import SourcePanels from '../../../components/strategic/SourcePanels'
import TheaterMap from '../../../components/strategic/TheaterMap'
import SpatialBoundary from '../../../components/strategic/SpatialBoundary'
import AskPalette from '../../../components/strategic/AskPalette'
import { getConsoleState, refreshConsole, subscribeConsole } from '../../../lib/consoleStore'
import {
  DEFAULT_CONSOLE_PREFS, loadConsolePrefs, saveConsolePrefs,
} from '../../../lib/consolePrefs'
import {
  DOMAIN_ORDER, HOUR, REGIONS, buildBoardTiles, computeConvergence,
  computePosture, relTime, sortSignals,
} from '../../../lib/consoleSignals'

export default function StrategicLens({ onAddToCase }) {
  const [prefs, setPrefs] = useState(loadConsolePrefs)
  const [store, setStore] = useState(getConsoleState)
  const [selectedId, setSelectedId] = useState(null)
  const [askOpen, setAskOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => subscribeConsole(setStore), [])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => saveConsolePrefs(prefs), [prefs])

  const patchPrefs = useCallback((patch) => setPrefs((prev) => ({ ...prev, ...patch })), [])
  const toggleDomain = useCallback((id) => setPrefs((prev) => {
    const has = prev.domains.includes(id)
    const next = has ? prev.domains.filter((domain) => domain !== id) : [...prev.domains, id]
    return next.length ? { ...prev, domains: DOMAIN_ORDER.filter((domain) => next.includes(domain)) } : prev
  }), [])

  const windowStart = now - prefs.windowHours * HOUR
  const inWindow = useMemo(() => store.signals.filter((signal) => (
    prefs.domains.includes(signal.domain)
    && signal.confidence * 100 >= prefs.minConfidence
    && signal.at >= windowStart
    && (prefs.region === 'global' || signal.region === prefs.region)
  )), [store.signals, prefs.domains, prefs.minConfidence, prefs.region, windowStart])

  const convergence = useMemo(() => computeConvergence(inWindow, { now }), [inWindow, now])
  const posture = useMemo(
    () => computePosture({ signals: inWindow, convergence, threat: store.threat, defcon: store.defcon, now }),
    [inWindow, convergence, store.threat, store.defcon, now],
  )
  const tiles = useMemo(() => buildBoardTiles(inWindow, prefs.sort).slice(0, 24), [inWindow, prefs.sort])
  const selectedSignal = useMemo(
    () => store.signals.find((signal) => signal.id === selectedId) || null,
    [store.signals, selectedId],
  )
  const related = useMemo(() => selectedSignal
    ? sortSignals(store.signals.filter((signal) => signal.region === selectedSignal.region && signal.id !== selectedSignal.id), 'significance').slice(0, 4)
    : [], [store.signals, selectedSignal])

  const addSignal = (signal) => onAddToCase?.({
    title: signal.title,
    summary: signal.detail || signal.raw || '',
    type: 'signal',
    source: signal.source,
    url: signal.link,
    id: signal.id,
    tags: signal.tags,
    timestampMs: signal.at,
    lat: signal.lat,
    lon: signal.lon,
    confidence: signal.confidence,
    signal,
  })

  return (
    <div className="bm-lens">
      <div className="bm-lens-bar">
        <p>Signals from the published snapshot. <b>Nothing here is simulated.</b></p>
        <select value={prefs.region} onChange={(event) => patchPrefs({ region: event.target.value })} aria-label="Region">
          {Object.entries(REGIONS).map(([id, region]) => <option key={id} value={id}>{region.label}</option>)}
        </select>
        <select value={prefs.windowHours} onChange={(event) => patchPrefs({ windowHours: Number(event.target.value) })} aria-label="Time window">
          {[1, 6, 24, 72, 168].map((hours) => <option key={hours} value={hours}>Last {hours}h</option>)}
        </select>
        <button type="button" className="batman-btn batman-btn-ghost" onClick={() => setAskOpen(true)}><Search size={13} strokeWidth={1.5} aria-hidden /> Ask</button>
        {store.error ? <button type="button" className="batman-btn batman-btn-ghost" onClick={() => refreshConsole({ force: true })}>Retry</button> : null}
      </div>

      <SituationBrief
        posture={posture}
        convergence={convergence}
        anomalies={inWindow.filter((signal) => signal.magnitude >= 0.8)}
        signals={inWindow}
        mode={prefs.mode}
        regionLabel={prefs.region === 'global' ? 'all theaters' : REGIONS[prefs.region]?.label || prefs.region}
        windowHours={prefs.windowHours}
        threat={store.threat}
        topSignal={sortSignals(inWindow, 'significance')[0] || null}
      />
      <ConvergenceStrip convergence={convergence} mode={prefs.mode} now={now} onFocus={(region) => patchPrefs({ region })} />

      <div className="bm-lens-pills">
        {DOMAIN_ORDER.filter((id) => prefs.domains.includes(id)).map((id) => {
          const count = inWindow.filter((signal) => signal.domain === id).length
          if (!count) return null
          return (
            <button key={id} type="button" onClick={() => toggleDomain(id)} className={count ? 'has-items' : ''}>
              {id} <b>{count}</b>
            </button>
          )
        })}
      </div>

      <SignalBoard
        tiles={tiles}
        mode={prefs.mode}
        density={prefs.density}
        series={store.series}
        watch={prefs.watch}
        onToggleWatch={(id) => patchPrefs({ watch: prefs.watch.includes(id) ? prefs.watch.filter((w) => w !== id) : [id, ...prefs.watch].slice(0, 80) })}
        onOpen={setSelectedId}
        now={now}
        emptyCopy="Nothing published in this window and region."
      />

      <section className="bm-lens-section">
        <h3>Where it is happening</h3>
        <SpatialBoundary>
          <TheaterMap
            signals={inWindow}
            domains={prefs.domains}
            onToggleDomain={toggleDomain}
            region={prefs.region}
            selectedId={selectedId}
            onSelect={setSelectedId}
            now={now}
            scrubHours={Math.min(prefs.scrubHours, prefs.windowHours)}
            onScrub={(value) => patchPrefs({ scrubHours: value })}
            windowHours={prefs.windowHours}
          />
        </SpatialBoundary>
      </section>

      <section className="bm-lens-section">
        <h3>Trends</h3>
        <TrendCharts charts={store.charts} />
      </section>
      <section className="bm-lens-section">
        <h3>Latest published</h3>
        <ul className="bm-lens-latest">
          {inWindow.slice().sort((a, b) => b.at - a.at).slice(0, 12).map((signal) => (
            <li key={signal.id}>
              <span>{relTime(signal.at, now)}</span>
              <button type="button" onClick={() => setSelectedId(signal.id)}>{signal.title}</button>
              <button type="button" className="batman-btn batman-btn-ghost" onClick={() => addSignal(signal)}>Add to Case</button>
            </li>
          ))}
        </ul>
      </section>
      <SourcePanels payloads={store.payloads} sources={store.sources} />

      {selectedSignal ? (
        <>
          <SignalDrawer
            signal={selectedSignal}
            mode={prefs.mode}
            watch={prefs.watch}
            onToggleWatch={(id) => patchPrefs({ watch: prefs.watch.includes(id) ? prefs.watch.filter((w) => w !== id) : [id, ...prefs.watch].slice(0, 80) })}
            onClose={() => setSelectedId(null)}
            onFocus={(region) => patchPrefs({ region })}
            onOpen={setSelectedId}
            related={related}
            now={now}
          />
          <div className="bm-lens-drawer-add">
            <button type="button" className="batman-btn" onClick={() => addSignal(selectedSignal)}><Plus size={13} strokeWidth={1.5} aria-hidden /> Add this signal to a case</button>
          </div>
        </>
      ) : null}
      {askOpen ? <AskPalette onClose={() => setAskOpen(false)} signals={store.signals} onOpenSignal={(id) => { setSelectedId(id); setAskOpen(false) }} now={now} /> : null}
    </div>
  )
}
