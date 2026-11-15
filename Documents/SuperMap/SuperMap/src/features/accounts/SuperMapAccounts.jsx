/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { UserRound, VenetianMask } from 'lucide-react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { firebaseReady, getAccountsFirebase } from './firebaseClient'
import { accountHandle, accountNumber, personHandle, personNumber, personTitle } from './accountIdentity'
import { getModeVisibility, setModeVisibility } from './menuCatalog'
import { deleteOwnedContent, subscribeConversations } from './socialData'
import AccountWorkspace from './AccountWorkspace'
import './accounts.css'

function getFirebase() {
  return getAccountsFirebase()
}

const AccountsContext = createContext(null)

export function useSuperMapAccount() {
  const value = useContext(AccountsContext)
  if (!value) throw new Error('useSuperMapAccount must be used inside <AccountsProvider>')
  return value
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function signInProvider(fbUser) {
  if (!fbUser || fbUser.isAnonymous) return 'anonymous'
  const ids = new Set((fbUser.providerData || []).map((entry) => entry.providerId))
  if (ids.has('google.com')) return 'google'
  return 'password'
}

function dockKind(user) {
  if (!user) return 'profile'
  if (user.anonymous || user.provider === 'anonymous') return 'anonymous'
  if (user.provider === 'google') return 'google'
  return 'profile'
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  )
}

function cleanTags(tags) {
  if (Array.isArray(tags)) return [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 12)
  if (typeof tags === 'string') return [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 12)
  return []
}

function sortVault(items) {
  return [...items].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
    return (b.updatedAtMs || 0) - (a.updatedAtMs || 0)
  })
}

function friendlyAuthError(error) {
  const code = error?.code || ''
  if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'Email or password is incorrect.'
  if (code.includes('user-not-found')) return 'No account exists for that email.'
  if (code.includes('email-already-in-use')) return 'That email is already registered.'
  if (code.includes('weak-password')) return 'Password must be at least 6 characters.'
  if (code.includes('invalid-email')) return 'Enter a valid email address.'
  if (code.includes('popup-closed')) return 'Google sign-in was closed.'
  if (code.includes('unauthorized-domain')) return 'Sign-in is not available from this site.'
  if (code.includes('requires-recent-login')) return 'Sign in again, then delete the account.'
  return error?.message || 'Authentication failed.'
}

const TYPE_META = {
  article: { label: 'Article', glyph: '▤' },
  place: { label: 'Place', glyph: '◈' },
  map: { label: 'Map recipe', glyph: '▦' },
  report: { label: 'Report', glyph: '✎' },
}

const LOCAL_KEY = 'supermap.accounts.local.v1'

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return { user: null, vault: [], posts: [], replies: [] }
    const parsed = JSON.parse(raw)
    return {
      account: parsed.account || null,
      user: parsed.user || null,
      vault: Array.isArray(parsed.vault) ? parsed.vault : [],
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      replies: Array.isArray(parsed.replies) ? parsed.replies : [],
    }
  } catch {
    return { account: null, user: null, vault: [], posts: [], replies: [] }
  }
}

function writeLocal(state) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

function normalizeSavedItem(input, user) {
  const now = Date.now()
  return {
    id: input.id || uid(),
    ownerUid: user.uid,
    type: TYPE_META[input.type] ? input.type : 'place',
    title: String(input.title || 'Untitled').trim().slice(0, 180),
    summary: String(input.summary || '').trim().slice(0, 600),
    tags: cleanTags(input.tags),
    pinned: Boolean(input.pinned),
    sourceUrl: input.sourceUrl || null,
    location: input.location || null,
    payload: input.payload && typeof input.payload === 'object' ? input.payload : {},
    createdAtMs: input.createdAtMs || now,
    updatedAtMs: now,
  }
}

export function buildMapPrintRecipe({
  map,
  styleId = 'supermap',
  page = { size: 'letter', orientation: 'portrait' },
  frameMm = { width: 200, height: 240 },
  scaleDenominator = 25000,
  layers = [],
  overlays = [],
  extras = {},
} = {}) {
  const center = map?.getCenter?.()
  return {
    version: 1,
    kind: 'supermap.print.recipe',
    generatedAt: new Date().toISOString(),
    page,
    frameMm,
    scaleDenominator,
    center: center ? [center.lng, center.lat] : extras.center || [0, 0],
    zoom: map?.getZoom?.() ?? extras.zoom ?? 12,
    bearing: map?.getBearing?.() ?? extras.bearing ?? 0,
    pitch: map?.getPitch?.() ?? extras.pitch ?? 0,
    styleId,
    layers,
    overlays,
    ...extras,
  }
}

export function dispatchMapRecipe(recipe) {
  window.dispatchEvent(new CustomEvent('supermap:load-map-recipe', { detail: recipe }))
}

export function onMapRecipeRequest(callback) {
  const handler = (event) => callback(event.detail)
  window.addEventListener('supermap:load-map-recipe', handler)
  return () => window.removeEventListener('supermap:load-map-recipe', handler)
}

export function onOpenPlaceRequest(callback) {
  const handler = (event) => callback(event.detail)
  window.addEventListener('supermap:open-place', handler)
  return () => window.removeEventListener('supermap:open-place', handler)
}

export function AccountsProvider({ children }) {
  const [local, setLocal] = useState(readLocal)
  const [user, setUser] = useState(() => (firebaseReady ? null : readLocal().user))
  const [authReady, setAuthReady] = useState(!firebaseReady)
  const [overlay, setOverlay] = useState(null)
  const [toast, setToast] = useState(null)
  const [workspaceTab, setWorkspaceTab] = useState('vault')
  const [messageDraft, setMessageDraft] = useState(null)
  const [unread, setUnread] = useState(0)
  const [remoteVault, setRemoteVault] = useState([])

  const vault = firebaseReady ? remoteVault : local.vault

  const showToast = useCallback((next) => setToast({ id: uid(), ...next }), [])

  useEffect(() => {
    if (!firebaseReady) return undefined
    const f = getFirebase()
    return onAuthStateChanged(f.auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null)
        setAuthReady(true)
        return
      }
      let stored = {}
      try {
        const snap = await getDoc(doc(f.db, 'users', fbUser.uid))
        stored = snap.exists() ? snap.data() : {}
      } catch { stored = {} }
      const profile = {
        uid: fbUser.uid,
        email: fbUser.email || null,
        displayName: stored.displayName || fbUser.displayName || (fbUser.isAnonymous ? 'Anonymous' : (fbUser.email ? fbUser.email.split('@')[0] : 'Operator')),
        photoURL: fbUser.photoURL || null,
        emoji: stored.emoji || '◈',
        handle: stored.handle || accountHandle(fbUser.uid),
        accountNumber: stored.accountNumber || accountNumber(fbUser.uid),
        discoverable: stored.discoverable !== false && !fbUser.isAnonymous ? true : stored.discoverable === true,
        anonymous: Boolean(fbUser.isAnonymous),
        provider: signInProvider(fbUser),
      }
      if (stored.modeVisibility && typeof stored.modeVisibility === 'object') {
        setModeVisibility({ ...getModeVisibility(), ...stored.modeVisibility })
      }
      try {
        await setDoc(doc(f.db, 'users', fbUser.uid), {
          uid: profile.uid,
          email: profile.email,
          displayName: profile.displayName,
          emoji: profile.emoji,
          handle: profile.handle,
          accountNumber: profile.accountNumber,
          discoverable: profile.discoverable,
          anonymous: profile.anonymous,
          provider: profile.provider,
          updatedAt: serverTimestamp(),
          updatedAtMs: Date.now(),
        }, { merge: true })
      } catch { /* profile write is non-blocking */ }
      setUser(profile)
      setAuthReady(true)
    })
  }, [])

  useEffect(() => {
    if (!firebaseReady) writeLocal(local)
  }, [local])

  useEffect(() => {
    if (!firebaseReady || !user) return undefined
    const f = getFirebase()
    const q = query(collection(f.db, 'saved_items'), where('ownerUid', '==', user.uid))
    return onSnapshot(q, (snap) => {
      setRemoteVault(sortVault(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
    }, (error) => showToast({ tone: 'danger', message: error.message }))
  }, [user, showToast])

  useEffect(() => {
    if (!user?.uid) return undefined
    return subscribeConversations(user.uid, (rows) => {
      const count = rows.reduce((sum, row) => sum + (Number(row.unread?.[user.uid]) || 0), 0)
      setUnread(count)
    })
  }, [user?.uid])

  const openLocalUser = useCallback((profile) => {
    setLocal((current) => ({ ...current, user: profile }))
    setUser(profile)
    setOverlay('workspace')
  }, [])

  const signUpEmail = useCallback(async (email, password, displayName) => {
    const f = getFirebase()
    const name = displayName || email.split('@')[0]
    if (!f) {
      const localUid = `local-${email.toLowerCase()}`
      const profile = { uid: localUid, email, displayName: name, handle: accountHandle(localUid), accountNumber: accountNumber(localUid), photoURL: null, provider: 'password', local: true }
      setLocal((current) => ({ ...current, account: profile, user: profile }))
      setUser(profile)
      setOverlay('workspace')
      showToast({ tone: 'info', message: 'Account saved on this device.' })
      return { ok: true }
    }
    try {
      const cred = await createUserWithEmailAndPassword(f.auth, email, password)
      if (displayName) await updateProfile(cred.user, { displayName })
      await setDoc(doc(f.db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email,
        displayName: name,
        handle: accountHandle(cred.user.uid),
        accountNumber: accountNumber(cred.user.uid),
        provider: 'password',
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      }, { merge: true })
      setOverlay('workspace')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: friendlyAuthError(error) }
    }
  }, [showToast])

  const signInEmail = useCallback(async (email, password) => {
    const f = getFirebase()
    if (!f) {
      const stored = readLocal()
      const existing = stored.account || stored.user
      if (existing?.email && existing.email.toLowerCase() === email.toLowerCase()) {
        openLocalUser(existing)
        return { ok: true }
      }
      return { ok: false, error: 'No account in this browser for that email. Create one first.' }
    }
    try {
      await signInWithEmailAndPassword(f.auth, email, password)
      setOverlay('workspace')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: friendlyAuthError(error) }
    }
  }, [openLocalUser])

  const signInGoogle = useCallback(async () => {
    const f = getFirebase()
    if (!f) return { ok: false, error: 'Google sign-in is unavailable.' }
    try {
      await signInWithPopup(f.auth, new GoogleAuthProvider())
      setOverlay('workspace')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: friendlyAuthError(error) }
    }
  }, [])

  const signInAnonymous = useCallback(async () => {
    const f = getFirebase()
    if (!f) {
      const localUid = `local-anon-${uid()}`
      const profile = { uid: localUid, email: null, displayName: 'Anonymous', handle: accountHandle(localUid), accountNumber: accountNumber(localUid), emoji: '🎭', discoverable: false, anonymous: true, provider: 'anonymous', local: true }
      setLocal((current) => ({ ...current, account: profile, user: profile }))
      setUser(profile)
      setOverlay('workspace')
      return { ok: true }
    }
    try {
      const cred = await signInAnonymously(f.auth)
      await setDoc(doc(f.db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: null,
        displayName: 'Anonymous',
        emoji: '🎭',
        handle: accountHandle(cred.user.uid),
        accountNumber: accountNumber(cred.user.uid),
        discoverable: false,
        anonymous: true,
        provider: 'anonymous',
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      }, { merge: true })
      setOverlay('workspace')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: friendlyAuthError(error) }
    }
  }, [])

  const updateAccount = useCallback(async (patch) => {
    const name = patch.displayName != null ? String(patch.displayName).trim().slice(0, 60) : user?.displayName
    const next = {
      ...user,
      displayName: name || user?.displayName || 'Anonymous',
      emoji: patch.emoji || user?.emoji || '◈',
      handle: user?.handle || accountHandle(user?.uid),
      accountNumber: user?.accountNumber || accountNumber(user?.uid),
      discoverable: patch.discoverable != null ? Boolean(patch.discoverable) : user?.discoverable !== false,
    }
    setUser(next)
    if (!firebaseReady) {
      setLocal((current) => ({ ...current, user: next, account: { ...(current.account || {}), ...next } }))
      return { ok: true }
    }
    const f = getFirebase()
    try {
      if (f?.auth.currentUser && patch.displayName) await updateProfile(f.auth.currentUser, { displayName: next.displayName })
      await setDoc(doc(f.db, 'users', user.uid), {
        displayName: next.displayName,
        emoji: next.emoji,
        handle: next.handle,
        accountNumber: next.accountNumber,
        discoverable: next.discoverable,
        modeVisibility: patch.modeVisibility || getModeVisibility(),
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      }, { merge: true })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: friendlyAuthError(error) }
    }
  }, [user])

  const deleteAccount = useCallback(async (typedName) => {
    if (!user) return { ok: false, error: 'Sign in first.' }
    const typed = String(typedName || '').trim().toLowerCase()
    const accepted = [user.displayName, personHandle(user), personNumber(user)]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
    if (!accepted.includes(typed)) {
      return { ok: false, error: 'Type your display name or username to confirm.' }
    }
    const f = getFirebase()
    try {
      if (f?.auth.currentUser) {
        await deleteOwnedContent(user.uid)
        const saved = await getDocs(query(collection(f.db, 'saved_items'), where('ownerUid', '==', user.uid)))
        await Promise.all(saved.docs.map((row) => deleteDoc(row.ref)))
        await deleteUser(f.auth.currentUser)
      }
      setLocal({ account: null, user: null, vault: [], posts: [], replies: [] })
      setUser(null)
      setRemoteVault([])
      setOverlay(null)
      showToast({ tone: 'info', message: 'Account deleted' })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: friendlyAuthError(error) }
    }
  }, [user, showToast])

  const openMessages = useCallback((person) => {
    setMessageDraft(person || null)
    setWorkspaceTab('messages')
    setOverlay('workspace')
  }, [])

  useEffect(() => {
    const onOpen = (event) => {
      const person = event.detail
      if (!person?.uid) return
      if (!user) {
        setOverlay('auth')
        showToast({ tone: 'info', message: 'Sign in to message people' })
        return
      }
      openMessages(person)
    }
    window.addEventListener('supermap:open-messages', onOpen)
    return () => window.removeEventListener('supermap:open-messages', onOpen)
  }, [user, openMessages, showToast])

  const beginAddPlace = useCallback(() => {
    sessionStorage.setItem('supermap.vault-place', '1')
    sessionStorage.setItem('supermap.one-shot-pin', '1')
    window.dispatchEvent(new CustomEvent('supermap:begin-pin'))
    setOverlay(null)
  }, [])

  const signOutUser = useCallback(async () => {
    const f = getFirebase()
    if (f) await signOut(f.auth)
    else setLocal((s) => ({ ...s, user: null }))
    setRemoteVault([])
    setUser(null)
    setOverlay(null)
  }, [])

  const createSavedItem = useCallback(async (input) => {
    if (!user) {
      setOverlay('auth')
      return { ok: false, needsAuth: true }
    }
    const item = normalizeSavedItem(input, user)
    const f = getFirebase()
    if (f) {
      try {
        await setDoc(doc(f.db, 'saved_items', item.id), { ...item, updatedAt: serverTimestamp(), createdAt: serverTimestamp() })
        showToast({ tone: 'success', message: `Saved “${item.title}”` })
        return { ok: true, id: item.id, item }
      } catch (error) {
        showToast({ tone: 'danger', message: error.message })
        return { ok: false, error }
      }
    }
    setLocal((s) => ({ ...s, vault: sortVault([item, ...(s.vault || [])]) }))
    showToast({ tone: 'success', message: `Saved “${item.title}” on this device` })
    return { ok: true, id: item.id, item }
  }, [user, showToast])

  useEffect(() => {
    const onVaultPlace = async (event) => {
      const detail = event.detail || {}
      if (!user) return
      await createSavedItem({
        type: 'place',
        title: detail.title || 'Place',
        summary: '',
        location: { lat: Number(detail.lat), lon: Number(detail.lon) },
      })
    }
    window.addEventListener('supermap:vault-place', onVaultPlace)
    return () => window.removeEventListener('supermap:vault-place', onVaultPlace)
  }, [user, createSavedItem])

  const deleteSavedItem = useCallback(async (id) => {
    const f = getFirebase()
    if (f) {
      try { await deleteDoc(doc(f.db, 'saved_items', id)) } catch (error) {
        showToast({ tone: 'danger', message: error.message })
        return { ok: false }
      }
    } else {
      setLocal((s) => ({ ...s, vault: (s.vault || []).filter((item) => item.id !== id) }))
    }
    return { ok: true }
  }, [showToast])

  const updateSavedItem = useCallback(async (id, patch) => {
    const f = getFirebase()
    if (f) {
      try {
        await updateDoc(doc(f.db, 'saved_items', id), { ...patch, updatedAt: serverTimestamp(), updatedAtMs: Date.now() })
      } catch (error) {
        showToast({ tone: 'danger', message: error.message })
        return { ok: false }
      }
    } else {
      setLocal((s) => ({
        ...s,
        vault: sortVault((s.vault || []).map((item) => (item.id === id ? { ...item, ...patch, updatedAtMs: Date.now() } : item))),
      }))
    }
    return { ok: true }
  }, [showToast])

  const value = {
    firebaseReady,
    authReady,
    user,
    overlay,
    setOverlay,
    toast,
    setToast,
    showToast,
    vault,
    workspaceTab,
    setWorkspaceTab,
    messageDraft,
    unread,
    signInEmail,
    signUpEmail,
    signInGoogle,
    signInAnonymous,
    signOutUser,
    updateAccount,
    deleteAccount,
    openMessages,
    beginAddPlace,
    createSavedItem,
    updateSavedItem,
    deleteSavedItem,
  }

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>
}

export function SaveToSuperMapButton({
  type = 'place',
  title,
  summary = '',
  tags = [],
  payload,
  getPayload,
  label = 'Save',
  className = '',
}) {
  const { createSavedItem, user, setOverlay } = useSuperMapAccount()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className={`sm-save-btn ${className}`}
      disabled={busy}
      onClick={async () => {
        if (!user) {
          setOverlay('auth')
          return
        }
        setBusy(true)
        const resolved = typeof getPayload === 'function' ? getPayload() : payload || {}
        await createSavedItem({ type, title, summary, tags, payload: resolved })
        setBusy(false)
      }}
    >
      {busy ? 'Saving…' : label}
    </button>
  )
}

export function SaveMapRecipeButton(props) {
  const resolve = () => {
    if (props.recipe) return props.recipe
    if (typeof props.getRecipe === 'function') return props.getRecipe()
    return buildMapPrintRecipe(props)
  }
  return (
    <SaveToSuperMapButton
      type="map"
      title={props.title || 'Current print layout'}
      summary={props.summary || 'Saved as a recipe. The PDF is regenerated locally.'}
      tags={props.tags || ['print', 'recipe']}
      getPayload={resolve}
      label={props.label || 'Save recipe'}
      className={props.className || ''}
    />
  )
}

export function AccountsOverlay() {
  const { overlay } = useSuperMapAccount()
  return (
    <>
      <AccountDock />
      {overlay === 'auth' ? <AuthModal /> : null}
      {overlay === 'workspace' ? <AccountWorkspace /> : null}
      <Toast />
    </>
  )
}

function AccountDock() {
  const { user, setOverlay, vault, unread, setWorkspaceTab } = useSuperMapAccount()
  const kind = dockKind(user)
  const mark = kind === 'google'
    ? <GoogleMark />
    : kind === 'anonymous'
      ? <VenetianMask size={18} strokeWidth={2.25} />
      : <UserRound size={18} strokeWidth={2.25} />
  const label = user ? personTitle(user) : 'Account'
  return (
    <div className="sm-acct-dock">
      <button type="button" className="sm-acct-dock-btn" aria-label={label} onClick={() => {
        if (!user) setOverlay('auth')
        else {
          if (unread > 0) setWorkspaceTab('messages')
          setOverlay('workspace')
        }
      }}>
        <span className={`sm-acct-avatar is-${kind}`}>{mark}</span>
        <span className="sm-acct-dock-label">{label}</span>
        {unread > 0 ? <span className="sm-acct-count">{unread}</span> : null}
        {unread === 0 && vault.length > 0 ? <span className="sm-acct-count">{vault.length}</span> : null}
      </button>
    </div>
  )
}

function AuthModal() {
  const { setOverlay, signInEmail, signUpEmail, signInGoogle, signInAnonymous } = useSuperMapAccount()
  const [mode, setMode] = useState('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const result = mode === 'signin'
      ? await signInEmail(email.trim(), password)
      : await signUpEmail(email.trim(), password, displayName.trim())
    setBusy(false)
    if (!result.ok) setError(result.error || 'Authentication failed.')
  }

  return (
    <div className="sm-modal-scrim" role="dialog" aria-modal="true">
      <div className="sm-auth-card">
        <button type="button" className="sm-modal-close" onClick={() => setOverlay(null)} aria-label="Close">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <div className="sm-auth-brand">
          <span className="sm-auth-mark">◈</span>
          <div>
            <h2>Good Palantir Membership</h2>
            <p className="sm-auth-free">Don't worry it's 100% free.</p>
          </div>
        </div>
        <div className="sm-auth-tabs">
          <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Sign in</button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Create account</button>
        </div>
        <form onSubmit={handleSubmit} className="sm-auth-form">
          {mode === 'signup' ? (
            <label>
              Display name
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Callsign or name" autoComplete="nickname" />
            </label>
          ) : null}
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </label>
          <label>
            Password
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          </label>
          {error ? <p className="sm-auth-error">{error}</p> : null}
          <button type="submit" className="sm-primary-btn" disabled={busy}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button type="button" className="sm-google-btn" onClick={async () => {
          setError('')
          const result = await signInGoogle()
          if (!result.ok) setError(result.error || 'Google sign-in failed.')
        }}>
          <GoogleMark />
          Continue with Google
        </button>
        <button type="button" className="sm-ghost-btn sm-anon-btn" onClick={async () => {
          setError('')
          const result = await signInAnonymous()
          if (!result.ok) setError(result.error || 'Anonymous sign-in failed.')
        }}>
          Continue without an email
        </button>
      </div>
    </div>
  )
}

function Toast() {
  const { toast, setToast } = useSuperMapAccount()
  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast, setToast])
  if (!toast) return null
  return (
    <div className={`sm-toast sm-toast-${toast.tone || 'info'}`} role="status">
      <span>{toast.message}</span>
      <button type="button" className="sm-toast-close" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
    </div>
  )
}
