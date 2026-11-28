/**
 * The homepage panels as standalone previews.
 *
 * Each one reads the stores the dashboard already reads — homeStore, consoleStore
 * and the case list — so a floating preview and the tiled dashboard show the
 * same data through one subscription. Most recent only: no paging, no filters.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { readHomeSnapshot, osintXToImages } from '../../../lib/homeBootstrap'
import { HOME_STATE, subscribeHome, startHomePolling } from '../../../lib/homeStore'
import { subscribeConsole, startConsole } from '../../../lib/consoleStore'
import { computeConvergence, computePosture } from '../../../lib/consoleSignals'
import { subscribeCases } from '../../../features/batman/caseStore'
import { LatestBulletin } from '../../../features/bulletin/BulletinBoardView'
import { xImageProps } from '../../../lib/snapshotClient'

const CommunityMapView = lazy(() => import('../../CommunityMapView'))
const StockWidget = lazy(() => import('../../widgets/StockWidget'))
const EarthquakesWidget = lazy(() => import('../../widgets/EarthquakesWidget'))
const SpaceWidget = lazy(() => import('../../widgets/SpaceWidget'))
const NextLaunchWidget = lazy(() => import('../../widgets/NextLaunchWidget'))
const GasPrices = lazy(() => import('../GasPrices'))

let started = false
function startOnce() {
  if (started) return
  started = true
  startHomePolling?.()
  startConsole?.()
}

function useHome() {
  const [home, setHome] = useState(() => readHomeSnapshot() || null)
  const [state, setState] = useState(HOME_STATE.SEED)
  useEffect(() => {
    startOnce()
    return subscribeHome((next) => {
      if (next?.payload) setHome(next.payload)
      if (next?.state) setState(next.state)
    })
  }, [])
  return { home, state }
}

function useConsole() {
  const [consoleState, setConsoleState] = useState(null)
  useEffect(() => {
    startOnce()
    return subscribeConsole(setConsoleState)
  }, [])
  return consoleState
}

function useCaseList() {
  const [cases, setCases] = useState([])
  useEffect(() => subscribeCases('local', setCases), [])
  return cases
}

function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    // A zero-delay tick keeps the first setState out of the effect body.
    const first = setTimeout(() => setNow(Date.now()), 0)
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [intervalMs])
  return now
}

function ago(ms, now) {
  if (!Number.isFinite(ms) || !ms || !now) return '—'
  const minutes = Math.round((now - ms) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}

function headlinesOf(home) {
  const news = home?.news?.features || []
  return news.slice(0, 12).map((feature) => ({
    id: feature.properties?.id || feature.id,
    title: feature.properties?.title || 'Untitled',
    source: feature.properties?.source || 'News',
    time: Number(feature.properties?.timestamp) || null,
    url: feature.properties?.link || '',
  }))
}

export function SituationPreview() {
  const now = useNow()
  const { home } = useHome()
  const consoleState = useConsole()
  const threat = home?.threatSummary || null
  const posture = useMemo(() => {
    if (!consoleState?.signals) return null
    const now = consoleState.computedAt || 0
    if (!now) return null
    return computePosture({
      signals: consoleState.signals,
      convergence: computeConvergence(consoleState.signals, { now }),
      threat,
      defcon: home?.defcon || null,
      now,
    })
  }, [consoleState, threat, home])

  return (
    <div className="xp-preview">
      <dl className="xp-preview-stats">
        <div><dt>Threat</dt><dd>{threat?.threat_level || '—'}</dd></div>
        <div><dt>Average</dt><dd>{Number(threat?.average_score || 0).toFixed(1)}</dd></div>
        <div><dt>Posture</dt><dd>{posture ? `${posture.band} ${posture.score}` : '—'}</dd></div>
        <div><dt>High risk</dt><dd>{threat?.high_risk_count ?? '—'}</dd></div>
      </dl>
      {threat?.narrative || threat?.summary ? (
        <p className="xp-preview-text">{threat.narrative || threat.summary}</p>
      ) : <p className="xp-preview-muted">No summary yet.</p>}
      <p className="xp-preview-muted">Updated {ago(Number(threat?.timestamp) || 0, now)}</p>
    </div>
  )
}

export function MapPreview() {
  return (
    <div className="xp-preview xp-preview-map">
      <Suspense fallback={<p className="xp-preview-muted">Loading the map…</p>}>
        <CommunityMapView variant="home" />
      </Suspense>
    </div>
  )
}

export function HeadlinesPreview() {
  const now = useNow()
  const { home } = useHome()
  const rows = headlinesOf(home)
  if (!rows.length) return <p className="xp-preview-muted">No headlines yet.</p>
  return (
    <ul className="xp-preview-list">
      {rows.map((row) => (
        <li key={row.id}>
          <a href={row.url || '#'} target="_blank" rel="noopener noreferrer">{row.title}</a>
          <span>{row.source}{row.time ? ` · ${ago(row.time, now)}` : ''}</span>
        </li>
      ))}
    </ul>
  )
}

export function XPreview() {
  const { home } = useHome()
  const images = useMemo(() => {
    const fromHome = Array.isArray(home?.homeImages) ? home.homeImages : []
    return (fromHome.length ? fromHome : osintXToImages(home?.osintX)).slice(0, 12)
  }, [home])
  if (!images.length) return <p className="xp-preview-muted">No images yet.</p>
  return (
    <div className="xp-preview-strip">
      {images.map((item, index) => (
        <img key={`${item.src}-${index}`} {...xImageProps(item.src)} alt="" loading="lazy" />
      ))}
    </div>
  )
}

export function MarketsPreview() {
  const { home, state } = useHome()
  return (
    <div className="xp-preview">
      <Suspense fallback={<p className="xp-preview-muted">Loading markets…</p>}>
        <StockWidget initialData={home?.stocks} bootstrapState={state} />
      </Suspense>
      <Suspense fallback={null}>
        <GasPrices gas={home?.gasPrices || null} states={home?.gasStates || []} />
      </Suspense>
    </div>
  )
}

export function HazardsPreview() {
  const { home, state } = useHome()
  return (
    <div className="xp-preview">
      <Suspense fallback={<p className="xp-preview-muted">Loading hazards…</p>}>
        <EarthquakesWidget initialData={home?.earthquakes} bootstrapState={state} />
      </Suspense>
    </div>
  )
}

export function OrbitalPreview() {
  const { home, state } = useHome()
  return (
    <div className="xp-preview">
      <Suspense fallback={<p className="xp-preview-muted">Loading space…</p>}>
        <SpaceWidget initialData={home?.space} bootstrapState={state} />
      </Suspense>
      <Suspense fallback={null}>
        <NextLaunchWidget bootstrapState={state} />
      </Suspense>
    </div>
  )
}

export function BatmanPreview() {
  const cases = useCaseList()
  return (
    <div className="xp-preview">
      {cases.length ? (
        <ul className="xp-preview-list">
          {cases.slice(0, 8).map((row) => (
            <li key={row.id}><span>{row.title || 'Untitled case'}</span><span>{(row.nodes || []).length} items</span></li>
          ))}
        </ul>
      ) : <p className="xp-preview-muted">No cases yet.</p>}
    </div>
  )
}

export function BulletinPreview() {
  return (
    <div className="xp-preview">
      <LatestBulletin />
    </div>
  )
}

export function CrimePreview() {
  return (
    <div className="xp-preview">
      <p className="xp-preview-text">National crime snapshot, with state and city detail on the full page.</p>
    </div>
  )
}
