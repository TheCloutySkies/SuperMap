/**
 * Strategic desk, rebuilt as a console on published data.
 *
 * Every number on this page comes from the collector's snapshot: signals,
 * convergence, posture, charts and the source panels. The desk never invents a
 * value, never calls an upstream from the browser and never runs a simulation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConsoleHeader from './strategic/ConsoleHeader'
import ConsoleRail from './strategic/ConsoleRail'
import SituationBrief from './strategic/SituationBrief'
import ConvergenceStrip from './strategic/ConvergenceStrip'
import SignalBoard from './strategic/SignalBoard'
import TheaterMap from './strategic/TheaterMap'
import TrendCharts from './strategic/TrendCharts'
import SignalDrawer from './strategic/SignalDrawer'
import AskPalette from './strategic/AskPalette'
import SourcePanels from './strategic/SourcePanels'
import SpatialBoundary from './strategic/SpatialBoundary'
import { getConsoleState, refreshConsole, startConsole, subscribeConsole } from '../lib/consoleStore'
import {
  ACCENTS,
  DEFAULT_CONSOLE_PREFS,
  loadConsolePrefs,
  loadSavedViews,
  saveConsolePrefs,
  saveSavedViews,
} from '../lib/consolePrefs'
import {
  BOARD_LIMIT,
  DOMAINS,
  DOMAIN_ORDER,
  HOUR,
  REGIONS,
  buildBoardTiles,
  computeConvergence,
  computePosture,
  relTime,
  sortSignals,
} from '../lib/consoleSignals'
import './StrategicView.css'

let audioContext = null

function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    if (!audioContext) audioContext = new Ctx()
    if (audioContext.state === 'suspended') audioContext.resume()
    const start = audioContext.currentTime
    for (const [index, frequency] of [523, 659, 784].entries()) {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0, start + index * 0.07)
      gain.gain.linearRampToValueAtTime(0.05, start + index * 0.07 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.07 + 0.4)
      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.start(start + index * 0.07)
      oscillator.stop(start + index * 0.07 + 0.45)
    }
  } catch { /* audio is optional */ }
}

export default function StrategicView() {
  const [prefs, setPrefsState] = useState(loadConsolePrefs)
  const [views, setViews] = useState(loadSavedViews)
  const [store, setStore] = useState(getConsoleState)
  const [selectedId, setSelectedId] = useState(null)
  const [askOpen, setAskOpen] = useState(false)
  const [railOpen, setRailOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [toasts, setToasts] = useState([])
  const toastSeq = useRef(0)
  const alertCount = useRef(0)
  const primed = useRef(false)

  useEffect(() => {
    startConsole()
    return subscribeConsole(setStore)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    saveConsolePrefs(prefs)
  }, [prefs])

  const patchPrefs = useCallback((patch) => {
    setPrefsState((prev) => ({ ...prev, ...patch }))
  }, [])

  const pushToast = useCallback((toast) => {
    toastSeq.current += 1
    const id = toastSeq.current
    setToasts((prev) => [...prev.slice(-2), { ...toast, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((entry) => entry.id !== id))
    }, 4600)
  }, [])

  const toggleDomain = useCallback((id) => {
    setPrefsState((prev) => {
      const has = prev.domains.includes(id)
      const next = has ? prev.domains.filter((domain) => domain !== id) : [...prev.domains, id]
      if (!next.length) return prev
      return { ...prev, domains: DOMAIN_ORDER.filter((domain) => next.includes(domain)) }
    })
  }, [])

  const toggleWatch = useCallback((id) => {
    setPrefsState((prev) => {
      const has = prev.watch.includes(id)
      const next = has ? prev.watch.filter((entry) => entry !== id) : [id, ...prev.watch].slice(0, 80)
      return { ...prev, watch: next }
    })
  }, [])

  const windowStart = now - prefs.windowHours * HOUR

  const inWindow = useMemo(() => store.signals.filter((signal) => {
    if (!prefs.domains.includes(signal.domain)) return false
    if (signal.confidence * 100 < prefs.minConfidence) return false
    if (signal.at < windowStart) return false
    if (prefs.region !== 'global' && signal.region !== prefs.region) return false
    return true
  }), [store.signals, prefs.domains, prefs.minConfidence, prefs.region, windowStart])

  const boardSignals = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return inWindow
    return inWindow.filter((signal) => (
      `${signal.title} ${signal.detail} ${signal.source}`.toLowerCase().includes(needle)
    ))
  }, [inWindow, search])

  const convergence = useMemo(() => computeConvergence(inWindow, { now }), [inWindow, now])

  const posture = useMemo(
    () => computePosture({ signals: inWindow, convergence, threat: store.threat, defcon: store.defcon, now }),
    [inWindow, convergence, store.threat, store.defcon, now],
  )

  const anomalies = useMemo(() => inWindow.filter((signal) => signal.magnitude >= 0.8), [inWindow])
  const boardTiles = useMemo(() => buildBoardTiles(boardSignals, prefs.sort), [boardSignals, prefs.sort])
  const topSignal = useMemo(() => sortSignals(inWindow, 'significance')[0] || null, [inWindow])
  const selectedSignal = useMemo(
    () => store.signals.find((signal) => signal.id === selectedId) || null,
    [store.signals, selectedId],
  )

  const related = useMemo(() => {
    if (!selectedSignal) return []
    return sortSignals(
      store.signals.filter((signal) => signal.region === selectedSignal.region && signal.id !== selectedSignal.id),
      'significance',
    ).slice(0, 4)
  }, [store.signals, selectedSignal])

  const watched = useMemo(
    () => prefs.watch
      .map((id) => store.signals.find((signal) => signal.id === id))
      .filter(Boolean),
    [prefs.watch, store.signals],
  )

  const latest = useMemo(
    () => inWindow.slice().sort((a, b) => b.at - a.at).slice(0, 12),
    [inWindow],
  )

  const regionLabel = prefs.region === 'global' ? 'all theaters' : REGIONS[prefs.region]?.label || prefs.region

  // A convergence that crosses the threshold raises one toast, never a stream.
  useEffect(() => {
    if (!primed.current) {
      primed.current = true
      alertCount.current = convergence.length
      return
    }
    if (!prefs.alerts) {
      alertCount.current = convergence.length
      return
    }
    const top = convergence[0]
    if (top && top.score >= prefs.alertThreshold && convergence.length > alertCount.current) {
      pushToast({
        kind: 'alert',
        icon: '🔴',
        text: `Convergence in ${REGIONS[top.region]?.label || top.region} · score ${top.score}`,
        actionLabel: 'Focus',
        onAction: () => patchPrefs({ region: top.region }),
      })
      if (prefs.sound) chime()
    }
    alertCount.current = convergence.length
  }, [convergence, prefs.alerts, prefs.alertThreshold, prefs.sound, pushToast, patchPrefs])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedId(null)
        setAskOpen(false)
        setRailOpen(false)
      }
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const tag = document.activeElement?.tagName?.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        event.preventDefault()
        setAskOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleSaveView = useCallback(() => {
    if (typeof window === 'undefined') return
    const name = window.prompt(
      'Name this view:',
      `${prefs.region === 'global' ? 'Global' : REGIONS[prefs.region]?.label || prefs.region} · ${prefs.windowHours}h`,
    )
    if (!name) return
    setViews((prev) => {
      const next = [
        ...prev.filter((view) => view.name !== name),
        {
          name: name.slice(0, 40),
          region: prefs.region,
          windowHours: prefs.windowHours,
          domains: prefs.domains,
          minConfidence: prefs.minConfidence,
          sort: prefs.sort,
        },
      ].slice(-12)
      saveSavedViews(next)
      return next
    })
    pushToast({ kind: 'ok', icon: '📁', text: `Saved “${name}”` })
  }, [prefs, pushToast])

  const handleLoadView = useCallback((view) => {
    patchPrefs({
      region: view.region || 'global',
      windowHours: view.windowHours || 24,
      domains: Array.isArray(view.domains) && view.domains.length ? view.domains : DOMAIN_ORDER,
      minConfidence: Number(view.minConfidence) || 0,
      sort: view.sort || 'significance',
    })
    pushToast({ kind: 'ok', icon: '📁', text: `Loaded “${view.name}”` })
  }, [patchPrefs, pushToast])

  const handleDeleteView = useCallback((name) => {
    setViews((prev) => {
      const next = prev.filter((view) => view.name !== name)
      saveSavedViews(next)
      return next
    })
  }, [])

  const handleExport = useCallback(() => {
    if (typeof window === 'undefined') return
    const payload = {
      generatedAt: new Date().toISOString(),
      snapshot: { version: store.version, publishedAt: store.generatedAt },
      posture,
      filters: {
        region: prefs.region,
        windowHours: prefs.windowHours,
        domains: prefs.domains,
        minConfidence: prefs.minConfidence,
      },
      convergence: convergence.map((cluster) => ({
        region: cluster.region,
        label: REGIONS[cluster.region]?.label || cluster.region,
        score: cluster.score,
        domains: cluster.domains,
        why: cluster.why,
      })),
      signals: sortSignals(inWindow, prefs.sort).slice(0, 100).map((signal) => ({
        id: signal.id,
        domain: signal.domain,
        region: signal.region,
        at: new Date(signal.at).toISOString(),
        title: signal.title,
        detail: signal.detail,
        confidence: Number(signal.confidence.toFixed(3)),
        corroboration: signal.corroboration,
        source: signal.source,
        link: signal.link,
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `strategic-console-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    pushToast({ kind: 'ok', icon: '⭳', text: 'Situation brief exported' })
  }, [convergence, inWindow, posture, prefs, pushToast, store.generatedAt, store.version])

  const handleReset = useCallback(() => {
    setPrefsState({ ...DEFAULT_CONSOLE_PREFS, watch: prefs.watch })
    setSearch('')
    setSelectedId(null)
    pushToast({ kind: '', icon: '↺', text: 'Console reset' })
  }, [prefs.watch, pushToast])

  const accent = ACCENTS.find((entry) => entry.id === prefs.accent) || ACCENTS[0]
  const accentStyle = {
    '--gp-accent': accent.hex,
    '--gp-accent-soft': accent.soft,
    '--gp-accent-glow': accent.glow,
  }

  return (
    <div className="strategic-console" style={accentStyle}>
      <ConsoleHeader
        mode={prefs.mode}
        onMode={(mode) => patchPrefs({ mode })}
        posture={posture}
        onAsk={() => setAskOpen(true)}
        status={store.status}
      />

      {store.status === 'loading' && store.signals.length === 0 ? (
        <p className="console-loading">
          Assembling the picture from the published snapshot… ({store.progress.done}/{store.progress.total} sources)
        </p>
      ) : null}
      {store.error ? (
        <p className="console-warn">
          {store.error}{' '}
          <button type="button" className="console-btn" onClick={() => refreshConsole({ force: true })}>
            Retry
          </button>
        </p>
      ) : null}

      <div className="console-body">
        <ConsoleRail
          prefs={prefs}
          onPatch={patchPrefs}
          views={views}
          onSaveView={handleSaveView}
          onLoadView={handleLoadView}
          onDeleteView={handleDeleteView}
          onExport={handleExport}
          onReset={handleReset}
          open={railOpen}
          onClose={() => setRailOpen(false)}
        />

        <div className="console-main">
          <SituationBrief
            posture={posture}
            convergence={convergence}
            anomalies={anomalies}
            signals={inWindow}
            mode={prefs.mode}
            regionLabel={regionLabel}
            windowHours={prefs.windowHours}
            threat={store.threat}
            topSignal={topSignal}
          />

          <ConvergenceStrip
            convergence={convergence}
            mode={prefs.mode}
            now={now}
            onFocus={(region) => patchPrefs({ region })}
          />

          <section className="console-section" aria-label="Theater map">
            <div className="console-section-head">
              <span className="console-tag">Live picture</span>
              <h2>Theater map</h2>
            </div>
            <p className="console-section-sub">
              Real plotted coordinates from the published feeds. Drag to pan, scroll to zoom, click a pin for its evidence drawer.
            </p>
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

          <section className="console-section" aria-label="Signal board">
            <div className="console-section-head">
              <span className="console-tag">Signal board</span>
              <h2>What the feeds are saying</h2>
            </div>
            <p className="console-section-sub">
              One tile per published item that earned a domain. Brief mode gives the plain reading; analyst mode gives the record.
            </p>
            <div className="console-toolbar">
              <input
                className="console-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter the board — equipment, country, CVE…"
                aria-label="Filter signals"
              />
              <span className="console-count">
                {boardTiles.length} of {boardSignals.length} shown · {inWindow.length} in {regionLabel} · {prefs.windowHours}h
                {boardTiles.length >= BOARD_LIMIT ? ' · tile cap reached' : ''}
              </span>
            </div>
            <div className="console-domain-strip">
              {DOMAIN_ORDER.filter((id) => prefs.domains.includes(id)).map((id) => {
                const count = inWindow.filter((signal) => signal.domain === id).length
                if (!count) return null
                const delta = store.deltas[id]
                return (
                  <span
                    className="console-domain-pill"
                    key={id}
                    style={{ '--dc': DOMAINS[id].hex }}
                    title={`${DOMAINS[id].label}: ${count} published in the window; domain volume last 24 h against the 24 h before`}
                  >
                    <i aria-hidden />
                    {DOMAINS[id].short}
                    <b>{count}</b>
                    <em className={delta == null ? 'is-new' : delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}>
                      {delta == null ? 'new' : `${delta > 0 ? '▲' : delta < 0 ? '▼' : '·'}${Math.abs(delta)}%`}
                    </em>
                  </span>
                )
              })}
            </div>
            <SignalBoard
              tiles={boardTiles}
              mode={prefs.mode}
              density={prefs.density}
              series={store.series}
              watch={prefs.watch}
              onToggleWatch={toggleWatch}
              onOpen={setSelectedId}
              now={now}
              emptyCopy={`No signals in ${regionLabel} for this filter set. Widen the window, lower the confidence floor, or include more domains.`}
            />
          </section>

          <section className="console-section" aria-label="Trends">
            <div className="console-section-head">
              <span className="console-tag">Trends</span>
              <h2>Patterns in the published data</h2>
            </div>
            <p className="console-section-sub">
              Aggregates the collector already publishes. A series with no rows is not shown rather than drawn empty.
            </p>
            <TrendCharts charts={store.charts} />
          </section>

          <section className="console-section" aria-label="Changes and watchlist">
            <div className="console-split">
              <div className="console-panel-block">
                <h3>⟳ Latest published <span className="console-n">{latest.length}</span></h3>
                <div className="console-delta">
                  {latest.length ? latest.map((signal) => (
                    <div className="console-delta-item" key={signal.id}>
                      <span className="console-delta-time">{relTime(signal.at, now)}</span>
                      <span className="console-delta-dot" style={{ background: DOMAINS[signal.domain].hex }} aria-hidden />
                      <span className="console-delta-text">
                        <b>{DOMAINS[signal.domain].label}</b> · {signal.title}
                      </span>
                      <button type="button" className="console-delta-open" onClick={() => setSelectedId(signal.id)}>
                        open →
                      </button>
                    </div>
                  )) : <p className="console-empty">Nothing published in this window.</p>}
                </div>
              </div>

              <div className="console-panel-block">
                <h3>★ Watchlist <span className="console-n">{watched.length}</span></h3>
                {watched.length ? watched.map((signal) => (
                  <div className="console-watch-item" key={signal.id}>
                    <span className="console-delta-dot" style={{ background: DOMAINS[signal.domain].hex }} aria-hidden />
                    <button type="button" className="console-watch-name" onClick={() => setSelectedId(signal.id)}>
                      {signal.title}
                    </button>
                    <button
                      type="button"
                      className="console-watch-remove"
                      onClick={() => toggleWatch(signal.id)}
                      aria-label="Remove from watchlist"
                    >
                      ✕
                    </button>
                  </div>
                )) : (
                  <p className="console-empty">Star a signal to keep it here. The list survives a reload.</p>
                )}
              </div>
            </div>
          </section>

          <SourcePanels payloads={store.payloads} sources={store.sources} />

          <footer className="console-foot">
            <p>
              Sources: {DOMAIN_ORDER.map((id) => DOMAINS[id].source).join(' · ')}.
            </p>
            <p className="console-note">
              This desk reads the shared snapshot, so every visitor sees the same picture. Nothing here calls an
              upstream from your browser.
              {store.version ? ` Published version ${store.version}.` : ''}
            </p>
          </footer>
        </div>
      </div>

      <button type="button" className="console-fab" onClick={() => setRailOpen(true)} aria-label="Open filters">
        ⌗ Filters
      </button>

      {selectedSignal ? (
        <SignalDrawer
          signal={selectedSignal}
          mode={prefs.mode}
          watch={prefs.watch}
          onToggleWatch={toggleWatch}
          onClose={() => setSelectedId(null)}
          onFocus={(region) => patchPrefs({ region })}
          onOpen={(id) => setSelectedId(id)}
          related={related}
          now={now}
        />
      ) : null}

      {askOpen ? (
        <AskPalette
          onClose={() => setAskOpen(false)}
          signals={store.signals}
          onOpenSignal={(id) => setSelectedId(id)}
          now={now}
        />
      ) : null}

      <div className="console-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`console-toast ${toast.kind ? `is-${toast.kind}` : ''}`}>
            <span className="console-toast-icon" aria-hidden>{toast.icon}</span>
            <span className="console-toast-text">{toast.text}</span>
            {toast.actionLabel ? (
              <button type="button" className="console-toast-action" onClick={toast.onAction}>
                {toast.actionLabel}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
