/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { initializeApp, getApp, getApps } from 'firebase/app'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import './accounts.css'

const ENV = import.meta.env
const firebaseConfig = {
  apiKey: ENV.VITE_FIREBASE_API_KEY,
  authDomain: ENV.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: ENV.VITE_FIREBASE_PROJECT_ID,
  storageBucket: ENV.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: ENV.VITE_FIREBASE_APP_ID,
}
const firebaseReady = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
)

let firebaseSingleton = null
function getFirebase() {
  if (!firebaseReady) return null
  if (!firebaseSingleton) {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
    firebaseSingleton = { app, auth: getAuth(app), db: getFirestore(app) }
  }
  return firebaseSingleton
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
  if (code.includes('unauthorized-domain')) return 'Add this domain to Firebase Auth authorized domains.'
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
  const [remoteVault, setRemoteVault] = useState([])
  const [remotePosts, setRemotePosts] = useState([])
  const [remoteReplies, setRemoteReplies] = useState([])

  const vault = firebaseReady ? remoteVault : local.vault
  const posts = firebaseReady ? remotePosts : local.posts
  const replies = firebaseReady ? remoteReplies : local.replies

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
      const profile = {
        uid: fbUser.uid,
        email: fbUser.email || null,
        displayName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Operator'),
        photoURL: fbUser.photoURL || null,
      }
      try {
        await setDoc(doc(f.db, 'users', fbUser.uid), {
          ...profile,
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
    if (!firebaseReady) return undefined
    const f = getFirebase()
    const postsQuery = query(collection(f.db, 'forum_posts'), orderBy('createdAtMs', 'desc'), limit(200))
    const repliesQuery = query(collection(f.db, 'forum_replies'), orderBy('createdAtMs', 'asc'), limit(1000))
    const unsubPosts = onSnapshot(postsQuery, (snap) => {
      setRemotePosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    }, (error) => showToast({ tone: 'danger', message: error.message }))
    const unsubReplies = onSnapshot(repliesQuery, (snap) => {
      setRemoteReplies(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    }, () => {})
    return () => { unsubPosts(); unsubReplies() }
  }, [showToast])

  const openLocalUser = useCallback((profile) => {
    setLocal((current) => ({ ...current, user: profile }))
    setUser(profile)
    setOverlay('workspace')
  }, [])

  const signUpEmail = useCallback(async (email, password, displayName) => {
    const f = getFirebase()
    const name = displayName || email.split('@')[0]
    if (!f) {
      const profile = { uid: `local-${email.toLowerCase()}`, email, displayName: name, photoURL: null, local: true }
      setLocal((current) => ({ ...current, account: profile, user: profile }))
      setUser(profile)
      setOverlay('workspace')
      showToast({ tone: 'info', message: 'Account saved in this browser. Add Firebase keys to sync it.' })
      return { ok: true }
    }
    try {
      const cred = await createUserWithEmailAndPassword(f.auth, email, password)
      if (displayName) await updateProfile(cred.user, { displayName })
      await setDoc(doc(f.db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email,
        displayName: name,
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
    if (!f) return { ok: false, error: 'Google sign-in needs Firebase keys. Create an email account to continue locally.' }
    try {
      await signInWithPopup(f.auth, new GoogleAuthProvider())
      setOverlay('workspace')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: friendlyAuthError(error) }
    }
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

  const createForumPost = useCallback(async (input) => {
    if (!user) {
      setOverlay('auth')
      return { ok: false, needsAuth: true }
    }
    const post = {
      id: uid(),
      authorUid: user.uid,
      authorName: user.displayName || 'Operator',
      title: String(input.title || 'Untitled thread').trim().slice(0, 180),
      body: String(input.body || '').trim().slice(0, 12000),
      tags: cleanTags(input.tags),
      createdAtMs: Date.now(),
    }
    const f = getFirebase()
    if (f) {
      try {
        await setDoc(doc(f.db, 'forum_posts', post.id), { ...post, createdAt: serverTimestamp() })
        showToast({ tone: 'success', message: 'Posted' })
        return { ok: true, id: post.id }
      } catch (error) {
        showToast({ tone: 'danger', message: error.message })
        return { ok: false, error }
      }
    }
    setLocal((s) => ({ ...s, posts: [post, ...(s.posts || [])] }))
    showToast({ tone: 'success', message: 'Posted on this device' })
    return { ok: true, id: post.id }
  }, [user, showToast])

  const addReply = useCallback(async (postId, body) => {
    if (!user) return { ok: false, needsAuth: true }
    const reply = {
      id: uid(),
      postId,
      authorUid: user.uid,
      authorName: user.displayName || 'Operator',
      body: String(body || '').trim().slice(0, 6000),
      createdAtMs: Date.now(),
    }
    if (!reply.body) return { ok: false }
    const f = getFirebase()
    if (f) {
      try { await setDoc(doc(f.db, 'forum_replies', reply.id), { ...reply, createdAt: serverTimestamp() }) }
      catch (error) { return { ok: false, error } }
    } else {
      setLocal((s) => ({ ...s, replies: [...(s.replies || []), reply] }))
    }
    return { ok: true }
  }, [user])

  const repliesByPost = useMemo(() => {
    const grouped = {}
    for (const reply of replies) {
      if (!grouped[reply.postId]) grouped[reply.postId] = []
      grouped[reply.postId].push(reply)
    }
    return grouped
  }, [replies])

  const value = {
    firebaseReady,
    authReady,
    user,
    overlay,
    setOverlay,
    toast,
    setToast,
    vault,
    posts,
    repliesByPost,
    signInEmail,
    signUpEmail,
    signInGoogle,
    signOutUser,
    createSavedItem,
    updateSavedItem,
    deleteSavedItem,
    createForumPost,
    addReply,
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
      {overlay === 'workspace' ? <Workspace /> : null}
      <Toast />
    </>
  )
}

function AccountDock() {
  const { user, setOverlay, vault } = useSuperMapAccount()
  const initial = user?.displayName?.charAt(0)?.toUpperCase() || '◉'
  return (
    <div className="sm-acct-dock">
      <button type="button" className="sm-acct-dock-btn" onClick={() => setOverlay(user ? 'workspace' : 'auth')}>
        <span className="sm-acct-avatar">{initial}</span>
        <span className="sm-acct-dock-label">{user ? user.displayName : 'Account'}</span>
        {vault.length > 0 ? <span className="sm-acct-count">{vault.length}</span> : null}
      </button>
    </div>
  )
}

function AuthModal() {
  const { setOverlay, signInEmail, signUpEmail, signInGoogle, firebaseReady } = useSuperMapAccount()
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
        <button type="button" className="sm-modal-close" onClick={() => setOverlay(null)} aria-label="Close">×</button>
        <div className="sm-auth-brand">
          <span className="sm-auth-mark">◈</span>
          <div>
            <h2>SuperMap Account</h2>
            <p>Save places, reports, and print recipes on this device{firebaseReady ? ', synced with Firebase' : ''}.</p>
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
          Continue with Google
        </button>
        {!firebaseReady ? (
          <p className="sm-local-note">Firebase is not configured. Creating an account stores it in this browser so you can try the workspace.</p>
        ) : null}
      </div>
    </div>
  )
}

function Workspace() {
  const { user, setOverlay, signOutUser, firebaseReady, vault, posts, createSavedItem, deleteSavedItem, updateSavedItem, createForumPost, addReply, repliesByPost } = useSuperMapAccount()
  const [tab, setTab] = useState('vault')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [type, setType] = useState('place')
  const [threadTitle, setThreadTitle] = useState('')
  const [threadBody, setThreadBody] = useState('')
  const [openPost, setOpenPost] = useState(null)
  const [reply, setReply] = useState('')

  return (
    <div className="sm-workspace-scrim" role="dialog" aria-modal="true">
      <div className="sm-workspace">
        <header className="sm-workspace-header">
          <div className="sm-workspace-title">
            <span className="sm-auth-mark">◈</span>
            <div>
              <h2>{user?.displayName || 'Operator'}</h2>
              <p>{firebaseReady ? 'Firebase sync' : 'Saved in this browser'} · {user?.email}</p>
            </div>
          </div>
          <div className="sm-workspace-user">
            <button type="button" className="sm-ghost-btn" onClick={signOutUser}>Sign out</button>
            <button type="button" className="sm-modal-close" onClick={() => setOverlay(null)} aria-label="Close">×</button>
          </div>
        </header>
        <div className="sm-workspace-body">
          <nav className="sm-workspace-nav">
            <button type="button" className={tab === 'vault' ? 'active' : ''} onClick={() => setTab('vault')}><span>▦</span> Vault <em>{vault.length}</em></button>
            <button type="button" className={tab === 'forum' ? 'active' : ''} onClick={() => setTab('forum')}><span>◉</span> Community <em>{posts.length}</em></button>
          </nav>
          <main className="sm-workspace-main">
            {tab === 'vault' ? (
              <section className="sm-vault">
                <form className="sm-form" onSubmit={async (e) => {
                  e.preventDefault()
                  const result = await createSavedItem({ type, title, summary })
                  if (result.ok) { setTitle(''); setSummary('') }
                }}>
                  <label>Title<input required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
                  <label>Type
                    <select value={type} onChange={(e) => setType(e.target.value)}>
                      <option value="place">Place</option>
                      <option value="map">Map recipe</option>
                      <option value="article">Article</option>
                      <option value="report">Report</option>
                    </select>
                  </label>
                  <label>Summary<textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
                  <button type="submit" className="sm-primary-btn">Save item</button>
                </form>
                <div className="sm-card-grid">
                  {vault.map((item) => (
                    <article key={item.id} className="sm-card">
                      <span className={`sm-type-badge sm-type-${item.type}`}>{TYPE_META[item.type]?.label || item.type}</span>
                      <h3>{item.title}</h3>
                      {item.summary ? <p className="sm-card-summary">{item.summary}</p> : null}
                      <div className="sm-card-actions">
                        {item.type === 'map' ? (
                          <button type="button" className="sm-ghost-btn" onClick={() => dispatchMapRecipe(item.payload)}>Load in Print</button>
                        ) : null}
                        <button type="button" className="sm-ghost-btn" onClick={() => updateSavedItem(item.id, { pinned: !item.pinned })}>{item.pinned ? 'Unpin' : 'Pin'}</button>
                        <button type="button" className="sm-danger-btn" onClick={() => deleteSavedItem(item.id)}>Delete</button>
                      </div>
                    </article>
                  ))}
                </div>
                {vault.length === 0 ? <p className="sm-local-note">Nothing saved yet. Add an item, or save a print recipe from the Print tab.</p> : null}
              </section>
            ) : (
              <section className="sm-forum">
                {openPost ? (
                  <div className="sm-thread-full">
                    <button type="button" className="sm-ghost-btn" onClick={() => setOpenPost(null)}>Back</button>
                    <h2>{openPost.title}</h2>
                    <p>{openPost.body}</p>
                    {(repliesByPost[openPost.id] || []).map((item) => (
                      <article key={item.id} className="sm-reply"><strong>{item.authorName}</strong><p>{item.body}</p></article>
                    ))}
                    <form className="sm-reply-form" onSubmit={async (e) => {
                      e.preventDefault()
                      const result = await addReply(openPost.id, reply)
                      if (result.ok) setReply('')
                    }}>
                      <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply" />
                      <button type="submit" className="sm-primary-btn">Reply</button>
                    </form>
                  </div>
                ) : (
                  <>
                    <form className="sm-form" onSubmit={async (e) => {
                      e.preventDefault()
                      const result = await createForumPost({ title: threadTitle, body: threadBody })
                      if (result.ok) { setThreadTitle(''); setThreadBody('') }
                    }}>
                      <label>Thread<input required value={threadTitle} onChange={(e) => setThreadTitle(e.target.value)} /></label>
                      <label>Body<textarea required rows={4} value={threadBody} onChange={(e) => setThreadBody(e.target.value)} /></label>
                      <button type="submit" className="sm-primary-btn">Post</button>
                    </form>
                    <div className="sm-thread-list">
                      {posts.map((post) => (
                        <button key={post.id} type="button" className="sm-thread-card" onClick={() => setOpenPost(post)}>
                          <h3>{post.title}</h3>
                          <p>{post.authorName}</p>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}
          </main>
        </div>
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
