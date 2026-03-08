import { useAuth } from '../contexts/AuthContext'
import './HeaderAuth.css'

export default function HeaderAuth({ onOpenAuth }) {
  const { user, signOut, isConfigured } = useAuth()

  if (!isConfigured) return null

  if (user) {
    return (
      <div className="header-auth">
        <span className="header-auth-email" title={user.email}>{user.email?.split('@')[0]}</span>
        <button type="button" className="header-auth-btn" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    )
  }

  return (
    <button type="button" className="header-auth-btn header-auth-btn--primary" onClick={onOpenAuth}>
      Sign in
    </button>
  )
}
