/**
 * The desktop icon layout: which grid cell each icon sits in, whether the
 * desktop arranges itself, and whether a drop snaps to the grid.
 *
 * Cells are stored, not pixels, so a resize keeps the arrangement. The layout
 * lives in localStorage and, when signed in, is mirrored to the user's document
 * (`users/{uid}.desktopIcons`), which the rules already let the owner write.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getAccountsFirebase } from '../features/accounts/firebaseClient'

export const CELL_W = 84
export const CELL_H = 74
export const ICON_PAD = 12

const KEY = 'supermap.xp.icons.v1'

const EMPTY = { positions: {}, autoArrange: false, alignToGrid: true }

let state = read()
const listeners = new Set()
let saveTimer = null

function read() {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw)
    return {
      positions: parsed?.positions && typeof parsed.positions === 'object' ? parsed.positions : {},
      autoArrange: parsed?.autoArrange === true,
      alignToGrid: parsed?.alignToGrid !== false,
    }
  } catch {
    return EMPTY
  }
}

function persist() {
  if (typeof window === 'undefined') return
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state))
    } catch { /* private mode */ }
  }, 300)
}

function set(next) {
  state = { ...state, ...next }
  persist()
  for (const listener of listeners) listener(state)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function getIconLayout() {
  return state
}

export function subscribeIconLayout(listener) {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

/** How many cells fit on this desktop. */
export function gridBounds(width, height, taskbarH = 40) {
  const cols = Math.max(1, Math.floor((Math.max(0, width) - ICON_PAD) / CELL_W))
  const rows = Math.max(1, Math.floor((Math.max(0, height - taskbarH) - ICON_PAD) / CELL_H))
  return { cols, rows }
}

export function cellPoint(cell) {
  return {
    left: ICON_PAD + clamp(cell.col, 0, 999) * CELL_W,
    top: ICON_PAD + clamp(cell.row, 0, 999) * CELL_H,
  }
}

export function pointCell(x, y, grid) {
  return {
    col: clamp(Math.round((x - ICON_PAD) / CELL_W), 0, grid.cols - 1),
    row: clamp(Math.round((y - ICON_PAD) / CELL_H), 0, grid.rows - 1),
  }
}

/** The nearest free cell, searching outward from a preferred one. */
function nearestFree(taken, grid, col, row) {
  const start = { col: clamp(col, 0, grid.cols - 1), row: clamp(row, 0, grid.rows - 1) }
  if (!taken.has(`${start.col}:${start.row}`)) return start
  for (let ring = 1; ring < grid.cols + grid.rows; ring += 1) {
    for (let dc = -ring; dc <= ring; dc += 1) {
      for (let dr = -ring; dr <= ring; dr += 1) {
        if (Math.abs(dc) !== ring && Math.abs(dr) !== ring) continue
        const nextCol = start.col + dc
        const nextRow = start.row + dr
        if (nextCol < 0 || nextRow < 0 || nextCol >= grid.cols || nextRow >= grid.rows) continue
        if (!taken.has(`${nextCol}:${nextRow}`)) return { col: nextCol, row: nextRow }
      }
    }
  }
  return start
}

/** Column-major slot for an index, which is XP's own arrangement. */
function flowCell(index, grid) {
  return {
    col: Math.floor(index / grid.rows),
    row: index % grid.rows,
  }
}

/** Every icon's cell: stored ones first, then the free cells for the rest. */
export function layoutCells(ids, layout, grid) {
  const out = {}
  if (layout.autoArrange) {
    ids.forEach((id, index) => { out[id] = flowCell(index, grid) })
    return out
  }
  const taken = new Set()
  for (const id of ids) {
    const cell = layout.positions?.[id]
    if (!cell || !Number.isFinite(cell.col) || !Number.isFinite(cell.row)) continue
    const col = clamp(Math.round(cell.col), 0, grid.cols - 1)
    const row = clamp(Math.round(cell.row), 0, grid.rows - 1)
    if (taken.has(`${col}:${row}`)) continue
    taken.add(`${col}:${row}`)
    out[id] = { col, row }
  }
  let index = 0
  for (const id of ids) {
    if (out[id]) continue
    let cell = flowCell(index, grid)
    while (taken.has(`${cell.col}:${cell.row}`) && index < grid.cols * grid.rows) {
      index += 1
      cell = flowCell(index, grid)
    }
    out[id] = cell
    taken.add(`${cell.col}:${cell.row}`)
    index += 1
  }
  return out
}

/** Drop an icon on a cell; a taken cell hands it the nearest free one. */
export function moveIcon(id, cell, grid, ids = []) {
  const cells = layoutCells(ids, state, grid)
  const taken = new Set(
    Object.entries(cells)
      .filter(([key]) => key !== id)
      .map(([, row]) => `${row.col}:${row.row}`),
  )
  const target = nearestFree(taken, grid, cell.col, cell.row)
  set({ positions: { ...state.positions, [id]: target }, autoArrange: false })
  return target
}

/** Arrow keys move the focused icon one cell. */
export function moveIconBy(id, dx, dy, grid, ids = []) {
  const cells = layoutCells(ids, state, grid)
  const from = cells[id]
  if (!from) return
  moveIcon(id, { col: from.col + dx, row: from.row + dy }, grid, ids)
}

export function setAutoArrange(on, grid, ids = []) {
  if (on) {
    set({ autoArrange: true })
    return
  }
  const seeded = layoutCells(ids, { ...state, autoArrange: true }, grid)
  set({ autoArrange: false, positions: { ...state.positions, ...seeded } })
}

export function setAlignToGrid(on) {
  set({ alignToGrid: on !== false })
}

export function resetIconLayout() {
  set({ positions: {}, autoArrange: false })
}

export function arrangeIconsBy(by, ids = [], grid = { cols: 8, rows: 6 }) {
  const cells = layoutCells(ids, state, grid)
  const order = [...ids]
  if (by === 'name') order.sort((a, b) => a.localeCompare(b))
  else if (by === 'type') order.sort((a, b) => {
    const typeA = a.includes('-') ? a.split('-')[0] : a
    const typeB = b.includes('-') ? b.split('-')[0] : b
    return typeA.localeCompare(typeB) || a.localeCompare(b)
  })
  const positions = { ...state.positions }
  order.forEach((id, index) => { positions[id] = cells[id] || flowCell(index, grid) })
  set({ positions, autoArrange: false })
}

/** Mirror the layout to the account so it follows the person. */
export async function syncIconLayout(uid) {
  if (!uid) return
  try {
    const firebase = getAccountsFirebase()
    if (!firebase?.db) return
    await setDoc(doc(firebase.db, 'users', uid), { desktopIcons: state }, { merge: true })
  } catch { /* offline: localStorage keeps it */ }
}

/** A layout already saved locally wins over the account's copy. */
export async function loadAccountLayout(uid) {
  if (!uid) return
  try {
    const firebase = getAccountsFirebase()
    if (!firebase?.db) return
    const snap = await getDoc(doc(firebase.db, 'users', uid))
    if (!snap.exists()) return
    const row = snap.data()?.desktopIcons
    if (!row || typeof row !== 'object') return
    if (Object.keys(state.positions).length) return
    set({
      positions: row.positions && typeof row.positions === 'object' ? row.positions : {},
      autoArrange: row.autoArrange === true,
      alignToGrid: row.alignToGrid !== false,
    })
  } catch { /* keep what is local */ }
}
