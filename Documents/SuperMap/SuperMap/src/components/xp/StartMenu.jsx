/**
 * The start menu. XP.css has none, so this is hand-built: the signed-in user at
 * the top, the mode list on the left, the places on the right, and the footer.
 */
import { useEffect, useRef } from 'react'
import { visibleModes } from '../../features/accounts/menuCatalog'
import { useSuperMapAccount } from '../../features/accounts/SuperMapAccounts'
import { presenceLabel } from '../../features/accounts/messageBits'

export default function StartMenu({ open, onClose, onMode, onView, onRefresh }) {
  const menuRef = useRef(null)
  const { user, setOverlay, setWorkspaceTab, signOutUser } = useSuperMapAccount()

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
  const name = user
    ? (user.displayName || String(user.email || '').split('@')[0] || 'Account')
    : 'Sign in'

  function openAccounts() {
    if (!user) {
      setOverlay('auth')
      return
    }
    setWorkspaceTab('vault')
    setOverlay('workspace')
  }

  return (
    <div className="xp-start" ref={menuRef} role="menu" aria-label="Start menu">
      <div className="xp-start-head">
        <button
          type="button"
          className="xp-start-user"
          onClick={() => { openAccounts(); onClose() }}
        >
          <span className="xp-start-avatar" aria-hidden="true">{user?.emoji || '◈'}</span>
          <span className="xp-start-user-copy">
            <strong>{name}</strong>
            <em>{user ? presenceLabel(user.presence) : 'Click to sign in'}</em>
          </span>
        </button>
      </div>
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
          <button type="button" role="menuitem" className="xp-start-item" onClick={() => { onView('home'); onClose() }}>
            <em>Dashboard</em>
          </button>
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
        <button
          type="button"
          onClick={() => {
            if (user) signOutUser?.()
            else setOverlay('auth')
            onClose()
          }}
        >
          {user ? 'Log Off' : 'Sign in'}
        </button>
        <button type="button" onClick={() => { onRefresh?.(); onClose() }}>Refresh data</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
