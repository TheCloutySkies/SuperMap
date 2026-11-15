import { useEffect, useRef, useState } from 'react'
import { useSuperMapAccount } from './SuperMapAccounts'
import ItemMenu from './ItemMenu'
import ReportMakerView from '../../components/ReportMakerView'
import { MODE_CATALOG, REPORT_OWNER_EMAIL, getModeVisibility, setModeVisibility } from './menuCatalog'
import { personHandle, personNumber, personTitle } from './accountIdentity'
import SystemEmojiButton from './SystemEmoji'
import {
  hashVaultPasscode,
  passcodeDigitsOk,
  setVaultUnlocked,
  vaultPasscodeMatches,
  vaultUnlocked,
} from './vaultLock'
import {
  conversationId,
  DISAPPEAR_CHOICES,
  disappearLabel,
  markConversationRead,
  openDirectConversation,
  searchDiscoverableUsers,
  sendDirectMessage,
  setConversationBox,
  setConversationTimer,
  subscribeConversations,
  subscribeMessages,
  createProfilePost,
  deleteProfilePost,
  subscribeProfilePosts,
  subscribeReports,
} from './socialData'

function presenceValue(value) {
  return value === 'online' || value === 'incognito' ? value : 'offline'
}

function PresenceDot({ presence }) {
  const value = presenceValue(presence)
  const label = value === 'online' ? 'Online' : value === 'incognito' ? 'Incognito' : 'Offline'
  return <span className={`sm-presence sm-presence--${value}`} title={label} aria-label={label} />
}

function when(ms) {
  if (!ms) return ''
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function AccountWorkspace() {
  const account = useSuperMapAccount()
  const { user, workspaceTab, setWorkspaceTab } = account
  const isOwner = String(user?.email || '').toLowerCase() === REPORT_OWNER_EMAIL
  const tabs = [
    ['vault', 'Vault'],
    ['profile', 'Profile'],
    ['messages', 'Messages'],
    ['reports', 'Reports'],
    ['infrastructure', 'Infrastructure'],
    ['settings', 'Settings'],
  ]
  return (
    <div className="sm-workspace-scrim" role="dialog" aria-modal="true">
      <div className="sm-workspace">
        <header className="sm-workspace-header">
          <div className="sm-workspace-title">
            <span className="sm-auth-mark">{user?.emoji || '◈'}</span>
            <div>
              <h2><PresenceDot presence={user?.presence} />{personTitle(user)}</h2>
              <p>{personHandle(user)} · #{personNumber(user)} · {user?.anonymous ? 'Anonymous account' : (user?.email || 'Signed in')}</p>
            </div>
          </div>
          <div className="sm-workspace-user">
            <button type="button" className="sm-ghost-btn" onClick={account.signOutUser}>Sign out</button>
            <button type="button" className="sm-modal-close" onClick={() => account.setOverlay(null)} aria-label="Close">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>
        <div className="sm-workspace-body">
          <nav className="sm-workspace-nav">
            {tabs.map(([id, label]) => (
              <button key={id} type="button" className={workspaceTab === id ? 'active' : ''} onClick={() => setWorkspaceTab(id)}>
                {label}
              </button>
            ))}
          </nav>
          <main className="sm-workspace-main">
            {workspaceTab === 'vault' ? <VaultPanel /> : null}
            {workspaceTab === 'profile' ? <ProfilePanel /> : null}
            {workspaceTab === 'messages' ? <MessagesPanel /> : null}
            {workspaceTab === 'settings' ? <SettingsPanel /> : null}
            {workspaceTab === 'reports' ? (
              <section className="sm-account-reports">
                <ReportMakerView />
                {isOwner ? <ReportsPanel /> : null}
              </section>
            ) : null}
            {workspaceTab === 'infrastructure' ? <InfrastructurePanel /> : null}
          </main>
        </div>
      </div>
    </div>
  )
}

function splitTags(value) {
  return [...new Set(String(value || '').split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 12)
}

function VaultPanel() {
  const { user } = useSuperMapAccount()
  const lock = user?.vaultLock
  const lockKey = lock ? `${user?.uid || ''}:${lock.hash}` : ''
  const [unlocked, setUnlocked] = useState(() => !lock || vaultUnlocked(user?.uid))
  const [code, setCode] = useState('')
  const [lockError, setLockError] = useState('')
  const [busy, setBusy] = useState(false)
  const [seenLock, setSeenLock] = useState(lockKey)
  if (seenLock !== lockKey) {
    setSeenLock(lockKey)
    setUnlocked(!lock || vaultUnlocked(user?.uid))
    setCode('')
    setLockError('')
  }

  async function unlock(event) {
    event.preventDefault()
    if (!user?.uid || !lock) return
    setBusy(true)
    let ok = false
    try {
      ok = await vaultPasscodeMatches(code, lock, user.uid)
    } catch (error) {
      setLockError(error.message || 'Could not check the passcode')
      setBusy(false)
      return
    }
    setBusy(false)
    if (!ok) {
      setLockError('Wrong passcode')
      setCode('')
      return
    }
    setVaultUnlocked(user.uid, true)
    setUnlocked(true)
    setCode('')
  }

  if (lock && !unlocked) {
    return (
      <section className="sm-vault">
        <h3>Vault locked</h3>
        <p className="sm-local-note">Enter the {lock.digits}-digit passcode for this account.</p>
        <form className="sm-form sm-pin-form" onSubmit={unlock}>
          <label>
            Passcode
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={lock.digits}
              value={code}
              onChange={(event) => {
                setLockError('')
                setCode(event.target.value.replace(/\D/g, '').slice(0, lock.digits))
              }}
            />
          </label>
          {lockError ? <p className="sm-auth-error">{lockError}</p> : null}
          <button type="submit" className="sm-primary-btn" disabled={busy || code.length !== lock.digits}>{busy ? '…' : 'Unlock'}</button>
        </form>
      </section>
    )
  }

  return <VaultLibrary onLock={lock ? () => { setVaultUnlocked(user.uid, false); setUnlocked(false) } : null} />
}

function VaultLibrary({ onLock }) {
  const { vault, updateSavedItem, deleteSavedItem, beginAddPlace, createPinList, createVaultFolder, showToast } = useSuperMapAccount()
  const [folderFilter, setFolderFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('')
  const [query, setQuery] = useState('')
  const [making, setMaking] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftFolder, setDraftFolder] = useState('')
  const [draftIcon, setDraftIcon] = useState('📋')
  const [viewingList, setViewingList] = useState('')

  const folders = vault.filter((item) => item.payload?.kind === 'vault-folder')
  const lists = vault.filter((item) => item.payload?.kind === 'pin-list')
  const places = vault.filter((item) => item.type === 'place')
  const otherItems = vault.filter((item) => item.type !== 'place' && item.payload?.kind !== 'pin-list' && item.payload?.kind !== 'vault-folder')
  const folderNames = [...new Set([
    ...folders.map((item) => item.title),
    ...vault.map((item) => String(item.payload?.folder || '').trim()).filter(Boolean),
  ])]
  const listNames = [...new Set([
    ...lists.map((item) => item.title),
    ...places.map((item) => item.payload?.listName || 'General'),
  ])].filter(Boolean)
  const tags = [...new Set(vault.flatMap((item) => item.tags || []))]
  const needle = query.trim().toLowerCase()

  function matchesQuery(item) {
    if (!needle) return true
    const hay = `${item.title || ''} ${item.summary || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
    return hay.includes(needle)
  }

  function inFolder(item) {
    if (folderFilter === 'all') return true
    const name = String(item.payload?.folder || '').trim()
    if (folderFilter === 'none') return !name
    return name === folderFilter
  }

  function hasTag(item) {
    if (!tagFilter) return true
    return (item.tags || []).includes(tagFilter)
  }

  async function makeRecord(event) {
    event.preventDefault()
    const result = making === 'folder'
      ? await createVaultFolder(draftName, draftIcon || '📁')
      : await createPinList(draftName, { folder: draftFolder, icon: draftIcon || '📋' })
    if (!result?.ok) return
    showToast({ tone: 'success', message: making === 'folder' ? 'Folder created' : 'List created' })
    setDraftName('')
    setMaking('')
    if (making === 'list') setViewingList(result.name || draftName.trim())
  }

  const visibleLists = (viewingList ? listNames.filter((name) => name === viewingList) : listNames)
    .filter((name) => {
      if (viewingList) return true
      const record = lists.find((item) => item.title === name)
      const listPlaces = places.filter((item) => (item.payload?.listName || 'General') === name)
      const folderOk = record
        ? inFolder(record)
        : folderFilter === 'all' || (folderFilter === 'none' && name === 'General') || listPlaces.some(inFolder)
      if (!folderOk) return false
      if (tagFilter && !listPlaces.some(hasTag) && !(record && hasTag(record))) return false
      if (needle && !listPlaces.some(matchesQuery) && !(record && matchesQuery(record))) return false
      return true
    })

  return (
    <section className="sm-vault">
      <div className="sm-vault-toolbar">
        <p className="sm-local-note">Lists, folders, icons, and tags stay on this account.</p>
        <div className="sm-card-actions">
          <button type="button" className="sm-primary-btn" onClick={beginAddPlace}>Add a place</button>
          <button type="button" className="sm-ghost-btn" onClick={() => { setMaking(making === 'list' ? '' : 'list'); setDraftIcon('📋') }}>New list</button>
          <button type="button" className="sm-ghost-btn" onClick={() => { setMaking(making === 'folder' ? '' : 'folder'); setDraftIcon('📁') }}>New folder</button>
          {onLock ? <button type="button" className="sm-ghost-btn" onClick={onLock}>Lock vault</button> : null}
        </div>
        {making ? (
          <form className="sm-form sm-vault-create" onSubmit={makeRecord}>
            <label>
              {making === 'folder' ? 'Folder name' : 'List name'}
              <input value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={80} required />
            </label>
            {making === 'list' ? (
              <label>
                Folder
                <select value={draftFolder} onChange={(event) => setDraftFolder(event.target.value)}>
                  <option value="">No folder</option>
                  {folderNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
            ) : null}
            <SystemEmojiButton label="Icon" value={draftIcon} onPick={setDraftIcon} />
            <button type="submit" className="sm-primary-btn">{making === 'folder' ? 'Create folder' : 'Create list'}</button>
          </form>
        ) : null}
        <div className="sm-vault-filters">
          <label>
            Folder
            <select value={folderFilter} onChange={(event) => { setFolderFilter(event.target.value); setViewingList('') }}>
              <option value="all">All folders</option>
              <option value="none">No folder</option>
              {folderNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>
            Search
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or tag" />
          </label>
        </div>
        {tags.length ? (
          <div className="sm-tag-row">
            <button type="button" className={!tagFilter ? 'active' : ''} onClick={() => setTagFilter('')}>All tags</button>
            {tags.map((tag) => (
              <button key={tag} type="button" className={tagFilter === tag ? 'active' : ''} onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}>{tag}</button>
            ))}
          </div>
        ) : null}
      </div>
      {viewingList ? (
        <button type="button" className="sm-ghost-btn" onClick={() => setViewingList('')}>All lists</button>
      ) : null}
      {folders.filter(inFolder).filter(matchesQuery).map((folder) => (
        <div key={folder.id} className="sm-list-head">
          <h3>{folder.payload?.icon || '📁'} {folder.title}</h3>
          <div className="sm-card-actions">
            <SystemEmojiButton label="Folder icon" value={folder.payload?.icon || '📁'} onPick={(mark) => updateSavedItem(folder.id, { payload: { ...(folder.payload || {}), icon: mark } })} />
            <button type="button" className="sm-ghost-btn" onClick={() => setFolderFilter(folder.title)}>View</button>
            <button type="button" className="sm-ghost-btn" onClick={() => deleteSavedItem(folder.id)}>Delete folder</button>
          </div>
        </div>
      ))}
      {visibleLists.map((name) => {
        const listRecord = lists.find((item) => item.title === name)
        const listPlaces = places.filter((item) => (item.payload?.listName || 'General') === name && inFolder(item) && hasTag(item) && matchesQuery(item))
        if (!viewingList && tagFilter && listPlaces.length === 0) return null
        if (!viewingList && needle && listPlaces.length === 0 && !(listRecord && matchesQuery(listRecord))) return null
        return (
          <div key={name}>
            <div className="sm-list-head">
              <h3>{listRecord?.payload?.icon || '📋'} {name}</h3>
              <div className="sm-card-actions">
                <button type="button" className="sm-ghost-btn" onClick={() => setViewingList(name)}>View</button>
                {listRecord ? <button type="button" className="sm-ghost-btn" onClick={() => deleteSavedItem(listRecord.id)}>Delete list</button> : null}
              </div>
            </div>
            {listRecord ? (
              <p className="sm-local-note">
                {listRecord.payload?.folder ? `Folder ${listRecord.payload.folder}` : 'No folder'}
                {(listRecord.tags || []).length ? ` · ${listRecord.tags.join(', ')}` : ''}
              </p>
            ) : null}
            {listPlaces.length === 0 ? <p className="sm-local-note">No places in this list yet.</p> : null}
            <div className="sm-card-grid">
              {listPlaces.map((item) => (
                <VaultCard key={`${item.id}:${item.updatedAtMs || 0}:${(item.tags || []).join(',')}`} item={item} listNames={listNames} folderNames={folderNames} />
              ))}
            </div>
          </div>
        )
      })}
      {otherItems.filter(inFolder).filter(hasTag).filter(matchesQuery).length ? (
        <div>
          <div className="sm-list-head"><h3>Saved</h3></div>
          <div className="sm-card-grid">
            {otherItems.filter(inFolder).filter(hasTag).filter(matchesQuery).map((item) => (
              <VaultCard key={`${item.id}:${item.updatedAtMs || 0}:${(item.tags || []).join(',')}`} item={item} listNames={listNames} folderNames={folderNames} />
            ))}
          </div>
        </div>
      ) : null}
      {vault.length === 0 ? <p className="sm-local-note">Nothing saved yet. Make a list or a folder, or add a place.</p> : null}
    </section>
  )
}

function VaultCard({ item, listNames, folderNames }) {
  const { updateSavedItem, deleteSavedItem } = useSuperMapAccount()
  const [tags, setTags] = useState((item.tags || []).join(', '))
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : {}

  function savePayload(patch) {
    updateSavedItem(item.id, { payload: { ...payload, ...patch } })
  }

  return (
    <article className="sm-card">
      <span className="sm-type-badge">{payload.icon || (item.type === 'place' ? '📍' : '▤')} {item.type}</span>
      <h3>{item.title}</h3>
      {item.summary ? <p className="sm-card-summary">{item.summary}</p> : null}
      {item.location ? <p className="sm-card-summary">{Number(item.location.lat).toFixed(3)}, {Number(item.location.lon).toFixed(3)}</p> : null}
      {(item.tags || []).length ? <p className="sm-card-summary">{item.tags.map((tag) => `#${tag}`).join(' ')}</p> : null}
      <div className="sm-card-actions">
        {item.location ? (
          <button type="button" className="sm-ghost-btn" onClick={() => {
            window.dispatchEvent(new CustomEvent('supermap:show-place', {
              detail: { lat: item.location.lat, lon: item.location.lon, title: item.title, zoom: 12 },
            }))
          }}>Show on map</button>
        ) : null}
        {item.type === 'map' && payload.kind !== 'pin-list' && payload.kind !== 'vault-folder' ? (
          <button type="button" className="sm-ghost-btn" onClick={() => {
            window.dispatchEvent(new CustomEvent('supermap:load-map-recipe', { detail: item.payload }))
          }}>Load in Print</button>
        ) : null}
        <button type="button" className="sm-ghost-btn" onClick={() => updateSavedItem(item.id, { pinned: !item.pinned })}>{item.pinned ? 'Unpin' : 'Pin'}</button>
        <button type="button" className="sm-danger-btn" onClick={() => deleteSavedItem(item.id)}>Delete</button>
      </div>
      <div className="sm-organize">
        <SystemEmojiButton label="Icon" value={payload.icon || ''} onPick={(mark) => savePayload({ icon: mark })} />
        {item.type === 'place' ? (
          <label>
            List
            <select value={payload.listName || 'General'} onChange={(event) => savePayload({ listName: event.target.value })}>
              {listNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        ) : null}
        <label>
          Folder
          <select value={payload.folder || ''} onChange={(event) => savePayload({ folder: event.target.value })}>
            <option value="">No folder</option>
            {folderNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label>
          Tags
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            onBlur={() => updateSavedItem(item.id, { tags: splitTags(tags) })}
            placeholder="field, watch"
          />
        </label>
      </div>
    </article>
  )
}

function ProfilePanel() {
  const { user, showToast } = useSuperMapAccount()
  const [posts, setPosts] = useState([])
  const [thought, setThought] = useState('')
  const [posting, setPosting] = useState(false)
  useEffect(() => subscribeProfilePosts(user?.uid, setPosts), [user?.uid])
  const thoughts = posts.filter((post) => post.type === 'thought' && post.parentId)
  const visible = posts.filter((post) => !post.parentId)

  async function postThought(event) {
    event.preventDefault()
    const text = thought.trim()
    if (!text || !user) return
    setPosting(true)
    try {
      await createProfilePost(user, { type: 'thought', title: text, summary: text })
      setThought('')
      showToast({ tone: 'success', message: 'Thought posted' })
    } catch (error) {
      showToast({ tone: 'danger', message: error.message || 'Could not post that' })
    } finally {
      setPosting(false)
    }
  }

  return (
    <section className="sm-vault">
      <div className="sm-profile-head">
        <h2><PresenceDot presence={user?.presence} />{user?.emoji || '◈'} {personTitle(user)}</h2>
        <p className="sm-local-note">{personHandle(user)}</p>
        {user?.bulletinTagline ? <p className="sm-public-tagline">{user.bulletinTagline}</p> : null}
        {user?.bio ? <p className="sm-bio">{user.bio}</p> : null}
      </div>
      <form className="sm-form sm-thought-form" onSubmit={postThought}>
        <label>
          Leave a thought
          <textarea value={thought} onChange={(event) => setThought(event.target.value)} maxLength={600} rows={3} placeholder="Write something" />
        </label>
        <button type="submit" className="sm-primary-btn" disabled={posting || !thought.trim()}>{posting ? '…' : 'Post'}</button>
      </form>
      {visible.map((post) => {
        const notes = thoughts.filter((row) => row.parentId === post.id)
        const menuItem = {
          id: post.id,
          ownerUid: post.ownerUid,
          type: post.type || 'article',
          title: post.title,
          summary: post.summary || '',
          url: post.sourceUrl || '',
          lat: post.lat,
          lon: post.lon,
        }
        return (
          <article key={post.id} className="sm-card has-item-menu">
            <ItemMenu item={menuItem} profilePost />
            {post.type === 'thought' ? <span className="sm-type-badge">Thought</span> : null}
            <h3>{post.type === 'thought' ? (post.summary || post.title) : post.title}</h3>
            {post.type !== 'thought' && post.summary ? <p className="sm-card-summary">{post.summary}</p> : null}
            {post.sourceUrl ? <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a> : null}
            {notes.map((note) => (
              <p key={note.id} className="sm-thought">
                {note.summary || note.title}
                <button type="button" className="sm-ghost-btn" onClick={() => deleteProfilePost(note).catch((error) => showToast({ tone: 'danger', message: error.message || 'Could not remove it' }))}>Remove</button>
              </p>
            ))}
          </article>
        )
      })}
      {visible.length === 0 ? <p className="sm-local-note">No profile posts yet.</p> : null}
    </section>
  )
}

function ago(ms) {
  if (!ms) return ''
  const sec = Math.max(0, Math.floor((Date.now() - Number(ms)) / 1000))
  if (sec < 60) return 'now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function MessagesPanel() {
  const { user, messageDraft, firebaseReady: ready, openPublicProfile } = useSuperMapAccount()
  const [conversations, setConversations] = useState([])
  const [pickedId, setPickedId] = useState(null)
  const [activePerson, setActivePerson] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [find, setFind] = useState('')
  const [people, setPeople] = useState([])
  const [searching, setSearching] = useState(false)
  const [sendError, setSendError] = useState('')
  const [menuId, setMenuId] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [burst, setBurst] = useState('')
  const [, setClock] = useState(0)
  const logRef = useRef(null)
  const composerRef = useRef(null)

  useEffect(() => subscribeConversations(user?.uid, setConversations), [user?.uid])

  useEffect(() => {
    if (!messageDraft?.uid || !user?.uid) return undefined
    const person = {
      uid: messageDraft.uid,
      displayName: messageDraft.displayName || 'Anonymous',
      emoji: messageDraft.emoji || '◈',
      handle: personHandle(messageDraft),
    }
    const id = conversationId(user.uid, person.uid)
    setActivePerson(person)
    setPickedId(id)
    openDirectConversation({ from: user, to: person }).catch(() => {})
    return undefined
  }, [messageDraft, user])

  const activeId = pickedId
  useEffect(() => {
    if (!activeId || !user?.uid) return undefined
    markConversationRead(activeId, user.uid).catch(() => {})
    return subscribeMessages(activeId, setMessages)
  }, [activeId, user?.uid])

  useEffect(() => {
    const q = find.trim()
    if (!ready || q.length < 1) {
      setPeople([])
      setSearching(false)
      return undefined
    }
    let cancel = false
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const rows = await searchDiscoverableUsers(q)
        if (!cancel) setPeople(rows.filter((person) => person.uid !== user?.uid))
      } catch {
        if (!cancel) setPeople([])
      } finally {
        if (!cancel) setSearching(false)
      }
    }, 180)
    return () => {
      cancel = true
      clearTimeout(timer)
    }
  }, [find, ready, user?.uid])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, activeId])

  useEffect(() => {
    if (!messages.some((message) => message.expiresAtMs)) return undefined
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [messages])

  const active = conversations.find((row) => row.id === activeId) || null
  const partnerId = active?.memberUids?.find((id) => id !== user?.uid) || activePerson?.uid || null
  const partner = (partnerId && active?.members?.[partnerId]) || (activePerson?.uid === partnerId ? activePerson : null)
  const other = partner ? { uid: partnerId, displayName: partner.displayName || 'Anonymous', emoji: partner.emoji || '◈', handle: personHandle({ ...partner, uid: partnerId }) } : null
  const knownIds = new Set(conversations.map((row) => row.id))
  const inbox = conversations.filter((row) => (row.box?.[user?.uid] || 'inbox') !== 'archived' && row.box?.[user?.uid] !== 'deleted')
  const archived = conversations.filter((row) => row.box?.[user?.uid] === 'archived')
  const liveMessages = messages.filter((message) => !message.expiresAtMs || message.expiresAtMs > Date.now())

  async function setBox(id, box) {
    setMenuId(null)
    setSettingsOpen(false)
    await setConversationBox(id, user.uid, box).catch((error) => setSendError(error.message || 'Could not update the chat'))
    if (box === 'deleted' && id === activeId) {
      setPickedId(null)
      setActivePerson(null)
    }
  }

  function insertEmoji(mark) {
    const el = composerRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? start
    const next = `${text.slice(0, start)}${mark}${text.slice(end)}`
    setText(next)
    requestAnimationFrame(() => {
      el?.focus()
      const caret = start + mark.length
      el?.setSelectionRange?.(caret, caret)
    })
  }

  function renderChat(row) {
    const id = row.memberUids?.find((uid) => uid !== user.uid)
    const person = row.members?.[id] || {}
    const card = { uid: id, displayName: person.displayName, emoji: person.emoji, handle: person.handle }
    const unread = row.unread?.[user.uid] || 0
    const preview = row.lastBody || 'Start of the conversation'
    const title = personTitle(card)
    const boxed = row.box?.[user.uid] === 'archived'
    return (
      <div
        key={row.id}
        className={`sm-msg-row${row.id === activeId ? ' is-active' : ''}`}
        aria-current={row.id === activeId ? 'true' : undefined}
      >
        <button type="button" className="sm-msg-avatar sm-msg-avatar-btn" onClick={() => openPublicProfile(card)} aria-label={`View ${title}'s profile`}>{person.emoji || '◈'}</button>
        <button type="button" className="sm-msg-main" onClick={() => choose(card)}>
          <span className="sm-msg-copy">
            <strong>{title}</strong>
            <em>{title === personHandle(card) ? preview : `${personHandle(card)} · ${preview}`}</em>
          </span>
          <span className="sm-msg-meta">
            {row.updatedAtMs ? <time>{ago(row.updatedAtMs)}</time> : null}
            {unread > 0 ? <strong className="sm-msg-unread">{unread}</strong> : null}
          </span>
        </button>
        <div className="sm-msg-menu">
          <button type="button" className="sm-msg-more" aria-label={`Options for ${title}`} aria-expanded={menuId === row.id} onClick={() => setMenuId(menuId === row.id ? null : row.id)}>···</button>
          {menuId === row.id ? (
            <div className="sm-msg-menu-pop" role="menu">
              <button type="button" role="menuitem" onClick={() => setBox(row.id, boxed ? 'inbox' : 'archived')}>{boxed ? 'Unarchive' : 'Archive'}</button>
              <button type="button" role="menuitem" onClick={() => setBox(row.id, 'deleted')}>Delete</button>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  async function choose(person) {
    if (!user?.uid || !person?.uid || person.uid === user.uid) return
    const next = {
      uid: person.uid,
      displayName: person.displayName || 'Anonymous',
      emoji: person.emoji || '◈',
      handle: personHandle(person),
    }
    const id = conversationId(user.uid, next.uid)
    setSendError('')
    setActivePerson(next)
    setPickedId(id)
    setFind('')
    setPeople([])
    if (id !== pickedId) setMessages([])
    await openDirectConversation({ from: user, to: next }).catch(() => {})
    composerRef.current?.focus()
  }

  async function onSend(event) {
    event.preventDefault()
    if (!other) return
    const expiresInMs = Number(burst) || Number(active?.disappearMs) || 0
    const result = await sendDirectMessage({ from: user, to: other, body: text, expiresInMs })
    if (result.ok) {
      setText('')
      setSendError('')
      setPickedId(result.id)
    } else {
      setSendError(result.error || 'Could not send')
    }
  }

  function onComposerKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <section className={`sm-messages${other ? ' is-thread-open' : ''}`}>
      <aside className="sm-message-list">
        <div className="sm-msg-search">
          {ready ? (
            <input
              value={find}
              onChange={(event) => setFind(event.target.value)}
              placeholder="Search people"
              aria-label="Search people"
            />
          ) : null}
        </div>
        <div className="sm-msg-scroll">
          {find.trim() ? <p className="sm-msg-section">People</p> : null}
          {people.map((person) => (
            <div key={person.uid} className="sm-msg-row sm-msg-person">
              <button type="button" className="sm-msg-main" onClick={() => openPublicProfile(person)} aria-label={`View ${personTitle(person)}'s profile`}>
                <span className="sm-msg-avatar" aria-hidden>{person.emoji || '◈'}</span>
                <span className="sm-msg-copy">
                  <strong><PresenceDot presence={person.presence} />{personTitle(person)}</strong>
                  <em>{personHandle(person)}{person.bulletinTagline ? ` · ${person.bulletinTagline}` : ''}</em>
                </span>
              </button>
              <button type="button" className="sm-msg-go" onClick={() => choose(person)}>Message</button>
            </div>
          ))}
          {find.trim() && !searching && people.length === 0 ? <p className="sm-local-note">No accounts match.</p> : null}
          <p className="sm-msg-section">Chats</p>
          {other && activeId && !knownIds.has(activeId) ? (
            <div className="sm-msg-row is-active" aria-current="true">
              <button type="button" className="sm-msg-avatar sm-msg-avatar-btn" onClick={() => openPublicProfile(other)} aria-label={`View ${personTitle(other)}'s profile`}>{other.emoji}</button>
              <button type="button" className="sm-msg-main" onClick={() => choose(other)}>
                <span className="sm-msg-copy">
                  <strong>{personTitle(other)}</strong>
                  <em>{personHandle(other)}</em>
                </span>
              </button>
            </div>
          ) : null}
          {inbox.map((row) => renderChat(row))}
          {inbox.length === 0 && !other ? <p className="sm-local-note">No chats yet. Search for someone to message.</p> : null}
          {archived.length ? <p className="sm-msg-section">Archived</p> : null}
          {archived.map((row) => renderChat(row))}
        </div>
      </aside>
      <div className="sm-message-thread">
        {other ? (
          <>
            <header className="sm-msg-head" aria-live="polite">
              <button type="button" className="sm-msg-back" onClick={() => { setPickedId(null); setActivePerson(null) }}>Chats</button>
              <button type="button" className="sm-msg-main" onClick={() => openPublicProfile(other)} aria-label={`View ${personTitle(other)}'s profile`}>
                <span className="sm-msg-avatar sm-msg-avatar-lg" aria-hidden>{other.emoji}</span>
                <span className="sm-msg-copy">
                  <h3>{personTitle(other)}</h3>
                  <p>{personHandle(other)} · Profile{active?.disappearMs ? ` · Disappears after ${disappearLabel(active.disappearMs)}` : ''}</p>
                </span>
              </button>
              <button type="button" className="sm-ghost-btn" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>Message settings</button>
            </header>
            {settingsOpen ? (
              <div className="sm-msg-settings">
                <label>
                  Disappearing messages
                  <select
                    value={String(active?.disappearMs || '')}
                    onChange={(event) => setConversationTimer(activeId, Number(event.target.value) || 0).catch((error) => setSendError(error.message || 'Could not save that timer'))}
                  >
                    <option value="">Off</option>
                    {DISAPPEAR_CHOICES.map((choice) => <option key={choice.id} value={choice.ms}>{choice.label}</option>)}
                  </select>
                </label>
                <div className="sm-card-actions">
                  <button type="button" className="sm-ghost-btn" onClick={() => setBox(activeId, active?.box?.[user.uid] === 'archived' ? 'inbox' : 'archived')}>{active?.box?.[user.uid] === 'archived' ? 'Unarchive' : 'Archive chat'}</button>
                  <button type="button" className="sm-danger-btn" onClick={() => setBox(activeId, 'deleted')}>Delete chat</button>
                </div>
              </div>
            ) : null}
            <div className="sm-message-log" ref={logRef}>
              {liveMessages.length === 0 ? (
                <p className="sm-msg-empty">This is the start of your conversation with {personTitle(other)}.</p>
              ) : null}
              {liveMessages.map((message) => (
                <article key={message.id} className={message.fromUid === user.uid ? 'is-mine' : ''}>
                  {message.item?.title ? <p className="sm-message-card">{message.item.title}</p> : null}
                  <p>{message.body}</p>
                  <time>
                    {when(message.createdAtMs)}
                    {message.expiresAtMs ? ` · disappears ${disappearLabel(message.expiresAtMs - message.createdAtMs) || 'soon'}` : ''}
                  </time>
                </article>
              ))}
            </div>
            <form onSubmit={onSend} className="sm-reply-form">
              <textarea
                ref={composerRef}
                rows={1}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={onComposerKey}
                placeholder={`Message ${personTitle(other)}`}
                aria-label={`Message ${personTitle(other)}`}
              />
              <div className="sm-reply-tools">
                <SystemEmojiButton label="Emoji" placement="up" targetRef={composerRef} onPick={insertEmoji} />
                <label>
                  This message
                  <select value={burst} onChange={(event) => setBurst(event.target.value)} aria-label="Short disappearing time">
                    <option value="">{active?.disappearMs ? `Chat timer (${disappearLabel(active.disappearMs)})` : 'Stays'}</option>
                    {DISAPPEAR_CHOICES.filter((choice) => choice.short).map((choice) => (
                      <option key={choice.id} value={choice.ms}>{choice.label}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="sm-primary-btn" disabled={!text.trim()}>Send</button>
              </div>
            </form>
            {sendError ? <p className="sm-auth-error">{sendError}</p> : null}
          </>
        ) : (
          <div className="sm-msg-empty-pane">
            <h3>Your messages</h3>
            <p>Search for a person, then open their chat. Their name stays at the top of the thread.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function SettingsPanel() {
  const { user, updateAccount, deleteAccount } = useSuperMapAccount()
  const [name, setName] = useState(user?.displayName || '')
  const [emoji, setEmoji] = useState(user?.emoji || '◈')
  const [bio, setBio] = useState(user?.bio || '')
  const [tagline, setTagline] = useState(user?.bulletinTagline || '')
  const [presence, setPresence] = useState(presenceValue(user?.presence))
  const [discoverable, setDiscoverable] = useState(user?.discoverable !== false)
  const [modes, setModes] = useState(getModeVisibility)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  async function onSave(event) {
    event.preventDefault()
    setError('')
    const result = await updateAccount({ displayName: name, emoji, discoverable, bio, presence, bulletinTagline: tagline })
    setSaved(result.ok ? 'Saved' : '')
    if (!result.ok) setError(result.error || 'Could not save')
  }

  function toggleMode(id) {
    const next = { ...modes, [id]: !modes[id] }
    setModes(next)
    setModeVisibility(next)
    updateAccount({ modeVisibility: getModeVisibility() }).catch?.(() => {})
  }

  return (
    <section className="sm-vault">
      <form className="sm-form" onSubmit={onSave}>
        <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required /></label>
        <label>Bio<textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={280} rows={3} placeholder="A short bio other people can see" /></label>
        <fieldset className="sm-bulletin-settings">
          <legend>Bulletin profile</legend>
          <label>
            Tagline
            <input value={tagline} onChange={(event) => setTagline(event.target.value)} maxLength={80} placeholder="A title under your name on the board" />
          </label>
          <p className="sm-local-note">Shows under your name on The Bulletin Board, like a custom title on an old forum.</p>
          <div className="sm-bulletin-preview" aria-hidden="true">
            <span>{emoji || '◈'}</span>
            <strong>{name.trim() || personTitle(user)}</strong>
            {tagline.trim() ? <em>{tagline.trim()}</em> : null}
          </div>
        </fieldset>
        <label>
          Status
          <select value={presence} onChange={(event) => setPresence(event.target.value)}>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="incognito">Incognito</option>
          </select>
        </label>
        <div>
          <span>Profile emoji</span>
          <SystemEmojiButton label="Profile emoji" value={emoji} onPick={setEmoji} />
        </div>
        <label className="sm-check">
          <input type="checkbox" checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)} />
          Let other people find me and send messages
        </label>
        <p className="sm-local-note">Username {personHandle(user)} · Account #{personNumber(user)}. Assigned to this account and saved with it. Your email stays off your public profile.</p>
        {error ? <p className="sm-auth-error">{error}</p> : null}
        {saved ? <p className="sm-local-note">{saved}</p> : null}
        <button type="submit" className="sm-primary-btn">Save profile</button>
      </form>
      <VaultPasscodeForm />
      <div>
        <h3>Menu</h3>
        <p className="sm-local-note">Home and Settings stay on the rail and the circular menu.</p>
        {MODE_CATALOG.filter((mode) => !mode.pinned).map((mode) => (
          <label key={mode.id} className="sm-check">
            <input type="checkbox" checked={modes[mode.id] !== false} onChange={() => toggleMode(mode.id)} />
            {mode.icon} {mode.label}
          </label>
        ))}
      </div>
      <form className="sm-form" onSubmit={async (event) => {
        event.preventDefault()
        setError('')
        const result = await deleteAccount(confirm)
        if (!result.ok) setError(result.error || 'Could not delete the account')
      }}>
        <h3>Delete account</h3>
        <p className="sm-local-note">Type your display name or username. This removes the account, saved items, and profile posts.</p>
        <label>Display name<input value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
        <button type="submit" className="sm-danger-btn">Delete account</button>
      </form>
    </section>
  )
}

function VaultPasscodeForm() {
  const { user, setVaultLock } = useSuperMapAccount()
  const [digits, setDigits] = useState(user?.vaultLock?.digits || 4)
  const [current, setCurrent] = useState('')
  const [nextCode, setNextCode] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  function digitsOnly(value, length) {
    return String(value || '').replace(/\D/g, '').slice(0, length)
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (!user?.uid) return
    setError('')
    setNote('')
    setBusy(true)
    try {
      if (user.vaultLock) {
        const ok = await vaultPasscodeMatches(current, user.vaultLock, user.uid)
        if (!ok) {
          setError('Current passcode is wrong')
          return
        }
      }
      if (!nextCode && !again) {
        const cleared = await setVaultLock(null)
        if (!cleared.ok) setError(cleared.error || 'Could not remove the passcode')
        else {
          setNote('Vault passcode removed')
          setCurrent('')
        }
        return
      }
      if (!passcodeDigitsOk(nextCode, digits) || nextCode !== again) {
        setError(nextCode !== again ? 'Passcodes do not match' : `Use exactly ${digits} digits`)
        return
      }
      const hash = await hashVaultPasscode(nextCode, user.uid)
      const savedLock = await setVaultLock({ digits: Number(digits), hash })
      if (!savedLock.ok) setError(savedLock.error || 'Could not save the passcode')
      else {
        setNote(`Vault passcode saved (${digits} digits)`)
        setCurrent('')
        setNextCode('')
        setAgain('')
      }
    } catch (err) {
      setError(err.message || 'Could not save the passcode')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="sm-form" onSubmit={onSubmit}>
      <h3>Vault passcode</h3>
      <p className="sm-local-note">Optional. A 4- or 6-digit code locks the vault on this account until you enter it again.</p>
      <label>
        Length
        <select value={digits} onChange={(event) => setDigits(Number(event.target.value))}>
          <option value={4}>4 digits</option>
          <option value={6}>6 digits</option>
        </select>
      </label>
      {user?.vaultLock ? (
        <label>
          Current passcode
          <input inputMode="numeric" autoComplete="off" value={current} maxLength={6} onChange={(event) => setCurrent(digitsOnly(event.target.value, 6))} />
        </label>
      ) : null}
      <label>
        New passcode
        <input inputMode="numeric" autoComplete="off" value={nextCode} maxLength={digits} onChange={(event) => setNextCode(digitsOnly(event.target.value, digits))} />
      </label>
      <label>
        Confirm passcode
        <input inputMode="numeric" autoComplete="off" value={again} maxLength={digits} onChange={(event) => setAgain(digitsOnly(event.target.value, digits))} />
      </label>
      {error ? <p className="sm-auth-error">{error}</p> : null}
      {note ? <p className="sm-local-note">{note}</p> : null}
      <div className="sm-card-actions">
        <button type="submit" className="sm-primary-btn" disabled={busy}>{user?.vaultLock ? 'Update passcode' : 'Set passcode'}</button>
        {user?.vaultLock ? (
          <button
            type="button"
            className="sm-danger-btn"
            disabled={busy}
            onClick={async () => {
              setError('')
              setNote('')
              if (!user.vaultLock) return
              setBusy(true)
              try {
                const ok = await vaultPasscodeMatches(current, user.vaultLock, user.uid)
                if (!ok) {
                  setError('Current passcode is wrong')
                  return
                }
                const cleared = await setVaultLock(null)
                if (!cleared.ok) setError(cleared.error || 'Could not remove the passcode')
                else {
                  setNote('Vault passcode removed')
                  setCurrent('')
                  setNextCode('')
                  setAgain('')
                }
              } catch (err) {
                setError(err.message || 'Could not remove the passcode')
              } finally {
                setBusy(false)
              }
            }}
          >
            Remove passcode
          </button>
        ) : null}
      </div>
    </form>
  )
}

const INFRA_LAYERS = [
  { key: 'openRailwayMap', label: 'Open Railway Map' },
  { key: 'powerGrid', label: 'Power Grid (Worldwide)', hint: 'Zoom to 14 or closer to load lines and substations.' },
  { key: 'commsInfrastructure', label: 'Comms Infrastructure' },
]

function InfrastructurePanel() {
  const [layers, setLayers] = useState({})
  useEffect(() => {
    function onLayers(event) {
      setLayers(event.detail || {})
    }
    window.addEventListener('supermap:layers', onLayers)
    window.dispatchEvent(new CustomEvent('supermap:layers-request'))
    return () => window.removeEventListener('supermap:layers', onLayers)
  }, [])

  function toggle(key, on) {
    setLayers((prev) => ({ ...prev, [key]: on }))
    window.dispatchEvent(new CustomEvent('supermap:layer-toggle', { detail: { key, on } }))
  }

  return (
    <section className="sm-vault">
      <h3>Infrastructure</h3>
      <p className="sm-local-note">Rail, power, and communications layers on the map.</p>
      {INFRA_LAYERS.map((layer) => (
        <label key={layer.key} className="sm-check">
          <input type="checkbox" checked={!!layers[layer.key]} onChange={(event) => toggle(layer.key, event.target.checked)} />
          <span>{layer.label}{layers[layer.key] && layer.hint ? ` — ${layer.hint}` : ''}</span>
        </label>
      ))}
    </section>
  )
}

function ReportsPanel() {
  const [reports, setReports] = useState([])
  useEffect(() => subscribeReports(setReports), [])
  return (
    <section className="sm-vault">
      <p className="sm-local-note">Reports sent to you. Other accounts cannot read this list.</p>
      {reports.map((report) => (
        <article key={report.id} className="sm-card">
          <span className="sm-type-badge">{report.reason === 'score' ? `Score ${report.suggestedScore || '?'}/5` : report.reason}</span>
          <h3>{report.target?.title || 'Site'}</h3>
          <p className="sm-card-summary">{report.note || 'No note.'}</p>
          <p className="sm-card-summary">{report.reporterName} · {when(report.createdAtMs)}</p>
          {report.target?.url ? <a href={report.target.url} target="_blank" rel="noopener noreferrer">Open</a> : null}
        </article>
      ))}
      {reports.length === 0 ? <p className="sm-local-note">No reports yet.</p> : null}
    </section>
  )
}
