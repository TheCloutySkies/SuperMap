/**
 * The XP desktop's window state: one page window plus up to six floaters.
 *
 * The route owns the page window, so the URL stays the source of truth for a
 * full page. Previews ("applets") are the homepage panels opened as small
 * windows: they never touch the URL, they cascade, they remember their frame,
 * and the whole set comes back after a reload.
 */
const KEY = 'supermap.xp.desktop.v1'
const MAX_APPLETS = 6
const CASCADE_STEP = 28
const DEFAULT_FRAME = { w: 420, h: 300 }

let state = {
  applets: {},
  order: [],
  activeId: null,
  startOpen: false,
  page: { route: null, title: 'Good Palantir', minimized: [] },
  cascade: 0,
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
  persist()
}

function persist() {
  try {
    const open = state.order
      .map((id) => state.applets[id])
      .filter(Boolean)
      .map((row) => ({ id: row.id, frame: row.frame, z: row.z }))
    localStorage.setItem(KEY, JSON.stringify({ open, activeId: state.activeId }))
  } catch { /* private mode */ }
}

function clampFrame(frame) {
  const maxW = typeof window === 'undefined' ? 1200 : window.innerWidth - 24
  const maxH = typeof window === 'undefined' ? 800 : window.innerHeight - 80
  const w = Math.max(280, Math.min(frame.w, Math.max(280, maxW)))
  const h = Math.max(180, Math.min(frame.h, Math.max(180, maxH)))
  const x = Math.max(4, Math.min(frame.x, Math.max(4, maxW - w)))
  const y = Math.max(4, Math.min(frame.y, Math.max(4, maxH - h)))
  return { x, y, w, h }
}

function nextFrame(size = DEFAULT_FRAME) {
  const step = state.cascade % 8
  const baseX = 90 + step * CASCADE_STEP
  const baseY = 60 + step * CASCADE_STEP
  return clampFrame({ x: baseX, y: baseY, w: size.w || DEFAULT_FRAME.w, h: size.h || DEFAULT_FRAME.h })
}

/** Open or raise a preview; never changes the route. */
export function openApplet(entry) {
  if (!entry?.id) return
  const existing = state.applets[entry.id]
  if (existing) {
    focusWindow(entry.id)
    return
  }
  const order = [...state.order, entry.id]
  const applets = {
    ...state.applets,
    [entry.id]: {
      id: entry.id,
      kind: 'applet',
      title: entry.title,
      frame: nextFrame(entry.size),
      z: state.cascade + 1,
      openedAt: Date.now(),
    },
  }
  // Seven at once is too many: the oldest preview steps aside.
  if (order.length > MAX_APPLETS) {
    const oldest = order
      .map((id) => applets[id])
      .filter(Boolean)
      .sort((a, b) => a.openedAt - b.openedAt)[0]
    if (oldest) {
      delete applets[oldest.id]
      const index = order.indexOf(oldest.id)
      if (index >= 0) order.splice(index, 1)
    }
  }
  set({ applets, order, activeId: entry.id, cascade: state.cascade + 1 })
}

export function focusWindow(id) {
  const applet = state.applets[id]
  if (!applet) return
  set({
    applets: { ...state.applets, [id]: { ...applet, z: state.cascade + 1 } },
    activeId: id,
    cascade: state.cascade + 1,
  })
}

export function closeWindow(id) {
  if (!state.applets[id]) return
  const applets = { ...state.applets }
  delete applets[id]
  set({
    applets,
    order: state.order.filter((entry) => entry !== id),
    activeId: state.activeId === id ? (state.order.find((entry) => entry !== id) || null) : state.activeId,
  })
}

export function moveFrame(id, frame) {
  const applet = state.applets[id]
  if (!applet) return
  set({ applets: { ...state.applets, [id]: { ...applet, frame: clampFrame(frame) } } })
}

export function minimizeWindow() {
  if (!state.page.route) return
  const entry = { route: state.page.route, title: state.page.title }
  set({
    page: {
      ...state.page,
      route: null,
      title: 'Good Palantir',
      minimized: [...state.page.minimized.filter((row) => row.route !== entry.route), entry],
    },
  })
}

export function restorePage(route) {
  set({ page: { ...state.page, minimized: state.page.minimized.filter((row) => row.route !== route) } })
}

export function setActiveWindow({ route, title, id }) {
  const nextMin = state.page.minimized.filter((entry) => entry.route !== route)
  if (state.page.route === route && state.page.title === title && state.page.minimized.length === nextMin.length) {
    set({ page: { ...state.page, title } })
    return
  }
  try {
    localStorage.setItem('supermap.xp.window.v1', JSON.stringify({ route, title }))
  } catch { /* private mode */ }
  set({ page: { route, title, minimized: nextMin }, activeId: null })
  void id
}

export function closePage() {
  set({ page: { ...state.page, route: null, title: 'Good Palantir' } })
}

export function toggleStart(open) {
  set({ startOpen: open == null ? !state.startOpen : Boolean(open) })
}

export function closeAllApplets() {
  set({ applets: {}, order: [], activeId: null })
}

export function lastRoute() {
  try {
    const raw = JSON.parse(localStorage.getItem('supermap.xp.window.v1') || 'null')
    return raw?.route || null
  } catch {
    return null
  }
}

/** Bring back the previews that were open, in their frames. */
export function restoreSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    const open = Array.isArray(raw?.open) ? raw.open : []
    if (!open.length) return
    const applets = {}
    const order = []
    open.forEach((row, index) => {
      if (!row?.id) return
      applets[row.id] = {
        id: row.id,
        kind: 'applet',
        title: row.id,
        frame: clampFrame(row.frame || nextFrame()),
        z: index + 1,
        openedAt: Date.now() + index,
      }
      order.push(row.id)
    })
    set({ applets, order, cascade: order.length })
  } catch { /* private mode */ }
}
