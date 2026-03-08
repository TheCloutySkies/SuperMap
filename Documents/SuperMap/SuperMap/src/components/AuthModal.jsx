import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './AuthModal.css'

export default function AuthModal({ onClose }) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!email.trim() || !password) {
      setError('Email and password required')
      return
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
        onClose?.()
      } else {
        await signUp(email.trim(), password)
        setMessage('Check your email to confirm your account, then sign in.')
      }
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-header">
          <h2 className="auth-modal-title">{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>
          <button type="button" className="auth-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="auth-modal-form">
          <label className="auth-modal-label">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="auth-modal-input"
              autoComplete="email"
              disabled={busy}
            />
          </label>
          <label className="auth-modal-label">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="auth-modal-input"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              disabled={busy}
            />
          </label>
          {error && <p className="auth-modal-error">{error}</p>}
          {message && <p className="auth-modal-message">{message}</p>}
          <button type="submit" className="auth-modal-submit" disabled={busy}>
            {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>
        <p className="auth-modal-switch">
          {mode === 'signin' ? (
            <>No account? <button type="button" className="auth-modal-link" onClick={() => { setMode('signup'); setError(''); setMessage('') }}>Sign up</button></>
          ) : (
            <>Have an account? <button type="button" className="auth-modal-link" onClick={() => { setMode('signin'); setError(''); setMessage('') }}>Sign in</button></>
          )}
        </p>
      </div>
    </div>
  )
}
