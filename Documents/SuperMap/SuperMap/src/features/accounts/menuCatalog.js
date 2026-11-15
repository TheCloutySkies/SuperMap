import { APP_MODES } from '../../lib/appRoutes'

export const MODE_VISIBILITY_KEY = 'supermap.modeVisibility.v1'

/** Shared by the left rail and the circular menu. Home and Settings stay pinned. */
export const MODE_CATALOG = [
  { id: APP_MODES.HOME, label: 'Home', icon: '⌂', pinned: true },
  { id: APP_MODES.MAPS, label: 'Maps', icon: '◎' },
  { id: APP_MODES.CRIME, label: 'Crime', icon: '📉' },
  { id: APP_MODES.WEATHER, label: 'Weather', icon: '☁' },
  { id: APP_MODES.FEEDS, label: 'News', icon: '☰' },
  { id: APP_MODES.BULLETIN, label: 'Bulletin', icon: '▤' },
  { id: APP_MODES.TOOLS, label: 'Tools', icon: '⚒' },
  { id: APP_MODES.RESOURCES, label: 'Resources', icon: '▣' },
  { id: APP_MODES.REPORTS, label: 'Reports', icon: '✎' },
  { id: APP_MODES.SETTINGS, label: 'Settings', icon: '⚙', pinned: true },
]

export function getModeVisibility() {
  try {
    const raw = localStorage.getItem(MODE_VISIBILITY_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const next = {}
    for (const mode of MODE_CATALOG) next[mode.id] = mode.pinned ? true : parsed[mode.id] !== false
    return next
  } catch {
    return Object.fromEntries(MODE_CATALOG.map((mode) => [mode.id, true]))
  }
}

export function setModeVisibility(next) {
  const stored = {}
  for (const mode of MODE_CATALOG) {
    if (!mode.pinned) stored[mode.id] = next[mode.id] !== false
  }
  localStorage.setItem(MODE_VISIBILITY_KEY, JSON.stringify(stored))
  window.dispatchEvent(new CustomEvent('supermap:modes-changed'))
}

export function visibleModes(visibility = getModeVisibility()) {
  return MODE_CATALOG.filter((mode) => mode.pinned || visibility[mode.id] !== false)
}

export const PROFILE_EMOJIS = ['◈', '🎭', '🦅', '🌊', '🔥', '🌲', '⛰', '☀', '🌙', '📡', '🗺', '✎', '⚖', '⚓', '🧭', '🦊', '🦉', '🐺', '🌵', '❄']

export const REPORT_OWNER_EMAIL = 'lonnie034@gmail.com'

export const STARTER_BOARDS = [
  { id: 'general', name: 'General', description: 'Anything that does not belong in a narrower group.', emoji: '📌' },
  { id: 'field-notes', name: 'Field notes', description: 'Places, weather, and what you saw on the map.', emoji: '⌖' },
  { id: 'site-help', name: 'Site help', description: 'Something broken, confusing, or missing.', emoji: '⚙' },
]
