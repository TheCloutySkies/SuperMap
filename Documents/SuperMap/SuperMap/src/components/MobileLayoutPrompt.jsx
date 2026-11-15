import { useEffect, useState } from 'react'
import { STORAGE_KEYS, getVisualsPrefs, setVisualsPrefs } from '../constants'
import { useSuperMapAccount } from '../features/accounts/SuperMapAccounts'
import './MobileLayoutPrompt.css'

function seen(key) {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

function markSeen(key) {
  try { localStorage.setItem(key, '1') } catch { /* ignore */ }
}

function shouldOfferPrompt() {
  if (seen(STORAGE_KEYS.ACCOUNT_PROMPT_SEEN) || seen(STORAGE_KEYS.MOBILE_PROMPT_SEEN)) return false
  if (seen(STORAGE_KEYS.ACCOUNT_PROMPT_PENDING)) return true
  if (typeof window === 'undefined') return false
  const narrow = window.matchMedia('(max-width: 900px)').matches
  const coarse = window.matchMedia('(pointer: coarse)').matches
  return narrow || coarse
}

/**
 * One-time chooser: layout, then whether to sign in, then whether to use an anonymous account.
 */
export default function MobileLayoutPrompt({ onChoice }) {
  const { user, signInEmail, signUpEmail, signInGoogle, signInAnonymous } = useSuperMapAccount()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('layout')
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!shouldOfferPrompt()) return
    setStep(seen(STORAGE_KEYS.ACCOUNT_PROMPT_PENDING) ? 'login-ask' : 'layout')
    setOpen(true)
  }, [])

  useEffect(() => {
    if (open && user && step !== 'layout') finish()
  }, [open, user, step])

  const finish = () => {
    markSeen(STORAGE_KEYS.MOBILE_PROMPT_SEEN)
    markSeen(STORAGE_KEYS.ACCOUNT_PROMPT_SEEN)
    try { localStorage.removeItem(STORAGE_KEYS.ACCOUNT_PROMPT_PENDING) } catch { /* ignore */ }
    setOpen(false)
  }

  const chooseLayout = (layoutMode) => {
    const prefs = getVisualsPrefs()
    setVisualsPrefs({ ...prefs, layoutMode })
    markSeen(STORAGE_KEYS.ACCOUNT_PROMPT_PENDING)
    onChoice?.(layoutMode)
    if (user) finish()
    else setStep('login-ask')
  }

  async function submitAccount(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const result = mode === 'signin'
      ? await signInEmail(email.trim(), password)
      : await signUpEmail(email.trim(), password, displayName.trim())
    setBusy(false)
    if (!result.ok) {
      setError(result.error || 'Could not sign in.')
      return
    }
    finish()
  }

  async function continueWithGoogle() {
    setError('')
    setBusy(true)
    const result = await signInGoogle()
    setBusy(false)
    if (!result.ok) {
      setError(result.error || 'Google sign-in failed.')
      return
    }
    finish()
  }

  async function continueAnonymous() {
    setError('')
    setBusy(true)
    const result = await signInAnonymous()
    setBusy(false)
    if (!result.ok) {
      setError(result.error || 'Could not start an anonymous account.')
      return
    }
    finish()
  }

  if (!open) return null

  return (
    <div className="mobile-layout-prompt" role="dialog" aria-modal="true" aria-labelledby="mobile-layout-prompt-title">
      <div className="mobile-layout-prompt-card">
        {step === 'layout' ? (
          <>
            <h2 id="mobile-layout-prompt-title" className="mobile-layout-prompt-title">Layout</h2>
            <p className="mobile-layout-prompt-copy">
              This screen works better with the mobile Good Palantir hub. Choose a layout — you can change it anytime in Settings.
            </p>
            <div className="mobile-layout-prompt-actions">
              <button type="button" className="mobile-layout-prompt-btn mobile-layout-prompt-btn--primary" onClick={() => chooseLayout('mobile')}>
                Use mobile layout
              </button>
              <button type="button" className="mobile-layout-prompt-btn" onClick={() => chooseLayout('desktop')}>
                Keep desktop
              </button>
            </div>
          </>
        ) : null}

        {step === 'login-ask' ? (
          <>
            <h2 id="mobile-layout-prompt-title" className="mobile-layout-prompt-title">Sign in</h2>
            <p className="mobile-layout-prompt-copy">
              Want to log in? Your name, bulletin tagline, and messages stay with the account.
            </p>
            <div className="mobile-layout-prompt-actions">
              <button type="button" className="mobile-layout-prompt-btn mobile-layout-prompt-btn--primary" onClick={() => { setError(''); setStep('login') }}>
                Yes, log in
              </button>
              <button type="button" className="mobile-layout-prompt-btn" onClick={() => { setError(''); setStep('anon-ask') }}>
                Not now
              </button>
            </div>
          </>
        ) : null}

        {step === 'login' ? (
          <>
            <h2 id="mobile-layout-prompt-title" className="mobile-layout-prompt-title">
              {mode === 'signin' ? 'Log in' : 'Create account'}
            </h2>
            <div className="mobile-layout-prompt-tabs">
              <button type="button" className={mode === 'signin' ? 'is-on' : ''} onClick={() => setMode('signin')}>Sign in</button>
              <button type="button" className={mode === 'signup' ? 'is-on' : ''} onClick={() => setMode('signup')}>Create account</button>
            </div>
            <form className="mobile-layout-prompt-form" onSubmit={submitAccount}>
              {mode === 'signup' ? (
                <label>
                  Display name
                  <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Callsign or name" autoComplete="nickname" />
                </label>
              ) : null}
              <label>
                Email
                <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" />
              </label>
              <label>
                Password
                <input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
              </label>
              {error ? <p className="mobile-layout-prompt-error">{error}</p> : null}
              <button type="submit" className="mobile-layout-prompt-btn mobile-layout-prompt-btn--primary" disabled={busy}>
                {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>
            <div className="mobile-layout-prompt-actions">
              <button type="button" className="mobile-layout-prompt-btn" onClick={continueWithGoogle} disabled={busy}>
                Continue with Google
              </button>
              <button type="button" className="mobile-layout-prompt-btn" onClick={() => { setError(''); setStep('anon-ask') }}>
                Not now
              </button>
            </div>
          </>
        ) : null}

        {step === 'anon-ask' ? (
          <>
            <h2 id="mobile-layout-prompt-title" className="mobile-layout-prompt-title">Anonymous account</h2>
            <p className="mobile-layout-prompt-copy">
              Want an anonymous account instead? You can still post and message. You can sign in with email later.
            </p>
            {error ? <p className="mobile-layout-prompt-error">{error}</p> : null}
            <div className="mobile-layout-prompt-actions">
              <button type="button" className="mobile-layout-prompt-btn mobile-layout-prompt-btn--primary" onClick={continueAnonymous} disabled={busy}>
                {busy ? 'Working…' : 'Use an anonymous account'}
              </button>
              <button type="button" className="mobile-layout-prompt-btn" onClick={finish} disabled={busy}>
                Continue without an account
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
