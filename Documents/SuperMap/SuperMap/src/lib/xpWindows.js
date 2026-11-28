/**
 * The XP desktop's window state.
 *
 * v1 is one window at a time: the route decides which window is open, so the
 * URL stays the single source of truth and the taskbar can never drift from it.
 * Minimised windows are remembered by route so restore works; nothing else is
 * persisted but the last route and the start-menu flag.
 */
const KEY = 'supermap.xp.window.v1'

let state = {
  activeId: null,
  title: 'Good Palantir',
  route: null,
  minimized: [],
  startOpen: false,
}

const listeners = new Set()

function emit() {
  for (const listener of listeners) listener(state)
}

export function subscribeXpWindows(listener) {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

export function getXpWindows() {
  return state
}

function set(next) {
  state = { ...state, ...next }
  emit()
}

/** The route changed: that window is open and active, and is no longer minimised. */
export function setActiveWindow({ route, title, id }) {
  const nextMin = state.minimized.filter((entry) => entry.route !== route)
  if (state.route === route && state.title === title && state.minimized.length === nextMin.length) {
    set({ activeId: id, minimized: nextMin })
    return
  }
  set({ activeId: id, route, title, minimized: nextMin })
  try {
    localStorage.setItem(KEY, JSON.stringify({ route, title }))
  } catch { /* private mode */ }
}

/** Minimise the open window and go back to the desktop. */
export function minimizeWindow() {
  if (!state.route) return
  const entry = { route: state.route, title: state.title, id: state.activeId }
  const minimized = [...state.minimized.filter((row) => row.route !== entry.route), entry]
  set({ minimized, activeId: null, route: null, title: 'Good Palantir' })
}

/** Take a route out of the minimised list (the caller navigates to it). */
export function restoreWindow(route) {
  set({ minimized: state.minimized.filter((entry) => entry.route !== route) })
}

export function closeWindow() {
  if (!state.route) return
  set({ minimized: state.minimized.filter((entry) => entry.route !== state.route), activeId: null, route: null, title: 'Good Palantir' })
}

export function toggleStart(open) {
  set({ startOpen: open == null ? !state.startOpen : Boolean(open) })
}

export function lastRoute() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    return raw?.route || null
  } catch {
    return null
  }
}
