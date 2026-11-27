/**
 * Batman case storage: Firestore when the account database is live, a local
 * mirror always, and no case ever lost to a failed write.
 *
 * A case is one document, so a save is one `setDoc`. The local copy is written
 * first and read first, which is what makes the board open instantly and keeps
 * working with no Firebase configured at all.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { getAccountsFirebase } from '../accounts/firebaseClient'
import { CASE_LIMITS, caseGuard, emptyCase } from './caseModel'

const LOCAL_KEY = 'supermap.batman.cases.v1'
const LOCAL_OWNER = 'local'
const SAVE_DELAY_MS = 800
const pendingSaves = new Map()

function db() {
  const firebase = getAccountsFirebase()
  return firebase?.db || null
}

function readLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocal(cases) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(cases.slice(0, 60)))
  } catch { /* private mode */ }
}

function upsertLocal(caseDoc) {
  const cases = readLocal().filter((row) => row.id !== caseDoc.id)
  writeLocal([caseDoc, ...cases])
}

export function localCases(ownerUid) {
  return readLocal()
    .filter((row) => !ownerUid || row.ownerUid === ownerUid || row.ownerUid === LOCAL_OWNER)
    .sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0))
}

/** The cached copy of a case, if this browser has opened it before. */
export function cachedCase(caseId) {
  return readLocal().find((row) => row.id === caseId) || null
}

/**
 * The list of cases: local first, then live Firestore rows merged in. A case
 * that only exists locally (a failed create, or no Firebase) still appears.
 */
export function subscribeCases(ownerUid, cb) {
  const local = localCases(ownerUid)
  cb(local)
  const firestore = db()
  if (!firestore || !ownerUid) return () => {}
  const q = query(
    collection(firestore, 'cases'),
    where('memberUids', 'array-contains', ownerUid),
    orderBy('updatedAtMs', 'desc'),
    limit(60),
  )
  return onSnapshot(q, (snap) => {
    const remote = snap.docs.map((row) => ({ id: row.id, ...row.data() }))
    const seen = new Set(remote.map((row) => row.id))
    const onlyLocal = readLocal().filter((row) => !seen.has(row.id))
    writeLocal([...remote, ...onlyLocal])
    cb([...remote, ...onlyLocal])
  }, () => cb(local))
}

export async function fetchCase(caseId) {
  if (!caseId) return null
  const cached = cachedCase(caseId)
  const firestore = db()
  if (!firestore) return cached
  try {
    const snap = await getDoc(doc(firestore, 'cases', caseId))
    if (!snap.exists()) return cached
    const remote = { id: snap.id, ...snap.data() }
    // The newer copy wins; a failed push must not erase local edits.
    const chosen = cached && (cached.updatedAtMs || 0) > (remote.updatedAtMs || 0) ? cached : remote
    upsertLocal(chosen)
    return chosen
  } catch {
    return cached
  }
}

export async function createCase({ ownerUid, title, description = '' }) {
  const caseDoc = emptyCase({ ownerUid: ownerUid || LOCAL_OWNER, title, description })
  const result = await persistCase(caseDoc)
  return result.ok ? { ok: true, caseDoc } : result
}

/** Write local first, then Firestore. Returns `{ ok, error? }`, never throws. */
export async function persistCase(caseDoc) {
  if (!caseDoc?.id) return { ok: false, error: 'No case to save.' }
  const guard = caseGuard(caseDoc)
  if (!guard.ok) return guard
  const next = { ...caseDoc, updatedAtMs: Date.now() }
  upsertLocal(next)
  const firestore = db()
  const ownerUid = String(next.ownerUid || '')
  if (!firestore || !ownerUid || ownerUid === LOCAL_OWNER) return { ok: true, savedLocally: true }
  try {
    const { id, ...body } = next
    await setDoc(doc(firestore, 'cases', id), body, { merge: true })
    return { ok: true, bytes: guard.bytes, limit: CASE_LIMITS.warnBytes }
  } catch (error) {
    return { ok: false, error: error.message || 'Could not save to the account database; kept the local copy.' }
  }
}

/** Debounced save for canvas drags and typing, one timer per case. */
export function scheduleSave(caseDoc) {
  if (!caseDoc?.id) return () => {}
  const existing = pendingSaves.get(caseDoc.id)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    pendingSaves.delete(caseDoc.id)
    persistCase(caseDoc)
  }, SAVE_DELAY_MS)
  pendingSaves.set(caseDoc.id, timer)
  return () => {
    clearTimeout(timer)
    pendingSaves.delete(caseDoc.id)
  }
}

export async function removeCase(caseDoc) {
  if (!caseDoc?.id) return { ok: false }
  writeLocal(readLocal().filter((row) => row.id !== caseDoc.id))
  const firestore = db()
  if (!firestore || !caseDoc.ownerUid || caseDoc.ownerUid === LOCAL_OWNER) return { ok: true }
  try {
    await deleteDoc(doc(firestore, 'cases', caseDoc.id))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || 'Could not delete the shared copy.' }
  }
}

/** Private by default; a share link is the read-only capability. */
export async function setVisibility(caseDoc, visible) {
  const token = visible
    ? (caseDoc.shareToken || (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Date.now())))
    : null
  const next = { ...caseDoc, visibility: visible ? 'link' : 'private', shareToken: token, updatedAtMs: Date.now() }
  const result = await persistCase(next)
  return result.ok ? { ok: true, caseDoc: next } : result
}

/**
 * Fire the event that opens the case picker, from any surface. It lives here,
 * not in the picker, so a component file exports components only.
 */
export function requestAddToCase(item) {
  if (!item) return
  window.dispatchEvent(new CustomEvent('supermap:add-to-case', { detail: { item } }))
}

export function shareUrl(caseDocId) {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/batman/shared/${caseDocId}`
}
