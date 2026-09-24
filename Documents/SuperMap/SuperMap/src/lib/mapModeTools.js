/**
 * Per-map-mode tool definitions for the map tools radial menu.
 * Keep the orbit small (~6–8 items) so buttons don’t overlap.
 * Chrome toggles (weather/coords/…) live in the Chrome panel.
 * Zoom opens its own collapsible panel (not fixed chrome).
 */

const COMMON = [
  { id: 'locate', label: 'Locate', icon: '⌖', action: 'event', event: 'supermap-locate-me' },
  { id: 'measure', label: 'Measure', icon: '📏', action: 'event', event: 'supermap-toggle-measure' },
  { id: 'pin', label: 'Pin', icon: '📍', action: 'event', event: 'supermap-toggle-tap-pin-request' },
  { id: 'zoom', label: 'Zoom', icon: '±', action: 'panel', panel: 'zoom' },
  { id: 'layers', label: 'Layers', icon: '☰', action: 'callback', callback: 'toggleLayers' },
  { id: 'chrome', label: 'Chrome', icon: '👁', action: 'panel', panel: 'chrome' },
]

export function getToolsForView(activeView) {
  const extras = []

  if (activeView === 'osint-map') {
    extras.push({ id: 'overpass', label: 'Overpass', icon: '⌘', action: 'callback', callback: 'openOverpass' })
  }

  if (activeView === 'conflict-map') {
    extras.push({ id: 'events', label: 'Events', icon: '⚡', action: 'callback', callback: 'toggleLayers' })
  }

  if (activeView === 'crime-map') {
    extras.push({ id: 'crimeDash', label: 'Crime', icon: '▣', action: 'toggleChrome', chromeKey: 'crimeDash' })
  }

  if (activeView === 'explore-map') {
    extras.push({ id: 'draw', label: 'Draw', icon: '✎', action: 'panel', panel: 'draw' })
  }

  if (activeView === 'geolocate-map') {
    extras.push({ id: 'presets', label: 'Presets', icon: '◎', action: 'panel', panel: 'geolocatePresets' })
  }

  return [...COMMON, ...extras]
}

/** Labels for chrome toggles shown in the Chrome panel */
export const CHROME_TOGGLES = [
  { key: 'zoom', label: 'Docked zoom / compass (map corner)' },
  { key: 'weather', label: 'Weather HUD' },
  { key: 'spaceWx', label: 'Space Wx (Kp)' },
  { key: 'coords', label: 'Coordinates' },
  { key: 'crimeDash', label: 'Crime dashboard', views: ['crime-map'] },
  { key: 'locateStack', label: 'Classic Measure / Pin / Locate buttons' },
]
