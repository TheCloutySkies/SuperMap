import { useState, useEffect, lazy, Suspense } from 'react'
import axios from 'axios'
import HeaderAuth from './HeaderAuth'
import './HomeScreen.css'
import './widgets/widgets.css'

const StockWidget = lazy(() => import('./widgets/StockWidget'))
const WorldClock = lazy(() => import('./widgets/WorldClock'))
const SpaceWidget = lazy(() => import('./widgets/SpaceWidget'))
const HeadlinesWidget = lazy(() => import('./widgets/HeadlinesWidget'))
const EarthquakesWidget = lazy(() => import('./widgets/EarthquakesWidget'))

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

const DOOMSDAY_CLOCK_SECONDS = 85
const DOOMSDAY_CLOCK_URL = 'https://thebulletin.org/doomsday-clock/#nav_menu'

const QUICK_LINKS = [
  { id: 'osint-map', label: 'OSINT Map', desc: 'View news, intel, and events on the map', icon: '🗺️', path: 'osint-map' },
  { id: 'conflict-map', label: 'Conflict Map', desc: 'Tactical and conflict layers', icon: '⚔️', path: 'conflict-map' },
  { id: 'news-feeds', label: 'News Feeds', desc: 'Wikipedia, Reddit, Google News, BBC', icon: '📰', path: 'news-feeds' },
  { id: 'osint-feeds', label: 'OSINT Feeds', desc: 'Bellingcat, CISA, DW, tactical intel', icon: '📡', path: 'osint-feeds' },
  { id: 'osint-x', label: 'OSINT (X)', desc: 'Posts from OSINT X/Twitter accounts via RSS', icon: '𝕏', path: 'osint-x' },
  { id: 'community', label: 'Community Forum', desc: 'Browse communities and post in the forum', icon: '💬', path: 'community' },
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

function stripHtml(html) {
  if (!html || typeof html !== 'string') return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent || div.innerText || '').trim().slice(0, 100)
}

export default function HomeScreen({ onNavigate, footerMode, onFooterNav, footerTabs, isMobileLayout, onOpenAuth, onNavigateAccount }) {
  const [nitterImages, setNitterImages] = useState([])
  const [forumPosts, setForumPosts] = useState([])
  const [forumCommunities, setForumCommunities] = useState([])
  const [threatSummary, setThreatSummary] = useState(null)
  const [threatSummaryLoading, setThreatSummaryLoading] = useState(true)
  const [threatSummaryError, setThreatSummaryError] = useState(null)
  const [osintPhotoModal, setOsintPhotoModal] = useState(null)
  const [gasPrices, setGasPrices] = useState(null)
  const [gasPricesLoading, setGasPricesLoading] = useState(false)
  const [gasPricesError, setGasPricesError] = useState(null)
  const [gasPricesStates, setGasPricesStates] = useState([])
  const [selectedGasState, setSelectedGasState] = useState('')

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
      })
      .catch((err) => {
        setThreatSummaryError(err.message || 'Failed to load threat summary')
        setThreatSummary(null)
      })
      .finally(() => setThreatSummaryLoading(false))
  }

  useEffect(() => {
    if (!API_BASE) { setThreatSummaryLoading(false); return }
    fetchThreatSummary(false)
  }, [])

  useEffect(() => {
    if (!API_BASE) return
    axios
      .get(`${API_BASE}/api/osint-x`, { params: { limit: 80 }, timeout: 12000 })
      .then((res) => {
        const posts = Array.isArray(res.data) ? res.data : []
        const caption = (p) => (p.content || p.title || '').trim().slice(0, 400)
        const items = posts.flatMap((p) => {
          const postUrl = p.url && typeof p.url === 'string' && p.url.startsWith('http') ? p.url : null
          return (Array.isArray(p.images) ? p.images : [])
            .filter((src) => typeof src === 'string' && src.startsWith('http'))
            .map((src) => ({ src, postUrl: postUrl || src, caption: caption(p) }))
        })
        setNitterImages(items.slice(0, 24))
      })
      .catch(() => setNitterImages([]))
  }, [])

  useEffect(() => {
    if (!API_BASE) return
    Promise.all([
      axios.get(`${API_BASE}/api/forum/posts`, { timeout: 12000 }),
      axios.get(`${API_BASE}/api/forum/communities`, { timeout: 12000 }),
    ])
      .then(([postsRes, communitiesRes]) => {
        const posts = Array.isArray(postsRes.data) ? postsRes.data.slice(0, 10) : []
        const communities = Array.isArray(communitiesRes.data) ? communitiesRes.data : []
        setForumPosts(posts)
        setForumCommunities(communities)
      })
      .catch(() => { setForumPosts([]); setForumCommunities([]) })
  }, [])

  useEffect(() => {
    if (!API_BASE) return
    axios.get(`${API_BASE}/api/gas-prices/states`, { timeout: 5000 })
      .then((res) => setGasPricesStates(Array.isArray(res.data) ? res.data : []))
      .catch(() => setGasPricesStates([]))
  }, [])

  useEffect(() => {
    if (!API_BASE) return
    setGasPricesLoading(true)
    const params = selectedGasState ? { state: selectedGasState } : {}
    axios.get(`${API_BASE}/api/gas-prices`, { params, timeout: 10000 })
      .then((res) => {
        setGasPrices(res.data || null)
        setGasPricesError(null)
      })
      .catch((err) => {
        setGasPricesError(err.message || 'Failed to load gas prices')
        setGasPrices(null)
      })
      .finally(() => setGasPricesLoading(false))
  }, [selectedGasState])

  const handleCardClick = (path) => {
    if (onNavigate && path) onNavigate(path)
  }

  const getCommunityName = (communityId) => {
    const c = forumCommunities.find((x) => x.id === communityId)
    return c?.name || 'Community'
  }

  const handleForumPostClick = (post) => {
    window.location.hash = `#/post/${post.id}`
    if (onNavigate) onNavigate('community')
  }

  return (
    <div className="home-screen">
      <div className="home-screen-map-bg" aria-hidden />
      <div className="home-screen-frame">
        <header className="home-screen-header">
          <div className="home-screen-header-brand">
            <h1 className="home-screen-logo">SuperMap</h1>
            <span className="home-screen-date">{formatDate()}</span>
          </div>
          {footerTabs && onFooterNav && (
            <nav className="home-screen-nav">
              {footerTabs.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`home-screen-nav-tab metallicss ${footerMode === key ? 'active' : ''}`}
                  onClick={() => onFooterNav(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
        </header>

        <div className="home-screen-main">
          <div className="home-screen-main-left">
            <div className="home-screen-featured">
              <p className="home-screen-featured-title">Welcome to SuperMap</p>
              <p className="home-screen-featured-sub">See current events, use the maps to see what&apos;s going on around you, and a huge library of OSINT resources — all at your fingertips. It&apos;s kind of like a personal Palantir if Palantir wasn&apos;t evil and ushering in a surveillance state.</p>
            </div>
            <section className="home-screen-section home-screen-threat">
              <div className="home-screen-threat-head">
                <h2 className="home-screen-section-title">Today&apos;s Threat Summary</h2>
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
                  </div>
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
            <section className="home-screen-section home-screen-forum">
              <h2 className="home-screen-section-title">Community posts</h2>
              {forumPosts.length === 0 ? (
                <p className="home-screen-forum-empty">No forum posts yet. Open Community to browse or post.</p>
              ) : (
                <ul className="home-screen-forum-list">
                  {forumPosts.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="home-screen-forum-item"
                        onClick={() => handleForumPostClick(p)}
                      >
                        <span className="home-screen-forum-item-title">{p.title || 'Untitled'}</span>
                        <span className="home-screen-forum-item-meta">
                          {(p.category || getCommunityName(p.community_id))} · {p.created_at ? new Date(p.created_at).toLocaleDateString(undefined, { dateStyle: 'short' }) : ''}
                        </span>
                        {p.content && (
                          <span className="home-screen-forum-item-preview">{stripHtml(p.content)}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="home-screen-forum-link btn-y2k"
                onClick={() => handleCardClick('community')}
              >
                Open Community →
              </button>
            </section>
            <section className="home-screen-section home-screen-gas-prices card-y2k" id="gas-prices">
              <h2 className="home-screen-section-title">Gas Prices (US)</h2>
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
                <p className="home-screen-gas-prices-loading">Loading…</p>
              )}
              {gasPricesError && !gasPrices && (
                <p className="home-screen-gas-prices-error">{gasPricesError}</p>
              )}
              {!gasPricesLoading && gasPrices && (
                <>
                  {gasPrices.requiresEiaKey || (gasPrices.national == null && (!Array.isArray(gasPrices.states) || gasPrices.states.length === 0 || gasPrices.states[0].price == null)) ? (
                    <p className="home-screen-gas-prices-no-data">
                      Real-time data requires an EIA API key. Add <code>EIA_API_KEY</code> to your backend <code>.env</code>. Free key at{' '}
                      <a href="https://www.eia.gov/opendata/register.php" target="_blank" rel="noopener noreferrer">eia.gov/opendata</a>.
                    </p>
                  ) : Array.isArray(gasPrices.states) && gasPrices.states.length > 0 && gasPrices.states[0].price != null ? (
                    <>
                      <div className="home-screen-gas-prices-national">
                        <span className="home-screen-gas-prices-state-label">{gasPrices.states[0].name}</span>
                        <span className="home-screen-gas-prices-value">${gasPrices.states[0].price}</span>
                        <span className="home-screen-gas-prices-unit">{gasPrices.unit}</span>
                        <span className="home-screen-gas-prices-updated">Updated {gasPrices.updatedAt}</span>
                      </div>
                      {gasPrices.national != null && (
                        <p className="home-screen-gas-prices-us-avg">US avg ${gasPrices.national} {gasPrices.unit}</p>
                      )}
                    </>
                  ) : gasPrices.national != null ? (
                    <div className="home-screen-gas-prices-national">
                      <span className="home-screen-gas-prices-state-label">US average</span>
                      <span className="home-screen-gas-prices-value">${gasPrices.national}</span>
                      <span className="home-screen-gas-prices-unit">{gasPrices.unit}</span>
                      <span className="home-screen-gas-prices-updated">Updated {gasPrices.updatedAt}</span>
                    </div>
                  ) : selectedGasState ? (
                    <p className="home-screen-gas-prices-no-data">Data unavailable for this state from EIA.</p>
                  ) : (
                    <p className="home-screen-gas-prices-no-data">No data from EIA. Check backend logs.</p>
                  )}
                  {Array.isArray(gasPrices.regions) && gasPrices.regions.length > 0 && !selectedGasState && (
                    <ul className="home-screen-gas-prices-regions">
                      {gasPrices.regions.map((r) => (
                        <li key={r.name}>
                          <span className="home-screen-gas-prices-region-name">{r.name}</span>
                          <span className="home-screen-gas-prices-region-price">${r.price}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          </div>
          <aside className="home-screen-sidebar">
            <Suspense fallback={<div className="home-screen-sidebar-block card-y2k widget-card"><p className="widget-card-loading">Loading widgets…</p></div>}>
              <div id="stocks"><StockWidget onOpenSettings={() => onNavigate?.('settings')} /></div>
              <div id="headlines"><HeadlinesWidget /></div>
              <div id="earthquakes"><EarthquakesWidget /></div>
              <div id="world-clock"><WorldClock /></div>
              <div id="space"><SpaceWidget /></div>
            </Suspense>
            <div className="home-screen-sidebar-block card-y2k home-screen-sidebar-photos">
              <h3 className="home-screen-sidebar-photos-title">From OSINT (X) feed</h3>
              {nitterImages.length > 0 ? (
                <div className="home-screen-sidebar-photos-grid">
                  {nitterImages.map((item, i) => (
                    <div
                      key={`${item.src}-${i}`}
                      className="home-screen-sidebar-photo-wrap"
                      onMouseEnter={(e) => e.currentTarget.classList.add('is-hover')}
                      onMouseLeave={(e) => e.currentTarget.classList.remove('is-hover')}
                    >
                      <button
                        type="button"
                        className="home-screen-sidebar-photo"
                        onClick={() => setOsintPhotoModal(item)}
                        title="Expand"
                      >
                        <img src={item.src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        <span className="home-screen-sidebar-photo-overlay">Expand</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="home-screen-hint">Connect to the API to show photos from the Nitter/OSINT X feed.</p>
              )}
            </div>
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
          <div className="home-screen-footer-col home-screen-footer-col--account">
            <h3 className="home-screen-footer-head">Account</h3>
            <div className="home-screen-footer-auth">
              <HeaderAuth onOpenAuth={onOpenAuth} onNavigateAccount={onNavigateAccount} />
            </div>
          </div>
          <div className="home-screen-footer-col">
            <h3 className="home-screen-footer-head">Source</h3>
            <a href="https://github.com/TheCloutySkies/SuperMap" target="_blank" rel="noopener noreferrer" className="home-screen-footer-link home-screen-footer-link--anchor">
              SuperMap on GitHub
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}
