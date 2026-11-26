import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSuperMapAccount } from './SuperMapAccounts'
import { personHandle, personTitle } from './accountIdentity'
import { createProfilePost, deleteProfilePost, fileReport, queueReportClip, searchDiscoverableUsers, sendDirectMessage } from './socialData'
import { firebaseReady } from './firebaseClient'
import './ItemMenu.css'
import { getApiBase } from '../../lib/homeBootstrap'

const API_BASE = getApiBase()

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default function ItemMenu({ item, inline = false, profilePost = false }) {
  const { user, setOverlay, createSavedItem, openMessages, showToast } = useSuperMapAccount()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('actions')
  const [people, setPeople] = useState([])
  const [query, setQuery] = useState('')
  const [note, setNote] = useState('')
  const [thought, setThought] = useState('')
  const [reason, setReason] = useState('broken')
  const [busy, setBusy] = useState(false)
  const rootRef = useRef(null)
  const popRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (event) => {
      const target = event.target
      if (rootRef.current?.contains(target) || popRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return undefined
    const pop = popRef.current
    const anchor = rootRef.current?.querySelector('.item-menu-btn')
    if (!pop || !anchor) return undefined

    const place = () => {
      const rect = anchor.getBoundingClientRect()
      const margin = 8
      const gap = 4
      const width = pop.offsetWidth
      const height = pop.offsetHeight
      let top = rect.bottom + gap
      let left = rect.right - width
      if (top + height > window.innerHeight - margin) {
        const above = rect.top - gap - height
        if (above >= margin) top = above
      }
      const maxLeft = Math.max(margin, window.innerWidth - margin - width)
      const maxTop = Math.max(margin, window.innerHeight - margin - height)
      left = Math.min(Math.max(margin, left), maxLeft)
      top = Math.min(Math.max(margin, top), maxTop)
      pop.style.top = `${Math.round(top)}px`
      pop.style.left = `${Math.round(left)}px`
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, step, people.length, busy])

  function requireUser() {
    if (user) return true
    setOverlay('auth')
    setOpen(false)
    return false
  }

  async function addToVault() {
    if (!requireUser()) return
    const lat = num(item.lat)
    const lon = num(item.lon)
    await createSavedItem({
      type: item.vaultType || (lat != null && lon != null && item.type === 'place' ? 'place' : 'article'),
      title: item.title || 'Saved item',
      summary: item.summary || '',
      sourceUrl: item.url || null,
      location: lat != null && lon != null ? { lat, lon } : null,
      payload: item.payload || {},
    })
    setOpen(false)
  }

  async function removeFromProfile() {
    if (!requireUser()) return
    if (item.ownerUid && item.ownerUid !== user.uid) return
    setBusy(true)
    try {
      await deleteProfilePost(item)
      showToast({ tone: 'success', message: 'Removed from your profile' })
      setOpen(false)
    } catch (error) {
      showToast({ tone: 'danger', message: error.message || 'Could not remove it' })
    } finally {
      setBusy(false)
    }
  }

  async function submitThought(event) {
    event.preventDefault()
    if (!requireUser()) return
    const text = thought.trim()
    if (!text) return
    setBusy(true)
    try {
      await createProfilePost(user, { type: 'thought', title: text, summary: text, parentId: item.id || null })
      showToast({ tone: 'success', message: 'Thought posted' })
      setThought('')
      setOpen(false)
    } catch (error) {
      showToast({ tone: 'danger', message: error.message || 'Could not post that' })
    } finally {
      setBusy(false)
    }
  }

  async function postToProfile() {
    if (!requireUser()) return
    await createProfilePost(user, item)
    showToast({ tone: 'success', message: 'Posted to your profile' })
    setOpen(false)
  }

  function pinMedia() {
    const url = item.url || item.link || ''
    const listed = Array.isArray(item.images) ? item.images.find((src) => typeof src === 'string' && src) : ''
    const image = item.image || item.imageUrl || item.thumbnail || item.src || listed || ''
    const summary = item.summary || item.description || item.contentSnippet || item.content || ''
    const mediaKind = ['x', 'news', 'image'].includes(item.kind)
      ? item.kind
      : (/x\.com|twitter\.com/i.test(url) ? 'x' : (image && !url ? 'image' : 'news'))
    const coords = Array.isArray(item.coordinates) ? item.coordinates : null
    return {
      title: item.title || 'Pinned item',
      url,
      image,
      summary,
      mediaKind,
      kind: mediaKind,
      lat: num(item.lat ?? item.latitude) ?? num(coords?.[1]),
      lon: num(item.lon ?? item.lng ?? item.longitude) ?? num(coords?.[0]),
    }
  }

  async function locatePin(destination) {
    if (destination === 'community' && !requireUser()) return
    const media = pinMedia()
    const key = destination === 'community' ? 'supermap.draft-community-pin' : 'supermap.draft-map-pin'
    const eventName = destination === 'community' ? 'supermap:draft-community-pin' : 'supermap:draft-map-pin'
    const publish = (draft) => {
      sessionStorage.setItem(key, JSON.stringify(draft))
      window.dispatchEvent(new CustomEvent(eventName, { detail: draft }))
    }
    setBusy(true)
    setOpen(false)
    showToast({ tone: 'info', message: 'Reading the headline for a place…' })
    publish({
      ...media,
      place: '',
      category: media.kind === 'x' ? 'x' : 'news',
      sidc: '',
      reasoning: '',
      label: media.title || '',
      destination,
      locating: true,
    })
    let located = {}
    try {
      const response = await fetch(`${API_BASE}/api/pins/locate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          title: media.title,
          summary: media.summary,
          url: media.url,
          image: media.image,
          kind: media.kind,
        }),
      })
      const payload = await response.json()
      if (response.ok && payload && typeof payload === 'object') located = payload
    } catch {
      located = {}
    }
    const lat = num(located.lat) ?? media.lat
    const lon = num(located.lon) ?? media.lon
    publish({
      ...media,
      lat,
      lon,
      place: located.place || '',
      category: located.category || (media.kind === 'x' ? 'x' : 'news'),
      sidc: located.sidc || '',
      reasoning: located.reasoning || '',
      label: media.title || '',
      zoom: located.zoom,
      destination,
      locating: false,
    })
    const searchText = located.query || located.place || ''
    if (searchText) {
      const detail = { query: searchText, lat, lon }
      sessionStorage.setItem('supermap.place-search', JSON.stringify(detail))
      window.dispatchEvent(new CustomEvent('supermap:place-search', { detail }))
    }
    setBusy(false)
    const placeName = located.place || located.query || ''
    if (lat == null || lon == null) {
      showToast({ tone: 'info', message: 'No place stood out. Click the map to drop the pin.' })
    } else {
      showToast({
        tone: 'success',
        message: placeName
          ? `Draft pin is on ${placeName}. Drag it if the spot is off.`
          : 'Draft pin is on the map. Drag it if the spot is off.',
      })
    }
  }

  function addToReport() {
    queueReportClip(item)
    showToast({ tone: 'success', message: 'Added to your report' })
    setOpen(false)
  }

  async function loadPeople(nextQuery) {
    setQuery(nextQuery)
    if (!firebaseReady) {
      setPeople([])
      return
    }
    const rows = await searchDiscoverableUsers(nextQuery)
    setPeople(rows.filter((person) => person.uid !== user?.uid))
  }

  async function sendTo(person) {
    if (!requireUser()) return
    setBusy(true)
    const result = await sendDirectMessage({
      from: user,
      to: person,
      body: '',
      item,
    })
    setBusy(false)
    if (!result.ok) {
      showToast({ tone: 'danger', message: result.error || 'Could not send' })
      return
    }
    showToast({ tone: 'success', message: `Sent to ${personTitle(person)}` })
    openMessages?.({ uid: person.uid, displayName: person.displayName, emoji: person.emoji, handle: personHandle(person) })
    setOpen(false)
  }

  async function submitReport(event) {
    event.preventDefault()
    if (!requireUser()) return
    setBusy(true)
    const result = await fileReport({ reporter: user, reason, note, item })
    setBusy(false)
    if (!result.ok) {
      showToast({ tone: 'danger', message: result.error || 'Could not send the report' })
      return
    }
    showToast({ tone: 'success', message: 'Report sent' })
    setNote('')
    setOpen(false)
  }

  return (
    <div className={`item-menu ${inline ? 'is-inline' : ''}`} ref={rootRef} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="item-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${item.title || 'item'}`}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setStep('actions')
          setOpen((value) => !value)
        }}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="3" cy="8" r="1.35" />
          <circle cx="8" cy="8" r="1.35" />
          <circle cx="13" cy="8" r="1.35" />
        </svg>
      </button>
      {open ? createPortal(
        <div className={`item-menu-pop${step === 'actions' ? '' : ' is-wide'}`} role="menu" ref={popRef}>
          {step === 'actions' ? (
            <>
              {profilePost ? <button type="button" onClick={() => setStep('thought')}>Leave a thought</button> : null}
              {profilePost && (!item.ownerUid || item.ownerUid === user?.uid) ? (
                <button type="button" onClick={removeFromProfile} disabled={busy}>Remove from profile</button>
              ) : null}
              {!profilePost ? <button type="button" onClick={postToProfile}>Post to Profile</button> : null}
              <button type="button" onClick={() => { setStep('send'); loadPeople('') }}>Send to User</button>
              <button type="button" onClick={addToVault}>Add to vault</button>
              <button type="button" onClick={addToReport}>Add to report</button>
              <button type="button" onClick={() => locatePin('mine')} disabled={busy}>Pin to my maps</button>
              <button type="button" onClick={() => locatePin('community')} disabled={busy}>Pin to community</button>
              <button type="button" onClick={() => setStep('report')}>Report</button>
            </>
          ) : null}
          {step === 'send' ? (
            <div className="item-menu-step">
              <button type="button" className="item-menu-back" onClick={() => setStep('actions')}>Back</button>
              {firebaseReady ? (
                <>
                  <input
                    value={query}
                    onChange={(event) => loadPeople(event.target.value)}
                    placeholder="Search people"
                    aria-label="Search people"
                  />
                  <ul>
                    {people.map((person) => (
                      <li key={person.uid}>
                        <button type="button" disabled={busy} onClick={() => sendTo(person)}>
                          <span>{person.emoji || '◈'}</span> {personTitle(person)} <em>{personHandle(person)}</em>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {people.length === 0 ? <p>No discoverable accounts match.</p> : null}
                </>
              ) : null}
            </div>
          ) : null}
          {step === 'thought' ? (
            <form className="item-menu-step" onSubmit={submitThought}>
              <button type="button" className="item-menu-back" onClick={() => setStep('actions')}>Back</button>
              <label>
                Thought
                <textarea value={thought} onChange={(event) => setThought(event.target.value)} rows={3} maxLength={600} placeholder="Leave a thought" />
              </label>
              <button type="submit" disabled={busy || !thought.trim()}>{busy ? '…' : 'Post'}</button>
            </form>
          ) : null}
          {step === 'report' ? (
            <form className="item-menu-step" onSubmit={submitReport}>
              <button type="button" className="item-menu-back" onClick={() => setStep('actions')}>Back</button>
              <label>
                Reason
                <select value={reason} onChange={(event) => setReason(event.target.value)}>
                  <option value="broken">Broken</option>
                  <option value="misleading">Misleading</option>
                  <option value="false">False</option>
                </select>
              </label>
              <label>
                Note
                <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What looks wrong?" />
              </label>
              <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
            </form>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
