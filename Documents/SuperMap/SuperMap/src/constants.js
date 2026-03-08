// LocalStorage keys
export const STORAGE_KEYS = {
  HAS_CONFIGURED: 'supermap_hasConfigured',
  TAB_VISIBILITY: 'supermap_tabVisibility',
  CONFIG_PROFILE: 'supermap_configProfile',
  AOI_FEATURES: 'supermap_aoiFeatures',
  SAVED_POINTS: 'supermap_savedPoints',
  LOCATION_REQUESTED: 'supermap_locationRequested',
  RAPIDAPI_KEYS: 'supermap_rapidapiKeys',
  VISUALS_PREFS: 'supermap_visualsPrefs',
}

// Intelligence layer toggle keys (default all off)
export const DEFAULT_LAYER_TOGGLES = {
  openRailwayMap: false,
  powerGrid: false,
  liveWildfires: false,
  gdacs: false,
  geoconfirmed: false,
  usgsEarthquakes: false,
  acled: false,
  adsbAircraft: false,
  aisShips: false,
  noaaRadar: false,
  aoiDraw: false,
  sentinel2BurnScars: false,
  utilityOutages: false,
  commsInfrastructure: false,
}

export function getAoiFeatures() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AOI_FEATURES)
    if (!raw) return { type: 'FeatureCollection', features: [] }
    return JSON.parse(raw)
  } catch {
    return { type: 'FeatureCollection', features: [] }
  }
}

export function setAoiFeatures(fc) {
  localStorage.setItem(STORAGE_KEYS.AOI_FEATURES, JSON.stringify(fc))
}

export function getSavedPoints() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SAVED_POINTS)
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed || parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
      return { type: 'FeatureCollection', features: [] }
    }
    return parsed
  } catch {
    return { type: 'FeatureCollection', features: [] }
  }
}

export function setSavedPoints(fc) {
  localStorage.setItem(STORAGE_KEYS.SAVED_POINTS, JSON.stringify(fc))
}

// Default visibility for map/feed tabs (user can hide in Settings)
export const DEFAULT_TAB_VISIBILITY = {
  osintMap: true,
  conflictMap: true,
  osintFeeds: true,
  newsFeeds: true,
  osintX: true,
  places: true,
  advancedSearch: true,
  broadcasts: true,
  saved: true,
  updates: true,
}

export function getTabVisibility() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TAB_VISIBILITY)
    if (!raw) return { ...DEFAULT_TAB_VISIBILITY }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_TAB_VISIBILITY, ...parsed }
  } catch {
    return { ...DEFAULT_TAB_VISIBILITY }
  }
}

export function setTabVisibility(prefs) {
  localStorage.setItem(STORAGE_KEYS.TAB_VISIBILITY, JSON.stringify(prefs))
}

export function hasConfigured() {
  return localStorage.getItem(STORAGE_KEYS.HAS_CONFIGURED) === 'true'
}

export function setConfigured(value = true) {
  localStorage.setItem(STORAGE_KEYS.HAS_CONFIGURED, value ? 'true' : 'false')
}

export function getConfigProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG_PROFILE)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setConfigProfile(profile) {
  localStorage.setItem(STORAGE_KEYS.CONFIG_PROFILE, JSON.stringify(profile || {}))
}

export function getRapidApiKeys() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RAPIDAPI_KEYS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function setRapidApiKeys(keys) {
  localStorage.setItem(STORAGE_KEYS.RAPIDAPI_KEYS, JSON.stringify(keys || {}))
}

const DEFAULT_VISUALS = { theme: 'dark', compact: false, fontSize: 'normal' }

export function getVisualsPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VISUALS_PREFS)
    if (!raw) return { ...DEFAULT_VISUALS }
    return { ...DEFAULT_VISUALS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_VISUALS }
  }
}

export function setVisualsPrefs(prefs) {
  localStorage.setItem(STORAGE_KEYS.VISUALS_PREFS, JSON.stringify(prefs || {}))
}

// Basemap definitions: id, label, style (URL or inline style object)
export const BASEMAPS = [
  {
    id: 'arcgis-topo',
    label: 'ArcGIS Topo World',
    type: 'raster',
    attribution: 'Esri',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
  },
  {
    id: 'high-res-satellite',
    label: 'High-Res Satellite',
    type: 'raster',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
  },
  {
    id: 'dark-matter',
    label: 'Dark Matter',
    type: 'raster',
    attribution: '© CARTO',
    tiles: [
      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    ],
    tileSize: 256,
  },
  {
    id: 'topography',
    label: 'OpenTopoMap',
    type: 'raster',
    attribution: '© OpenTopoMap',
    tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
  },
  {
    id: 'hybrid',
    label: 'Hybrid',
    type: 'hybrid',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    imagery: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    labels: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
  },
]
