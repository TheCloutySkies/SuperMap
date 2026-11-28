import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Draggable from 'react-draggable'
import { useSuperMapAccount } from './SuperMapAccounts'
import SystemEmojiButton from './SystemEmoji'
import { personHandle, personTitle } from './accountIdentity'
import { MAX_MEDIA_BYTES } from './chatMedia'
import { mediaReady } from './firebaseClient'
import { ago, countdownText, presenceLabel, presenceValue, when } from './messageBits'
import {
  clearTyping,
  conversationId,
  DISAPPEAR_CHOICES,
  disappearLabel,
  loadUserProfile,
  markConversationRead,
  openDirectConversation,
  recountUnread,
  searchDiscoverableUsers,
  sendDirectMessage,
  setConversationBox,
  setConversationTimer,
  setTyping,
  subscribeConversations,
  subscribeMessages,
  subscribeTyping,
  TYPING_LIVE_MS,
} from './socialData'
import { raiseError } from '../../lib/xpErrors'
import './msn.css'

/**
 * Accounts → Messages as an MSN Messenger window pair.
 *
 * Presentation only: conversations, messages, unread counts, disappearing
 * timers, photos and profile reads all come from socialData.js exactly as
 * before. The two windows float over the workspace, and a contact row opens
 * the conversation window beside it.
 */

/** Live profile reads, so a contact row can show presence, tagline and picture. */
const PROFILE_TTL_MS = 30 * 1000
const profileCache = new Map()

function useProfiles(uids) {
  const [rows, setRows] = useState({})
  const key = uids.join(',')

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    const now = Date.now()
    const stale = uids.filter((uid) => {
      const hit = profileCache.get(uid)
      return !hit || now - hit.at > PROFILE_TTL_MS
    })
    const reads = stale.map((uid) => loadUserProfile(uid)
      .then((row) => { if (row) profileCache.set(uid, { at: Date.now(), row }) }))
    Promise.all(reads).then(() => {
      if (cancelled) return
      const next = {}
      for (const uid of uids) next[uid] = profileCache.get(uid)?.row || null
      setRows(next)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return rows
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 900)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const onChange = (event) => setNarrow(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return narrow
}

/** A ticking clock for live countdowns; pauses while the tab is hidden. */
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer = null
    const start = () => {
      if (timer) return
      setNow(Date.now())
      timer = setInterval(() => setNow(Date.now()), intervalMs)
    }
    const stop = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }
    const onVisibility = () => (document.hidden ? stop() : start())
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])
  return now
}

function MsnStatus({ presence, className = '' }) {
  const value = presenceValue(presence)
  const label = presenceLabel(presence)
  return (
    <span
      className={`msn-status msn-status--${value}${className ? ` ${className}` : ''}`}
      title={label}
      aria-label={label}
      role="img"
    >
      {value === 'away' ? (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 4.4v4.1l2.5 1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="4.5" r="2.7" fill="currentColor" />
          <path d="M8 8.4c-2.8 0-5 2.3-5 4.3h10c0-2-2.2-4.3-5-4.3z" fill="currentColor" />
        </svg>
      )}
    </span>
  )
}

function MsnPicture({ person, size = 40, label = '' }) {
  const src = person?.photoURL || ''
  return (
    <span className={`msn-picture msn-picture--${size}`} title={label || undefined}>
      <span className="msn-picture-fallback" aria-hidden="true">{person?.emoji || '◈'}</span>
      {src ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={(event) => { event.currentTarget.hidden = true }}
        />
      ) : null}
    </span>
  )
}

function MsnWindow({
  title,
  icon,
  className = '',
  width,
  start,
  state,
  canDrag,
  onClose,
  onShade,
  onFill,
  children,
}) {
  const nodeRef = useRef(null)
  const frame = (
    <div
      ref={nodeRef}
      className={`window msn-window ${className}`.trim()}
      style={{ width }}
      role="dialog"
      aria-label={title}
      data-state={state}
    >
      <div className="title-bar">
        <div className="title-bar-text">
          {icon ? <span className="msn-title-mark" aria-hidden="true">{icon}</span> : null}
          {title}
        </div>
        <div className="title-bar-controls">
          <button type="button" aria-label="Minimize" title="Minimize" onClick={onShade} />
          <button type="button" aria-label="Maximize" title="Maximize" onClick={onFill} />
          <button type="button" aria-label="Close" title="Close" onClick={onClose} />
        </div>
      </div>
      {children}
    </div>
  )

  if (!canDrag) return frame
  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".title-bar"
      cancel=".title-bar-controls"
      bounds="parent"
      disabled={state !== 'normal'}
      defaultPosition={start}
    >
      {frame}
    </Draggable>
  )
}

function MsnMenuBar({ menus, open, onOpen, onClose }) {
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!boxRef.current?.contains(event.target)) onClose()
    }
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div className="msn-menubar" ref={boxRef} role="menubar">
      {menus.map((menu) => (
        <div className="msn-menu" key={menu.id}>
          <button
            type="button"
            role="menuitem"
            className={open === menu.id ? 'is-open' : ''}
            aria-expanded={open === menu.id}
            onClick={() => (open === menu.id ? onClose() : onOpen(menu.id))}
          >
            {menu.label}
          </button>
          {open === menu.id ? (
            <div className="msn-menu-pop" role="menu">
              {menu.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  title={item.title || undefined}
                  onClick={() => {
                    onClose()
                    item.onSelect?.()
                  }}
                >
                  {item.checked ? <span className="msn-menu-check" aria-hidden="true">✓</span> : null}
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export default function MsnMessenger() {
  const navigate = useNavigate()
  const account = useSuperMapAccount()
  const { user, messageDraft, firebaseReady: ready, openPublicProfile, updateAccount, setWorkspaceTab } = account
  const narrow = useNarrow()

  const [conversations, setConversations] = useState([])
  const [pickedId, setPickedId] = useState(null)
  const [activePerson, setActivePerson] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sendError, setSendError] = useState('')
  const [burst, setBurst] = useState('')
  const [photo, setPhoto] = useState(null)
  const [photoError, setPhotoError] = useState('')
  const [typingUids, setTypingUids] = useState([])
  const [taglineDraft, setTaglineDraft] = useState(null)
  const [menu, setMenu] = useState(null)
  const [rowMenuId, setRowMenuId] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [find, setFind] = useState('')
  const [people, setPeople] = useState([])
  const [searching, setSearching] = useState(false)
  const [about, setAbout] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [shake, setShake] = useState(false)
  const [listState, setListState] = useState('normal')
  const [chatState, setChatState] = useState('normal')

  const photoRef = useRef(null)
  const logRef = useRef(null)
  const composerRef = useRef(null)
  const now = useNow(1000)

  useEffect(() => subscribeConversations(user?.uid, setConversations), [user?.uid])

  useEffect(() => {
    if (!messageDraft?.uid || !user?.uid) return undefined
    const person = {
      uid: messageDraft.uid,
      displayName: messageDraft.displayName || 'Anonymous',
      emoji: messageDraft.emoji || '◈',
      handle: personHandle(messageDraft),
    }
    setActivePerson(person)
    setPickedId(conversationId(user.uid, person.uid))
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
    const query = find.trim()
    if (!ready || !addOpen || query.length < 1) {
      setPeople([])
      setSearching(false)
      return undefined
    }
    let cancel = false
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const rows = await searchDiscoverableUsers(query)
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
  }, [find, ready, addOpen, user?.uid])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, activeId])

  useEffect(() => {
    if (!activeId || !user?.uid) return undefined
    return subscribeTyping(activeId, (rows) => {
      setTypingUids(rows.filter((row) => row.uid !== user.uid))
    })
  }, [activeId, user?.uid])

  // A typing row hides itself six seconds after the last keystroke.
  useEffect(() => {
    if (!typingUids.length) return undefined
    const timer = setTimeout(() => setTypingUids([]), TYPING_LIVE_MS + 500)
    return () => clearTimeout(timer)
  }, [typingUids])

  // Reading a thread while it is open keeps its badge at zero.
  useEffect(() => {
    if (!activeId || !user?.uid) return
    markConversationRead(activeId, user.uid).catch(() => {})
    recountUnread(activeId).catch(() => {})
  }, [activeId, user?.uid, messages.length])

  const active = conversations.find((row) => row.id === activeId) || null
  const partnerId = active?.memberUids?.find((id) => id !== user?.uid) || activePerson?.uid || null
  const partner = (partnerId && active?.members?.[partnerId]) || (activePerson?.uid === partnerId ? activePerson : null)
  const other = partner
    ? { uid: partnerId, displayName: partner.displayName || 'Anonymous', emoji: partner.emoji || '◈', handle: personHandle({ ...partner, uid: partnerId }) }
    : null

  const knownIds = new Set(conversations.map((row) => row.id))
  const inbox = conversations.filter((row) => (row.box?.[user?.uid] || 'inbox') !== 'archived' && row.box?.[user?.uid] !== 'deleted')
  const archived = conversations.filter((row) => row.box?.[user?.uid] === 'archived')
  const liveMessages = messages.filter((message) => !message.expiresAtMs || message.expiresAtMs > Date.now())

  const contactUids = useMemo(
    () => [...new Set([...inbox, ...archived]
      .map((row) => row.memberUids?.find((uid) => uid !== user?.uid))
      .filter(Boolean))],
    [inbox, archived, user?.uid],
  )
  const profiles = useProfiles(contactUids)
  const myProfile = useProfiles([user?.uid || ''])[user?.uid] || user || null
  const contactProfile = other ? (profiles[other.uid] || active?.members?.[other.uid] || other) : null
  const contactPresence = presenceValue(contactProfile?.presence)
  const contactTagline = String(contactProfile?.bulletinTagline || '').trim()
  const tagline = taglineDraft ?? (user?.bulletinTagline || '')
  const presence = presenceValue(user?.presence)

  /** One bubble group per run of messages from the same person. */
  const groups = useMemo(() => {
    const rows = []
    for (const message of liveMessages) {
      const previous = rows[rows.length - 1]
      const same = previous
        && previous.items[previous.items.length - 1].fromUid === message.fromUid
        && Math.abs(Number(message.createdAtMs || 0) - Number(previous.items[previous.items.length - 1].createdAtMs || 0)) < 4 * 60 * 1000
      if (same) previous.items.push(message)
      else rows.push({ key: message.id, fromUid: message.fromUid, mine: message.fromUid === user?.uid, items: [message] })
    }
    return rows
  }, [liveMessages, user?.uid])

  async function setBox(id, box) {
    setRowMenuId(null)
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
    setAddOpen(false)
    setFind('')
    setPeople([])
    clearPhoto()
    if (id !== pickedId) setMessages([])
    await openDirectConversation({ from: user, to: next }).catch(() => {})
    composerRef.current?.focus()
  }

  function openContact(person) {
    if (!person?.uid) return
    choose(person)
  }

  function closeChat() {
    setPickedId(null)
    setActivePerson(null)
    setChatState('normal')
  }

  async function onSend(event) {
    event.preventDefault()
    if (!other) return
    const expiresInMs = Number(burst) || Number(active?.disappearMs) || 0
    await clearTyping(activeId, user.uid).catch(() => {})
    const result = await sendDirectMessage({ from: user, to: other, body: text, photo, expiresInMs })
    if (result.ok) {
      setText('')
      setPhoto(null)
      setPhotoError('')
      setSendError('')
      setPickedId(result.id)
      if (photoRef.current) photoRef.current.value = ''
    } else {
      setSendError(result.error || 'Could not send')
      raiseError('Message not sent', result.error || 'The message did not go through.')
    }
  }

  function clearPhoto() {
    setPhotoError('')
    setPhoto(null)
  }

  function pickPhoto(event) {
    const file = event.target.files?.[0] || null
    setPhotoError('')
    if (!file) {
      setPhoto(null)
      return
    }
    if (!/^image\//i.test(file.type || '')) {
      setPhotoError('Photos only.')
      raiseError('Not a photo', 'Only image files can be attached.')
      setPhoto(null)
      event.target.value = ''
      return
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setPhotoError(`Keep the photo under ${Math.round(MAX_MEDIA_BYTES / 1048576)} MB.`)
      raiseError('Photo too large', `Keep the photo under ${Math.round(MAX_MEDIA_BYTES / 1048576)} MB.`)
      setPhoto(null)
      event.target.value = ''
      return
    }
    setPhoto(file)
  }

  function onComposerChange(event) {
    setText(event.target.value)
    if (event.target.value.trim()) setTyping(activeId, user.uid).catch(() => {})
  }

  function onComposerBlur() {
    clearTyping(activeId, user.uid).catch(() => {})
  }

  function onComposerKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  function nudge() {
    setShake(true)
    window.setTimeout(() => setShake(false), 620)
  }

  async function saveTagline() {
    const next = String(taglineDraft ?? tagline).trim().slice(0, 80)
    setTaglineDraft(null)
    if (next === (user?.bulletinTagline || '')) return
    await updateAccount({ bulletinTagline: next }).catch(() => {})
  }

  async function setMyPresence(value) {
    await updateAccount({ presence: value }).catch(() => {})
  }

  const typingNames = typingUids.length
    ? typingUids.map((row) => active?.members?.[row.uid]?.displayName || 'Someone')
    : []

  const start = useMemo(() => {
    const wide = typeof window !== 'undefined' && window.innerWidth > 1040
    return wide
      ? { list: { x: 20, y: 20 }, chat: { x: 372, y: 44 } }
      : { list: { x: 12, y: 12 }, chat: { x: 12, y: 24 } }
  }, [])

  const menus = [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'Sign out', onSelect: () => account.signOutUser?.() },
        { label: 'Close Messenger', onSelect: () => setWorkspaceTab('vault') },
      ],
    },
    {
      id: 'contacts',
      label: 'Contacts',
      items: [
        { label: 'Add a Contact…', onSelect: () => setAddOpen(true) },
        { label: 'My profile', onSelect: () => openPublicProfile({ ...user, isSelf: true }) },
      ],
    },
    {
      id: 'actions',
      label: 'Actions',
      items: [
        { label: 'Online', checked: presence === 'online', onSelect: () => setMyPresence('online') },
        { label: 'Away', checked: presence === 'away', onSelect: () => setMyPresence('away') },
        { label: 'Busy', checked: presence === 'busy', onSelect: () => setMyPresence('busy') },
        { label: 'Appear Offline', checked: presence === 'incognito', onSelect: () => setMyPresence('incognito') },
        { label: 'Offline', checked: presence === 'offline', onSelect: () => setMyPresence('offline') },
        {
          label: active?.box?.[user?.uid] === 'archived' ? 'Unarchive this chat' : 'Archive this chat',
          disabled: !active,
          onSelect: () => setBox(activeId, active?.box?.[user?.uid] === 'archived' ? 'inbox' : 'archived'),
        },
        { label: 'Delete this chat', disabled: !active, onSelect: () => setBox(activeId, 'deleted') },
      ],
    },
    {
      id: 'tools',
      label: 'Tools',
      items: [
        { label: 'Attach a photo', disabled: !other || !mediaReady, onSelect: () => photoRef.current?.click() },
        { label: 'Send a nudge', disabled: !other, onSelect: nudge },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [{ label: 'About GPN Messenger', onSelect: () => setAbout(true) }],
    },
  ]

  return (
    <div
      className={`msn-layer${other ? ' is-thread-open' : ''}${narrow ? ' is-narrow' : ''}`}
      role="presentation"
      aria-label="GPN Messenger"
    >
      <MsnWindow
        title="GPN Messenger"
        icon="◈"
        className={`msn-window--list${listState === 'shaded' ? ' is-shaded' : ''}${listState === 'filled' ? ' is-filled' : ''}`}
        width={narrow ? '100%' : 336}
        start={start.list}
        state={listState}
        canDrag={!narrow}
        onClose={() => setWorkspaceTab('vault')}
        onShade={() => setListState((value) => (value === 'shaded' ? 'normal' : 'shaded'))}
        onFill={() => setListState((value) => (value === 'filled' ? 'normal' : 'filled'))}
      >
        <MsnMenuBar menus={menus} open={menu} onOpen={setMenu} onClose={() => setMenu(null)} />
        <div className="window-body msn-list">
          <div className="msn-me">
            <MsnPicture person={myProfile} size={48} label="Your display picture" />
            <div className="msn-me-copy">
              <p className="msn-me-name">
                {personTitle(user)}
                <span className="msn-me-status">({presenceLabel(presence)})</span>
              </p>
              <input
                className="msn-tagline"
                value={tagline}
                maxLength={80}
                aria-label="Personal message"
                placeholder="<Type a personal message>"
                onChange={(event) => setTaglineDraft(event.target.value)}
                onBlur={saveTagline}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }
                }}
              />
            </div>
          </div>

          <p className="msn-banner">
            <span className="msn-banner-mark" aria-hidden="true">i</span>
            Messages disappear on the timer you set in the conversation.
          </p>

          <button type="button" className="msn-add" onClick={() => setAddOpen(true)}>
            <span className="msn-add-plus" aria-hidden="true">+</span>
            Add a Contact
          </button>
          {!ready ? <p className="msn-hint">Sign in to look people up. Saved chats are still below.</p> : null}

          <div className="msn-list-scroll">
            {other && activeId && !knownIds.has(activeId) ? (
              <div className="msn-row is-active">
                <MsnStatus presence={contactProfile?.presence} className="msn-row-status" />
                <MsnPicture person={other} size={40} />
                <button type="button" className="msn-row-main" onClick={() => openContact(other)}>
                  <span className="msn-row-name">{personTitle(other)}</span>
                  <span className="msn-row-tagline">{contactTagline || other.handle}</span>
                </button>
              </div>
            ) : null}

            {inbox.map((row) => {
              const uid = row.memberUids?.find((id) => id !== user?.uid)
              const person = row.members?.[uid] || {}
              const profile = profiles[uid] || person
              const unread = row.unread?.[user.uid] || 0
              const preview = row.lastBody || 'Start of the conversation'
              const name = personTitle({ ...person, uid })
              return (
                <div key={row.id} className={`msn-row${row.id === activeId ? ' is-active' : ''}`}>
                  <MsnStatus presence={profile?.presence} className="msn-row-status" />
                  <button
                    type="button"
                    className="msn-row-pic"
                    onClick={() => openPublicProfile({ ...profile, uid })}
                    aria-label={`View ${name}'s profile`}
                  >
                    <MsnPicture person={{ ...profile, uid }} size={40} />
                  </button>
                  <button type="button" className="msn-row-main" onClick={() => openContact({ ...person, ...profile, uid })}>
                    <span className="msn-row-name">
                      {name}
                      <em className="msn-row-status-word">({presenceLabel(profile?.presence)})</em>
                      {unread > 0 ? <span className="msn-unread" aria-label={`${unread} unread`} /> : null}
                    </span>
                    <span className="msn-row-tagline">{String(profile?.bulletinTagline || '').trim() || personHandle({ ...person, uid })}</span>
                    <span className="msn-row-preview">{preview}</span>
                  </button>
                  <span className="msn-row-tail">
                    {row.updatedAtMs ? <time>{ago(row.updatedAtMs)}</time> : null}
                    <button
                      type="button"
                      className="msn-row-more"
                      aria-label={`Options for ${name}`}
                      aria-expanded={rowMenuId === row.id}
                      onClick={() => setRowMenuId(rowMenuId === row.id ? null : row.id)}
                    >
                      ⋯
                    </button>
                  </span>
                  {rowMenuId === row.id ? (
                    <div className="msn-row-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => setBox(row.id, 'archived')}>Archive</button>
                      <button type="button" role="menuitem" onClick={() => setBox(row.id, 'deleted')}>Delete</button>
                    </div>
                  ) : null}
                </div>
              )
            })}

            {inbox.length === 0 && !other ? (
              <p className="msn-hint">No chats yet. Add a contact to start one.</p>
            ) : null}

            {archived.length ? (
              <>
                <p className="msn-group-caption">Archived</p>
                {archived.map((row) => {
                  const uid = row.memberUids?.find((id) => id !== user?.uid)
                  const person = row.members?.[uid] || {}
                  const profile = profiles[uid] || person
                  const name = personTitle({ ...person, uid })
                  return (
                    <div key={row.id} className={`msn-row${row.id === activeId ? ' is-active' : ''}`}>
                      <MsnStatus presence={profile?.presence} className="msn-row-status" />
                      <button type="button" className="msn-row-main" onClick={() => openContact({ ...person, ...profile, uid })}>
                        <span className="msn-row-name">{name}</span>
                        <span className="msn-row-preview">{row.lastBody || 'Archived chat'}</span>
                      </button>
                      <span className="msn-row-tail">
                        <button type="button" className="msn-row-more" aria-label={`Restore ${name}`} onClick={() => setBox(row.id, 'inbox')}>↩</button>
                        <button type="button" className="msn-row-more" aria-label={`Delete ${name}`} onClick={() => setBox(row.id, 'deleted')}>✕</button>
                      </span>
                    </div>
                  )
                })}
              </>
            ) : null}
          </div>

          <div className="msn-strip">
            <span className="msn-strip-logo" aria-hidden="true"><span className="msn-strip-blocks" />GPN</span>
            <span className="msn-strip-text">Good Palantir Network</span>
          </div>
        </div>
      </MsnWindow>

      {other ? (
        <MsnWindow
          title={`${personTitle(other)} - Conversation`}
          icon="◈"
          className={`msn-window--chat${chatState === 'shaded' ? ' is-shaded' : ''}${chatState === 'filled' ? ' is-filled' : ''}${shake ? ' is-shaking' : ''}`}
          width={narrow ? '100%' : 566}
          start={start.chat}
          state={chatState}
          canDrag={!narrow}
          onClose={closeChat}
          onShade={() => setChatState((value) => (value === 'shaded' ? 'normal' : 'shaded'))}
          onFill={() => setChatState((value) => (value === 'filled' ? 'normal' : 'filled'))}
        >
          <div className="window-body msn-chat">
            <div className="msn-toolbar" role="toolbar" aria-label="Conversation tools">
              <button type="button" className="msn-tool" title="Invite someone" onClick={() => setAddOpen(true)}>
                <span aria-hidden="true">✉</span> Invite
              </button>
              <button
                type="button"
                className="msn-tool"
                title={mediaReady ? 'Send a photo' : 'Photos need the live account database'}
                disabled={!mediaReady}
                onClick={() => photoRef.current?.click()}
              >
                <span aria-hidden="true">▤</span> Send Files
              </button>
              <button type="button" className="msn-tool" title="Open the broadcasts desk" onClick={() => navigate('/news/broadcasts')}>
                <span aria-hidden="true">◍</span> Voice
              </button>
              <button type="button" className="msn-tool" title="Open the tools desk" onClick={() => navigate('/tools')}>
                <span aria-hidden="true">▦</span> Activities
              </button>
              <button type="button" className="msn-tool" title="Open the tools desk" onClick={() => navigate('/tools')}>
                <span aria-hidden="true">▧</span> Games
              </button>
            </div>

            <div className="msn-chat-head">
              <button type="button" className="msn-back" onClick={closeChat}>Chats</button>
              <p className="msn-to">
                To: <strong>{personTitle(other)}</strong> &lt;{other.handle}&gt;
              </p>
            </div>

            {contactPresence !== 'online' ? (
              <p className="msn-banner msn-banner--away">
                <span className="msn-banner-mark" aria-hidden="true">i</span>
                {personTitle(other)} may not reply because their status is {presenceLabel(contactPresence)}.
              </p>
            ) : null}

            <p className="msn-security">Never give out your password or credit card number in an instant message.</p>

            <div className="msn-chat-main">
              <div className={`msn-log${shake ? ' is-shaking' : ''}`} ref={logRef} role="log" aria-label={`Messages with ${personTitle(other)}`}>
                {groups.length === 0 ? (
                  <p className="msn-hint">This is the start of your conversation with {personTitle(other)}.</p>
                ) : null}
                {groups.map((group) => {
                  const imageOwner = group.mine ? myProfile : contactProfile
                  return (
                    <div key={group.key} className={`msn-group${group.mine ? ' is-mine' : ''}`}>
                      {group.items.map((message) => {
                        const left = message.expiresAtMs ? Number(message.expiresAtMs) - now : null
                        return (
                          <div key={message.id} className={`msn-bubble-row${left != null && left <= 10000 ? ' is-expiring' : ''}`}>
                            <div className="msn-bubble">
                              {message.item?.title ? <p className="msn-card">{message.item.title}</p> : null}
                              {message.media?.path && message.media?.url ? (
                                <button type="button" className="msn-photo" onClick={() => setLightbox(message.media.url)}>
                                  <img
                                    src={message.media.url}
                                    alt=""
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={(event) => { event.currentTarget.hidden = true }}
                                  />
                                </button>
                              ) : null}
                              {message.body ? <p className="msn-text">{message.body}</p> : null}
                            </div>
                            <p className="msn-stamp">
                              {when(message.createdAtMs)}
                              {left != null ? ` · Disappears in ${countdownText(left)}` : ''}
                            </p>
                          </div>
                        )
                      })}
                      <div className="msn-group-foot">
                        <MsnPicture person={imageOwner} size={40} />
                        <span>{group.mine ? 'You' : personTitle(other)}</span>
                      </div>
                    </div>
                  )
                })}
                {typingNames.length ? (
                  <p className="msn-typing" aria-live="polite">
                    {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing…
                  </p>
                ) : null}
              </div>

              <aside className="msn-pictures" aria-label="Display pictures">
                <div className="msn-pic-panel">
                  <MsnPicture person={contactProfile} size={64} label={personTitle(other)} />
                  <button
                    type="button"
                    className="msn-pic-caret"
                    aria-label={`Open ${personTitle(other)}'s profile`}
                    onClick={() => openPublicProfile({ ...contactProfile, uid: other.uid })}
                  >
                    ▾
                  </button>
                </div>
                <div className="msn-pic-panel">
                  <MsnPicture person={myProfile} size={64} label="Your display picture" />
                  <SystemEmojiButton
                    label="Change your display picture"
                    value={String(user?.emoji || '')}
                    placement="up"
                    triggerClassName="msn-pic-caret"
                    triggerContent={<span aria-hidden="true">▾</span>}
                    onPick={(mark) => updateAccount({ emoji: mark }).catch(() => {})}
                  />
                </div>
              </aside>
            </div>

            <form className="msn-compose" onSubmit={onSend}>
              <div className="msn-format" role="toolbar" aria-label="Formatting">
                <button type="button" className="msn-fmt" disabled title="Fonts follow the Windows face here">A</button>
                <SystemEmojiButton
                  label="Emoticon"
                  placement="up"
                  targetRef={composerRef}
                  triggerClassName="msn-fmt"
                  triggerContent={<span aria-hidden="true">☺</span>}
                  onPick={insertEmoji}
                />
                <button type="button" className="msn-fmt" disabled title="Voice clips are not recorded here">♪</button>
                <button type="button" className="msn-fmt" disabled title="Winks are not installed">☺!</button>
                <button
                  type="button"
                  className="msn-fmt"
                  title={mediaReady ? 'Send a photo' : 'Photos need the live account database'}
                  disabled={!mediaReady}
                  onClick={() => photoRef.current?.click()}
                >
                  ▣
                </button>
                <button type="button" className="msn-fmt" disabled title="Gifts are not installed">✦</button>
                <button type="button" className="msn-fmt" title="Nudge this window" onClick={nudge}>⚡</button>
              </div>
              <div className="msn-compose-row">
                <textarea
                  ref={composerRef}
                  rows={2}
                  value={text}
                  onChange={onComposerChange}
                  onBlur={onComposerBlur}
                  onKeyDown={onComposerKey}
                  placeholder={`Message ${personTitle(other)}`}
                  aria-label={`Message ${personTitle(other)}`}
                />
                <button type="submit" className="msn-send" disabled={!text.trim() && !photo}>Send</button>
              </div>
              <div className="msn-compose-extra">
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  className="msn-hidden-file"
                  onChange={pickPhoto}
                  aria-label="Attach a photo"
                />
                {photo ? <span className="msn-chip">Photo attached</span> : null}
                <label className="msn-field">
                  Timer
                  <select
                    value={String(active?.disappearMs || '')}
                    onChange={(event) => setConversationTimer(activeId, Number(event.target.value) || 0).catch((error) => setSendError(error.message || 'Could not save that timer'))}
                  >
                    <option value="">Off</option>
                    {DISAPPEAR_CHOICES.map((choice) => <option key={choice.id} value={choice.ms}>{choice.label}</option>)}
                  </select>
                </label>
                <label className="msn-field">
                  This message
                  <select value={burst} onChange={(event) => setBurst(event.target.value)} aria-label="Short disappearing time">
                    <option value="">{active?.disappearMs ? `Chat timer (${disappearLabel(active.disappearMs)})` : 'Stays'}</option>
                    {DISAPPEAR_CHOICES.filter((choice) => choice.short).map((choice) => (
                      <option key={choice.id} value={choice.ms}>{choice.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {sendError ? <p className="msn-error">{sendError}</p> : null}
              {photoError ? <p className="msn-error">{photoError}</p> : null}
            </form>
          </div>
        </MsnWindow>
      ) : null}

      {addOpen ? (
        <div className="msn-modal" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setAddOpen(false) }}>
          <div className="window msn-dialog" role="dialog" aria-label="Add a Contact">
            <div className="title-bar">
              <div className="title-bar-text">Add a Contact</div>
              <div className="title-bar-controls">
                <button type="button" aria-label="Close" title="Close" onClick={() => setAddOpen(false)} />
              </div>
            </div>
            <div className="window-body">
              <label className="msn-field">
                Find a person
                <input
                  value={find}
                  onChange={(event) => setFind(event.target.value)}
                  placeholder="Name or handle"
                  autoFocus
                />
              </label>
              <div className="msn-find-list">
                {people.map((person) => (
                  <div key={person.uid} className="msn-find-row">
                    <MsnStatus presence={person.presence} />
                    <MsnPicture person={person} size={40} />
                    <span className="msn-find-copy">
                      <strong>{personTitle(person)}</strong>
                      <em>{personHandle(person)}{person.bulletinTagline ? ` · ${person.bulletinTagline}` : ''}</em>
                    </span>
                    <button type="button" className="sm-primary-btn" onClick={() => choose(person)}>Message</button>
                  </div>
                ))}
                {find.trim() && !searching && people.length === 0 ? <p className="msn-hint">No accounts match.</p> : null}
                {!ready ? <p className="msn-hint">Sign in to look people up.</p> : null}
              </div>
              <div className="msn-dialog-actions">
                <button type="button" onClick={() => setAddOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {about ? (
        <div className="msn-modal" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setAbout(false) }}>
          <div className="window msn-dialog" role="dialog" aria-label="About GPN Messenger">
            <div className="title-bar">
              <div className="title-bar-text">About GPN Messenger</div>
              <div className="title-bar-controls">
                <button type="button" aria-label="Close" title="Close" onClick={() => setAbout(false)} />
              </div>
            </div>
            <div className="window-body">
              <p className="msn-about-title">GPN Messenger</p>
              <p>Chat with other accounts on Good Palantir. Messages, unread counts and the disappearing timer are kept in your account database.</p>
              <p className="msn-security">Never give out your password or credit card number in an instant message.</p>
              <div className="msn-dialog-actions">
                <button type="button" onClick={() => setAbout(false)}>OK</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {lightbox ? (
        <div className="msn-modal msn-modal--photo" role="presentation" onClick={() => setLightbox(null)}>
          <div className="window msn-dialog msn-dialog--photo" role="dialog" aria-label="Photo">
            <div className="title-bar">
              <div className="title-bar-text">Photo</div>
              <div className="title-bar-controls">
                <button type="button" aria-label="Close" title="Close" onClick={() => setLightbox(null)} />
              </div>
            </div>
            <div className="window-body">
              <img src={lightbox} alt="" referrerPolicy="no-referrer" />
              <div className="msn-dialog-actions">
                <button type="button" onClick={() => setLightbox(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
