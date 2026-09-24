/**
 * Per-map-mode tool definitions for the map tools radial menu.
 * action: 'toggleChrome' | 'panel' | 'event' | 'callback'
 */

const COMMON = [
  { id: 'locate', label: 'Locate', icon: '⌖', action: 'event', event: 'supermap-locate-me' },
  { id: 'measure', label: 'Measure', icon: '📏', action: 'event', event: 'supermap-toggle-measure' },
  { id: 'pin', label: 'Pin', icon: '📍', action: 'event', event: 'supermap-toggle-tap-pin-request' },
  { id: 'layers', label: 'Layers', icon: '☰', action: 'callback', callback: 'toggleLayers' },
  { id: 'weather', label: 'Weather', icon: '☁', action: 'toggleChrome', chromeKey: 'weather' },
  { id: 'coords', label: 'Coords', icon: '⊕', action: 'toggleChrome', chromeKey: 'coords' },
  { id: 'zoom', label: 'Zoom', icon: '±', action: 'toggleChrome', chromeKey: 'zoom' },
]

export function getToolsForView(activeView) {
  const extras = []

  if (activeView !== 'explore-map') {
    extras.push({ id: 'spaceWx', label: 'Space Wx', icon: '☀', action: 'toggleChrome', chromeKey: 'spaceWx' })
  }

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

  extras.push({ id: 'chromeStack', label: 'Buttons', icon: '⋯', action: 'toggleChrome', chromeKey: 'locateStack' })

  return [...COMMON, ...extras]
}
