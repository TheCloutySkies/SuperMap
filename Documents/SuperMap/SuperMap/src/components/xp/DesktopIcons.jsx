/**
 * The desktop: one icon per door, column-major like XP.
 *
 * Click selects, double-click or Enter opens, a single tap opens on touch.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import XpIcon from './XpIcon'
import { visibleModes } from '../../features/accounts/menuCatalog'
import { useSuperMapAccount } from '../../features/accounts/SuperMapAccounts'
import { PANEL_PREVIEWS } from '../operations/panels/panelRegistry'

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

export default function DesktopIcons({ onMode, onView, onOpenApplet, onRefresh }) {
  const navigate = useNavigate()
  const { user, setOverlay, setWorkspaceTab } = useSuperMapAccount()
  const [selected, setSelected] = useState('dashboard')
  const [menu, setMenu] = useState(null)
  const gridRef = useRef(null)
  const touchRef = useRef(null)

  const previews = PANEL_PREVIEWS.map((panel) => ({
    id: `preview-${panel.id}`,
    label: panel.title,
    icon: panel.icon,
    applet: panel,
  }))
  const icons = [
    ...SHORTCUTS,
    ...visibleModes().filter((mode) => mode.id !== 'HOME').map((mode) => ({
      id: mode.id.toLowerCase(),
      label: mode.label,
      icon: MODE_ICONS[mode.id] || 'folder',
      mode: mode.id,
    })),
    ...previews,
  ]

  const open = (entry) => {
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

  return (
    <div
      className="xp-desktop-icons"
      ref={gridRef}
      role="list"
      aria-label="Desktop"
      onContextMenu={(event) => {
        if (event.target.closest?.('.xp-desk-icon')) return
        event.preventDefault()
        setMenu({ id: null, x: event.clientX, y: event.clientY })
      }}
    >
      {icons.map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="listitem"
          className={`xp-desk-icon${selected === entry.id ? ' is-selected' : ''}`}
          aria-pressed={selected === entry.id}
          onClick={() => setSelected(entry.id)}
          onDoubleClick={() => open(entry)}
          onPointerUp={(event) => {
            if (event.pointerType !== 'touch') return
            const started = touchRef.current
            touchRef.current = null
            if (started && Date.now() - started.at < 500 && started.id === entry.id) open(entry)
          }}
          onPointerDown={(event) => {
            if (event.pointerType === 'touch') touchRef.current = { id: entry.id, at: Date.now() }
          }}
          onKeyDown={(event) => { if (event.key === 'Enter') open(entry) }}
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
      ))}
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
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onRefresh?.()
              setMenu(null)
            }}
          >
            Refresh data
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onView?.('settings')
              setMenu(null)
            }}
          >
            {menu.id ? 'Properties' : 'Display Properties'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
