import { useEffect, useRef, useState } from 'react'
import { useSuperMapAccount } from './SuperMapAccounts'
import { MODE_CATALOG, PROFILE_EMOJIS, REPORT_OWNER_EMAIL, getModeVisibility, setModeVisibility } from './menuCatalog'
import { firebaseReady } from './firebaseClient'
import { personHandle, personNumber, personTitle } from './accountIdentity'
import {
  conversationId,
  markConversationRead,
  openDirectConversation,
  searchDiscoverableUsers,
  sendDirectMessage,
  subscribeConversations,
  subscribeMessages,
  subscribeProfilePosts,
  subscribeReports,
} from './socialData'

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
    ['settings', 'Settings'],
    ...(isOwner ? [['reports', 'Reports']] : []),
  ]
  return (
    <div className="sm-workspace-scrim" role="dialog" aria-modal="true">
      <div className="sm-workspace">
        <header className="sm-workspace-header">
          <div className="sm-workspace-title">
            <span className="sm-auth-mark">{user?.emoji || '◈'}</span>
            <div>
              <h2>{personTitle(user)}</h2>
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
            {workspaceTab === 'reports' && isOwner ? <ReportsPanel /> : null}
          </main>
        </div>
      </div>
    </div>
  )
}

function VaultPanel() {
  const { vault, pinLists, updateSavedItem, deleteSavedItem, beginAddPlace } = useSuperMapAccount()
  const listNames = [...new Set([
    ...(pinLists || []),
    ...vault.filter((item) => item.type === 'place').map((item) => item.payload?.listName || 'General'),
  ])].filter(Boolean)
  const otherItems = vault.filter((item) => item.type !== 'place' && item.payload?.kind !== 'pin-list')
  return (
    <section className="sm-vault">
      <p className="sm-local-note">Places are a name and a point on the map. Articles and reports show up here when you add them from the ··· menu.</p>
      <button type="button" className="sm-primary-btn" onClick={beginAddPlace}>Add a place</button>
      {listNames.map((name) => {
        const places = vault.filter((item) => item.type === 'place' && (item.payload?.listName || 'General') === name)
        const listRecord = vault.find((item) => item.payload?.kind === 'pin-list' && item.title === name)
        return (
          <div key={name}>
            <div className="sm-list-head">
              <h3>{name}</h3>
              {listRecord ? (
                <button type="button" className="sm-ghost-btn" onClick={() => deleteSavedItem(listRecord.id)}>Delete list</button>
              ) : null}
            </div>
            {places.length === 0 ? <p className="sm-local-note">No places in this list yet.</p> : null}
            <div className="sm-card-grid">
              {places.map((item) => (
                <article key={item.id} className="sm-card">
                  <span className="sm-type-badge">{item.payload?.icon || '📍'} {item.type}</span>
                  <h3>{item.title}</h3>
                  {item.summary ? <p className="sm-card-summary">{item.summary}</p> : null}
                  {item.location ? <p className="sm-card-summary">{Number(item.location.lat).toFixed(3)}, {Number(item.location.lon).toFixed(3)}</p> : null}
                  <div className="sm-card-actions">
                    {item.location ? (
                      <button type="button" className="sm-ghost-btn" onClick={() => {
                        window.dispatchEvent(new CustomEvent('supermap:show-place', {
                          detail: { lat: item.location.lat, lon: item.location.lon, title: item.title, zoom: 12 },
                        }))
                      }}>Show on map</button>
                    ) : null}
                    <button type="button" className="sm-ghost-btn" onClick={() => updateSavedItem(item.id, { pinned: !item.pinned })}>{item.pinned ? 'Unpin' : 'Pin'}</button>
                    <button type="button" className="sm-danger-btn" onClick={() => deleteSavedItem(item.id)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )
      })}
      <div className="sm-card-grid">
        {otherItems.map((item) => (
          <article key={item.id} className="sm-card">
            <span className="sm-type-badge">{item.type}</span>
            <h3>{item.title}</h3>
            {item.summary ? <p className="sm-card-summary">{item.summary}</p> : null}
            {item.location ? <p className="sm-card-summary">{Number(item.location.lat).toFixed(3)}, {Number(item.location.lon).toFixed(3)}</p> : null}
            <div className="sm-card-actions">
              {item.type === 'place' && item.location ? (
                <button type="button" className="sm-ghost-btn" onClick={() => {
                  window.dispatchEvent(new CustomEvent('supermap:show-place', {
                    detail: { lat: item.location.lat, lon: item.location.lon, title: item.title, zoom: 12 },
                  }))
                }}>Show on map</button>
              ) : null}
              {item.type === 'map' ? (
                <button type="button" className="sm-ghost-btn" onClick={() => {
                  window.dispatchEvent(new CustomEvent('supermap:load-map-recipe', { detail: item.payload }))
                }}>Load in Print</button>
              ) : null}
              <button type="button" className="sm-ghost-btn" onClick={() => updateSavedItem(item.id, { pinned: !item.pinned })}>{item.pinned ? 'Unpin' : 'Pin'}</button>
              <button type="button" className="sm-danger-btn" onClick={() => deleteSavedItem(item.id)}>Delete</button>
            </div>
          </article>
        ))}
      </div>
      {vault.length === 0 && listNames.length === 0 ? <p className="sm-local-note">Nothing saved yet.</p> : null}
    </section>
  )
}

function ProfilePanel() {
  const { user } = useSuperMapAccount()
  const [posts, setPosts] = useState([])
  useEffect(() => subscribeProfilePosts(user?.uid, setPosts), [user?.uid])
  return (
    <section className="sm-vault">
      <p className="sm-local-note">{user?.emoji || '◈'} {personTitle(user)} · {personHandle(user)}. Posts you send with “Post to Profile” land here.</p>
      {posts.map((post) => (
        <article key={post.id} className="sm-card">
          <h3>{post.title}</h3>
          {post.summary ? <p className="sm-card-summary">{post.summary}</p> : null}
          {post.sourceUrl ? <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a> : null}
        </article>
      ))}
      {posts.length === 0 ? <p className="sm-local-note">No profile posts yet.</p> : null}
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
  const { user, messageDraft, firebaseReady: ready } = useSuperMapAccount()
  const [conversations, setConversations] = useState([])
  const [pickedId, setPickedId] = useState(null)
  const [activePerson, setActivePerson] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [find, setFind] = useState('')
  const [people, setPeople] = useState([])
  const [searching, setSearching] = useState(false)
  const [sendError, setSendError] = useState('')
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

  const active = conversations.find((row) => row.id === activeId) || null
  const partnerId = active?.memberUids?.find((id) => id !== user?.uid) || activePerson?.uid || null
  const partner = (partnerId && active?.members?.[partnerId]) || (activePerson?.uid === partnerId ? activePerson : null)
  const other = partner ? { uid: partnerId, displayName: partner.displayName || 'Anonymous', emoji: partner.emoji || '◈', handle: personHandle({ ...partner, uid: partnerId }) } : null
  const knownIds = new Set(conversations.map((row) => row.id))

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
    const result = await sendDirectMessage({ from: user, to: other, body: text })
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
          ) : <p className="sm-local-note">Direct messages with other accounts need Firebase.</p>}
        </div>
        <div className="sm-msg-scroll">
          {find.trim() ? <p className="sm-msg-section">People</p> : null}
          {people.map((person) => (
            <button key={person.uid} type="button" className="sm-msg-row sm-msg-person" onClick={() => choose(person)}>
              <span className="sm-msg-avatar" aria-hidden>{person.emoji || '◈'}</span>
              <span className="sm-msg-copy">
                <strong>{personTitle(person)}</strong>
                <em>{personHandle(person)}</em>
              </span>
              <span className="sm-msg-go">Message</span>
            </button>
          ))}
          {find.trim() && !searching && people.length === 0 ? <p className="sm-local-note">No accounts match.</p> : null}
          <p className="sm-msg-section">Chats</p>
          {other && activeId && !knownIds.has(activeId) ? (
            <button type="button" className="sm-msg-row is-active" aria-current="true">
              <span className="sm-msg-avatar" aria-hidden>{other.emoji}</span>
              <span className="sm-msg-copy">
                <strong>{personTitle(other)}</strong>
                <em>{personHandle(other)}</em>
              </span>
            </button>
          ) : null}
          {conversations.map((row) => {
            const id = row.memberUids?.find((uid) => uid !== user.uid)
            const person = row.members?.[id] || {}
            const unread = row.unread?.[user.uid] || 0
            const preview = row.lastBody || 'Start of the conversation'
            return (
              <button
                key={row.id}
                type="button"
                className={`sm-msg-row${row.id === activeId ? ' is-active' : ''}`}
                aria-current={row.id === activeId ? 'true' : undefined}
                onClick={() => choose({ uid: id, displayName: person.displayName, emoji: person.emoji, handle: person.handle })}
              >
                <span className="sm-msg-avatar" aria-hidden>{person.emoji || '◈'}</span>
                <span className="sm-msg-copy">
                  <strong>{personTitle({ ...person, uid: id })}</strong>
                  <em>{personTitle({ ...person, uid: id }) === personHandle({ ...person, uid: id }) ? preview : `${personHandle({ ...person, uid: id })} · ${preview}`}</em>
                </span>
                <span className="sm-msg-meta">
                  {row.updatedAtMs ? <time>{ago(row.updatedAtMs)}</time> : null}
                  {unread > 0 ? <strong className="sm-msg-unread">{unread}</strong> : null}
                </span>
              </button>
            )
          })}
          {conversations.length === 0 && !other ? <p className="sm-local-note">No chats yet. Search for someone to message.</p> : null}
        </div>
      </aside>
      <div className="sm-message-thread">
        {other ? (
          <>
            <header className="sm-msg-head" aria-live="polite">
              <button type="button" className="sm-msg-back" onClick={() => { setPickedId(null); setActivePerson(null) }}>Chats</button>
              <span className="sm-msg-avatar sm-msg-avatar-lg" aria-hidden>{other.emoji}</span>
              <div>
                <h3>{personTitle(other)}</h3>
                <p>{personHandle(other)} · Direct message</p>
              </div>
            </header>
            <div className="sm-message-log" ref={logRef}>
              {messages.length === 0 ? (
                <p className="sm-msg-empty">This is the start of your conversation with {personTitle(other)}.</p>
              ) : null}
              {messages.map((message) => (
                <article key={message.id} className={message.fromUid === user.uid ? 'is-mine' : ''}>
                  {message.item?.title ? <p className="sm-message-card">{message.item.title}</p> : null}
                  <p>{message.body}</p>
                  <time>{when(message.createdAtMs)}</time>
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
              <button type="submit" className="sm-primary-btn" disabled={!text.trim()}>Send</button>
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
  const [discoverable, setDiscoverable] = useState(user?.discoverable !== false)
  const [modes, setModes] = useState(getModeVisibility)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  async function onSave(event) {
    event.preventDefault()
    setError('')
    const result = await updateAccount({ displayName: name, emoji, discoverable })
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
        <div>
          <span>Profile emoji</span>
          <div className="sm-emoji-grid">
            {PROFILE_EMOJIS.map((mark) => (
              <button key={mark} type="button" className={emoji === mark ? 'active' : ''} onClick={() => setEmoji(mark)} aria-label={mark}>{mark}</button>
            ))}
          </div>
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

function ReportsPanel() {
  const [reports, setReports] = useState([])
  useEffect(() => subscribeReports(setReports), [])
  return (
    <section className="sm-vault">
      <p className="sm-local-note">Reports sent to you. Other accounts cannot read this list.</p>
      {reports.map((report) => (
        <article key={report.id} className="sm-card">
          <span className="sm-type-badge">{report.reason}</span>
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
