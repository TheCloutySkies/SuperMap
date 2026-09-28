import { CRIME_VIEW_ID, WEATHER_VIEW_ID, resolveCrimeViewId, CRIME_VIEW_ALIASES } from '../constants'

/** Mode ids used by ModeRail / MobileShell / App. */
export const APP_MODES = {
  HOME: 'HOME',
  MAPS: 'MAPS',
  CRIME: 'CRIME',
  WEATHER: 'WEATHER',
  FEEDS: 'FEEDS',
  TOOLS: 'TOOLS',
  RESOURCES: 'RESOURCES',
  REPORTS: 'REPORTS',
  SETTINGS: 'SETTINGS',
}

/** Map tool URL segment → activeView id. `/maps` alone → osint-map. */
const MAP_TOOL_TO_VIEW = Object.freeze({
  osint: 'osint-map',
  'osint-map': 'osint-map',
  conflict: 'conflict-map',
  'conflict-map': 'conflict-map',
  explore: 'explore-map',
  'explore-map': 'explore-map',
  geolocate: 'geolocate-map',
  'geolocate-map': 'geolocate-map',
  flock: 'flock-map',
  'flock-map': 'flock-map',
  webcams: 'live-webcams',
  'live-webcams': 'live-webcams',
})

const VIEW_TO_MAP_TOOL = Object.freeze({
  'osint-map': null,
  'conflict-map': 'conflict',
  'explore-map': 'explore',
  'geolocate-map': 'geolocate',
  'flock-map': 'flock',
  'live-webcams': 'webcams',
})

const VIEW_TO_PATH = Object.freeze({
  home: '/',
  'osint-map': '/maps',
  'conflict-map': '/maps/conflict',
  'explore-map': '/maps/explore',
  'geolocate-map': '/maps/geolocate',
  'flock-map': '/maps/flock',
  'live-webcams': '/maps/webcams',
  [CRIME_VIEW_ID]: '/crime',
  'crime-intel': '/crime',
  'crime-map': '/crime',
  [WEATHER_VIEW_ID]: '/weather',
  'news-feeds': '/news',
  'osint-feeds': '/news/osint',
  'recent-videos': '/news/videos',
  'osint-x': '/news/x',
  broadcasts: '/news/broadcasts',
  tools: '/tools',
  resources: '/resources',
  'report-maker': '/reports',
  settings: '/settings',
  'search-results': '/search',
})

const PATH_TO_VIEW = Object.freeze({
  '/': 'home',
  '/maps': 'osint-map',
  '/crime': CRIME_VIEW_ID,
  '/weather': WEATHER_VIEW_ID,
  '/news': 'news-feeds',
  '/news/osint': 'osint-feeds',
  '/news/videos': 'recent-videos',
  '/news/x': 'osint-x',
  '/news/broadcasts': 'broadcasts',
  '/tools': 'tools',
  '/resources': 'resources',
  '/reports': 'report-maker',
  '/settings': 'settings',
  '/search': 'search-results',
})

const FEED_VIEW_IDS = new Set([
  'osint-feeds',
  'osint-x',
  'advanced-search',
  'news-feeds',
  'broadcasts',
  'recent-videos',
])

const MAP_VIEW_IDS = new Set(Object.keys(VIEW_TO_MAP_TOOL))

/**
 * Normalize pathname: strip trailing slash (except `/`), drop query/hash.
 * @param {string} pathname
 * @returns {string}
 */
export function normalizePath(pathname) {
  if (!pathname || typeof pathname !== 'string') return '/'
  let p = pathname.split('?')[0].split('#')[0].trim() || '/'
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p || '/'
}

/**
 * Parse a location pathname into a view id.
 * Unknown paths → `{ viewId: 'home', unknown: true }` (caller should redirect to `/`).
 * @param {string} pathname
 * @returns {{ viewId: string, mapTool?: string|null, unknown?: boolean }}
 */
export function viewFromPath(pathname) {
  const path = normalizePath(pathname)
  if (PATH_TO_VIEW[path]) {
    const viewId = PATH_TO_VIEW[path]
    return {
      viewId,
      mapTool: MAP_VIEW_IDS.has(viewId) ? VIEW_TO_MAP_TOOL[viewId] : undefined,
    }
  }
  if (path.startsWith('/maps/')) {
    const tool = path.slice('/maps/'.length)
    const viewId = MAP_TOOL_TO_VIEW[tool]
    if (viewId) return { viewId, mapTool: VIEW_TO_MAP_TOOL[viewId] }
  }
  return { viewId: 'home', unknown: true }
}

/**
 * Build a path for a view id (omnibar / ModeRail / Home quick links).
 * @param {string} viewId
 * @returns {string}
 */
export function pathFromView(viewId) {
  if (!viewId) return '/'
  const resolved = resolveCrimeViewId(viewId)
  if (VIEW_TO_PATH[resolved]) return VIEW_TO_PATH[resolved]
  if (CRIME_VIEW_ALIASES.includes(viewId)) return '/crime'
  return '/'
}

/**
 * Default path for a ModeRail mode id.
 * @param {string} mode
 * @returns {string}
 */
export function pathFromMode(mode) {
  switch (mode) {
    case APP_MODES.HOME:
      return '/'
    case APP_MODES.MAPS:
      return '/maps'
    case APP_MODES.CRIME:
      return '/crime'
    case APP_MODES.WEATHER:
      return '/weather'
    case APP_MODES.FEEDS:
      return '/news'
    case APP_MODES.TOOLS:
      return '/tools'
    case APP_MODES.RESOURCES:
      return '/resources'
    case APP_MODES.REPORTS:
      return '/reports'
    case APP_MODES.SETTINGS:
      return '/settings'
    default:
      return '/'
  }
}

/**
 * Derive ModeRail mode from active view id.
 * @param {string} viewId
 * @returns {string}
 */
export function modeFromView(viewId) {
  const resolved = resolveCrimeViewId(viewId)
  if (resolved === CRIME_VIEW_ID) return APP_MODES.CRIME
  if (resolved === WEATHER_VIEW_ID) return APP_MODES.WEATHER
  if (MAP_VIEW_IDS.has(resolved)) return APP_MODES.MAPS
  if (FEED_VIEW_IDS.has(resolved) || resolved === 'search-results') return APP_MODES.FEEDS
  if (resolved === 'home') return APP_MODES.HOME
  if (resolved === 'tools') return APP_MODES.TOOLS
  if (resolved === 'resources') return APP_MODES.RESOURCES
  if (resolved === 'report-maker') return APP_MODES.REPORTS
  if (resolved === 'settings') return APP_MODES.SETTINGS
  return APP_MODES.HOME
}

export { MAP_VIEW_IDS, FEED_VIEW_IDS, MAP_TOOL_TO_VIEW }
