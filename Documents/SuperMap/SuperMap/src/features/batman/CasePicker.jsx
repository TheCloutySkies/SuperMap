/**
 * "Add to case" from anywhere.
 *
 * Every surface dispatches `supermap:add-to-case` with an item; this host owns the
 * modal that picks the case, so no surface has to know how cases are stored.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSuperMapAccount } from '../accounts/SuperMapAccounts'
import { createCase, fetchCase, persistCase, subscribeCases } from './caseStore'
import { cleanItemForNode, nodeFromItem, NODE_KINDS } from './caseModel'
import './batman.css'

export default function CasePickerHost() {
  const { user } = useSuperMapAccount()
  const [item, setItem] = useState(null)
  const [cases, setCases] = useState([])
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onAdd = (event) => {
      const next = event.detail?.item || null
      if (!next) return
      setItem(next)
      setStatus('')
      setTitle(String(next.title || next.name || '').slice(0, 80))
    }
    window.addEventListener('supermap:add-to-case', onAdd)
    return () => window.removeEventListener('supermap:add-to-case', onAdd)
  }, [])

  useEffect(() => {
    if (!item) return undefined
    return subscribeCases(user?.uid || 'local', setCases)
  }, [item, user?.uid])

  if (!item) return null

  const ownerUid = user?.uid || 'local'
  const kind = NODE_KINDS.find((entry) => entry.id === cleanItemForNode(item).kind) || NODE_KINDS[5]

  async function appendTo(caseDoc) {
    setBusy(true)
    setStatus('')
    const node = nodeFromItem(item)
    const result = await persistCase({
      ...caseDoc,
      nodes: [...(caseDoc.nodes || []), node],
    })
    setBusy(false)
    if (!result.ok) {
      setStatus(result.error || 'Could not save the case.')
      return
    }
    setItem(null)
  }

  async function pick(caseId) {
    setBusy(true)
    setStatus('')
    const caseDoc = await fetchCase(caseId)
    setBusy(false)
    if (!caseDoc) {
      setStatus('That case could not be opened.')
      return
    }
    await appendTo(caseDoc)
  }

  async function createAndAppend() {
    setBusy(true)
    setStatus('')
    const created = await createCase({ ownerUid, title: title.trim() || 'Untitled case' })
    setBusy(false)
    if (!created.ok) {
      setStatus(created.error || 'Could not create the case.')
      return
    }
    await appendTo(created.caseDoc)
  }

  const close = () => {
    if (busy) return
    setItem(null)
    setStatus('')
  }

  return createPortal(
    <div className="batman-modal-scrim" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <div className="batman-modal" role="dialog" aria-modal="true" aria-label="Add to a Batman Mode case">
        <header className="batman-modal-head">
          <h3>Add to a case</h3>
          <button type="button" className="batman-btn batman-btn-ghost" onClick={close} disabled={busy}>Close</button>
        </header>
        <p className="batman-modal-item">
          <span aria-hidden>{kind.icon}</span> {String(item.title || item.name || 'Untitled').slice(0, 120)}
        </p>

        <form
          className="batman-new-case"
          onSubmit={(event) => {
            event.preventDefault()
            if (!busy) createAndAppend()
          }}
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="New case name"
            aria-label="New case name"
          />
          <button type="submit" className="batman-btn" disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : 'New case'}
          </button>
        </form>

        {cases.length ? (
          <ul className="batman-case-pick">
            {cases.slice(0, 12).map((caseDoc) => (
              <li key={caseDoc.id}>
                <button type="button" onClick={() => pick(caseDoc.id)} disabled={busy}>
                  <strong>{caseDoc.title || 'Untitled case'}</strong>
                  <em>{(caseDoc.nodes || []).length} items · {caseDoc.visibility === 'link' ? 'share link on' : 'private'}</em>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="batman-hint">No cases yet — name one above and this item becomes its first piece of evidence.</p>
        )}

        {status ? <p className="batman-error">{status}</p> : null}
      </div>
    </div>,
    document.body,
  )
}
