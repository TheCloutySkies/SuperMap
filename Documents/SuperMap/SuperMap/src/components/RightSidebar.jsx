import { useState } from 'react'
import { BASEMAPS } from '../constants'
import OverpassConsole from './OverpassConsole'
import LiveuamapRssWidget from './LiveuamapRssWidget'
import './RightSidebar.css'

const OSINT_LAYER_SECTIONS = [
  {
    title: 'Infrastructure',
    layers: [
      { key: 'openRailwayMap', label: 'Open Railway Map' },
      { key: 'powerGrid', label: 'Power Grid' },
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
      { key: 'adsbAircraft', label: 'ADS-B Exchange (Aircraft)', statusKey: 'adsb' },
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
      { key: 'utilityOutages', label: 'Utility Outages' },
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
  const handleLayerToggle = (key, checked) => {
    onLayerTogglesChange?.((prev) => ({ ...prev, [key]: checked }))
  }

  if (!visible) return null

  const isConflictMap = activeView === 'conflict-map'
  const sections = isConflictMap ? CONFLICT_LAYER_SECTIONS : OSINT_LAYER_SECTIONS

  return (
    <aside className="sidebar sidebar-right">
      {onClose && (
        <div className="sidebar-right-mobile-header">
          <span className="sidebar-right-mobile-title">Layers</span>
          <button type="button" className="sidebar-right-close" onClick={onClose} aria-label="Close layers" title="Close">−</button>
        </div>
      )}
      {isMapView && (
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
        </section>
      )}

      {isMapView && !isConflictMap && (
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
                      {statusKey === 'adsb' && layerToggles[key] && (
                        <span className="layer-status-pending">Data Connection Pending</span>
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
