/**
 * Strategic console preferences: the desk remembers how you left it.
 * Kept apart from the app's visual prefs so a theme change never resets filters.
 */
import { DOMAIN_ORDER } from './consoleSignals'

export const CONSOLE_PREFS_KEY = 'supermap.strategicConsole.v1'
export const CONSOLE_VIEWS_KEY = 'supermap.strategicConsole.views.v1'

/** Accent choices for the desk only. */
export const ACCENTS = [
  { id: 'cyan', label: 'Cyan · default', hex: '#22d3ee', soft: 'rgba(34,211,238,.14)', glow: 'rgba(34,211,238,.45)' },
  { id: 'amber', label: 'Amber · alert', hex: '#ffb020', soft: 'rgba(255,176,32,.14)', glow: 'rgba(255,176,32,.45)' },
  { id: 'magenta', label: 'Magenta · recon', hex: '#ff4fd8', soft: 'rgba(255,79,216,.14)', glow: 'rgba(255,79,216,.45)' },
  { id: 'green', label: 'Green · nominal', hex: '#57e389', soft: 'rgba(87,227,137,.14)', glow: 'rgba(87,227,137,.45)' },
]

export const CONSOLE_WINDOWS = [
  { id: 1, label: 'Last 1 hour' },
  { id: 6, label: 'Last 6 hours' },
  { id: 24, label: 'Last 24 hours' },
  { id: 72, label: 'Last 3 days' },
  { id: 168, label: 'Last 7 days' },
]

export const DEFAULT_CONSOLE_PREFS = {
  mode: 'brief',
  region: 'global',
  windowHours: 24,
  domains: [...DOMAIN_ORDER],
  minConfidence: 0,
  sort: 'significance',
  density: 'comfort',
  accent: 'cyan',
  alerts: true,
  alertThreshold: 70,
  sound: false,
  watch: [],
  scrubHours: 24,
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

export function loadConsolePrefs() {
  const stored = readJson(CONSOLE_PREFS_KEY, {})
  const merged = { ...DEFAULT_CONSOLE_PREFS, ...stored }
  const domains = Array.isArray(merged.domains)
    ? merged.domains.filter((id) => DOMAIN_ORDER.includes(id))
    : [...DOMAIN_ORDER]
  return {
    ...merged,
    domains: domains.length ? domains : [...DOMAIN_ORDER],
    watch: Array.isArray(merged.watch) ? merged.watch.filter((id) => typeof id === 'string') : [],
    windowHours: CONSOLE_WINDOWS.some((w) => w.id === Number(merged.windowHours))
      ? Number(merged.windowHours)
      : DEFAULT_CONSOLE_PREFS.windowHours,
    minConfidence: Math.max(0, Math.min(90, Number(merged.minConfidence) || 0)),
    alertThreshold: Math.max(40, Math.min(95, Number(merged.alertThreshold) || 70)),
    scrubHours: Math.max(1, Math.min(24, Number(merged.scrubHours) || 24)),
  }
}

export function saveConsolePrefs(prefs) {
  try {
    localStorage.setItem(CONSOLE_PREFS_KEY, JSON.stringify(prefs))
  } catch { /* private mode */ }
}

export function loadSavedViews() {
  const stored = readJson(CONSOLE_VIEWS_KEY, [])
  if (!Array.isArray(stored)) return []
  return stored.filter((view) => view && typeof view.name === 'string').slice(0, 12)
}

export function saveSavedViews(views) {
  try {
    localStorage.setItem(CONSOLE_VIEWS_KEY, JSON.stringify(views.slice(0, 12)))
  } catch { /* private mode */ }
}
