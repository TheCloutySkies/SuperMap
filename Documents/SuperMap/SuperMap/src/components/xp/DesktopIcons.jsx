/**
 * The desktop: one icon per door, laid out in grid cells.
 *
 * Click selects, double-click (or a tap) opens, Enter opens. On a desktop the
 * icons drag from cell to cell and the layout is remembered.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import XpIcon from './XpIcon'
import { visibleModes } from '../../features/accounts/menuCatalog'
import { useSuperMapAccount } from '../../features/accounts/SuperMapAccounts'
import { PANEL_PREVIEWS } from '../operations/panels/panelRegistry'
import {
  arrangeIconsBy,
  cellPoint,
  getIconLayout,
  gridBounds,
  layoutCells,
  loadAccountLayout,
  moveIcon,
  moveIconBy,
  pointCell,
  resetIconLayout,
  setAlignToGrid,
  setAutoArrange,
  subscribeIconLayout,
  syncIconLayout,
} from '../../lib/desktopIcons'

const SHORTCUTS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', view: 'home' },
  { id: 'vault', label: 'My Vault', icon: 'vault', vault: true },
]

const MODE_ICONS = {
  HOME: 'dashboard',
  MAPS: 'maps',
  CRIME: 'crime',
  WEATHER: 'weather',
  BATMAN: 'batman',
  FEEDS: 'news',
  BULLETIN: 'bulletin',
  TOOLS: 'tools',
  RESOURCES: 'resources',
  REPORTS: 'reports',
  SETTINGS: 'settings',
}

const ARROWS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export default function DesktopIcons({ onMode, onView, onOpenApplet, onRefresh }) {
  const navigate = useNavigate()
  const { user, setOverlay, setWorkspaceTab } = useSuperMapAccount()
  const [selected, setSelected] = useState('dashboard')
  const [menu, setMenu] = useState(null)
  const [layout, setLayout] = useState(getIconLayout)
  const [grid, setGrid] = useState(() => gridBounds(
    (typeof window === 'undefined' ? 1200 : window.innerWidth) - 24,
    (typeof window === 'undefined' ? 800 : window.innerHeight) - 40,
  ))
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  const gridRef = useRef(null)
  const touchRef = useRef(null)

  const previews = useMemo(() => PANEL_PREVIEWS.map((panel) => ({
    id: `preview-${panel.id}`,
    label: panel.title,
    icon: panel.icon,
    applet: panel,
  })), [])

  const icons = useMemo(() => ([
    ...SHORTCUTS,
    ...visibleModes().filter((mode) => mode.id !== 'HOME').map((mode) => ({
      id: mode.id.toLowerCase(),
      label: mode.label,
      icon: MODE_ICONS[mode.id] || 'folder',
      mode: mode.id,
    })),
    ...previews,
  ]), [previews])
  const ids = useMemo(() => icons.map((entry) => entry.id), [icons])
  const cells = useMemo(() => layoutCells(ids, layout, grid), [ids, layout, grid])
  const manual = !layout.autoArrange

  function open(entry) {
    if (entry.applet) onOpenApplet?.(entry.applet)
    else if (entry.view) onView?.(entry.view)
    else if (entry.vault) {
      if (!user) {
        setOverlay('auth')
        return
      }
      setWorkspaceTab('vault')
      navigate('/accounts')
    } else if (entry.mode) onMode?.(entry.mode)
  }

  useEffect(() => subscribeIconLayout(setLayout), [])

  useEffect(() => {
    if (user?.uid) loadAccountLayout(user.uid)
  }, [user?.uid])

  // The cell count follows the window, and stored cells clamp into it.
  useEffect(() => {
    const measure = () => {
      const next = gridBounds(window.innerWidth - 24, window.innerHeight - 40)
      setGrid((prev) => (prev.cols === next.cols && prev.rows === next.rows ? prev : next))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Enter') return
      const entry = icons.find((row) => row.id === selected)
      if (entry) open(entry)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    const onDown = (event) => {
      if (!gridRef.current?.contains(event.target)) setMenu(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  function persistLayout() {
    if (user?.uid) syncIconLayout(user.uid)
  }

  function beginDrag(event, entry) {
    setSelected(entry.id)
    setMenu(null)
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (!manual) return
    dragRef.current = { id: entry.id, fromX: event.clientX, fromY: event.clientY, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (event.pointerType === 'touch') touchRef.current = { id: entry.id }
  }

  function onIconMove(event, entry) {
    const current = dragRef.current
    if (!current || current.id !== entry.id) return
    const dx = event.clientX - current.fromX
    const dy = event.clientY - current.fromY
    // A few pixels of slack on a mouse and a longer pull on a finger, so a tap
    // or a scroll never becomes a drag.
    if (!current.moved) {
      const reach = touchRef.current?.id === entry.id ? 12 : 4
      if (Math.hypot(dx, dy) < reach) return
      current.moved = true
    }
    setDrag({ id: entry.id, dx, dy })
  }

  function endDrag(event, entry) {
    const current = dragRef.current
    dragRef.current = null
    if (current?.moved) {
      const cell = cells[entry.id] || { col: 0, row: 0 }
      const box = cellPoint(cell)
      const dropped = pointCell(
        box.left + (event.clientX - current.fromX),
        box.top + (event.clientY - current.fromY),
        grid,
      )
      moveIcon(entry.id, dropped, grid, ids)
      persistLayout()
      setDrag(null)
      return
    }
    setDrag(null)
    const tapped = event.pointerType !== 'mouse' && touchRef.current?.id === entry.id
    touchRef.current = null
    if (tapped) open(entry)
  }

  return (
    <div
      className={`xp-desktop-icons${manual ? ' is-manual' : ' is-auto'}`}
      ref={gridRef}
      role="list"
      aria-label="Desktop"
      onContextMenu={(event) => {
        if (event.target.closest?.('.xp-desk-icon')) return
        event.preventDefault()
        setMenu({ id: null, x: event.clientX, y: event.clientY })
      }}
    >
      {icons.map((entry) => {
        const cell = cells[entry.id] || { col: 0, row: 0 }
        const box = cellPoint(cell)
        const dragging = drag?.id === entry.id
        return (
          <button
            key={entry.id}
            type="button"
            role="listitem"
            className={`xp-desk-icon${selected === entry.id ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
            aria-pressed={selected === entry.id}
            aria-label={entry.label}
            style={manual
              ? { left: `${box.left}px`, top: `${box.top}px`, transform: dragging ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined }
              : undefined}
            onClick={() => setSelected(entry.id)}
            onDoubleClick={() => open(entry)}
            onPointerDown={(event) => beginDrag(event, entry)}
            onPointerMove={(event) => onIconMove(event, entry)}
            onPointerUp={(event) => endDrag(event, entry)}
            onPointerCancel={() => { dragRef.current = null; setDrag(null) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                open(entry)
                return
              }
              const step = ARROWS[event.key]
              if (!step) return
              event.preventDefault()
              moveIconBy(entry.id, step[0], step[1], grid, ids)
              persistLayout()
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              setSelected(entry.id)
              setMenu({ id: entry.id, x: event.clientX, y: event.clientY })
            }}
            title={entry.label}
          >
            <XpIcon name={entry.icon} size={32} />
            <span>{entry.label}</span>
          </button>
        )
      })}
      {menu ? (
        <div className="xp-context" style={{ left: `${menu.x}px`, top: `${menu.y}px` }} role="menu">
          {menu.id ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const entry = icons.find((row) => row.id === menu.id)
                if (entry) open(entry)
                setMenu(null)
              }}
            >
              Open
            </button>
          ) : null}
          <div className="xp-context-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => { arrangeIconsBy('name', ids, grid); persistLayout(); setMenu(null) }}
          >
            Arrange Icons By Name
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { arrangeIconsBy('type', ids, grid); persistLayout(); setMenu(null) }}
          >
            Arrange Icons By Type
          </button>
          <div className="xp-context-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => { setAutoArrange(!layout.autoArrange, grid, ids); persistLayout(); setMenu(null) }}
          >
            <span className="xp-context-check" aria-hidden="true">{layout.autoArrange ? '✓' : ''}</span>
            Auto Arrange
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setAlignToGrid(!layout.alignToGrid); persistLayout(); setMenu(null) }}
          >
            <span className="xp-context-check" aria-hidden="true">{layout.alignToGrid ? '✓' : ''}</span>
            Align to Grid
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { resetIconLayout(); persistLayout(); setMenu(null) }}
          >
            Reset icon layout
          </button>
          <div className="xp-context-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => { onRefresh?.(); setMenu(null) }}
          >
            Refresh data
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onView?.('settings'); setMenu(null) }}
          >
            {menu.id ? 'Properties' : 'Display Properties'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
