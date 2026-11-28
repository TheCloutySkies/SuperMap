/**
 * Full-viewport operations dashboard — the homepage itself.
 *
 * Every panel is a live window into a section and a door into that section.
 * Data stays in the existing stores/widgets; this file only rearranges them.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, Bell, BriefcaseBusiness, ChartNoAxesCombined, CloudSun, Compass,
  FileText, Globe2, HardDrive, Map, Menu, Newspaper, Radio, Settings,
  Shield, Telescope, Search, ChevronLeft, ChevronRight,
} from 'lucide-react'
import Panel, { Skeleton, Status } from './Panel'
import DataFreshness from '../DataFreshness'
import { LatestBulletin } from '../../features/bulletin/BulletinBoardView'
import ItemMenu from '../../features/accounts/ItemMenu'
import { useSuperMapAccount } from '../../features/accounts/SuperMapAccounts'
import { xImageProps } from '../../lib/snapshotClient'
import { CRIME_VIEW_ID, WEATHER_VIEW_ID, BRAND_LOGO_SRC, BRAND_LOGO_ALT } from '../../constants'
import { getApiBase, readHomeSnapshot, osintXToImages } from '../../lib/homeBootstrap'
import { HOME_STATE, subscribeHome, startHomePolling, refreshHomeNow } from '../../lib/homeStore'
import { subscribeConsole, startConsole } from '../../lib/consoleStore'
import { computeConvergence, computePosture } from '../../lib/consoleSignals'
import { localCases } from '../../features/batman/caseStore'
import './operations.css'
import './dashboard.css'

const CommunityMapView = lazy(() => import('../CommunityMapView'))
const StockWidget = lazy(() => import('../widgets/StockWidget'))
const SpaceWidget = lazy(() => import('../widgets/SpaceWidget'))
const HeadlinesWidget = lazy(() => import('../widgets/HeadlinesWidget'))
const EarthquakesWidget = lazy(() => import('../widgets/EarthquakesWidget'))
const StrategicOverviewWidget = lazy(() => import('../widgets/StrategicOverviewWidget'))
const NextLaunchWidget = lazy(() => import('../widgets/NextLaunchWidget'))
const WorldClock = lazy(() => import('../widgets/WorldClock'))

const API_BASE = getApiBase()
const DOOMSDAY_SECONDS = 85

const MODES = [
  { id: 'HOME', label: 'Home', icon: Globe2, view: 'home' },
  { id: 'MAPS', label: 'Maps', icon: Map, view: 'community-map' },
  { id: 'CRIME', label: 'Crime', icon: ChartNoAxesCombined, view: CRIME_VIEW_ID },
  { id: 'WEATHER', label: 'Weather', icon: CloudSun, view: WEATHER_VIEW_ID },
  { id: 'STRATEGIC', label: 'Strategic', icon: Shield, view: 'batman-overview' },
  { id: 'BATMAN', label: 'Batman', icon: BriefcaseBusiness, view: 'batman-overview' },
  { id: 'FEEDS', label: 'News', icon: Newspaper, view: 'news-feeds' },
  { id: 'BULLETIN', label: 'Bulletin', icon: Bell, view: 'bulletin' },
  { id: 'TOOLS', label: 'Tools', icon: Compass, view: 'tools' },
  { id: 'RESOURCES', label: 'Resources', icon: HardDrive, view: 'resources' },
  { id: 'REPORTS', label: 'Reports', icon: FileText, view: 'report-maker' },
  { id: 'SETTINGS', label: 'Settings', icon: Settings, view: 'settings' },
]

function clockUtc() {
  const now = new Date()
  return {
    time: now.toISOString().slice(11, 19),
    date: now.toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: '2-digit', year: 'numeric' }),
  }
}

function ago(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function extractHeadlines(news, xPosts) {
  const rows = []
  for (const feature of Array.isArray(news?.features) ? news.features : []) {
    const p = feature?.properties || {}
    if (!p.title) continue
    rows.push({
      id: p.id || p.link || p.title,
      title: p.title,
      source: p.source || 'press',
      time: p.timestamp,
      url: p.link || p.url,
      image: p.image || p.thumbnail || null,
    })
  }
  for (const post of Array.isArray(xPosts) ? xPosts : []) {
    if (!post.title && !post.content) continue
    rows.push({
      id: post.id || post.url,
      title: post.title || String(post.content).slice(0, 120),
      source: post.account ? `@${post.account}` : 'X',
      time: post.timestamp,
      url: post.url,
    })
  }
  return rows.sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 60)
}

export default function OperationsHome({
  onNavigate, onFooterNav, isMobileLayout = false, onShowLocationOnMap, onHomeBootstrap,
}) {
  const { user } = useSuperMapAccount()
  const [home, setHome] = useState(() => readHomeSnapshot() || null)
  const [bootstrapState, setBootstrapState] = useState(HOME_STATE.SEED)
  const [consoleState, setConsoleState] = useState(null)
  const [clock, setClock] = useState(clockUtc)
  const [railOpen, setRailOpen] = useState(true)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState('situation')
  const [cases, setCases] = useState([])
  const [photo, setPhoto] = useState(null)
  const searchRef = useRef(null)

  useEffect(() => {
    const stop = subscribeHome((store) => {
      setBootstrapState(store.status)
      if (store.payload) {
        setHome(store.payload)
        onHomeBootstrap?.(store.payload)
      }
    })
    startHomePolling()
    const stopConsole = subscribeConsole(setConsoleState)
    startConsole()
    return () => { stop(); stopConsole() }
  }, [onHomeBootstrap])

  useEffect(() => {
    const timer = setTimeout(() => setCases(localCases(user?.uid || null).slice(0, 5)), 0)
    return () => clearTimeout(timer)
  }, [user?.uid])

  useEffect(() => {
    const id = setInterval(() => setClock(clockUtc()), 1000)
    return () => clearInterval(id)
  }, [])

  const open = useCallback((view) => {
    if (!view) return
    if (view === 'home') onFooterNav?.('HOME')
    else onNavigate?.(view)
  }, [onNavigate, onFooterNav])

  useEffect(() => {
    const onKey = (event) => {
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus() }
      if (event.key === 'Escape') { setPhoto(null); searchRef.current?.blur() }
      const index = Number(event.key)
      if (index >= 1 && index <= MODES.length) open(MODES[index - 1].view)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const threat = home?.threatSummary || null
  const defcon = home?.defcon || null
  const gas = home?.gasPrices || null
  const images = useMemo(() => {
    const fromHome = Array.isArray(home?.homeImages) ? home.homeImages : []
    return (fromHome.length ? fromHome : osintXToImages(home?.osintX)).slice(0, 24)
  }, [home])
  const headlines = useMemo(() => extractHeadlines(home?.news, home?.osintX), [home])
  const signals = useMemo(() => consoleState?.signals || [], [consoleState])
  const consoleNow = consoleState?.computedAt || 0
  const posture = useMemo(() => {
    if (!consoleState) return null
    return computePosture({
      signals,
      convergence: computeConvergence(signals, { now: consoleNow }),
      threat,
      defcon,
      now: consoleNow,
    })
  }, [consoleState, signals, threat, defcon, consoleNow])

  const go = (view) => () => open(view)
  const piece = (value, present) => (bootstrapState === HOME_STATE.LIVE || bootstrapState === HOME_STATE.FAILED) && !present ? undefined : value

  return (
    <div className={`op-console op-dashboard operations-home${isMobileLayout ? ' operations-home--mobile' : ''}`}>
      <header className="op-command-bar">
        <button type="button" className="op-brand" onClick={go('home')} aria-label="Home">
          <img src={BRAND_LOGO_SRC} alt="" />
          <span>{BRAND_LOGO_ALT}</span>
        </button>
        <div className="op-command-search">
          <Search size={14} strokeWidth={1.5} aria-hidden />
          <input ref={searchRef} type="search" placeholder="Search or jump to a mode" aria-label="Search or jump" onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            const q = event.target.value.trim().toLowerCase()
            const match = MODES.find((mode) => mode.label.toLowerCase().includes(q) || mode.id.toLowerCase().includes(q))
            if (match) { open(match.view); event.target.value = '' }
          }} />
          <span className="op-key-hint">/</span>
        </div>
        <div className="op-command-right">
          <Suspense fallback={<span className="op-muted">—</span>}><WorldClock /></Suspense>
          <span className="op-num op-command-clock">{clock.time} UTC · {clock.date}</span>
          {posture ? <span className="op-command-posture op-num">{posture.band} {posture.score}</span> : null}
          <DataFreshness />
          <button type="button" className="op-btn" onClick={() => onFooterNav?.('SETTINGS')} aria-label="Account and settings">
            {user ? String(user.email || user.uid).slice(0, 14) : 'Account'}
          </button>
        </div>
      </header>

      <div className="op-workspace">
        <nav className={`op-rail${railCollapsed ? ' is-collapsed' : ''}`} aria-label="Primary modes">
          <div className="op-rail-head">
            <button type="button" className="op-btn" onClick={() => setRailCollapsed(!railCollapsed)} aria-label="Toggle navigation rail">
              {railCollapsed ? <ChevronRight size={14} strokeWidth={1.5} /> : <ChevronLeft size={14} strokeWidth={1.5} />}
            </button>
            {!railCollapsed ? <span className="op-rail-label">Modes</span> : null}
          </div>
          <ul>
            {MODES.map((mode, index) => {
              const Icon = mode.icon
              const count = mode.id === 'BATMAN' ? cases.length : mode.id === 'FEEDS' ? headlines.length : null
              return (
                <li key={mode.id}>
                  <button type="button" className={mode.id === 'HOME' ? 'is-on' : ''} onClick={() => open(mode.view)} title={mode.label}>
                    <Icon size={15} strokeWidth={1.5} aria-hidden />
                    {!railCollapsed ? <span className="op-rail-label">{mode.label}</span> : null}
                    {!railCollapsed && count != null ? <b className="op-num">{count}</b> : null}
                    {!railCollapsed ? <em className="op-num">{index + 1}</em> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <main className="op-grid">
          <Panel index="01" title="Situation" area="sit" meta={threat?.threat_level || '—'} onOpen={go('batman-overview')} refreshing={bootstrapState === HOME_STATE.WAKING}>
            <div className="op-tabs" role="tablist">
              {['situation', 'conflict', 'outages'].map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'is-on' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>
              ))}
            </div>
            {activeTab === 'situation' ? (
              threat ? (
                <div className="op-situation">
                  <div className="op-stat-row">
                    <div><span className="op-stat-label">Threat level</span><strong className="op-num op-stat-value">{threat.threat_level || '—'}</strong></div>
                    <div><span className="op-stat-label">Average</span><strong className="op-num op-stat-value">{Number(threat.average_score || 0).toFixed(1)}<small>/5</small></strong></div>
                    <div><span className="op-stat-label">High risk</span><strong className="op-num op-stat-value">{threat.high_risk_count ?? '—'}</strong></div>
                  </div>
                  <div className="op-defcon">
                    <span className="op-stat-label">DEFCON</span>
                    <div className="op-defcon-scale">
                      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={defcon?.level === n ? 'is-on op-num' : 'op-num'}>{n}</span>)}
                    </div>
                    <span className="op-muted">{defcon?.label || '—'}</span>
                  </div>
                  <div className="op-clock-line">
                    <span className="op-num">{DOOMSDAY_SECONDS}s to midnight</span>
                    <span className="op-clock-track"><i style={{ width: `${((threat.threat_score || 2) / 5) * 100}%` }} /></span>
                  </div>
                  {threat.narrative ? <p className="op-narrative">{threat.narrative}</p> : threat.summary ? <p className="op-narrative">{threat.summary}</p> : null}
                  {Array.isArray(threat.bullets) && threat.bullets.length ? (
                    <ul className="op-bullets">{threat.bullets.slice(0, 5).map((b, i) => <li key={i}>{b}</li>)}</ul>
                  ) : null}
                  {Array.isArray(threat.sources) && threat.sources.length ? <p className="op-faint">Sources: {threat.sources.slice(0, 6).join(', ')}</p> : null}
                  <div className="op-panel-actions">
                    <button type="button" className="op-btn" onClick={() => refreshHomeNow({ force: true })}>Refresh</button>
                    <span className="op-faint op-num">Updated {ago(threat.timestamp)}</span>
                  </div>
                </div>
              ) : <Skeleton rows={5} label="Loading threat summary" />
            ) : activeTab === 'conflict' ? (
              <Suspense fallback={<Skeleton />}><StrategicOverviewWidget bootstrapState={bootstrapState} /></Suspense>
            ) : (
              <Suspense fallback={<Skeleton />}><PanelOutages /></Suspense>
            )}
          </Panel>

          <Panel index="02" title="Live map" area="map" meta="community" onOpen={go('osint-map')} flush>
            <Suspense fallback={<Skeleton rows={6} />}><CommunityMapView variant="home" /></Suspense>
          </Panel>

          <Panel index="03" title="Headlines" area="news" meta={`${headlines.length} items`} onOpen={go('news-feeds')}>
            {headlines.length ? (
              <ul className="op-headlines">
                {headlines.map((item) => (
                  <li key={item.id}>
                    <span className="op-headline-meta"><b>{item.source}</b> <span className="op-num">{item.time ? ago(item.time) : '—'}</span></span>
                    <a href={item.url || '#'} target="_blank" rel="noopener noreferrer">{item.title}</a>
                  </li>
                ))}
              </ul>
            ) : <Skeleton rows={6} />}
          </Panel>

          <Panel index="04" title="X / OSINT" area="x" meta={`${images.length} images`} onOpen={go('osint-x')}>
            {images.length ? (
              <div className="op-filmstrip">
                {images.map((item, i) => (
                  <div className="op-film-cell has-item-menu" key={`${item.src}-${i}`}>
                    <button type="button" onClick={() => setPhoto(item)} aria-label="Expand image"><img {...xImageProps(item.src)} alt="" loading="lazy" /></button>
                    <ItemMenu item={{ type: 'article', kind: 'image', title: item.caption || 'Photo', url: item.postUrl || '', image: item.src || '' }} />
                  </div>
                ))}
              </div>
            ) : <Skeleton rows={3} />}
          </Panel>

          <Panel index="05" title="Markets" area="mkt" onOpen={go('home')}>
            <div className="op-split">
              <Suspense fallback={<Skeleton />}><StockWidget onOpenSettings={() => open('settings')} initialData={piece(home?.stocks, Boolean(home?.stocks?.current))} bootstrapState={bootstrapState} /></Suspense>
              <div className="op-gas">
                <span className="op-stat-label">US gasoline</span>
                <strong className="op-num op-stat-value">{gas?.national != null ? `$${Number(gas.national).toFixed(2)}` : (gas?.gasoline?.national != null ? `$${Number(gas.gasoline.national).toFixed(2)}` : '—')}</strong>
                {gas?.sourceLabel ? <span className="op-faint">{gas.sourceLabel}</span> : null}
                {gas?.asOf ? <span className="op-faint op-num">Week ending {gas.asOf}</span> : null}
              </div>
            </div>
          </Panel>

          <Panel index="06" title="Hazards" area="hzd" onOpen={go(WEATHER_VIEW_ID)}>
            <Suspense fallback={<Skeleton />}><EarthquakesWidget onShowOnMap={onShowLocationOnMap} initialData={piece(home?.earthquakes, Array.isArray(home?.earthquakes?.events) && home.earthquakes.events.length > 0)} bootstrapState={bootstrapState} /></Suspense>
          </Panel>

          <Panel index="07" title="Orbital" area="orb" onOpen={go('batman-overview')}>
            <Suspense fallback={<Skeleton />}><SpaceWidget initialData={piece(home?.space, Boolean(home?.space?.eonet || home?.space?.apod))} bootstrapState={bootstrapState} /></Suspense>
            <Suspense fallback={<Skeleton />}><NextLaunchWidget bootstrapState={bootstrapState} /></Suspense>
          </Panel>

          <Panel index="08" title="Batman" area="bat" onOpen={go('batman-cases')}>
            {cases.length ? (
              <ul className="op-cases">
                {cases.map((item) => <li key={item.id}><button type="button" onClick={() => open('batman-cases')}>{item.title || 'Untitled case'}</button><span className="op-num">{(item.nodes || []).length}</span></li>)}
              </ul>
            ) : <p className="op-muted">No cases yet.</p>}
            <button type="button" className="op-btn op-btn-primary" onClick={() => open('batman-cases')}>New case</button>
          </Panel>

          <Panel index="09" title="Bulletin" area="bul" onOpen={go('bulletin')}>
            <LatestBulletin onOpen={() => open('bulletin')} />
          </Panel>

          <Panel index="10" title="Crime" area="crime" onOpen={go(CRIME_VIEW_ID)}>
            <p className="op-muted">National crime snapshot, state and city detail.</p>
            <button type="button" className="op-btn" onClick={() => open(CRIME_VIEW_ID)}>Open Crime Intelligence</button>
          </Panel>
        </main>
      </div>

      {photo ? (
        <div className="op-photo-backdrop" role="dialog" aria-modal="true" aria-label="OSINT photo" onClick={() => setPhoto(null)}>
          <div className="op-photo" onClick={(event) => event.stopPropagation()}>
            <img {...xImageProps(photo.src)} alt="" />
            {photo.caption ? <p>{photo.caption}</p> : null}
            <div className="op-panel-actions">
              {photo.postUrl ? <a href={photo.postUrl} target="_blank" rel="noopener noreferrer" className="op-btn">Open original post</a> : null}
              <button type="button" className="op-btn" onClick={() => setPhoto(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}

      {isMobileLayout ? (
        <nav className="op-mobile-modes" aria-label="Modes">
          {MODES.slice(0, 6).map((mode) => {
            const Icon = mode.icon
            return <button key={mode.id} type="button" onClick={() => open(mode.view)} aria-label={mode.label}><Icon size={16} strokeWidth={1.5} /></button>
          })}
          <button type="button" onClick={() => setRailOpen(!railOpen)} aria-label="More modes"><Menu size={16} strokeWidth={1.5} /></button>
        </nav>
      ) : null}
    </div>
  )
}

/** Outage panel tab, kept lazy so its API call is never made unless opened. */
function PanelOutages() {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/outages/internet`, { signal: AbortSignal.timeout(8000) })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setRows(Array.isArray(data?.countries) ? data.countries : []) })
      .catch(() => { if (!cancelled) setRows([]) })
    return () => { cancelled = true }
  }, [])
  if (!rows) return <Skeleton rows={4} />
  if (!rows.length) return <p className="op-muted">No active internet outages published.</p>
  return <ul className="op-bullets">{rows.slice(0, 8).map((row, i) => <li key={i}>{row.country || row.name || 'Unknown'}</li>)}</ul>
}
