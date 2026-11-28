/**
 * The start menu. XP.css has none, so this is hand-built: the mode list on the
 * left, the places on the right, and the two footer commands.
 */
import { useEffect, useRef } from 'react'
import { visibleModes } from '../../features/accounts/menuCatalog'

export default function StartMenu({ open, onClose, onMode, onView, onRefresh }) {
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    const onDown = (event) => {
      if (menuRef.current?.contains(event.target)) return
      if (event.target.closest?.('.xp-start-btn')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, onClose])

  if (!open) return null
  const modes = visibleModes()

  return (
    <div className="xp-start" ref={menuRef} role="menu" aria-label="Start menu">
      <div className="xp-start-head">Good Palantir</div>
      <div className="xp-start-body">
        <div className="xp-start-list">
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="menuitem"
              className="xp-start-item"
              onClick={() => { onMode(mode.id); onClose() }}
            >
              <b>{mode.label}</b>
            </button>
          ))}
          <div className="xp-start-sep" />
          <button type="button" role="menuitem" className="xp-start-item" onClick={() => { onView('report-maker'); onClose() }}>
            <b>Reports</b>
          </button>
          <button type="button" role="menuitem" className="xp-start-item" onClick={() => { onView('advanced-search'); onClose() }}>
            <b>Search</b>
          </button>
        </div>
        <div className="xp-start-side">
          <button type="button" role="menuitem" className="xp-start-item" onClick={() => { onMode('SETTINGS'); onClose() }}>
            <em>Settings</em>
          </button>
          <button type="button" role="menuitem" className="xp-start-item" onClick={() => { onMode('RESOURCES'); onClose() }}>
            <em>Resources</em>
          </button>
          <button type="button" role="menuitem" className="xp-start-item" onClick={() => { onRefresh?.(); onClose() }}>
            <em>Refresh data</em>
          </button>
        </div>
      </div>
      <div className="xp-start-foot">
        <button type="button" onClick={() => { onRefresh?.(); onClose() }}>Refresh data</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
