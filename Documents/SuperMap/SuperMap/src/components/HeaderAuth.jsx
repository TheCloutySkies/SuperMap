import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './HeaderAuth.css'

export default function HeaderAuth({ onOpenAuth, onNavigateAccount }) {
  const { user, signOut, isConfigured } = useAuth()
  const [open, setOpen] = useState(false)

  if (!isConfigured) {
    return (
      <button type="button" className="header-auth-btn header-auth-btn--primary metallicss" onClick={onOpenAuth}>
        Sign in
      </button>
    )
  }

  if (user) {
    const username = user.email?.split('@')?.[0] || user.user_metadata?.name || 'account'
    return (
      <div className="header-auth">
        <span className="header-auth-email" title={user.email || 'Signed in'}>{username}</span>
        <div className="header-auth-menu-wrap">
          <button type="button" className="header-auth-btn metallicss" onClick={() => setOpen((v) => !v)}>
            My account
          </button>
          {open && (
            <div className="header-auth-menu">
              <button type="button" className="metallicss" onClick={() => { onNavigateAccount?.('my-account'); setOpen(false) }}>My Account</button>
              <button type="button" className="metallicss" onClick={() => { onNavigateAccount?.('my-places'); setOpen(false) }}>My Places</button>
              <button type="button" className="metallicss" onClick={() => { onNavigateAccount?.('my-reports'); setOpen(false) }}>My Reports</button>
              <button type="button" className="metallicss" onClick={() => { onNavigateAccount?.('my-comments'); setOpen(false) }}>My Comments</button>
              <button type="button" className="metallicss" onClick={() => { onNavigateAccount?.('saved'); setOpen(false) }}>Saved</button>
              <button type="button" className="danger metallicss" onClick={() => { setOpen(false); signOut() }}>Sign out</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <button type="button" className="header-auth-btn header-auth-btn--primary metallicss" onClick={onOpenAuth}>
      Sign in
    </button>
  )
}
