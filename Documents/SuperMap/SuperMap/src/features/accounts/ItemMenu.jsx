import { useEffect, useRef, useState } from 'react'
import { useSuperMapAccount } from './SuperMapAccounts'
import { createProfilePost, fileReport, queueReportClip, searchDiscoverableUsers, sendDirectMessage } from './socialData'
import { firebaseReady } from './firebaseClient'
import './ItemMenu.css'

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default function ItemMenu({ item, inline = false }) {
  const { user, setOverlay, createSavedItem, openMessages, showToast } = useSuperMapAccount()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('actions')
  const [people, setPeople] = useState([])
  const [query, setQuery] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('broken')
  const [busy, setBusy] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])

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

  async function postToProfile() {
    if (!requireUser()) return
    await createProfilePost(user, item)
    showToast({ tone: 'success', message: 'Posted to your profile' })
    setOpen(false)
  }

  function pinToMap() {
    const lat = num(item.lat)
    const lon = num(item.lon)
    if (lat != null && lon != null) {
      window.dispatchEvent(new CustomEvent('supermap:show-place', {
        detail: { lat, lon, title: item.title, zoom: 12, drop: true },
      }))
      showToast({ tone: 'success', message: 'Pinned on the map' })
    } else {
      sessionStorage.setItem('supermap.pending-pin-title', item.title || 'Pinned item')
      sessionStorage.setItem('supermap.one-shot-pin', '1')
      window.dispatchEvent(new CustomEvent('supermap:begin-pin'))
      showToast({ tone: 'info', message: 'Click the map to place this pin' })
    }
    setOpen(false)
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
    showToast({ tone: 'success', message: `Sent to ${person.displayName || 'user'}` })
    openMessages?.({ uid: person.uid, displayName: person.displayName, emoji: person.emoji })
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
        ···
      </button>
      {open ? (
        <div className="item-menu-pop" role="menu">
          {step === 'actions' ? (
            <>
              <button type="button" onClick={postToProfile}>Post to Profile</button>
              <button type="button" onClick={() => { setStep('send'); loadPeople('') }}>Send to User</button>
              <button type="button" onClick={addToVault}>Add to vault</button>
              <button type="button" onClick={addToReport}>Add to report</button>
              <button type="button" onClick={pinToMap}>Pin to map</button>
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
                          <span>{person.emoji || '◈'}</span> {person.displayName || 'Anonymous'}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {people.length === 0 ? <p>No discoverable accounts match.</p> : null}
                </>
              ) : <p>Other people are available once Firebase sign-in is on.</p>}
            </div>
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
        </div>
      ) : null}
    </div>
  )
}
