import { useState, useCallback, useEffect, useRef } from 'react'
import { hasConfigured, setConfigured as persistConfigured, setConfigProfile, getTabVisibility, DEFAULT_LAYER_TOGGLES, getVisualsPrefs } from './constants'
import { AuthProvider } from './contexts/AuthContext'
import { SavedArticlesProvider } from './contexts/SavedArticlesContext'
import { SavedXPostsProvider } from './contexts/SavedXPostsContext'
import { SavedPlacesProvider } from './contexts/SavedPlacesContext'
import { SavedReportsProvider } from './contexts/SavedReportsContext'
import HomeScreen from './components/HomeScreen'
import MapView from './components/MapView'
import FeedsView from './components/FeedsView'
import RightSidebar from './components/RightSidebar'
import Omnibar from './components/Omnibar'
import PlaceSearch from './components/PlaceSearch'
import WeatherHUD from './components/WeatherHUD'
import OsintXView from './components/OsintXView'
import UserUpdatesView from './components/UserUpdatesView'
import MyPlacesView from './components/MyPlacesView'
import MyReportsView from './components/MyReportsView'
import MyCommentsView from './components/MyCommentsView'
import MyAccountView from './components/MyAccountView'
import CommunityView from './components/CommunityView'
import BroadcastsView from './components/BroadcastsView'
import SettingsView from './components/SettingsView'
import ResourcesView, { RESOURCE_SECTIONS } from './components/ResourcesView'
import ToolsView from './components/ToolsView'
import { TOOLS_LIST } from './components/toolsList'
import SearchResultsView from './components/SearchResultsView'
import { getWidgetMatches } from './components/widgetSearchIndex'
import SavedArticlesView from './components/SavedArticlesView'
import HeaderAuth from './components/HeaderAuth'
import AuthModal from './components/AuthModal'
import ReportMakerView from './components/ReportMakerView'
import QuickTutorialModal from './components/QuickTutorialModal'
import AmbientBackground from './components/AmbientBackground'
import AmbientBgLight from './components/AmbientBgLight'
import OmnibarBanner from './components/OmnibarBanner'
import { metallicss } from 'metallicss'
import { supabase } from './lib/supabase'
import './App.css'

function initMetallicss() {
  document.querySelectorAll('.metallicss').forEach((el) => {
    if (el.querySelector('.metal')) return
    el.style.setProperty('box-shadow', '0 1px 2px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.15)')
    el.style.setProperty('overflow', 'hidden')
    el.style.setProperty('transform', 'translateZ(0)')
    try { metallicss(el) } catch (_) {}
  })
}

const FOOTER_MODES = { HOME: 'HOME', MAPS: 'MAPS', FEEDS: 'FEEDS', COMMUNITY: 'COMMUNITY', TOOLS: 'TOOLS', RESOURCES: 'RESOURCES', REPORTS: 'REPORTS', SETTINGS: 'SETTINGS' }

const MAP_VIEWS = [
  { id: 'osint-map', label: 'OSINT Map', tabKey: 'osintMap' },
  { id: 'conflict-map', label: 'Conflict Map', tabKey: 'conflictMap' },
  { id: 'explore-map', label: 'Explore', tabKey: 'exploreMap' },
  { id: 'geolocate-map', label: 'Geolocate', tabKey: 'geolocateMap' },
]

const FEED_VIEWS = [
  // Feeds first (high-frequency, "main" content)
  { id: 'news-feeds', label: 'News Feeds', tabKey: 'newsFeeds' },
  { id: 'osint-feeds', label: 'OSINT Feeds', tabKey: 'osintFeeds' },
  { id: 'osint-x', label: 'OSINT (X/Twitter)', tabKey: 'osintX' },
  { id: 'broadcasts', label: 'Broadcasts', tabKey: 'broadcasts' },

  // Personal / account-driven views last
  { id: 'my-places', label: 'My Places', tabKey: 'places' },
  { id: 'saved', label: 'Saved', tabKey: 'saved' },
  { id: 'updates', label: 'Updates', tabKey: 'updates' },
]

function App() {
  const [configured, setConfigured] = useState(() => hasConfigured())
  const [footerMode, setFooterMode] = useState(FOOTER_MODES.HOME)
  const [activeView, setActiveView] = useState('home')
  const [basemapId, setBasemapId] = useState('arcgis-topo')
  const [overlayBasemapId, setOverlayBasemapId] = useState(null)
  const [layerToggles, setLayerToggles] = useState(() => ({ ...DEFAULT_LAYER_TOGGLES }))
  const [mapLoadingPending, setMapLoadingPending] = useState(0)
  const setIsMapLoading = useCallback((value) => {
    setMapLoadingPending((prev) => {
      if (value === true) return prev + 1
      if (value === false) return Math.max(0, prev - 1)
      return prev
    })
  }, [])

  const isMapLoading = mapLoadingPending > 0

  useEffect(() => {
    if (!mapLoadingPending) return
    const id = setTimeout(() => setMapLoadingPending(0), 20000)
    return () => clearTimeout(id)
  }, [mapLoadingPending])

  const [overpassResults, setOverpassResults] = useState(null)
  const [sentinelTime, setSentinelTime] = useState('24h')
  const [flyToTarget, setFlyToTarget] = useState(null)
  const [mapPointEntries, setMapPointEntries] = useState([])
  const [userCoords, setUserCoords] = useState({ lat: null, lon: null })
  const [weatherCoords, setWeatherCoords] = useState({ lat: null, lon: null })
  const [mapCenter, setMapCenter] = useState({ lat: null, lon: null })
  const [overlayOpacity, setOverlayOpacity] = useState(0.6)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResultsGeoJson, setSearchResultsGeoJson] = useState(null)
  const [prefetchedNews, setPrefetchedNews] = useState(null)
  const [bannerXItems, setBannerXItems] = useState([])
  const [visualsKey, setVisualsKey] = useState(0)
  const handleVisualsChange = useCallback(() => setVisualsKey((k) => k + 1), [])
  const [eventCountry, setEventCountry] = useState('')
  const [eventFilterByView, setEventFilterByView] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [deviceType, setDeviceType] = useState('desktop')
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true)
  const [activeToolId, setActiveToolId] = useState(TOOLS_LIST[0]?.id ?? null)
  const [isLeftSidebarMinimized, setIsLeftSidebarMinimized] = useState(false)
  const [settingsUserId, setSettingsUserId] = useState(null)
  const [footerTransition, setFooterTransition] = useState(false)
  const prevFooterModeRef = useRef(null)
  const resourcesScrollRef = useRef({})

  useEffect(() => {
    const detectDevice = () => {
      if (typeof window === 'undefined') {
        setDeviceType('desktop')
        return
      }
      const isMobileViewport = window.matchMedia('(max-width: 900px)').matches
      const isTouchDevice = window.matchMedia('(pointer: coarse)').matches
      const ua = window.navigator?.userAgent || ''
      const isUaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
      setDeviceType(isMobileViewport || isTouchDevice || isUaMobile ? 'mobile' : 'desktop')
    }
    detectDevice()
    window.addEventListener('resize', detectDevice)
    return () => window.removeEventListener('resize', detectDevice)
  }, [])

  useEffect(() => {
    // Keep sidebar behavior intuitive when switching between desktop and mobile layouts.
    if (deviceType === 'mobile') {
      setIsRightSidebarOpen(false)
    } else {
      setIsRightSidebarOpen(true)
    }
  }, [deviceType])

  useEffect(() => {
    if (!supabase) return
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSettingsUserId(data?.session?.user?.id || null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSettingsUserId(session?.user?.id || null)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => setUserCoords({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {}
    )
  }, [])

  const handleFlyTo = useCallback((opts) => {
    if (opts?.lng != null && opts?.lat != null) {
      setFlyToTarget({
        lng: opts.lng,
        lat: opts.lat,
        zoom: opts.zoom ?? 12,
        properties: opts.properties || {},
      })
    }
  }, [])

  const clearFlyToTarget = useCallback(() => setFlyToTarget(null), [])

  const handlePinnedToMap = useCallback((feature) => {
    if (!feature?.geometry?.coordinates?.length) return
    setSearchResultsGeoJson((prev) => ({
      type: 'FeatureCollection',
      features: [...(prev?.features || []), feature],
    }))
    setActiveView('conflict-map')
    setFooterMode(FOOTER_MODES.MAPS)
    const [lng, lat] = feature.geometry.coordinates
    setFlyToTarget({ lng, lat, zoom: 10, properties: feature.properties || {} })
  }, [])

  useEffect(() => {
    try {
      if (localStorage.getItem('supermap_tutorial_seen') !== '1') setShowTutorial(true)
    } catch {}
  }, [])

  const isMapView = ['osint-map', 'conflict-map', 'explore-map', 'geolocate-map'].includes(activeView)
  const isFeedView = ['osint-feeds', 'news-feeds', 'osint-x', 'my-places', 'my-reports', 'my-comments', 'advanced-search', 'saved', 'updates', 'broadcasts'].includes(activeView)
  const isSettingsView = activeView === 'settings'
  const tabVisibility = getTabVisibility(settingsUserId)

  const handleFooterNav = useCallback((mode) => {
    setFooterMode(mode)
    if (mode === FOOTER_MODES.HOME) setActiveView('home')
    else if (mode === FOOTER_MODES.MAPS) setActiveView('osint-map')
    else if (mode === FOOTER_MODES.FEEDS) setActiveView('news-feeds')
    else if (mode === FOOTER_MODES.COMMUNITY) setActiveView('community')
    else if (mode === FOOTER_MODES.TOOLS) setActiveView('tools')
    else if (mode === FOOTER_MODES.RESOURCES) setActiveView('resources')
    else if (mode === FOOTER_MODES.REPORTS) setActiveView('report-maker')
    else if (mode === FOOTER_MODES.SETTINGS) setActiveView('settings')
  }, [])

  const setActiveViewWithMode = useCallback((viewId) => {
    setActiveView(viewId)
    if (['osint-map', 'conflict-map'].includes(viewId)) setFooterMode(FOOTER_MODES.MAPS)
    else if (['osint-feeds', 'osint-x', 'my-places', 'my-reports', 'my-comments', 'advanced-search', 'news-feeds', 'saved', 'updates', 'broadcasts'].includes(viewId)) setFooterMode(FOOTER_MODES.FEEDS)
    else if (viewId === 'community') setFooterMode(FOOTER_MODES.COMMUNITY)
    else if (viewId === 'my-account') setFooterMode(FOOTER_MODES.SETTINGS)
    else if (viewId === 'home') setFooterMode(FOOTER_MODES.HOME)
    else if (viewId === 'tools') setFooterMode(FOOTER_MODES.TOOLS)
    else if (viewId === 'resources') setFooterMode(FOOTER_MODES.RESOURCES)
    else if (viewId === 'report-maker') setFooterMode(FOOTER_MODES.REPORTS)
    else if (viewId === 'settings') setFooterMode(FOOTER_MODES.SETTINGS)
  }, [])

  const apiBase = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
    ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
    : 'http://localhost:3001'

  // Warm up all APIs and functions immediately on startup
  useEffect(() => {
    if (!apiBase || !configured) return
    const timeout = (ms) => ({ signal: AbortSignal.timeout(ms) })
    const warm = [
      fetch(`${apiBase}/api/news`, timeout(20000)).then((r) => r.json()).then((data) => { if (data?.features?.length) setPrefetchedNews(data) }).catch(() => {}),
      fetch(`${apiBase}/api/osint-x?limit=25`, timeout(12000)).then((r) => r.json()).then((data) => {
        const posts = Array.isArray(data) ? data : []
        const items = posts.map((p) => {
          const account = p.account ? `@${p.account} ` : ''
          const text = (p.title || p.content || '').trim().slice(0, 140)
          return text ? `${account}${text}` : null
        }).filter(Boolean)
        setBannerXItems(items.slice(0, 15))
      }).catch(() => {}),
      fetch(`${apiBase}/api/osint`, timeout(15000)).catch(() => {}),
      fetch(`${apiBase}/api/config`, timeout(8000)).catch(() => {}),
      fetch(`${apiBase}/api/geocode?q=London`, timeout(8000)).catch(() => {}),
    ]
    Promise.allSettled(warm)
  }, [configured, apiBase])

  const visuals = getVisualsPrefs(settingsUserId)
  const activeLayoutMode = visuals.layoutMode || 'auto'
  const resolvedDeviceType = activeLayoutMode === 'auto' ? deviceType : activeLayoutMode
  const appClass = ['app', `app--theme-${visuals.theme || 'dark'}`, visuals.compact ? 'app--compact' : '', `app--font-${visuals.fontSize || 'normal'}`, `app--device-${resolvedDeviceType}`].filter(Boolean).join(' ')

  const isMobileLayout = resolvedDeviceType === 'mobile'

  useEffect(() => {
    const t = setTimeout(initMetallicss, 50)
    return () => clearTimeout(t)
  }, [visualsKey, activeView, footerMode])

  useEffect(() => {
    if (prevFooterModeRef.current !== null && prevFooterModeRef.current !== footerMode) {
      setFooterTransition(true)
      const t = setTimeout(() => {
        setFooterTransition(false)
      }, 500)
      return () => clearTimeout(t)
    }
    prevFooterModeRef.current = footerMode
  }, [footerMode])

  return (
    <AuthProvider>
      <SavedArticlesProvider>
        <SavedXPostsProvider>
          <SavedPlacesProvider>
            <SavedReportsProvider>
    <div className={appClass}>
      <AmbientBackground />
      <AmbientBgLight />
      <header className="app-omnibar-strip">
        <div className="app-omnibar-inner">
          <a href="https://cloutyskies.org" className="app-omnibar-logo" target="_blank" rel="noopener noreferrer" aria-label="Clouty Skies">
            <img src="/cloutyskies-logo.png" alt="" />
          </a>
          <OmnibarBanner
            headlines={prefetchedNews?.features
              ?.filter((f) => {
                const s = (f.properties?.source || '').toLowerCase()
                return !s.includes('wikipedia')
              })
              ?.sort((a, b) => (b.properties?.timestamp ?? 0) - (a.properties?.timestamp ?? 0))
              ?.slice(0, 15)
              ?.map((f) => f.properties?.title || f.properties?.headline)
              ?.filter(Boolean) || []}
            xFeedItems={bannerXItems}
          />
          <Omnibar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onFlyTo={handleFlyTo}
            onKeywordChange={setSearchQuery}
            onSearchResults={setSearchResultsGeoJson}
            onNavigateToMap={() => setActiveViewWithMode('osint-map')}
            onNavigateToSearchResults={(q) => { setSearchQuery(q || searchQuery); setActiveView('search-results'); setFooterMode(FOOTER_MODES.FEEDS) }}
            onNavigateToFeeds={(q) => { setSearchQuery(q || ''); setActiveView('osint-feeds'); setFooterMode(FOOTER_MODES.FEEDS) }}
            placeholder="Search map, events, and feeds…"
          />
          {isMapView && !isMobileLayout && (
            <PlaceSearch onFlyTo={handleFlyTo} />
          )}
          {activeView !== 'home' && (
            <div className="app-omnibar-auth-wrap">
              <HeaderAuth onOpenAuth={() => setShowAuthModal(true)} onNavigateAccount={setActiveViewWithMode} />
            </div>
          )}
        </div>
      </header>
      <div className="app-body">
      {activeView !== 'home' && activeView !== 'settings' && activeView !== 'search-results' && activeView !== 'report-maker' && activeView !== 'my-account' && activeView !== 'community' && (
        <aside className={`sidebar sidebar-left ${isLeftSidebarMinimized ? 'sidebar-left--minimized' : ''}`}>
          <div className="sidebar-head">
            <h1 className="sidebar-title">SuperMap</h1>
            <button
              type="button"
              className="sidebar-minimize-btn"
              onClick={() => setIsLeftSidebarMinimized((m) => !m)}
              aria-label={isLeftSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
              title={isLeftSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
            >
              {isLeftSidebarMinimized ? '→' : '←'}
            </button>
          </div>
          {!isLeftSidebarMinimized && (
            <nav className="nav">
              {activeView === 'resources' ? (
                <div className="sidebar-resources-nav">
                  {RESOURCE_SECTIONS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="sidebar-resources-link"
                      onClick={() => resourcesScrollRef.current?.scrollToSection?.(s.id)}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              ) : activeView === 'tools' ? (
                <div className="sidebar-tools-nav">
                  {TOOLS_LIST.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`sidebar-tools-link ${activeToolId === t.id ? 'active' : ''}`}
                      onClick={() => setActiveToolId(t.id)}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              ) : footerMode === FOOTER_MODES.MAPS ? (
                MAP_VIEWS.map((v) => (
                  <TabButton
                    key={v.id}
                    viewId={v.id}
                    label={v.label}
                    visible={tabVisibility[v.tabKey]}
                    activeView={activeView}
                    setActiveView={setActiveViewWithMode}
                  />
                ))
              ) : footerMode === FOOTER_MODES.FEEDS ? (
                FEED_VIEWS.map((v) => (
                  <TabButton
                    key={v.id}
                    viewId={v.id}
                    label={v.label}
                    visible={v.id === 'osint-x' ? true : tabVisibility[v.tabKey]}
                    activeView={activeView}
                    setActiveView={setActiveViewWithMode}
                  />
                ))
              ) : null}
            </nav>
          )}
        </aside>
      )}

      <main className={`main ${footerTransition ? 'main--y2k-transition' : ''}`}>
        {activeView === 'home' && (
              <HomeScreen
                onNavigate={setActiveViewWithMode}
                footerMode={footerMode}
                onFooterNav={handleFooterNav}
                footerTabs={[
                  { key: FOOTER_MODES.HOME, label: 'HOME' },
                  { key: FOOTER_MODES.MAPS, label: 'MAPS' },
                  { key: FOOTER_MODES.FEEDS, label: 'FEEDS' },
                  { key: FOOTER_MODES.COMMUNITY, label: 'COMMUNITY' },
                  { key: FOOTER_MODES.TOOLS, label: 'TOOLS' },
                  { key: FOOTER_MODES.RESOURCES, label: 'RESOURCES' },
                  { key: FOOTER_MODES.REPORTS, label: 'REPORT MAKER' },
                  { key: FOOTER_MODES.SETTINGS, label: 'SETTINGS' },
                ]}
                isMobileLayout={isMobileLayout}
                onOpenAuth={() => setShowAuthModal(true)}
                onNavigateAccount={setActiveViewWithMode}
              />
            )}
          {isMapView && (
          <>
            {isMobileLayout && (
              <button
                type="button"
                className="map-layers-toggle-btn"
                onClick={() => setIsRightSidebarOpen((open) => !open)}
                aria-label={isRightSidebarOpen ? 'Hide layers' : 'Show layers'}
                title={isRightSidebarOpen ? 'Hide layers' : 'Layers'}
              >
                {isRightSidebarOpen ? '−' : '☰'}
              </button>
            )}
            <MapView
              basemapId={activeView === 'geolocate-map' ? 'osm-standard' : basemapId}
              overlayBasemapId={overlayBasemapId}
              overlayOpacity={overlayOpacity}
              layerToggles={layerToggles}
              isMapLoading={isMapLoading}
              onLoadingChange={setIsMapLoading}
              overpassResults={overpassResults}
              sentinelTime={sentinelTime}
              flyToTarget={flyToTarget}
              onFlyToComplete={clearFlyToTarget}
              onSearchDataUpdate={setMapPointEntries}
              layerFilterKeyword={searchQuery}
              searchResultsGeoJson={searchResultsGeoJson}
              activeView={activeView}
              eventCountry={eventCountry || null}
              eventFilterByView={eventFilterByView}
              weatherCoords={weatherCoords}
              mapCenter={mapCenter}
              onMapCenterChange={(coord) => {
                setMapCenter(coord)
                setWeatherCoords(coord)
              }}
            />
            {activeView !== 'explore-map' && (
              <WeatherHUD
                lat={weatherCoords.lat ?? userCoords.lat}
                lon={weatherCoords.lon ?? userCoords.lon}
                onSearchCoords={(lng, lat) => {
                  setWeatherCoords({ lat, lon: lng })
                  handleFlyTo({ lng, lat, zoom: 10 })
                }}
              />
            )}
          </>
        )}
        {activeView === 'osint-feeds' && (
          <FeedsView title="OSINT Feeds" activeView="osint-feeds" keywordFilter={searchQuery} onClearFilter={() => setSearchQuery('')} onPinnedToMap={handlePinnedToMap} onSignInRequired={() => setShowAuthModal(true)} />
        )}
        {activeView === 'osint-x' && (
          <OsintXView keywordFilter={searchQuery} onClearFilter={() => setSearchQuery('')} onPinnedToMap={handlePinnedToMap} />
        )}
        {activeView === 'my-places' && (
          <div className="main-feed-view">
            <MyPlacesView onFlyTo={handleFlyTo} onSignInRequired={() => setShowAuthModal(true)} />
          </div>
        )}
        {activeView === 'my-reports' && (
          <div className="main-feed-view">
            <MyReportsView onOpenReportMaker={() => setActiveViewWithMode('report-maker')} onSignInRequired={() => setShowAuthModal(true)} />
          </div>
        )}
        {activeView === 'my-comments' && (
          <div className="main-feed-view">
            <MyCommentsView onSignInRequired={() => setShowAuthModal(true)} />
          </div>
        )}
        {activeView === 'community' && (
          <div className="main-feed-view">
            <CommunityView onSignInRequired={() => setShowAuthModal(true)} />
          </div>
        )}
        {activeView === 'my-account' && (
          <div className="main-feed-view">
            <MyAccountView onNavigateSection={setActiveViewWithMode} onSignInRequired={() => setShowAuthModal(true)} />
          </div>
        )}
        {activeView === 'news-feeds' && (
          <FeedsView title="News Feeds" activeView="news-feeds" keywordFilter={searchQuery} onClearFilter={() => setSearchQuery('')} initialNews={prefetchedNews} onSignInRequired={() => setShowAuthModal(true)} />
        )}
        {activeView === 'saved' && (
          <div className="main-feed-view">
            <SavedArticlesView />
          </div>
        )}
        {activeView === 'updates' && (
          <div className="main-feed-view">
            <UserUpdatesView onSignInRequired={() => setShowAuthModal(true)} />
          </div>
        )}
        {activeView === 'broadcasts' && (
          <div className="main-feed-view main-feed-view--broadcasts">
            <BroadcastsView />
          </div>
        )}
        {activeView === 'resources' && <ResourcesView resourcesScrollRef={resourcesScrollRef} />}
        {activeView === 'tools' && <ToolsView activeToolId={activeToolId} onToolChange={setActiveToolId} />}
        {activeView === 'report-maker' && (
          <div className="main-content-scroll">
            <ReportMakerView />
          </div>
        )}
        {activeView === 'search-results' && (
          <SearchResultsView
            query={searchQuery}
            features={searchResultsGeoJson?.features || []}
            widgetMatches={getWidgetMatches(searchQuery)}
            onFlyTo={handleFlyTo}
            onShowOnMap={() => { setActiveView('osint-map'); setFooterMode(FOOTER_MODES.MAPS) }}
            onBack={() => setActiveView('home')}
            onNavigateToWidget={(sectionId) => {
              setActiveView('home')
              setFooterMode(FOOTER_MODES.HOME)
              setTimeout(() => {
                document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }, 150)
            }}
          />
        )}
        {activeView === 'settings' && (
          <SettingsView
            apiBase={apiBase}
            settingsUserId={settingsUserId}
            onVisualsChange={handleVisualsChange}
          />
        )}
      </main>

        <RightSidebar
        visible={isMapView && (!isMobileLayout || isRightSidebarOpen)}
        onClose={isMobileLayout ? () => setIsRightSidebarOpen(false) : undefined}
        isMapView={isMapView}
        activeView={activeView}
        basemapId={basemapId}
        onBasemapChange={setBasemapId}
        overlayBasemapId={overlayBasemapId}
        onOverlayBasemapChange={setOverlayBasemapId}
        overlayOpacity={overlayOpacity}
        onOverlayOpacityChange={setOverlayOpacity}
        layerToggles={layerToggles}
        onLayerTogglesChange={setLayerToggles}
        onOverpassResults={(geojson) => setOverpassResults(geojson)}
        onOverpassLoading={setIsMapLoading}
        eventCountry={eventCountry}
        eventFilterByView={eventFilterByView}
        onEventCountryChange={setEventCountry}
        onEventFilterByViewChange={setEventFilterByView}
        sentinelTime={sentinelTime}
        onSentinelTimeChange={setSentinelTime}
      />
      </div>

      <footer className="footer">
        <div className="footer-nav-wrap">
          <div className="footer-switch">
          <button
            className={`footer-btn metallicss ${footerMode === FOOTER_MODES.HOME ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.HOME)}
          >
            HOME
          </button>
          <button
            className={`footer-btn metallicss ${footerMode === FOOTER_MODES.MAPS ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.MAPS)}
          >
            MAPS
          </button>
          <button
            className={`footer-btn metallicss ${footerMode === FOOTER_MODES.FEEDS ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.FEEDS)}
          >
            FEEDS
          </button>
          <button
            className={`footer-btn metallicss ${footerMode === FOOTER_MODES.COMMUNITY ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.COMMUNITY)}
          >
            COMMUNITY
          </button>
          <button
            className={`footer-btn metallicss ${footerMode === FOOTER_MODES.TOOLS ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.TOOLS)}
          >
            TOOLS
          </button>
          <button
            className={`footer-btn metallicss ${footerMode === FOOTER_MODES.RESOURCES ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.RESOURCES)}
          >
            RESOURCES
          </button>
          <button
            className={`footer-btn metallicss ${footerMode === FOOTER_MODES.REPORTS ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.REPORTS)}
          >
            REPORT MAKER
          </button>
          <button
            className={`footer-btn metallicss ${footerMode === FOOTER_MODES.SETTINGS ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.SETTINGS)}
          >
            SETTINGS
          </button>
          </div>
        </div>
        <div className="footer-copyright">
          © {new Date().getFullYear()} TheCloutySkies
        </div>
      </footer>
    </div>
    {showAuthModal && (
      <AuthModal
        onClose={() => setShowAuthModal(false)}
        onOpenSettings={() => {
          setShowAuthModal(false)
          setActiveView('settings')
          setFooterMode(FOOTER_MODES.SETTINGS)
        }}
      />
    )}
    {showTutorial && (
      <QuickTutorialModal
        onClose={(profileName) => {
          if (profileName) {
            setConfigProfile({ name: profileName })
          }
          persistConfigured(true)
          setConfigured(true)
          try { localStorage.setItem('supermap_tutorial_seen', '1') } catch {}
          setShowTutorial(false)
        }}
      />
    )}
            </SavedReportsProvider>
          </SavedPlacesProvider>
        </SavedXPostsProvider>
      </SavedArticlesProvider>
    </AuthProvider>
  )
}

function TabButton({ viewId, label, visible, activeView, setActiveView }) {
  if (visible === false) return null
  return (
    <button
      className={`nav-tab metallicss ${activeView === viewId ? 'active' : ''}`}
      onClick={() => setActiveView(viewId)}
    >
      {label}
    </button>
  )
}

export default App
