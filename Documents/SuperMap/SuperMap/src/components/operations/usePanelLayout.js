/**
 * Draggable, resizable, reorderable dashboard panels.
 *
 * The grid keeps ten named slots. A panel's slot is its position in `order`, so
 * dragging one over another swaps them; the dragged panel floats under the
 * pointer and flies into its new slot, which is what makes the shifting read as
 * motion rather than a jump. Heights are per panel and persisted.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const KEY = 'supermap.home.panels.v1'
export const PANEL_AREAS = ['sit', 'map', 'news', 'x', 'mkt', 'hzd', 'orb', 'bat', 'bul', 'crime']
const MIN_HEIGHT = 160
const MAX_HEIGHT = 760

function load(defaultOrder) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    const stored = Array.isArray(raw?.order) ? raw.order : null
    if (!stored) return defaultOrder
    const known = stored.filter((id) => defaultOrder.includes(id))
    return [...known, ...defaultOrder.filter((id) => !known.includes(id))]
  } catch {
    return defaultOrder
  }
}

function loadHeights() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    return raw && typeof raw.heights === 'object' && raw.heights ? raw.heights : {}
  } catch {
    return {}
  }
}

function save(order, heights) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ order, heights }))
  } catch { /* private mode */ }
}

export default function usePanelLayout(defaultOrder) {
  const [order, setOrder] = useState(() => load(defaultOrder))
  const [heights, setHeights] = useState(loadHeights)
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  const landing = useRef(null)

  useEffect(() => save(order, heights), [order, heights])

  const endDrag = useCallback(() => {
    const active = dragRef.current
    dragRef.current = null
    if (!active) return
    const panels = [...document.querySelectorAll('.op-panel:not(.is-dragging)')]
    const target = panels
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .find(({ rect }) => (
        active.point.x >= rect.left && active.point.x <= rect.right
        && active.point.y >= rect.top && active.point.y <= rect.bottom
      ))
    if (!target) {
      setDrag(null)
      return
    }
    const targetId = target.node.dataset.panelId
    const fromIndex = order.indexOf(active.id)
    const toIndex = order.indexOf(targetId)
    if (toIndex < 0 || fromIndex < 0 || toIndex === fromIndex) {
      setDrag(null)
      return
    }
    // Land in the slot before the order changes, so the panel visibly travels.
    landing.current = target.rect
    setDrag((prev) => (prev ? { ...prev, left: target.rect.left, top: target.rect.top, width: target.rect.width, landing: true } : prev))
    setTimeout(() => {
      const next = [...order]
      next.splice(fromIndex, 1)
      next.splice(toIndex, 0, active.id)
      setOrder(next)
      setDrag(null)
      landing.current = null
    }, 170)
  }, [order])

  const onPointerMove = useCallback((event) => {
    const active = dragRef.current
    if (!active) return
    active.point = { x: event.clientX, y: event.clientY }
    setDrag((prev) => (prev ? { ...prev, left: event.clientX - active.offsetX, top: event.clientY - active.offsetY } : prev))
  }, [])

  useEffect(() => {
    if (!drag) return undefined
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [drag, onPointerMove, endDrag])

  const lift = useCallback((id, panel, event) => {
    const rect = panel.getBoundingClientRect()
    dragRef.current = {
      id,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      point: { x: event.clientX, y: event.clientY },
    }
    setDrag({ id, left: rect.left, top: rect.top, width: rect.width, height: rect.height, landing: false })
    document.body.classList.add('xp-dragging')
  }, [])

  const startDrag = useCallback((id, event) => {
    if (event.button !== 0) return
    if (event.target.closest('button, a, input, select, textarea')) return
    const panel = event.currentTarget.closest('.op-panel')
    if (!panel) return
    // On touch a panel is lifted by holding it, so a swipe still scrolls the page.
    if (event.pointerType === 'touch') {
      const timer = setTimeout(() => lift(id, panel, event), 400)
      const cancel = () => {
        clearTimeout(timer)
        window.removeEventListener('pointerup', cancel)
        window.removeEventListener('pointercancel', cancel)
      }
      window.addEventListener('pointerup', cancel)
      window.addEventListener('pointercancel', cancel)
      return
    }
    lift(id, panel, event)
  }, [lift])

  /** Keyboard/tap reordering: move a panel one slot left or right. */
  const move = useCallback((id, delta) => {
    setOrder((prev) => {
      const from = prev.indexOf(id)
      const to = from + delta
      if (from < 0 || to < 0 || to >= prev.length) return prev
      const next = [...prev]
      next.splice(from, 1)
      next.splice(to, 0, id)
      return next
    })
  }, [])

  const startResize = useCallback((id, event) => {
    if (event.button !== 0) return
    event.preventDefault()
    const panel = event.currentTarget.closest('.op-panel')
    const startHeight = panel?.getBoundingClientRect().height || MIN_HEIGHT
    const startY = event.clientY
    const move = (moveEvent) => {
      const next = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(startHeight + (moveEvent.clientY - startY))))
      setHeights((prev) => ({ ...prev, [id]: next }))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [])

  const props = useCallback((id) => ({
    panelId: id,
    onDragHandle: (event) => startDrag(id, event),
    onResize: (event) => startResize(id, event),
    onMove: (delta) => move(id, delta),
    maxHeight: heights[id] || undefined,
    floating: drag?.id === id ? drag : null,
  }), [order, heights, drag, startDrag, startResize, move])

  const reset = useCallback(() => {
    setOrder(defaultOrder)
    setHeights({})
  }, [defaultOrder])

  useEffect(() => {
    if (!drag) document.body.classList.remove('xp-dragging')
  }, [drag])

  return { order, props, reset, move, dragging: Boolean(drag) }
}
