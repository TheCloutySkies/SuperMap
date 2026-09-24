/** Canonical Crime Intelligence page view id (ModeRail CRIME, Radial, Home, Omnibar). */
export const CRIME_VIEW_ID = 'crime'
/** Legacy ids redirected to CRIME_VIEW_ID — never open the old Maps crime-map overlay. */
export const CRIME_VIEW_ALIASES = Object.freeze(['crime-map', 'crime-intel'])

export function resolveCrimeViewId(viewId) {
  if (viewId === CRIME_VIEW_ID || CRIME_VIEW_ALIASES.includes(viewId)) return CRIME_VIEW_ID
  return viewId
}

/** True when the dedicated CrimeIntelligenceView should render. */
export function isCrimeIntelligenceView(viewId) {
  return viewId === CRIME_VIEW_ID || viewId === 'crime-intel'
}

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
  MOBILE_PROMPT_SEEN: 'supermap_mobilePromptSeen',
  MAP_TOOLS_FAB_POS: 'supermap_map_tools_fab_pos',
  MAP_TOOLS_CHROME: 'supermap_map_tools_chrome',
  MAP_TOOLS_PANELS: 'supermap_map_tools_panels',
}

function scopedKey(baseKey, userId) {
  const uid = String(userId || '').trim()
  return uid ? `${baseKey}:${uid}` : baseKey
}

// Intelligence layer toggle keys (default all off)
export const DEFAULT_LAYER_TOGGLES = {
  openRailwayMap: false,
  powerGrid: false,
  liveWildfires: false,
  gdacs: false,
  usgsEarthquakes: false,
  emscEarthquakes: false,
  nwsAlerts: false,
  usgsVolcanoes: false,
  nhcTropical: false,
  milAircraft: false,
  noaaRadar: false,
  aoiDraw: false,
  sentinel2BurnScars: false,
  utilityOutages: false,
  commsInfrastructure: false,
  dayNightTerminator: false,
  ukraineFrontline: false,
  iodaOutages: false,
  fccTowers: false,
  dataCenters: false,
  odintRegions: false,
  surveillanceCapabilities: false,
  crimeStateRates: false,
  crimeCityHighlight: false,
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
  crimeMap: true,
  exploreMap: true,
  geolocateMap: true,
  osintFeeds: true,
  newsFeeds: true,
  osintX: true,
  broadcasts: true,
}

export function getTabVisibility(userId = null) {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEYS.TAB_VISIBILITY, userId))
    if (!raw) {
      // Backward compatibility with older global key.
      const legacy = localStorage.getItem(STORAGE_KEYS.TAB_VISIBILITY)
      if (!legacy) return { ...DEFAULT_TAB_VISIBILITY }
      const parsedLegacy = JSON.parse(legacy)
      return { ...DEFAULT_TAB_VISIBILITY, ...parsedLegacy }
    }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_TAB_VISIBILITY, ...parsed }
  } catch {
    return { ...DEFAULT_TAB_VISIBILITY }
  }
}

export function setTabVisibility(prefs, userId = null) {
  localStorage.setItem(scopedKey(STORAGE_KEYS.TAB_VISIBILITY, userId), JSON.stringify(prefs))
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

export function getVisualsPrefs(userId = null) {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEYS.VISUALS_PREFS, userId))
    let parsed = null
    if (!raw) {
      const legacy = localStorage.getItem(STORAGE_KEYS.VISUALS_PREFS)
      if (!legacy) return { ...DEFAULT_VISUALS }
      parsed = JSON.parse(legacy)
    } else {
      parsed = JSON.parse(raw)
    }
    // Constant night mode — ignore any stored light theme
    return { ...DEFAULT_VISUALS, ...parsed, theme: 'dark' }
  } catch {
    return { ...DEFAULT_VISUALS }
  }
}

export function setVisualsPrefs(prefs, userId = null) {
  const next = { ...(prefs || {}), theme: 'dark' }
  localStorage.setItem(scopedKey(STORAGE_KEYS.VISUALS_PREFS, userId), JSON.stringify(next))
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
  {
    id: 'osm-standard',
    label: 'OpenStreetMap (POIs & places)',
    type: 'raster',
    attribution: '© OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
  },
  {
    id: 'carto-voyager',
    label: 'Carto Voyager',
    type: 'raster',
    attribution: '© CARTO',
    tiles: [
      'https://a.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png',
    ],
    tileSize: 256,
  },
  {
    id: 'nasa-black-marble',
    label: 'NASA Black Marble (night lights)',
    type: 'raster',
    attribution: 'NASA, Esri',
    tiles: [
      'https://tiles.arcgis.com/tiles/P3ePLMYs2RVChkJx/arcgis/rest/services/Earth_at_Night_WM/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
  },
  {
    id: 'esri-hillshade',
    label: 'ESRI Hillshade',
    type: 'raster',
    attribution: 'Esri',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
  },
  {
    id: 'usgs-national-map',
    label: 'USGS National Map (USA)',
    type: 'raster',
    attribution: 'USGS',
    tiles: [
      'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
  },
]
