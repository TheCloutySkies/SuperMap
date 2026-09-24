/** Map tools radial + chrome visibility prefs (localStorage, supermap_* keys). */

export const MAP_TOOLS_FAB_POS_KEY = 'supermap_map_tools_fab_pos'
export const MAP_TOOLS_CHROME_KEY = 'supermap_map_tools_chrome'
export const MAP_TOOLS_PANELS_KEY = 'supermap_map_tools_panels'
export const MAP_TOOLS_PANEL_POS_KEY = 'supermap_map_tools_panel_pos'

export const DEFAULT_CHROME = {
  zoom: true,
  weather: true,
  spaceWx: true,
  coords: true,
  crimeDash: true,
  locateStack: false, // Measure/Pin/Locate live in radial by default
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadFabPosition() {
  const pos = readJson(MAP_TOOLS_FAB_POS_KEY, null)
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') return pos
  return null
}

export function saveFabPosition(pos) {
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    writeJson(MAP_TOOLS_FAB_POS_KEY, { x: pos.x, y: pos.y })
  }
}

export function loadChromePrefs() {
  return { ...DEFAULT_CHROME, ...readJson(MAP_TOOLS_CHROME_KEY, {}) }
}

export function saveChromePrefs(prefs) {
  writeJson(MAP_TOOLS_CHROME_KEY, { ...DEFAULT_CHROME, ...prefs })
}

export function loadOpenPanels() {
  const data = readJson(MAP_TOOLS_PANELS_KEY, {})
  return data && typeof data === 'object' ? data : {}
}

export function saveOpenPanels(panels) {
  writeJson(MAP_TOOLS_PANELS_KEY, panels || {})
}

export function loadPanelPositions() {
  return readJson(MAP_TOOLS_PANEL_POS_KEY, {})
}

export function savePanelPosition(panelId, pos) {
  const all = loadPanelPositions()
  all[panelId] = { x: pos.x, y: pos.y }
  writeJson(MAP_TOOLS_PANEL_POS_KEY, all)
}

export function loadPanelCollapsed(panelId) {
  try {
    return localStorage.getItem(`supermap_map_tools_panel_collapsed_${panelId}`) === '1'
  } catch {
    return false
  }
}

export function savePanelCollapsed(panelId, collapsed) {
  try {
    localStorage.setItem(`supermap_map_tools_panel_collapsed_${panelId}`, collapsed ? '1' : '0')
  } catch {
    /* ignore */
  }
}
