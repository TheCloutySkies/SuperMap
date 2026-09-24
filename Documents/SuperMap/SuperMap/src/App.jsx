import { useState, useCallback, useEffect, useRef } from 'react'
import { hasConfigured, setConfigured as persistConfigured, setConfigProfile, getTabVisibility, DEFAULT_LAYER_TOGGLES, getVisualsPrefs } from './constants'
import HomeScreen from './components/HomeScreen'
import CrimeDashboard from './components/CrimeDashboard'
import MapView from './components/MapView'
import FeedsView from './components/FeedsView'
import RightSidebar from './components/RightSidebar'
import Omnibar from './components/Omnibar'
import PlaceSearch from './components/PlaceSearch'
import WeatherHUD from './components/WeatherHUD'
import OsintXView from './components/OsintXView'
import BroadcastsView from './components/BroadcastsView'
import SettingsView from './components/SettingsView'
import ResourcesView, { RESOURCE_SECTIONS } from './components/ResourcesView'
import ToolsView from './components/ToolsView'
import { TOOLS_LIST } from './components/toolsList'
import SearchResultsView from './components/SearchResultsView'
import { getWidgetMatches } from './components/widgetSearchIndex'
import ReportMakerView from './components/ReportMakerView'
import QuickTutorialModal from './components/QuickTutorialModal'
import AmbientBackground from './components/AmbientBackground'
import AmbientBgLight from './components/AmbientBgLight'
import OmnibarBanner from './components/OmnibarBanner'
import ModeRail from './components/ModeRail'
import MobileShell from './components/MobileShell'
import MobileLayoutPrompt from './components/MobileLayoutPrompt'
import { osintXToBannerItems, readHomeSnapshot } from './lib/homeBootstrap'
import { metallicss } from 'metallicss'
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

const APP_MODES = { HOME: 'HOME', MAPS: 'MAPS', FEEDS: 'FEEDS', TOOLS: 'TOOLS', RESOURCES: 'RESOURCES', REPORTS: 'REPORTS', SETTINGS: 'SETTINGS' }
/** @deprecated alias — keep for gradual rename */
const FOOTER_MODES = APP_MODES


const MAP_VIEWS = [
  { id: 'osint-map', label: 'OSINT Map', tabKey: 'osintMap' },
  { id: 'conflict-map', label: 'Conflict Map', tabKey: 'conflictMap' },
  { id: 'crime-map', label: 'Crime Map', tabKey: 'crimeMap' },
  { id: 'explore-map', label: 'Explore', tabKey: 'exploreMap' },
  { id: 'geolocate-map', label: 'Geolocate', tabKey: 'geolocateMap' },
]

const FEED_VIEWS = [
  { id: 'news-feeds', label: 'News Feeds', tabKey: 'newsFeeds' },
  { id: 'osint-feeds', label: 'OSINT Feeds', tabKey: 'osintFeeds' },
  { id: 'recent-videos', label: 'Recent Videos', tabKey: 'recentVideos' },
  { id: 'osint-x', label: 'OSINT (X/Twitter)', tabKey: 'osintX' },
  { id: 'broadcasts', label: 'Broadcasts', tabKey: 'broadcasts' },
]

function App() {
  const [configured, setConfigured] = useState(() => hasConfigured())
  const [appMode, setAppMode] = useState(APP_MODES.HOME)
  const footerMode = appMode
  const setFooterMode = setAppMode
  const [subnavOpen, setSubnavOpen] = useState(true)
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
  const [prefetchedNews, setPrefetchedNews] = useState(() => readHomeSnapshot()?.news || null)
  const [bannerXItems, setBannerXItems] = useState(() => osintXToBannerItems(readHomeSnapshot()?.osintX))
  const [visualsKey, setVisualsKey] = useState(0)
  const handleVisualsChange = useCallback(() => setVisualsKey((k) => k + 1), [])
  const [eventCountry, setEventCountry] = useState('')
  const [eventFilterByView, setEventFilterByView] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [deviceType, setDeviceType] = useState('desktop')
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true)
  const [activeToolId, setActiveToolId] = useState(TOOLS_LIST[0]?.id ?? null)
  const [isLeftSidebarMinimized, setIsLeftSidebarMinimized] = useState(false)
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
      const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches
      const ua = window.navigator?.userAgent || ''
      const isUaMobile = /Android|iPhone|iPad|iPod|webOS|Mobile|BlackBerry|IEMobile|Opera Mini/i.test(ua)
      setDeviceType(isMobileViewport || isTouchPrimary || isUaMobile ? 'mobile' : 'desktop')
    }
    detectDevice()
    window.addEventListener('resize', detectDevice)
    return () => window.removeEventListener('resize', detectDevice)
  }, [])

  useEffect(() => {
    if (deviceType === 'mobile') {
      setIsRightSidebarOpen(false)
    } else {
      setIsRightSidebarOpen(true)
    }
  }, [deviceType])

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

  const apiBase = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
    ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
    : 'http://localhost:3001'

  const handleShowLocationOnMap = useCallback((place) => {
    const q = typeof place === 'string' ? place.trim() : ''
    if (!q) return
    setSearchQuery(q)
    setActiveView('osint-map')
    setFooterMode(FOOTER_MODES.MAPS)
    fetch(`${apiBase}/api/geocode?q=${encodeURIComponent(q)}&limit=1`, { signal: AbortSignal.timeout(10000) })
      .then((r) => r.json())
      .then((rows) => {
        const first = Array.isArray(rows) ? rows[0] : null
        const lat = first?.lat != null ? Number(first.lat) : null
        const lng = first?.lon != null ? Number(first.lon) : null
        if (lng != null && lat != null) setFlyToTarget({ lng, lat, zoom: 10 })
      })
      .catch(() => {})
  }, [apiBase])

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

  const isMapView = ['osint-map', 'conflict-map', 'crime-map', 'explore-map', 'geolocate-map'].includes(activeView)
  const isFeedView = ['osint-feeds', 'news-feeds', 'recent-videos', 'osint-x', 'advanced-search', 'broadcasts'].includes(activeView)
  const isSettingsView = activeView === 'settings'
  const tabVisibility = getTabVisibility()

  const handleFooterNav = useCallback((mode) => {
    setAppMode(mode)
    setSubnavOpen(true)
    if (mode === APP_MODES.HOME) setActiveView('home')
    else if (mode === APP_MODES.MAPS) setActiveView('osint-map')
    else if (mode === APP_MODES.FEEDS) setActiveView('news-feeds')
    else if (mode === APP_MODES.TOOLS) setActiveView('tools')
    else if (mode === APP_MODES.RESOURCES) setActiveView('resources')
    else if (mode === APP_MODES.REPORTS) setActiveView('report-maker')
    else if (mode === APP_MODES.SETTINGS) setActiveView('settings')
  }, [])

  const setActiveViewWithMode = useCallback((viewId) => {
    setActiveView(viewId)
    setSubnavOpen(true)
    if (['osint-map', 'conflict-map', 'crime-map', 'explore-map', 'geolocate-map'].includes(viewId)) setAppMode(APP_MODES.MAPS)
    else if (['osint-feeds', 'osint-x', 'advanced-search', 'news-feeds', 'broadcasts', 'recent-videos'].includes(viewId)) setAppMode(APP_MODES.FEEDS)
    else if (viewId === 'home') setAppMode(APP_MODES.HOME)
    else if (viewId === 'tools') setAppMode(APP_MODES.TOOLS)
    else if (viewId === 'resources') setAppMode(APP_MODES.RESOURCES)
    else if (viewId === 'report-maker') setAppMode(APP_MODES.REPORTS)
    else if (viewId === 'settings') setAppMode(APP_MODES.SETTINGS)
  }, [])

  useEffect(() => {
    if (activeView !== 'crime-map') return
    setLayerToggles((prev) => ({
      ...prev,
      crimeStateRates: true,
      crimeCityHighlight: prev.crimeCityHighlight ?? true,
    }))
    setFlyToTarget({ lng: -98.5, lat: 39.8, zoom: 3.4 })
  }, [activeView])

  useEffect(() => {
    if (!apiBase || !configured) return
    const timeout = (ms) => ({ signal: AbortSignal.timeout(ms) })
    // Light warm only — news/osint-x come from HomeScreen /api/home bootstrap
    const warm = [
      fetch(`${apiBase}/api/osint`, timeout(15000)).catch(() => {}),
      fetch(`${apiBase}/api/config`, timeout(8000)).catch(() => {}),
      fetch(`${apiBase}/api/geocode?q=London`, timeout(8000)).catch(() => {}),
    ]
    Promise.allSettled(warm)
  }, [configured, apiBase])

  const handleHomeBootstrap = useCallback((payload) => {
    if (!payload) return
    if (payload.news?.features?.length) setPrefetchedNews(payload.news)
    if (Array.isArray(payload.osintX)) setBannerXItems(osintXToBannerItems(payload.osintX))
  }, [])

  const visuals = getVisualsPrefs()
  const activeLayoutMode = visuals.layoutMode || 'auto'
  const resolvedDeviceType = activeLayoutMode === 'auto' ? deviceType : activeLayoutMode
  const appClass = ['app', `app--theme-${visuals.theme || 'dark'}`, visuals.compact ? 'app--compact' : '', `app--font-${visuals.fontSize || 'normal'}`, `app--device-${resolvedDeviceType}`].filter(Boolean).join(' ')

  const isMobileLayout = resolvedDeviceType === 'mobile'
  const isHub = isMobileLayout && activeView === 'home'

  const goHome = useCallback(() => {
    handleFooterNav(APP_MODES.HOME)
  }, [handleFooterNav])

  useEffect(() => {
    if (isMobileLayout) setIsRightSidebarOpen(false)
  }, [isMobileLayout, activeView])

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

  const mapChips = MAP_VIEWS
    .filter((v) => tabVisibility[v.tabKey] !== false)
    .map((v) => ({
      id: v.id,
      label: v.label.replace(/\s*Map$/i, ''),
      active: activeView === v.id,
      onClick: () => setActiveViewWithMode(v.id),
    }))

  let mobilePageTitle = 'SuperMap'
  let mobileChipItems = []
  if (appMode === APP_MODES.MAPS) mobilePageTitle = 'Maps'
  else if (appMode === APP_MODES.FEEDS) {
    mobilePageTitle = 'Feeds'
    mobileChipItems = FEED_VIEWS
      .filter((v) => (v.id === 'osint-x' ? true : tabVisibility[v.tabKey] !== false))
      .map((v) => ({
        id: v.id,
        label: v.label,
        active: activeView === v.id,
        onClick: () => setActiveViewWithMode(v.id),
      }))
  } else if (appMode === APP_MODES.TOOLS) {
    mobilePageTitle = 'Tools'
    mobileChipItems = TOOLS_LIST.map((t) => ({
      id: t.id,
      label: t.title,
      active: activeToolId === t.id,
      onClick: () => { setActiveViewWithMode('tools'); setActiveToolId(t.id) },
    }))
  } else if (appMode === APP_MODES.RESOURCES) {
    mobilePageTitle = 'Resources'
    mobileChipItems = RESOURCE_SECTIONS.map((s) => ({
      id: s.id,
      label: s.title,
      active: false,
      onClick: () => {
        setActiveViewWithMode('resources')
        setTimeout(() => resourcesScrollRef.current?.scrollToSection?.(s.id), 50)
      },
    }))
  } else if (appMode === APP_MODES.REPORTS) mobilePageTitle = 'Report Maker'
  else if (appMode === APP_MODES.SETTINGS) mobilePageTitle = 'Settings'
  else if (activeView === 'search-results') mobilePageTitle = 'Search'

  const mainContent = (
    <>
        {activeView === 'home' && (
              <HomeScreen
                onNavigate={setActiveViewWithMode}
                footerMode={appMode}
                onFooterNav={handleFooterNav}
                footerTabs={[
                  { key: APP_MODES.HOME, label: 'HOME' },
                  { key: APP_MODES.MAPS, label: 'MAPS' },
                  { key: APP_MODES.FEEDS, label: 'FEEDS' },
                  { key: APP_MODES.TOOLS, label: 'TOOLS' },
                  { key: APP_MODES.RESOURCES, label: 'RESOURCES' },
                  { key: APP_MODES.REPORTS, label: 'REPORT MAKER' },
                  { key: APP_MODES.SETTINGS, label: 'SETTINGS' },
                ]}
                isMobileLayout={isMobileLayout}
                onShowLocationOnMap={handleShowLocationOnMap}
                onHomeBootstrap={handleHomeBootstrap}
              />
            )}
          {isMapView && (
          <>
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
            {activeView === 'crime-map' && (
              <CrimeDashboard
                onFlyToCity={(city) => {
                  const q = `${city.city}, ${city.state}`
                  fetch(`${apiBase}/api/geocode?q=${encodeURIComponent(q)}&limit=1`, { signal: AbortSignal.timeout(12000) })
                    .then((r) => r.json())
                    .then((rows) => {
                      const first = Array.isArray(rows) ? rows[0] : null
                      const lat = first?.lat != null ? Number(first.lat) : null
                      const lng = first?.lon != null ? Number(first.lon) : null
                      if (lng != null && lat != null) {
                        setFlyToTarget({ lng, lat, zoom: 10, properties: { title: q, source: 'Crime city' } })
                        if (layerToggles.crimeCityHighlight) {
                          setSearchResultsGeoJson({
                            type: 'FeatureCollection',
                            features: [{
                              type: 'Feature',
                              properties: {
                                title: `${city.city}, ${city.state}`,
                                source: `Violent ${city.violentRate}/100k`,
                              },
                              geometry: { type: 'Point', coordinates: [lng, lat] },
                            }],
                          })
                        }
                      }
                    })
                    .catch(() => {})
                }}
              />
            )}
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
          <FeedsView title="OSINT Feeds" activeView="osint-feeds" keywordFilter={searchQuery} onClearFilter={() => setSearchQuery('')} onPinnedToMap={handlePinnedToMap} />
        )}
        {activeView === 'osint-x' && (
          <OsintXView keywordFilter={searchQuery} onClearFilter={() => setSearchQuery('')} onPinnedToMap={handlePinnedToMap} />
        )}
        {activeView === 'news-feeds' && (
          <FeedsView title="News Feeds" activeView="news-feeds" keywordFilter={searchQuery} onClearFilter={() => setSearchQuery('')} initialNews={prefetchedNews} />
        )}
        {activeView === 'recent-videos' && (
          <FeedsView title="Recent Videos" activeView="recent-videos" keywordFilter={searchQuery} onClearFilter={() => setSearchQuery('')} />
        )}
        {activeView === 'broadcasts' && (
          <div className="main-feed-view main-feed-view--broadcasts">
            <BroadcastsView />
          </div>
        )}
        {activeView === 'resources' && <ResourcesView resourcesScrollRef={resourcesScrollRef} />}
        {activeView === 'tools' && (
          <div className="main-content-scroll main-content-scroll--tools">
            <ToolsView activeToolId={activeToolId} onToolChange={setActiveToolId} />
          </div>
        )}
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
            onVisualsChange={handleVisualsChange}
          />
        )}
    </>
  )

  const sidebar = (
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
  )

  return (
    <>
    <div className={appClass}>
      <AmbientBackground />
      <AmbientBgLight />
      {!isMobileLayout && (
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
            onNavigateToSearchResults={(q) => { setSearchQuery(q || searchQuery); setActiveView('search-results'); setAppMode(APP_MODES.FEEDS) }}
            onNavigateToFeeds={(q) => { setSearchQuery(q || ''); setActiveView('osint-feeds'); setAppMode(APP_MODES.FEEDS) }}
            onCommandNavigate={setActiveViewWithMode}
            placeholder="Search or jump (Ctrl+K)…"
          />
          {isMapView && (
            <PlaceSearch onFlyTo={handleFlyTo} />
          )}
          <div className="app-omnibar-right">
            <span className="app-omnibar-copyright" aria-hidden>© {new Date().getFullYear()} TheCloutySkies</span>
          </div>
        </div>
      </header>
      )}
      <div className={`app-body ${isMobileLayout ? 'app-body--mobile' : ''}`}>
      {!isMobileLayout && (() => {
        const showFlyout =
          subnavOpen &&
          (appMode === APP_MODES.MAPS ||
            appMode === APP_MODES.FEEDS ||
            appMode === APP_MODES.TOOLS ||
            appMode === APP_MODES.RESOURCES)
        let flyoutTitle = ''
        let flyoutItems = []
        if (appMode === APP_MODES.MAPS) {
          flyoutTitle = 'Maps'
          flyoutItems = MAP_VIEWS
            .filter((v) => tabVisibility[v.tabKey] !== false)
            .map((v) => ({
              id: v.id,
              label: v.label,
              active: activeView === v.id,
              onClick: () => setActiveViewWithMode(v.id),
            }))
        } else if (appMode === APP_MODES.FEEDS) {
          flyoutTitle = 'Feeds'
          flyoutItems = FEED_VIEWS
            .filter((v) => (v.id === 'osint-x' ? true : tabVisibility[v.tabKey] !== false))
            .map((v) => ({
              id: v.id,
              label: v.label,
              active: activeView === v.id,
              onClick: () => setActiveViewWithMode(v.id),
            }))
        } else if (appMode === APP_MODES.TOOLS) {
          flyoutTitle = 'Tools'
          flyoutItems = TOOLS_LIST.map((t) => ({
            id: t.id,
            label: t.title,
            active: activeToolId === t.id,
            onClick: () => { setActiveViewWithMode('tools'); setActiveToolId(t.id) },
          }))
        } else if (appMode === APP_MODES.RESOURCES) {
          flyoutTitle = 'Resources'
          flyoutItems = RESOURCE_SECTIONS.map((s) => ({
            id: s.id,
            label: s.title,
            active: false,
            onClick: () => {
              setActiveViewWithMode('resources')
              setTimeout(() => resourcesScrollRef.current?.scrollToSection?.(s.id), 50)
            },
          }))
        }
        return (
          <ModeRail
            appMode={appMode}
            onModeSelect={handleFooterNav}
            flyout={{
              open: showFlyout,
              title: flyoutTitle,
              items: flyoutItems,
              onClose: () => setSubnavOpen(false),
            }}
          />
        )
      })()}

      {isMobileLayout ? (
        <MobileShell
          isHub={isHub}
          pageTitle={mobilePageTitle}
          chipItems={mobileChipItems}
          isMapPage={isMapView}
          mapChips={mapChips}
          onFlyTo={handleFlyTo}
          layersOpen={isRightSidebarOpen}
          onToggleLayers={() => setIsRightSidebarOpen((open) => !open)}
          onGoHome={goHome}
        >
          <main className={`main main--mobile ${footerTransition ? 'main--y2k-transition' : ''} ${isMapView ? 'main--map' : ''}`}>
            {mainContent}
          </main>
          {sidebar}
        </MobileShell>
      ) : (
        <>
      <main className={`main ${footerTransition ? 'main--y2k-transition' : ''} ${isMapView ? 'main--map' : ''}`}>
        {mainContent}
      </main>
      {sidebar}
        </>
      )}
      </div>
    </div>
    <MobileLayoutPrompt onChoice={() => setVisualsKey((k) => k + 1)} />
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
    </>
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
