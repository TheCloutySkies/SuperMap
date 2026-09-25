import MobileChipBar from './MobileChipBar'
import MobileHomeButton from './MobileHomeButton'
import MobileMapChrome from './MobileMapChrome'
import './MobileShell.css'

/**
 * Dedicated mobile chrome: hub (home) vs full-page modes with bottom Home.
 * Children = main view content (map, feeds, etc.).
 */
export default function MobileShell({
  isHub,
  pageTitle,
  chipItems = [],
  isMapPage = false,
  mapChips = [],
  onFlyTo,
  layersOpen,
  onToggleLayers,
  onGoHome,
  children,
}) {
  if (isHub) {
    return (
      <div className="mobile-shell mobile-shell--hub">
        <div className="mobile-shell-hub-scroll">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className={`mobile-shell mobile-shell--page ${isMapPage ? 'mobile-shell--map' : ''}`}>
      {isMapPage ? (
        <MobileMapChrome
          title={pageTitle || 'Maps'}
          mapChips={mapChips}
          onFlyTo={onFlyTo}
          layersOpen={layersOpen}
          onToggleLayers={onToggleLayers}
        />
      ) : (
        <header className="mobile-page-header">
          <h1 className="mobile-page-title">{pageTitle || 'Good Palantir'}</h1>
          {chipItems.length > 0 && (
            <MobileChipBar items={chipItems} ariaLabel={`${pageTitle || 'Page'} views`} />
          )}
        </header>
      )}
      <div className={`mobile-page-body ${isMapPage ? 'mobile-page-body--map' : ''}`}>
        {children}
      </div>
      <MobileHomeButton onClick={onGoHome} />
    </div>
  )
}
