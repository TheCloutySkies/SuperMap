/**
 * Passive enrichment for this case.
 *
 * The panel only ever asks: it writes a target into `scan_requests` and waits.
 * The Actions worker does the scanning with the Admin SDK and writes
 * `enrichment/{id}`, which the rules keep private to the owner. Importing the
 * result is a normal node add, so the case stays the one copy.
 */
import { useEffect, useState } from 'react'
import { collection, doc, getDoc, limit, onSnapshot, query, setDoc, where } from 'firebase/firestore'
import { getAccountsFirebase } from '../accounts/firebaseClient'
import { nodeOf } from './caseModel'

const TARGET_TYPES = [
  { id: 'domain', label: 'Domain' },
  { id: 'ip', label: 'IP address' },
  { id: 'email', label: 'Email' },
  { id: 'username', label: 'Username' },
  { id: 'phone', label: 'Phone' },
  { id: 'company', label: 'Company' },
]

function db() {
  const firebase = getAccountsFirebase()
  return firebase?.db || null
}

const STATUS_TEXT = {
  pending: 'queued',
  running: 'scanning',
  done: 'ready to import',
  error: 'failed',
}

export default function EnrichmentPanel({ caseDoc, ownerUid, onImport }) {
  const [target, setTarget] = useState('')
  const [targetType, setTargetType] = useState('domain')
  const [requests, setRequests] = useState([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const firestore = db()
    if (!firestore || !ownerUid || ownerUid === 'local') return undefined
    // One field only, so no composite index is needed; the order is done here.
    const q = query(
      collection(firestore, 'scan_requests'),
      where('ownerUid', '==', ownerUid),
      limit(30),
    )
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((row) => ({ id: row.id, ...row.data() }))
      rows.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
      setRequests(rows)
    }, () => setRequests([]))
  }, [ownerUid])

  async function queue(event) {
    event.preventDefault()
    const value = target.trim()
    if (!value || busy) return
    const firestore = db()
    if (!firestore || ownerUid === 'local') {
      setStatus('Enrichment needs the live account database.')
      return
    }
    setBusy(true)
    setStatus('')
    const id = crypto.randomUUID ? crypto.randomUUID() : `scan-${Date.now()}`
    try {
      await setDoc(doc(firestore, 'scan_requests', id), {
        ownerUid,
        caseId: caseDoc?.id || null,
        target: value.slice(0, 200),
        targetType,
        status: 'pending',
        createdAtMs: Date.now(),
      })
      setTarget('')
      setStatus('Queued. The worker picks it up within five minutes.')
    } catch (error) {
      setStatus(error.message || 'Could not queue the scan.')
    } finally {
      setBusy(false)
    }
  }

  async function importResult(requestId) {
    const firestore = db()
    if (!firestore) return
    setBusy(true)
    setStatus('')
    try {
      const snap = await getDoc(doc(firestore, 'enrichment', requestId))
      if (!snap.exists()) {
        setStatus('That result is not written yet.')
        return
      }
      const rows = snap.data()?.nodes || []
      const existing = new Set((caseDoc?.nodes || []).map((node) => `${node.kind}:${node.title}`))
      const fresh = rows
        .filter((row) => !existing.has(`${row.kind}:${row.title}`))
        .map((row) => nodeOf({
          kind: row.kind,
          title: row.title,
          data: row.data,
          confidence: row.confidence,
          ref: { source: row.source || 'SpiderFoot', url: null },
        }))
      if (!fresh.length) {
        setStatus('Everything in that result is already in the case.')
        return
      }
      onImport?.(fresh)
      setStatus(`Imported ${fresh.length} item${fresh.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setStatus(error.message || 'Could not read the result.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="batman-enrich">
      <p className="batman-hint">
        Passive sources only: DNS, WHOIS, certificates, archives, GitHub, breach and abuse feeds.
        Nothing is scanned directly, and results stay private to you.
      </p>
      <form className="batman-new" onSubmit={queue}>
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="example.com"
          aria-label="Target"
        />
        <select value={targetType} onChange={(event) => setTargetType(event.target.value)} aria-label="Target type">
          {TARGET_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
        </select>
        <button type="submit" className="batman-btn" disabled={busy || !target.trim()}>
          {busy ? 'Working…' : 'Queue scan'}
        </button>
      </form>
      {status ? <p className="batman-status">{status}</p> : null}
      {requests.length === 0 ? (
        <p className="batman-hint">No scans yet. Queue a domain and the worker answers in a few minutes.</p>
      ) : null}
      <ul className="batman-enrich-list">
        {requests.map((row) => (
          <li key={row.id}>
            <strong>{row.target}</strong>
            <em>{row.targetType} · {STATUS_TEXT[row.status] || row.status}</em>
            {row.error ? <span className="batman-error">{row.error}</span> : null}
            {row.status === 'done' ? (
              <button type="button" className="batman-btn batman-btn-ghost" onClick={() => importResult(row.id)} disabled={busy}>
                Import {row.nodeCount ? `${row.nodeCount} items` : 'results'}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
