import { useState, useCallback, useEffect } from 'react'
import { hasConfigured, setConfigured as persistConfigured, setConfigProfile, getTabVisibility, DEFAULT_LAYER_TOGGLES, getVisualsPrefs } from './constants'
import { AuthProvider } from './contexts/AuthContext'
import { SavedArticlesProvider } from './contexts/SavedArticlesContext'
import { SavedXPostsProvider } from './contexts/SavedXPostsContext'
import { SavedPlacesProvider } from './contexts/SavedPlacesContext'
import HomeScreen from './components/HomeScreen'
import MapView from './components/MapView'
import FeedsView from './components/FeedsView'
import RightSidebar from './components/RightSidebar'
import Omnibar from './components/Omnibar'
import PlaceSearch from './components/PlaceSearch'
import WeatherHUD from './components/WeatherHUD'
import AdvancedSearch from './components/AdvancedSearch'
import OsintXView from './components/OsintXView'
import UserUpdatesView from './components/UserUpdatesView'
import MyPlacesView from './components/MyPlacesView'
import BroadcastsView from './components/BroadcastsView'
import SettingsView from './components/SettingsView'
import ResourcesView from './components/ResourcesView'
import SearchResultsView from './components/SearchResultsView'
import SavedArticlesView from './components/SavedArticlesView'
import HeaderAuth from './components/HeaderAuth'
import AuthModal from './components/AuthModal'
import ReportMakerView from './components/ReportMakerView'
import QuickTutorialModal from './components/QuickTutorialModal'
import './App.css'

const FOOTER_MODES = { HOME: 'HOME', MAPS: 'MAPS', FEEDS: 'FEEDS', RESOURCES: 'RESOURCES', REPORTS: 'REPORTS', SETTINGS: 'SETTINGS' }

const MAP_VIEWS = [
  { id: 'osint-map', label: 'OSINT Map', tabKey: 'osintMap' },
  { id: 'conflict-map', label: 'Conflict Map', tabKey: 'conflictMap' },
]

const FEED_VIEWS = [
  { id: 'osint-feeds', label: 'OSINT Feeds', tabKey: 'osintFeeds' },
  { id: 'osint-x', label: 'OSINT (X/Twitter)', tabKey: 'osintX' },
  { id: 'my-places', label: 'My Places', tabKey: 'places' },
  { id: 'advanced-search', label: 'Advanced Search', tabKey: 'advancedSearch' },
  { id: 'news-feeds', label: 'News Feeds', tabKey: 'newsFeeds' },
  { id: 'saved', label: 'Saved', tabKey: 'saved' },
  { id: 'updates', label: 'Updates', tabKey: 'updates' },
  { id: 'broadcasts', label: 'Broadcasts', tabKey: 'broadcasts' },
]

function App() {
  const [configured, setConfigured] = useState(() => hasConfigured())
  const [footerMode, setFooterMode] = useState(FOOTER_MODES.HOME)
  const [activeView, setActiveView] = useState('home')
  const [basemapId, setBasemapId] = useState('arcgis-topo')
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
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResultsGeoJson, setSearchResultsGeoJson] = useState(null)
  const [prefetchedNews, setPrefetchedNews] = useState(null)
  const [visualsKey, setVisualsKey] = useState(0)
  const [eventCountry, setEventCountry] = useState('')
  const [eventFilterByView, setEventFilterByView] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [deviceType, setDeviceType] = useState('desktop')

  useEffect(() => {
    const detectDevice = () => {
      const isMobileViewport = window.matchMedia('(max-width: 900px)').matches
      const isTouchDevice = window.matchMedia('(pointer: coarse)').matches
      setDeviceType(isMobileViewport || isTouchDevice ? 'mobile' : 'desktop')
    }
    detectDevice()
    window.addEventListener('resize', detectDevice)
    return () => window.removeEventListener('resize', detectDevice)
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

  const isMapView = ['osint-map', 'conflict-map'].includes(activeView)
  const isFeedView = ['osint-feeds', 'news-feeds', 'osint-x', 'my-places', 'advanced-search', 'saved', 'updates', 'broadcasts'].includes(activeView)
  const isSettingsView = activeView === 'settings'
  const tabVisibility = getTabVisibility()

  const handleFooterNav = useCallback((mode) => {
    setFooterMode(mode)
    if (mode === FOOTER_MODES.HOME) setActiveView('home')
    else if (mode === FOOTER_MODES.MAPS) setActiveView('osint-map')
    else if (mode === FOOTER_MODES.FEEDS) setActiveView('news-feeds')
    else if (mode === FOOTER_MODES.RESOURCES) setActiveView('resources')
    else if (mode === FOOTER_MODES.REPORTS) setActiveView('report-maker')
    else if (mode === FOOTER_MODES.SETTINGS) setActiveView('settings')
  }, [])

  const setActiveViewWithMode = useCallback((viewId) => {
    setActiveView(viewId)
    if (['osint-map', 'conflict-map'].includes(viewId)) setFooterMode(FOOTER_MODES.MAPS)
    else if (['osint-feeds', 'osint-x', 'my-places', 'advanced-search', 'news-feeds', 'saved', 'updates', 'broadcasts'].includes(viewId)) setFooterMode(FOOTER_MODES.FEEDS)
    else if (viewId === 'home') setFooterMode(FOOTER_MODES.HOME)
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
      fetch(`${apiBase}/api/osint`, timeout(15000)).catch(() => {}),
      fetch(`${apiBase}/api/reddit-signals?limit=10`, timeout(12000)).catch(() => {}),
      fetch(`${apiBase}/api/config`, timeout(8000)).catch(() => {}),
      fetch(`${apiBase}/api/geocode?q=London`, timeout(8000)).catch(() => {}),
      fetch(`${apiBase}/api/weather/nearby?lat=0&lon=0`, timeout(8000)).catch(() => {}),
    ]
    Promise.allSettled(warm)
  }, [configured, apiBase])

  const visuals = getVisualsPrefs()
  const activeLayoutMode = visuals.layoutMode || 'auto'
  const resolvedDeviceType = activeLayoutMode === 'auto' ? deviceType : activeLayoutMode
  const appClass = ['app', `app--theme-${visuals.theme || 'dark'}`, visuals.compact ? 'app--compact' : '', `app--font-${visuals.fontSize || 'normal'}`, `app--device-${resolvedDeviceType}`].filter(Boolean).join(' ')

  return (
    <AuthProvider>
      <SavedArticlesProvider>
        <SavedXPostsProvider>
          <SavedPlacesProvider>
    <div className={appClass}>
      <header className="app-omnibar-strip">
        <div className="app-omnibar-inner">
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
          {isMapView && (
            <PlaceSearch onFlyTo={handleFlyTo} />
          )}
          <HeaderAuth onOpenAuth={() => setShowAuthModal(true)} />
        </div>
      </header>
      <div className="app-body">
      {activeView !== 'home' && activeView !== 'settings' && activeView !== 'search-results' && activeView !== 'report-maker' && (
        <aside className="sidebar sidebar-left">
          <h1 className="sidebar-title">SuperMap</h1>
          <nav className="nav">
            {footerMode === FOOTER_MODES.MAPS && (
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
            )}
            {footerMode === FOOTER_MODES.FEEDS && (
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
            )}
          </nav>
        </aside>
      )}

      <main className="main">
        {activeView === 'home' && <HomeScreen onNavigate={setActiveViewWithMode} />}
        {isMapView && (
          <>
            <MapView
              basemapId={basemapId}
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
            />
            <WeatherHUD
              lat={weatherCoords.lat ?? userCoords.lat}
              lon={weatherCoords.lon ?? userCoords.lon}
              onSearchCoords={(lng, lat) => {
                setWeatherCoords({ lat, lon: lng })
                handleFlyTo({ lng, lat, zoom: 10 })
              }}
            />
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
        {activeView === 'advanced-search' && (
          <div className="main-feed-view main-feed-view--advanced-search">
            <AdvancedSearch />
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
        {activeView === 'resources' && <ResourcesView />}
        {activeView === 'report-maker' && <ReportMakerView />}
        {activeView === 'search-results' && (
          <SearchResultsView
            query={searchQuery}
            features={searchResultsGeoJson?.features || []}
            onFlyTo={handleFlyTo}
            onShowOnMap={() => { setActiveView('osint-map'); setFooterMode(FOOTER_MODES.MAPS) }}
            onBack={() => setActiveView('home')}
          />
        )}
        {activeView === 'settings' && (
          <SettingsView apiBase={apiBase} onVisualsChange={() => setVisualsKey((k) => k + 1)} />
        )}
      </main>

        <RightSidebar
        visible={isMapView}
        isMapView={isMapView}
        activeView={activeView}
        basemapId={basemapId}
        onBasemapChange={setBasemapId}
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
        <div className="footer-switch">
          <button
            className={`footer-btn ${footerMode === FOOTER_MODES.HOME ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.HOME)}
          >
            HOME
          </button>
          <button
            className={`footer-btn ${footerMode === FOOTER_MODES.MAPS ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.MAPS)}
          >
            MAPS
          </button>
          <button
            className={`footer-btn ${footerMode === FOOTER_MODES.FEEDS ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.FEEDS)}
          >
            FEEDS
          </button>
          <button
            className={`footer-btn ${footerMode === FOOTER_MODES.RESOURCES ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.RESOURCES)}
          >
            RESOURCES
          </button>
          <button
            className={`footer-btn ${footerMode === FOOTER_MODES.REPORTS ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.REPORTS)}
          >
            REPORT MAKER
          </button>
          <button
            className={`footer-btn ${footerMode === FOOTER_MODES.SETTINGS ? 'active' : ''}`}
            onClick={() => handleFooterNav(FOOTER_MODES.SETTINGS)}
          >
            SETTINGS
          </button>
        </div>
      </footer>
    </div>
    {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
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
      className={`nav-tab ${activeView === viewId ? 'active' : ''}`}
      onClick={() => setActiveView(viewId)}
    >
      {label}
    </button>
  )
}

export default App
