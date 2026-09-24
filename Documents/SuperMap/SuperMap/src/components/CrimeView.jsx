import CrimeDashboard from './CrimeDashboard'
import MapView from './MapView'
import WeatherHUD from './WeatherHUD'
import './CrimeView.css'

/**
 * Standalone Crime section: analytics panel + choropleth map.
 * Not part of the Maps flyout — opened via the CRIME mode rail item.
 */
export default function CrimeView({
  basemapId,
  overlayBasemapId,
  overlayOpacity,
  layerToggles,
  isMapLoading,
  onLoadingChange,
  overpassResults,
  sentinelTime,
  flyToTarget,
  onFlyToComplete,
  onSearchDataUpdate,
  layerFilterKeyword,
  searchResultsGeoJson,
  eventCountry,
  eventFilterByView,
  weatherCoords,
  mapCenter,
  onMapCenterChange,
  userCoords,
  onFlyTo,
  onFlyToCity,
  onSearchCoords,
}) {
  return (
    <div className="crime-section" role="region" aria-label="Crime intelligence">
      <div className="crime-section-panel">
        <CrimeDashboard variant="section" onFlyToCity={onFlyToCity} />
      </div>
      <div className="crime-section-map">
        <MapView
          basemapId={basemapId}
          overlayBasemapId={overlayBasemapId}
          overlayOpacity={overlayOpacity}
          layerToggles={layerToggles}
          isMapLoading={isMapLoading}
          onLoadingChange={onLoadingChange}
          overpassResults={overpassResults}
          sentinelTime={sentinelTime}
          flyToTarget={flyToTarget}
          onFlyToComplete={onFlyToComplete}
          onSearchDataUpdate={onSearchDataUpdate}
          layerFilterKeyword={layerFilterKeyword}
          searchResultsGeoJson={searchResultsGeoJson}
          activeView="crime-map"
          eventCountry={eventCountry || null}
          eventFilterByView={eventFilterByView}
          weatherCoords={weatherCoords}
          mapCenter={mapCenter}
          onMapCenterChange={onMapCenterChange}
        />
        <WeatherHUD
          lat={weatherCoords?.lat ?? userCoords?.lat}
          lon={weatherCoords?.lon ?? userCoords?.lon}
          onSearchCoords={(lng, lat) => {
            onSearchCoords?.(lng, lat)
            onFlyTo?.({ lng, lat, zoom: 10 })
          }}
        />
      </div>
    </div>
  )
}
