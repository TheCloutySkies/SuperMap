import { useEffect, useMemo, useState } from 'react'
import { useSuperMapAccount } from './SuperMapAccounts'
import { MODE_CATALOG, PROFILE_EMOJIS, REPORT_OWNER_EMAIL, getModeVisibility, setModeVisibility } from './menuCatalog'
import { firebaseReady } from './firebaseClient'
import {
  markConversationRead,
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
              <h2>{user?.displayName || 'Anonymous'}</h2>
              <p>{user?.anonymous ? 'Anonymous account' : (user?.email || 'Signed in')} · {firebaseReady ? 'Firebase' : 'This browser'}</p>
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
  const { vault, updateSavedItem, deleteSavedItem, beginAddPlace } = useSuperMapAccount()
  return (
    <section className="sm-vault">
      <p className="sm-local-note">Places are a name and a point on the map. Articles and reports show up here when you add them from the ··· menu.</p>
      <button type="button" className="sm-primary-btn" onClick={beginAddPlace}>Add a place</button>
      <div className="sm-card-grid">
        {vault.map((item) => (
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
      {vault.length === 0 ? <p className="sm-local-note">Nothing saved yet.</p> : null}
    </section>
  )
}

function ProfilePanel() {
  const { user } = useSuperMapAccount()
  const [posts, setPosts] = useState([])
  useEffect(() => subscribeProfilePosts(user?.uid, setPosts), [user?.uid])
  return (
    <section className="sm-vault">
      <p className="sm-local-note">{user?.emoji || '◈'} {user?.displayName}. Posts you send with “Post to Profile” land here.</p>
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

function MessagesPanel() {
  const { user, messageDraft, firebaseReady: ready } = useSuperMapAccount()
  const [conversations, setConversations] = useState([])
  const [pickedId, setPickedId] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [find, setFind] = useState('')
  const [people, setPeople] = useState([])

  useEffect(() => subscribeConversations(user?.uid, setConversations), [user?.uid])
  const draftId = messageDraft?.uid && user?.uid ? [user.uid, messageDraft.uid].sort().join('__') : null
  const activeId = pickedId || draftId
  useEffect(() => {
    if (!activeId) return undefined
    markConversationRead(activeId, user.uid).catch(() => {})
    return subscribeMessages(activeId, setMessages)
  }, [activeId, user?.uid])

  const active = conversations.find((row) => row.id === activeId) || null
  const otherUid = useMemo(() => {
    if (active?.memberUids) return active.memberUids.find((id) => id !== user?.uid)
    return messageDraft?.uid || null
  }, [active, messageDraft, user?.uid])
  const other = active?.members?.[otherUid] || messageDraft || null

  async function onSend(event) {
    event.preventDefault()
    if (!otherUid) return
    const result = await sendDirectMessage({
      from: user,
      to: { uid: otherUid, displayName: other?.displayName, emoji: other?.emoji },
      body: text,
    })
    if (result.ok) {
      setText('')
      setPickedId(result.id)
    }
  }

  return (
    <section className="sm-messages">
      <div className="sm-message-list">
        {ready ? (
          <form onSubmit={async (event) => {
            event.preventDefault()
            setPeople(await searchDiscoverableUsers(find))
          }}>
            <input value={find} onChange={(event) => setFind(event.target.value)} placeholder="Find a person" aria-label="Find a person" />
          </form>
        ) : <p className="sm-local-note">Direct messages with other accounts need Firebase.</p>}
        {people.map((person) => (
          <button key={person.uid} type="button" onClick={() => {
            setPickedId([user.uid, person.uid].sort().join('__'))
            setPeople([])
          }}>{person.emoji || '◈'} {person.displayName}</button>
        ))}
        {conversations.map((row) => {
          const partnerId = row.memberUids?.find((id) => id !== user.uid)
          const partner = row.members?.[partnerId]
          const unread = row.unread?.[user.uid] || 0
          return (
            <button key={row.id} type="button" className={row.id === activeId ? 'active' : ''} onClick={() => setPickedId(row.id)}>
              <span>{partner?.emoji || '◈'} {partner?.displayName || 'Person'}</span>
              <em>{row.lastBody}</em>
              {unread > 0 ? <strong>{unread}</strong> : null}
            </button>
          )
        })}
      </div>
      <div className="sm-message-thread">
        {other ? <h3>{other.emoji || '◈'} {other.displayName || 'Conversation'}</h3> : <h3>Pick a conversation</h3>}
        <div className="sm-message-log">
          {messages.map((message) => (
            <article key={message.id} className={message.fromUid === user.uid ? 'is-mine' : ''}>
              {message.item?.title ? <p className="sm-message-card">{message.item.title}</p> : null}
              <p>{message.body}</p>
              <time>{when(message.createdAtMs)}</time>
            </article>
          ))}
        </div>
        <form onSubmit={onSend} className="sm-reply-form">
          <textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder="Message" />
          <button type="submit" className="sm-primary-btn" disabled={!otherUid}>Send</button>
        </form>
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
        <p className="sm-local-note">Your email stays off your public profile.</p>
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
        <p className="sm-local-note">Type your display name. This removes the account, saved items, and profile posts.</p>
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
