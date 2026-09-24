import MobileChipBar from './MobileChipBar'
import PlaceSearch from './PlaceSearch'
import './MobileMapChrome.css'

/**
 * Mobile maps top chrome: title, place search, map-type chips, layers toggle.
 */
export default function MobileMapChrome({
  title = 'Maps',
  mapChips = [],
  onFlyTo,
  layersOpen,
  onToggleLayers,
}) {
  return (
    <div className="mobile-map-chrome">
      <div className="mobile-map-chrome-row">
        <h1 className="mobile-map-chrome-title">{title}</h1>
        <button
          type="button"
          className="mobile-map-chrome-layers"
          onClick={onToggleLayers}
          aria-pressed={!!layersOpen}
          aria-label={layersOpen ? 'Hide layers' : 'Show layers'}
        >
          {layersOpen ? 'Close layers' : 'Layers'}
        </button>
      </div>
      {onFlyTo && (
        <div className="mobile-map-chrome-search">
          <PlaceSearch onFlyTo={onFlyTo} />
        </div>
      )}
      <MobileChipBar items={mapChips} ariaLabel="Map types" />
    </div>
  )
}
