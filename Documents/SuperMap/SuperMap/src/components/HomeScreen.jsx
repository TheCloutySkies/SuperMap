import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import axios from 'axios'
import RadialMenu from './RadialMenu'
import { CRIME_VIEW_ID, BRAND_LOGO_SRC, BRAND_LOGO_ALT } from '../constants'
import './HomeScreen.css'
import './widgets/widgets.css'
import {
  getApiBase,
  readHomeSnapshot,
  writeHomeSnapshot,
  fetchHomeBootstrap,
  osintXToImages,
} from '../lib/homeBootstrap'

const StockWidget = lazy(() => import('./widgets/StockWidget'))
const WorldClock = lazy(() => import('./widgets/WorldClock'))
const SpaceWidget = lazy(() => import('./widgets/SpaceWidget'))
const HeadlinesWidget = lazy(() => import('./widgets/HeadlinesWidget'))
const EarthquakesWidget = lazy(() => import('./widgets/EarthquakesWidget'))

const API_BASE = getApiBase()

const DOOMSDAY_CLOCK_SECONDS = 85
const DOOMSDAY_CLOCK_URL = 'https://thebulletin.org/doomsday-clock/#nav_menu'

const QUICK_LINKS = [
  { id: 'osint-map', label: 'OSINT Map', desc: 'View news, intel, and events on the map', icon: '🗺️', path: 'osint-map' },
  { id: 'conflict-map', label: 'Conflict Map', desc: 'Tactical and conflict layers', icon: '⚔️', path: 'conflict-map' },
  { id: CRIME_VIEW_ID, label: 'Crime Intelligence', desc: 'National snapshot, state & city detail, ask ThiellBot', icon: '📉', path: CRIME_VIEW_ID },
  { id: 'news-feeds', label: 'News Feeds', desc: 'Wikipedia, Reddit, Google News, BBC', icon: '📰', path: 'news-feeds' },
  { id: 'osint-feeds', label: 'OSINT Feeds', desc: 'Bellingcat, CISA, DW, tactical intel', icon: '📡', path: 'osint-feeds' },
  { id: 'osint-x', label: 'OSINT (X)', desc: 'Posts from OSINT X/Twitter accounts via FxTwitter', icon: '𝕏', path: 'osint-x' },
  { id: 'report-maker', label: 'Report Maker', desc: 'Build and save intelligence reports', icon: '📝', path: 'report-maker' },
  { id: 'resources', label: 'Resources', desc: 'Open OSINT tools and reference resources', icon: '📚', path: 'resources' },
]

function formatDate() {
  const d = new Date()
  const month = d.toLocaleString('en-US', { month: 'long' })
  const day = d.getDate()
  const year = d.getFullYear()
  return `${month} ${day} | ${year}`
}

function normalizeGasPrices(data) {
  if (!data || typeof data !== 'object') return null
  const src = String(data.source || '')
  // Reject legacy seed/stale snapshots so we never paint a fake national average.
  if (data._stale || /(?:^|-)(stale|seed)$/i.test(src) || /seed|stale/i.test(src)) {
    return {
      ok: false,
      gasUnavailable: true,
      national: null,
      regions: [],
      states: [],
      unit: data.unit || 'USD/gal',
      error: 'Waiting for live EIA weekly prices (cached estimate discarded).',
      source: null,
    }
  }
  return data
}

function applyHomePayload(data, setters) {
  if (!data) return
  const {
    setThreatSummary,
    setThreatSummaryError,
    setThreatSummaryLoading,
    setDefcon,
    setHomeXImages,
    setGasPricesStates,
    setGasPrices,
    setGasPricesError,
    setGasPricesLoading,
    setWidgetBootstrap,
  } = setters
  if (data.threatSummary) {
    setThreatSummary(data.threatSummary)
    setThreatSummaryError(null)
    setThreatSummaryLoading(false)
  }
  if (data.defcon && (data.defcon.level != null || data.defcon.label)) setDefcon(data.defcon)
  // Prefer dedicated homeImages (FxTwitter); fall back to osint-x post images
  const fromHome = Array.isArray(data.homeImages) ? data.homeImages : []
  const fromOsint = osintXToImages(data.osintX)
  if (fromHome.length || fromOsint.length) {
    setHomeXImages(fromHome.length ? fromHome : fromOsint)
  }
  if (Array.isArray(data.gasStates)) setGasPricesStates(data.gasStates)
  if (data.gasPrices) {
    const gas = normalizeGasPrices(data.gasPrices)
    setGasPrices(gas)
    setGasPricesError(gas?.gasUnavailable ? (gas.error || null) : null)
    setGasPricesLoading(false)
  }
  setWidgetBootstrap({
    news: data.news || null,
    stocks: data.stocks || null,
    earthquakes: data.earthquakes || null,
    space: data.space || null,
  })
}

export default function HomeScreen({
  onNavigate,
  footerMode,
  onFooterNav,
  footerTabs,
  isMobileLayout,
  activeView = null,
  onShowLocationOnMap,
  onHomeBootstrap,
}) {
  const initialSnap = useRef(typeof window !== 'undefined' ? readHomeSnapshot() : null)
  const snap = initialSnap.current

  const [homeXImages, setHomeXImages] = useState(() => {
    const fromHome = Array.isArray(snap?.homeImages) ? snap.homeImages : []
    return fromHome.length ? fromHome : osintXToImages(snap?.osintX)
  })
  const [homeXImagesLoading, setHomeXImagesLoading] = useState(false)
  const [threatSummary, setThreatSummary] = useState(() => snap?.threatSummary || null)
  const [threatSummaryLoading, setThreatSummaryLoading] = useState(() => !snap?.threatSummary)
  const [threatSummaryError, setThreatSummaryError] = useState(null)
  const [defcon, setDefcon] = useState(() =>
    snap?.defcon && (snap.defcon.level != null || snap.defcon.label) ? snap.defcon : null
  )
  const [osintPhotoModal, setOsintPhotoModal] = useState(null)
  const [gasPrices, setGasPrices] = useState(() => normalizeGasPrices(snap?.gasPrices) || null)
  const [gasPricesLoading, setGasPricesLoading] = useState(false)
  const [gasPricesError, setGasPricesError] = useState(null)
  const [gasPricesStates, setGasPricesStates] = useState(() =>
    Array.isArray(snap?.gasStates) ? snap.gasStates : []
  )
  const [selectedGasState, setSelectedGasState] = useState('')
  const [widgetBootstrap, setWidgetBootstrap] = useState(() => ({
    news: snap?.news || null,
    stocks: snap?.stocks || null,
    earthquakes: snap?.earthquakes || null,
    space: snap?.space || null,
  }))
  const skipInitialGasFetch = useRef(true) // national gas comes from /api/home; only refetch on state pick
  const notifiedBootstrap = useRef(false)

  const payloadSetters = {
    setThreatSummary,
    setThreatSummaryError,
    setThreatSummaryLoading,
    setDefcon,
    setHomeXImages,
    setGasPricesStates,
    setGasPrices,
    setGasPricesError,
    setGasPricesLoading,
    setWidgetBootstrap,
  }

  const goHomeHub = () => {
    onFooterNav?.('HOME')
  }

  const fetchThreatSummary = (refresh = false) => {
    if (!API_BASE) return
    if (refresh) {
      setThreatSummary(null)
      setThreatSummaryError(null)
    }
    setThreatSummaryLoading(true)
    const url = refresh
      ? `${API_BASE}/api/threat-summary?refresh=1&_=${Date.now()}`
      : `${API_BASE}/api/threat-summary`
    axios.get(url, { timeout: 95000 })
      .then((res) => {
        setThreatSummary(res.data || null)
        setThreatSummaryError(null)
        if (res.data) {
          const prev = readHomeSnapshot() || {}
          writeHomeSnapshot({ ...prev, threatSummary: res.data })
        }
      })
      .catch((err) => {
        setThreatSummaryError(err.message || 'Failed to load threat summary')
        if (!refresh) setThreatSummary(null)
      })
      .finally(() => setThreatSummaryLoading(false))
  }

  const fetchHomeXImages = (force = false) => {
    if (!API_BASE) return
    setHomeXImagesLoading(true)
    const url = force
      ? `${API_BASE}/api/home-images?refresh=1&limit=24&_=${Date.now()}`
      : `${API_BASE}/api/home-images?limit=24`
    axios.get(url, { timeout: 60000, headers: force ? { 'Cache-Control': 'no-cache' } : undefined })
      .then((res) => {
        const images = Array.isArray(res.data?.images) ? res.data.images : []
        setHomeXImages(images)
        if (images.length) {
          const prev = readHomeSnapshot() || {}
          writeHomeSnapshot({ ...prev, homeImages: images })
        }
      })
      .catch(() => {
        if (force) {
          // Keep existing gallery on force-refresh failure
        } else {
          setHomeXImages([])
        }
      })
      .finally(() => setHomeXImagesLoading(false))
  }

  // Single /api/home bootstrap (hydrate from snapshot already done via useState init)
  useEffect(() => {
    if (!API_BASE) {
      setThreatSummaryLoading(false)
      return
    }
    if (snap && !notifiedBootstrap.current) {
      notifiedBootstrap.current = true
      onHomeBootstrap?.(snap)
    }
    let cancelled = false
    fetchHomeBootstrap({ timeoutMs: 90000 }).then(({ data }) => {
      if (cancelled || !data) {
        if (!cancelled && !snap?.threatSummary) setThreatSummaryLoading(false)
        return
      }
      applyHomePayload(data, payloadSetters)
      onHomeBootstrap?.(data)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, [])

  const fetchGasPrices = (force = false) => {
    if (!API_BASE) return
    setGasPricesLoading(true)
    setGasPricesError(null)
    const params = {}
    if (selectedGasState) params.state = selectedGasState
    if (force) {
      params.refresh = '1'
      params._ = Date.now()
    }
    axios.get(`${API_BASE}/api/gas-prices`, {
      params,
      timeout: 35000,
      headers: force ? { 'Cache-Control': 'no-cache' } : undefined,
    })
      .then((res) => {
        const gas = normalizeGasPrices(res.data)
        setGasPrices(gas)
        setGasPricesError(gas?.gasUnavailable ? (gas.error || 'Gas prices unavailable') : null)
      })
      .catch((err) => {
        setGasPricesError(err.message || 'Failed to load gas prices')
        setGasPrices({
          ok: false,
          gasUnavailable: true,
          national: null,
          regions: [],
          states: [],
          unit: 'USD/gal',
          error: err.message || 'Failed to load gas prices',
        })
      })
      .finally(() => setGasPricesLoading(false))
  }

  // Gas prices: skip first national fetch when bootstrap already supplied *live* data; refetch on state change or stale discard
  useEffect(() => {
    if (!API_BASE) return
    const bootLive = gasPrices && !gasPrices.gasUnavailable && gasPrices.ok !== false && gasPrices.national != null
    if (!selectedGasState && skipInitialGasFetch.current && bootLive) {
      skipInitialGasFetch.current = false
      return
    }
    skipInitialGasFetch.current = false
    fetchGasPrices(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only on state pick; force refresh is manual
  }, [selectedGasState])

  const gasNeedsRetry =
    !gasPricesLoading && (
      !gasPrices ||
      Boolean(gasPricesError) ||
      gasPrices.gasUnavailable ||
      gasPrices.ok === false ||
      (
        gasPrices.national == null &&
        !(Array.isArray(gasPrices.states) && gasPrices.states.some((s) => s?.price != null)) &&
        !(Array.isArray(gasPrices.regions) && gasPrices.regions.length > 0)
      )
    )

  const handleCardClick = (path) => {
    if (onNavigate && path) onNavigate(path)
  }

  return (
    <div className={`home-screen ${isMobileLayout ? 'home-screen--mobile' : ''}`}>
      <div className="home-screen-map-bg" aria-hidden />
      <div className="home-screen-frame">
        <header className="home-screen-header">
          <div className="home-screen-header-brand">
            <h1 className="home-screen-logo">
              <img src={BRAND_LOGO_SRC} alt={BRAND_LOGO_ALT} className="home-screen-logo-img" />
              <span className="sr-only">Good Palantir</span>
            </h1>
            <span className="home-screen-date">{formatDate()}</span>
          </div>
        </header>

        {/* Desktop: ModeRail is the sole primary mode switcher. Radial is mobile-only. */}
        {isMobileLayout && (
          <section className="home-screen-radial-wrap" aria-label="Mode menu">
            <p className="home-screen-radial-hint">Tap a mode to open it</p>
            <RadialMenu
              activeMode={footerMode === 'HOME' ? null : footerMode}
              activeView={activeView}
              onSelectHome={goHomeHub}
              onSelectMode={(item) => {
                if (item?.viewId) {
                  onNavigate?.(item.viewId)
                  return
                }
                onFooterNav?.(item?.id || item)
              }}
            />
          </section>
        )}

        <div className="home-screen-main">
          <div className="home-screen-main-left">
            {!isMobileLayout && (
              <div className="home-screen-featured">
                <p className="home-screen-featured-title">Welcome to Good Palantir</p>
                <p className="home-screen-featured-sub">See current events, use the maps to see what&apos;s going on around you, and a huge library of OSINT resources, all at your fingertips. It&apos;s kind of like a personal Palantir if Palantir wasn&apos;t evil and ushering in a surveillance state.</p>
              </div>
            )}
            <section className="home-screen-section home-screen-threat">
              <div className="home-screen-threat-head">
                <h2 className="home-screen-section-title">Today&apos;s Threat Summary <span className="home-screen-threat-byline">by ThiellBot</span></h2>
                <a href={DOOMSDAY_CLOCK_URL} target="_blank" rel="noopener noreferrer" className="home-screen-threat-info" title="About the Doomsday Clock (Bulletin of the Atomic Scientists)" aria-label="About the Doomsday Clock">ℹ️</a>
              </div>
              {threatSummaryLoading && (
                <p className="home-screen-threat-loading">Loading threat summary…</p>
              )}
              {threatSummaryError && !threatSummary && (
                <p className="home-screen-threat-error">Threat summary unavailable. Ensure the API is running and Groq/Ollama is configured.</p>
              )}
              {!threatSummaryLoading && threatSummary && (
                <div className="home-screen-threat-card card-y2k">
                  <div className="home-screen-threat-level-wrap">
                    <span className="home-screen-threat-level-label">Threat Level</span>
                    <span className={`home-screen-threat-level home-screen-threat-level--${(threatSummary.threat_level || 'GUARDED').toLowerCase()}`}>
                      {threatSummary.threat_level || 'GUARDED'}
                    </span>
                    {threatSummary.high_risk_count > 0 && (
                      <span className="home-screen-threat-high-count" title="Items scored 4–5 in the last 24h">
                        {threatSummary.high_risk_count} high-risk
                      </span>
                    )}
                  </div>
                  {defcon?.url && (
                    <div className="home-screen-threat-defcon">
                      <span className="home-screen-threat-defcon-label">DEFCON (defconlevel.com)</span>
                      <div className="home-screen-threat-defcon-graphic" role="img" aria-label={`DEFCON level ${defcon.level ?? '—'}`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span
                            key={n}
                            className={`home-screen-threat-defcon-segment ${defcon.level != null && n === defcon.level ? 'home-screen-threat-defcon-segment--active' : ''}`}
                            title={n === (defcon.level ?? 0) ? `Current: DEFCON ${n}` : `DEFCON ${n}`}
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                      <a href={defcon.url} target="_blank" rel="noopener noreferrer" className="home-screen-threat-defcon-link">
                        {defcon.label ?? 'Current level'} · defconlevel.com
                      </a>
                    </div>
                  )}
                  <div className="home-screen-threat-clock">
                    <span className="home-screen-threat-clock-text">
                      <a href={DOOMSDAY_CLOCK_URL} target="_blank" rel="noopener noreferrer" className="home-screen-threat-clock-link">{DOOMSDAY_CLOCK_SECONDS} seconds to midnight</a>
                      <span className="home-screen-threat-clock-byline"> (Doomsday Clock · Bulletin of the Atomic Scientists, 2026)</span>
                    </span>
                    <div className="home-screen-threat-clock-bar" role="presentation">
                      <div
                        className="home-screen-threat-clock-fill"
                        style={{ width: `${((threatSummary.threat_score || 2) / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                  {threatSummary.narrative ? (
                    <div className="home-screen-threat-narrative">
                      {threatSummary.narrative.split(/\n\s*\n+/).map((para, i) => (
                        <p key={i} className="home-screen-threat-summary-text">{para.trim()}</p>
                      ))}
                    </div>
                  ) : null}
                  {!threatSummary.narrative && !(Array.isArray(threatSummary.bullets) && threatSummary.bullets.length > 0) && threatSummary.summary && (
                    <p className="home-screen-threat-summary-text">{threatSummary.summary}</p>
                  )}
                  {Array.isArray(threatSummary.bullets) && threatSummary.bullets.length > 0 && (
                    <div className="home-screen-threat-bullets-wrap">
                      <h3 className="home-screen-threat-bullets-title">
                        {threatSummary.narrative ? 'Key points' : 'Key developments'}
                      </h3>
                      <ul className="home-screen-threat-bullets">
                        {threatSummary.bullets.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {threatSummary.sources && threatSummary.sources.length > 0 && (
                    <p className="home-screen-threat-sources">
                      Sources: {threatSummary.sources.slice(0, 8).join(', ')}
                      {threatSummary.sources.length > 8 ? ' …' : ''}
                    </p>
                  )}
                  <div className="home-screen-threat-actions">
                    <button type="button" className="home-screen-threat-refresh btn-y2k" onClick={() => fetchThreatSummary(true)} disabled={threatSummaryLoading} title="Refresh threat summary">
                      {threatSummaryLoading ? 'Refreshing…' : 'Refresh summary'}
                    </button>
                    <p className="home-screen-threat-updated">
                      Updated: {threatSummary.timestamp ? new Date(threatSummary.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      {threatSummary.fallback && <span className="home-screen-threat-fallback"> (title-only summary)</span>}
                    </p>
                  </div>
                </div>
              )}
            </section>
            <section className="home-screen-section">
              <h2 className="home-screen-section-title">Quick access</h2>
              <ul className="home-screen-list">
                {QUICK_LINKS.map((link) => (
                  <li key={link.id}>
                    <button
                      type="button"
                      className="home-screen-card"
                      onClick={() => handleCardClick(link.path)}
                    >
                      <span className="home-screen-card-icon" aria-hidden>{link.icon}</span>
                      <div className="home-screen-card-text">
                        <span className="home-screen-card-title">{link.label}</span>
                        <span className="home-screen-card-desc">{link.desc}</span>
                      </div>
                      <span className="home-screen-card-arrow">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="home-screen-section home-screen-gas-prices card-y2k" id="gas-prices">
              <div className="home-screen-gas-prices-header">
                <h2 className="home-screen-section-title">Gas Prices (US)</h2>
                <button
                  type="button"
                  className={`home-screen-gas-prices-refresh btn-y2k${gasNeedsRetry ? ' home-screen-gas-prices-refresh--prominent' : ''}`}
                  onClick={() => fetchGasPrices(true)}
                  disabled={gasPricesLoading}
                  title="Refresh gas prices"
                  aria-label="Refresh gas prices"
                >
                  {gasPricesLoading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              {gasPricesStates.length > 0 && (
                <div className="home-screen-gas-prices-controls">
                  <label htmlFor="gas-prices-state" className="home-screen-gas-prices-label">State</label>
                  <select
                    id="gas-prices-state"
                    className="home-screen-gas-prices-select"
                    value={selectedGasState}
                    onChange={(e) => setSelectedGasState(e.target.value)}
                    aria-label="Select state for gas prices"
                  >
                    <option value="">All regions</option>
                    {gasPricesStates.map((st) => (
                      <option key={st.code} value={st.code}>{st.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {gasPricesLoading && (
                <p className="home-screen-gas-prices-loading">Loading live EIA weekly prices…</p>
              )}
              {gasPricesError && !gasPrices && (
                <p className="home-screen-gas-prices-error">
                  {gasPricesError} Tap Refresh to try again.
                </p>
              )}
              {!gasPricesLoading && gasPrices && (gasPrices.gasUnavailable || gasPrices.ok === false) && (
                <p className="home-screen-gas-prices-no-data">
                  {gasPrices.error || 'Live gas prices unavailable right now. No estimate shown.'}
                  {' '}Tap Refresh to try again.
                </p>
              )}
              {!gasPricesLoading && gasPrices && !gasPrices.gasUnavailable && gasPrices.ok !== false && (
                <>
                  {Array.isArray(gasPrices.states) && gasPrices.states.length > 0 && gasPrices.states[0].price != null ? (
                    <>
                      <div className="home-screen-gas-prices-national">
                        <span className="home-screen-gas-prices-state-label">{gasPrices.states[0].name}</span>
                        <span className="home-screen-gas-prices-value">${Number(gasPrices.states[0].price).toFixed(2)}</span>
                        <span className="home-screen-gas-prices-unit">{gasPrices.unit}</span>
                      </div>
                      {gasPrices.states[0].useRegionalFallback && (
                        <p className="home-screen-gas-prices-no-data home-screen-gas-prices-estimate-note">
                          No state series published; showing {gasPrices.states[0].regionLabel || 'regional'} (PADD) average.
                        </p>
                      )}
                      {gasPrices.national != null && !gasPrices.states[0].useRegionalFallback && (
                        <p className="home-screen-gas-prices-us-avg">US avg ${Number(gasPrices.national).toFixed(2)} {gasPrices.unit}</p>
                      )}
                    </>
                  ) : gasPrices.stateUnavailable ? (
                    <p className="home-screen-gas-prices-no-data">
                      No EIA state or regional series for this selection. Try another state or All regions.
                    </p>
                  ) : gasPrices.national != null ? (
                    <div className="home-screen-gas-prices-national">
                      <span className="home-screen-gas-prices-state-label">US average</span>
                      <span className="home-screen-gas-prices-value">${Number(gasPrices.national).toFixed(2)}</span>
                      <span className="home-screen-gas-prices-unit">{gasPrices.unit}</span>
                    </div>
                  ) : (
                    <p className="home-screen-gas-prices-no-data">
                      No price rows in the EIA response. Tap Refresh to try again.
                    </p>
                  )}
                  {Array.isArray(gasPrices.regions) && gasPrices.regions.length > 0 && !selectedGasState && (
                    <ul className="home-screen-gas-prices-regions">
                      {gasPrices.regions.map((r) => (
                        <li key={r.name}>
                          <span className="home-screen-gas-prices-region-name">{r.name}</span>
                          <span className="home-screen-gas-prices-region-price">${Number(r.price).toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(gasPrices.asOf || gasPrices.weekEnding || gasPrices.releaseDate || gasPrices.sourceLabel) && (
                    <p className="home-screen-gas-prices-source">
                      {gasPrices.sourceLabel || 'EIA'}
                      {gasPrices.asOf || gasPrices.weekEnding
                        ? ` · week ending ${gasPrices.asOf || gasPrices.weekEnding}`
                        : ''}
                      {gasPrices.releaseDate ? ` · released ${gasPrices.releaseDate}` : ''}
                    </p>
                  )}
                </>
              )}
            </section>
            <section className="home-screen-section home-screen-photos-main card-y2k">
              <div className="home-screen-photos-header">
                <h2 className="home-screen-section-title">Latest Images from X</h2>
                <button
                  type="button"
                  className="home-screen-photos-refresh btn-y2k"
                  onClick={() => fetchHomeXImages(true)}
                  disabled={homeXImagesLoading}
                  title="Force refresh images from FxTwitter"
                >
                  {homeXImagesLoading ? 'Refreshing…' : 'Refresh images'}
                </button>
              </div>
              {homeXImages.length > 0 ? (
                <div className="home-screen-photos-main-grid">
                  {homeXImages.map((item, i) => (
                    <div
                      key={`${item.src}-${i}`}
                      className="home-screen-photos-main-wrap"
                      onMouseEnter={(e) => e.currentTarget.classList.add('is-hover')}
                      onMouseLeave={(e) => e.currentTarget.classList.remove('is-hover')}
                    >
                      <button
                        type="button"
                        className="home-screen-photos-main-thumb"
                        onClick={() => setOsintPhotoModal(item)}
                        title="Expand"
                      >
                        <img src={item.src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        <span className="home-screen-photos-main-overlay">Expand</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="home-screen-hint">
                  {homeXImagesLoading
                    ? 'Loading OSINT images from FxTwitter…'
                    : 'No live OSINT images right now. Photos load from public FxTwitter timelines (no API key) — tap Refresh images to try again.'}
                </p>
              )}
            </section>
          </div>
          <aside className="home-screen-sidebar">
            <Suspense fallback={<div className="home-screen-sidebar-block card-y2k widget-card"><p className="widget-card-loading">Loading widgets…</p></div>}>
              <div id="stocks"><StockWidget onOpenSettings={() => onNavigate?.('settings')} initialData={widgetBootstrap.stocks} /></div>
              <div id="headlines"><HeadlinesWidget initialNews={widgetBootstrap.news} /></div>
              <div id="earthquakes"><EarthquakesWidget onShowOnMap={onShowLocationOnMap} initialData={widgetBootstrap.earthquakes} /></div>
              <div id="world-clock"><WorldClock /></div>
              <div id="space"><SpaceWidget initialData={widgetBootstrap.space} /></div>
            </Suspense>
            {osintPhotoModal && (
              <div className="home-screen-photo-dialog-backdrop" role="dialog" aria-modal="true" aria-label="OSINT photo" onClick={() => setOsintPhotoModal(null)}>
                <div className="home-screen-photo-dialog" onClick={(e) => e.stopPropagation()}>
                  <img src={osintPhotoModal.src} alt="" className="home-screen-photo-dialog-img" />
                  {osintPhotoModal.caption && <p className="home-screen-photo-dialog-caption">{osintPhotoModal.caption}</p>}
                  <div className="home-screen-photo-dialog-actions">
                    <a href={osintPhotoModal.postUrl} target="_blank" rel="noopener noreferrer" className="btn-y2k home-screen-photo-dialog-link">Open original post</a>
                    <button type="button" className="btn-y2k" onClick={() => setOsintPhotoModal(null)}>Close</button>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>

        {!isMobileLayout && (
        <footer className="home-screen-footer-strip">
          <div className="home-screen-footer-col">
            <h3 className="home-screen-footer-head">Quick access</h3>
            <ul className="home-screen-footer-list">
              {QUICK_LINKS.slice(0, 4).map((link) => (
                <li key={link.id}>
                  <button type="button" className="home-screen-footer-link" onClick={() => handleCardClick(link.path)}>{link.label}</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="home-screen-footer-col">
            <h3 className="home-screen-footer-head">Navigate</h3>
            <ul className="home-screen-footer-list">
              {footerTabs?.map(({ key, label }) => (
                <li key={key}>
                  <button type="button" className="home-screen-footer-link" onClick={() => onFooterNav?.(key)}>{label}</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="home-screen-footer-col">
            <h3 className="home-screen-footer-head">Source</h3>
            <a href="https://github.com/TheCloutySkies/SuperMap" target="_blank" rel="noopener noreferrer" className="home-screen-footer-link home-screen-footer-link--anchor">
              Good Palantir on GitHub
            </a>
          </div>
        </footer>
        )}
      </div>
    </div>
  )
}
