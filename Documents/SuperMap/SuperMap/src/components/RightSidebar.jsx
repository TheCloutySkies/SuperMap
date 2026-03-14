import { useState } from 'react'
import { BASEMAPS } from '../constants'
import { runOverpassQuery } from '../services/layerServices'
import OverpassConsole from './OverpassConsole'
import LiveuamapRssWidget from './LiveuamapRssWidget'
import './RightSidebar.css'

const GEOLOCATE_PRESETS = [
  { name: 'Fountains, tram, shops', query: `[out:json][timeout:30];( node["amenity"="fountain"]({{bbox}}); node["railway"="tram_stop"]({{bbox}}); node["shop"]({{bbox}}); way["amenity"="fountain"]({{bbox}}); way["shop"]({{bbox}}); );out body geom;` },
  { name: 'Wind turbines + railway', query: `[out:json][timeout:30];( node["man_made"="wind_turbine"]({{bbox}}); way["railway"="rail"]({{bbox}}); way["man_made"="wind_turbine"]({{bbox}}); );out body geom;` },
  { name: 'Emergency (fire, police, hospital)', query: `[out:json][timeout:30];( node["amenity"~"fire_station|police|hospital"]({{bbox}}); way["amenity"~"fire_station|police|hospital"]({{bbox}}); );out body geom;` },
  { name: 'Cafes & restaurants', query: `[out:json][timeout:30];( node["amenity"~"cafe|restaurant"]({{bbox}}); way["amenity"~"cafe|restaurant"]({{bbox}}); );out body geom;` },
  { name: 'Schools & universities', query: `[out:json][timeout:30];( node["amenity"~"school|university|college"]({{bbox}}); way["amenity"~"school|university|college"]({{bbox}}); );out body geom;` },
  { name: 'Fuel stations', query: `[out:json][timeout:30];( node["amenity"="fuel"]({{bbox}}); way["amenity"="fuel"]({{bbox}}); );out body geom;` },
  { name: 'Pharmacies', query: `[out:json][timeout:30];( node["amenity"="pharmacy"]({{bbox}}); way["amenity"="pharmacy"]({{bbox}}); );out body geom;` },
  { name: 'Supermarkets & shops', query: `[out:json][timeout:30];( node["shop"~"supermarket|convenience|mall"]({{bbox}}); way["shop"~"supermarket|convenience"]({{bbox}}); );out body geom;` },
  { name: 'Water (rivers, lakes)', query: `[out:json][timeout:30];( way["natural"="water"]({{bbox}}); way["waterway"~"river|stream|canal"]({{bbox}}); );out body geom;` },
  { name: 'Major roads', query: `[out:json][timeout:30];( way["highway"~"motorway|trunk|primary"]({{bbox}}); );out body geom;` },
  { name: 'Airports & runways', query: `[out:json][timeout:30];( node["aeroway"="aerodrome"]({{bbox}}); way["aeroway"~"aerodrome|runway|taxiway"]({{bbox}}); );out body geom;` },
  { name: 'Power lines & towers', query: `[out:json][timeout:30];( way["power"~"line|tower"]({{bbox}}); node["power"~"tower|substation"]({{bbox}}); );out body geom;` },
  { name: 'Cell towers / masts', query: `[out:json][timeout:30];( node["man_made"="tower"]["tower:type"~"communication|cell"]({{bbox}}); node["communication"~"mobile_phone|cell"]({{bbox}}); );out body geom;` },
  { name: 'Stadiums & monuments', query: `[out:json][timeout:30];( node["leisure"="stadium"]({{bbox}}); node["historic"="monument"]({{bbox}}); way["leisure"="stadium"]({{bbox}}); way["historic"="monument"]({{bbox}}); );out body geom;` },
  { name: 'Abandoned / disused rail', query: `[out:json][timeout:30];( way["railway"~"disused|abandoned"]({{bbox}}); way["railway"="rail"]["usage"~"disused|abandoned"]({{bbox}}); );out body geom;` },
]

const OSINT_LAYER_SECTIONS = [
  {
    title: 'Infrastructure',
    layers: [
      { key: 'openRailwayMap', label: 'Open Railway Map' },
      { key: 'powerGrid', label: 'Power Grid (Worldwide)', hint: 'Overpass: lines & substations' },
      { key: 'commsInfrastructure', label: 'Comms Infrastructure' },
    ],
  },
  {
    title: 'Live Threat Monitoring',
    layers: [
      { key: 'liveWildfires', label: 'Live Wildfires' },
      { key: 'usgsEarthquakes', label: 'USGS Earthquakes' },
      { key: 'iodaOutages', label: 'Internet Outages (IODA)' },
    ],
  },
  {
    title: 'Transportation (Tactical)',
    layers: [
      { key: 'milAircraft', label: 'Military Aircraft (adsb.lol)', hint: 'Free — no API key required' },
      { key: 'aisShips', label: 'AIS (Ships)', placeholder: true },
    ],
  },
  {
    title: 'Environment & Weather',
    layers: [
      { key: 'noaaRadar', label: 'Weather radar' },
      { key: 'dayNightTerminator', label: 'Day / Night Terminator' },
      { key: 'sentinel2BurnScars', label: 'Sentinel-2 Burn Scars', hasTimeFilter: true },
    ],
  },
  {
    title: 'Conflict Overlays',
    layers: [
      { key: 'ukraineFrontline', label: 'Ukraine Frontline (DeepState)' },
    ],
  },
  {
    title: 'Surveillance & Utilities',
    layers: [
      { key: 'dataCenters', label: 'Data Centers (ATLAS)', hint: '6,266+ locations worldwide' },
      { key: 'utilityOutages', label: 'Utility Outages (US)', hint: 'US only; use Power Grid for worldwide' },
    ],
  },
  {
    title: 'FCC & Towers',
    layers: [
      { key: 'fccTowers', label: 'FCC / Towers', hint: 'Backend or Overpass cell towers' },
      { key: 'odintRegions', label: 'ODINT Recon Regions', hint: 'Digital infrastructure recon (ringmast4r/ODINT)' },
      { key: 'surveillanceCapabilities', label: 'Surveillance Capabilities (US)', hint: 'EFF Atlas + contracts (ringmast4r)' },
    ],
  },
  {
    title: 'Areas of Interest (AOI)',
    layers: [
      { key: 'aoiDraw', label: 'Draw Tool' },
    ],
  },
]

const CONFLICT_LAYER_SECTIONS = [
  {
    title: 'Conflict & Disasters',
    layers: [
      { key: 'gdacs', label: 'GDACS (Disasters)' },
      { key: 'geoconfirmed', label: 'GeoConfirmed (OSINT)' },
      { key: 'acled', label: 'ACLED (Conflict)' },
      { key: 'sentinel2BurnScars', label: 'Sentinel-2 Burn Scars', hasTimeFilter: true },
    ],
  },
]

const SENTINEL_TIME_OPTIONS = [
  { value: '24h', label: '24h ago' },
  { value: '1w', label: '1 week ago' },
  { value: '1m', label: '1 month ago' },
]

const EVENT_COUNTRY_OPTIONS = [
  { value: '', label: 'All countries' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'UA', label: 'Ukraine' },
  { value: 'RU', label: 'Russia' },
  { value: 'IL', label: 'Israel' },
  { value: 'PS', label: 'Palestine' },
  { value: 'SY', label: 'Syria' },
  { value: 'IQ', label: 'Iraq' },
  { value: 'AF', label: 'Afghanistan' },
  { value: 'CN', label: 'China' },
  { value: 'TW', label: 'Taiwan' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'PL', label: 'Poland' },
  { value: 'TR', label: 'Turkey' },
  { value: 'IR', label: 'Iran' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'YE', label: 'Yemen' },
  { value: 'ET', label: 'Ethiopia' },
  { value: 'SD', label: 'Sudan' },
  { value: 'SS', label: 'South Sudan' },
  { value: 'LY', label: 'Libya' },
  { value: 'ML', label: 'Mali' },
  { value: 'NG', label: 'Nigeria' },
]

export default function RightSidebar({
  visible,
  onClose,
  isMapView,
  activeView,
  basemapId,
  onBasemapChange,
  overlayBasemapId = null,
  onOverlayBasemapChange,
  overlayOpacity = 0.6,
  onOverlayOpacityChange,
  layerToggles = {},
  onLayerTogglesChange,
  onOverpassResults,
  onOverpassLoading,
  sentinelTime = '24h',
  onSentinelTimeChange,
  eventCountry = '',
  eventFilterByView = false,
  onEventCountryChange,
  onEventFilterByViewChange,
}) {
  const [overpassOpen, setOverpassOpen] = useState(false)
  const [geolocateRunning, setGeolocateRunning] = useState(null)
  const handleLayerToggle = (key, checked) => {
    onLayerTogglesChange?.((prev) => ({ ...prev, [key]: checked }))
  }

  if (!visible) return null

  const isConflictMap = activeView === 'conflict-map'
  const isExploreMap = activeView === 'explore-map'
  const isGeolocateMap = activeView === 'geolocate-map'
  const sections = isConflictMap ? CONFLICT_LAYER_SECTIONS : OSINT_LAYER_SECTIONS

  const runGeolocatePreset = async (preset) => {
    const bbox = window.__supermapOverpassBbox
    const fallbackBbox = [-180, -90, 180, 90]
    const [w, s, e, n] = (bbox && Array.isArray(bbox) && bbox.length === 4) ? bbox : fallbackBbox
    let q = preset.query
    if (q.includes('{{bbox}}')) {
      q = q.replace(/\{\{bbox\}\}/g, `${s},${w},${n},${e}`)
    }
    setGeolocateRunning(preset.name)
    onOverpassLoading?.(true)
    try {
      const geojson = await runOverpassQuery(q)
      onOverpassResults?.(geojson)
    } catch (err) {
      console.warn('[Geolocate]', err?.message || err)
    } finally {
      setGeolocateRunning(null)
      onOverpassLoading?.(false)
    }
  }

  return (
    <aside className="sidebar sidebar-right">
      {onClose && (
        <div className="sidebar-right-mobile-header">
          <span className="sidebar-right-mobile-title">Layers</span>
          <button type="button" className="sidebar-right-close" onClick={onClose} aria-label="Close layers" title="Close">−</button>
        </div>
      )}
      {isMapView && !isGeolocateMap && (
        <section className="right-sidebar-section">
          <h3>Base layer</h3>
          <div className="basemap-list">
            {BASEMAPS.map((b) => (
              <label
                key={b.id}
                className={`basemap-option ${b.type === 'placeholder' ? 'disabled' : ''} ${basemapId === b.id ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="basemap"
                  value={b.id}
                  checked={basemapId === b.id}
                  onChange={() => b.type !== 'placeholder' && onBasemapChange(b.id)}
                  disabled={b.type === 'placeholder'}
                />
                <span className="basemap-label">{b.label}</span>
                {b.type === 'placeholder' && b.description && (
                  <span className="basemap-hint">{b.description}</span>
                )}
              </label>
            ))}
          </div>
          {onOverlayBasemapChange && (
            <>
              <h3 className="right-sidebar-overlay-heading">Overlay (stack on base)</h3>
              <div className="basemap-list overlay-list">
                <label className={`basemap-option ${!overlayBasemapId ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="overlay"
                    checked={!overlayBasemapId}
                    onChange={() => onOverlayBasemapChange(null)}
                  />
                  <span className="basemap-label">None</span>
                </label>
                {BASEMAPS.filter((b) => b.type === 'raster' && b.id !== basemapId).map((b) => (
                  <label key={b.id} className={`basemap-option ${overlayBasemapId === b.id ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="overlay"
                      value={b.id}
                      checked={overlayBasemapId === b.id}
                      onChange={() => onOverlayBasemapChange(b.id)}
                    />
                    <span className="basemap-label">{b.label}</span>
                  </label>
                ))}
              </div>
              {overlayBasemapId && onOverlayOpacityChange && (
                <div className="overlay-opacity-row">
                  <label className="overlay-opacity-label">
                    Overlay opacity
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={overlayOpacity}
                      onChange={(e) => onOverlayOpacityChange(Number(e.target.value))}
                      className="overlay-opacity-slider"
                    />
                    <span className="overlay-opacity-value">{Math.round(overlayOpacity * 100)}%</span>
                  </label>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {isMapView && isExploreMap && (
        <>
          <section className="right-sidebar-section">
            <h3>Explore mode</h3>
            <p className="layers-hint">Draw, measure, minimap. Weather and coordinates follow map center.</p>
          </section>
          <section className="right-sidebar-section intelligence-layer-manager">
            <h3>Layers</h3>
            {sections.map((section) => (
              <div key={section.title} className="layer-subsection">
                <h4>{section.title}</h4>
                <div className="toggle-list">
                  {section.layers.map(({ key, label, placeholder, statusKey, hasTimeFilter, hint }) => (
                    <div key={key} className="toggle-option-wrapper">
                      <label className={`toggle-option ${placeholder ? 'placeholder' : ''}`}>
                        <input
                          type="checkbox"
                          checked={!!layerToggles[key]}
                          onChange={(e) => handleLayerToggle(key, e.target.checked)}
                          disabled={placeholder}
                        />
                        <span>{label}</span>
                        {placeholder && <span className="layer-placeholder-tag">Placeholder</span>}
                      </label>
                      {hint && layerToggles[key] && (
                        <span className="layer-hint">{hint}</span>
                      )}
                      {key === 'powerGrid' && layerToggles[key] && (
                        <span className="layer-hint">Zoom 14+ to load</span>
                      )}
                      {key === 'sentinel2BurnScars' && layerToggles[key] && (
                        <span className="layer-hint">Sentinel Hub instance active</span>
                      )}
                      {hasTimeFilter && layerToggles[key] && (
                        <div className="sentinel-time-filter">
                          <span className="sentinel-time-label">Historical:</span>
                          <div className="sentinel-time-btns">
                            {SENTINEL_TIME_OPTIONS.map(({ value, label: l }) => (
                              <button
                                key={value}
                                type="button"
                                className={`sentinel-time-btn ${sentinelTime === value ? 'active' : ''}`}
                                onClick={() => onSentinelTimeChange?.(value)}
                              >
                                {l}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
      {isMapView && isGeolocateMap && (
        <>
          <section className="right-sidebar-section">
            <h3>Geolocate</h3>
            <p className="layers-hint">OpenStreetMap base layer only. Run a preset Overpass query for the visible map area; results appear on the map.</p>
            <div className="geolocate-presets">
              {GEOLOCATE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className="geolocate-preset-btn"
                  onClick={() => runGeolocatePreset(preset)}
                  disabled={!!geolocateRunning}
                  title={preset.name}
                >
                  {geolocateRunning === preset.name ? '…' : preset.name}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {isMapView && !isConflictMap && !isExploreMap && !isGeolocateMap && (
        <>
          <section className="right-sidebar-section">
            <button
              type="button"
              className="overpass-console-btn"
              onClick={() => setOverpassOpen(true)}
            >
              Open Overpass Console
            </button>
          </section>

          <section className="right-sidebar-section intelligence-layer-manager">
            <h3>Intelligence Layer Manager</h3>
            <p className="layers-hint">Layers are added/removed from the map when toggled.</p>
            {sections.map((section) => (
              <div key={section.title} className="layer-subsection">
                <h4>{section.title}</h4>
                <div className="toggle-list">
                  {section.layers.map(({ key, label, placeholder, statusKey, hasTimeFilter, hint }) => (
                    <div key={key} className="toggle-option-wrapper">
                      <label className={`toggle-option ${placeholder ? 'placeholder' : ''}`}>
                        <input
                          type="checkbox"
                          checked={!!layerToggles[key]}
                          onChange={(e) => handleLayerToggle(key, e.target.checked)}
                          disabled={placeholder}
                        />
                        <span>{label}</span>
                        {placeholder && <span className="layer-placeholder-tag">Placeholder</span>}
                      </label>
                      {hint && layerToggles[key] && (
                        <span className="layer-hint">{hint}</span>
                      )}
                      {key === 'powerGrid' && layerToggles[key] && (
                        <span className="layer-hint">Zoom 14+ to load</span>
                      )}
                      {key === 'sentinel2BurnScars' && layerToggles[key] && (
                        <span className="layer-hint">Sentinel Hub instance active</span>
                      )}
                      {hasTimeFilter && layerToggles[key] && (
                        <div className="sentinel-time-filter">
                          <span className="sentinel-time-label">Historical:</span>
                          <div className="sentinel-time-btns">
                            {SENTINEL_TIME_OPTIONS.map(({ value, label: l }) => (
                              <button
                                key={value}
                                type="button"
                                className={`sentinel-time-btn ${sentinelTime === value ? 'active' : ''}`}
                                onClick={() => onSentinelTimeChange?.(value)}
                              >
                                {l}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      {isMapView && isConflictMap && (
        <>
          <section className="right-sidebar-section">
            <h3>Event filters</h3>
            <p className="layers-hint">High-confidence events only. Filter by country or current map view.</p>
            <div className="toggle-list">
              <div className="toggle-option-wrapper">
                <label className="toggle-option">
                  <input
                    type="checkbox"
                    checked={!!eventFilterByView}
                    onChange={(e) => onEventFilterByViewChange?.(e.target.checked)}
                  />
                  <span>Only current view</span>
                </label>
                <span className="layer-hint">Show events inside visible map area</span>
              </div>
              <div className="toggle-option-wrapper">
                <label className="layer-subsection-label">Country</label>
                <select
                  className="event-country-select"
                  value={eventCountry || ''}
                  onChange={(e) => onEventCountryChange?.(e.target.value)}
                >
                  {EVENT_COUNTRY_OPTIONS.map(({ value, label }) => (
                    <option key={value || 'all'} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>
          <section className="right-sidebar-section intelligence-layer-manager">
            <h3>Conflict Map Layers</h3>
            <p className="layers-hint">GDACS, ACLED, and Sentinel-2 for disaster and conflict events.</p>
            {sections.map((section) => (
              <div key={section.title} className="layer-subsection">
                <h4>{section.title}</h4>
                <div className="toggle-list">
                  {section.layers.map(({ key, label, hasTimeFilter }) => (
                    <div key={key} className="toggle-option-wrapper">
                      <label className="toggle-option">
                        <input
                          type="checkbox"
                          checked={!!layerToggles[key]}
                          onChange={(e) => handleLayerToggle(key, e.target.checked)}
                        />
                        <span>{label}</span>
                      </label>
                      {key === 'sentinel2BurnScars' && layerToggles[key] && (
                        <span className="layer-hint">Sentinel Hub instance active</span>
                      )}
                      {hasTimeFilter && layerToggles[key] && (
                        <div className="sentinel-time-filter">
                          <span className="sentinel-time-label">Historical:</span>
                          <div className="sentinel-time-btns">
                            {SENTINEL_TIME_OPTIONS.map(({ value, label: l }) => (
                              <button
                                key={value}
                                type="button"
                                className={`sentinel-time-btn ${sentinelTime === value ? 'active' : ''}`}
                                onClick={() => onSentinelTimeChange?.(value)}
                              >
                                {l}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      {overpassOpen && (
        <OverpassConsole
          onClose={() => setOverpassOpen(false)}
          onResults={(geojson) => {
            onOverpassResults?.(geojson)
            setOverpassOpen(false)
          }}
          onLoading={onOverpassLoading}
        />
      )}
    </aside>
  )
}
