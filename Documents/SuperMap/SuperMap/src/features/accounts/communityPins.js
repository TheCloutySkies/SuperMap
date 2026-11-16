import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { getAccountsFirebase } from './firebaseClient'

const LOCAL_KEY = 'supermap.community.pins.v1'
export const ADMIN_EMAIL = 'lonnie034@gmail.com'
const KINDS = new Set(['x', 'news', 'image', 'shape', 'pin'])

function db() {
  return getAccountsFirebase()?.db || null
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocal(rows) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(rows))
  window.dispatchEvent(new CustomEvent('supermap:community-pins-local'))
}

export function isSiteAdmin(user) {
  return String(user?.email || '').toLowerCase() === ADMIN_EMAIL
}

export async function isUserBanned(userUid) {
  if (!userUid) return false
  const firestore = db()
  if (!firestore) return false
  try {
    const snap = await getDoc(doc(firestore, 'bans', userUid))
    return snap.exists() && snap.data()?.active !== false
  } catch {
    return false
  }
}

export function subscribeCommunityPins(cb) {
  const firestore = db()
  if (!firestore) {
    const run = () => cb(readLocal())
    run()
    window.addEventListener('supermap:community-pins-local', run)
    return () => window.removeEventListener('supermap:community-pins-local', run)
  }
  const q = query(collection(firestore, 'community_pins'), orderBy('createdAtMs', 'desc'), limit(400))
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((row) => withGeometry({ id: row.id, ...row.data() })))
  }, () => cb([]))
}

export async function createCommunityPin(input) {
  const ownerUid = input?.ownerUid
  if (!ownerUid) return { ok: false, error: 'Sign in to pin to the community map.' }
  if (await isUserBanned(ownerUid)) return { ok: false, error: 'This account is banned from pinning.' }
  const geometry = input?.geometry
  if (!geometry || !geometry.type) return { ok: false, error: 'That pin needs a place on the map.' }
  const kind = KINDS.has(input.kind) ? input.kind : 'pin'
  const pin = {
    id: input.id || uid(),
    ownerUid,
    ownerName: String(input.ownerName || 'Anonymous').slice(0, 80),
    ownerEmoji: input.ownerEmoji || '📍',
    title: String(input.title || input.label || 'Community pin').trim().slice(0, 180) || 'Community pin',
    summary: String(input.summary || '').slice(0, 500),
    kind,
    icon: input.icon || '📍',
    url: String(input.url || '').slice(0, 2000),
    image: String(input.image || '').slice(0, 2000),
    label: String(input.label || '').slice(0, 80),
    geometry,
    createdAtMs: Date.now(),
  }
  const firestore = db()
  if (!firestore) {
    writeLocal([pin, ...readLocal().filter((row) => row.id !== pin.id)])
    return { ok: true, id: pin.id }
  }
  const { geometry: shape, ...rest } = pin
  await setDoc(doc(firestore, 'community_pins', pin.id), {
    ...rest,
    geometryJson: JSON.stringify(shape).slice(0, 20000),
    createdAt: serverTimestamp(),
  })
  return { ok: true, id: pin.id }
}

function withGeometry(pin) {
  if (pin?.geometry?.type) return pin
  if (!pin?.geometryJson) return pin
  try {
    return { ...pin, geometry: JSON.parse(pin.geometryJson) }
  } catch {
    return pin
  }
}

export async function deleteCommunityPin(pinId) {
  if (!pinId) return { ok: false }
  const firestore = db()
  if (!firestore) {
    writeLocal(readLocal().filter((row) => row.id !== pinId))
    return { ok: true }
  }
  await deleteDoc(doc(firestore, 'community_pins', pinId))
  return { ok: true }
}

export async function banUser({ uid: targetUid, handle, reason, byEmail }) {
  if (!targetUid) return { ok: false, error: 'Pick an account to ban.' }
  const firestore = db()
  if (!firestore) return { ok: false, error: 'Bans need the live account database.' }
  await setDoc(doc(firestore, 'bans', targetUid), {
    uid: targetUid,
    handle: handle || '',
    reason: String(reason || '').slice(0, 240),
    active: true,
    byEmail: byEmail || ADMIN_EMAIL,
    createdAtMs: Date.now(),
    createdAt: serverTimestamp(),
  })
  return { ok: true }
}

export async function unbanUser(targetUid) {
  if (!targetUid) return { ok: false }
  const firestore = db()
  if (!firestore) return { ok: false, error: 'Bans need the live account database.' }
  await deleteDoc(doc(firestore, 'bans', targetUid))
  return { ok: true }
}

export function subscribeBans(cb) {
  const firestore = db()
  if (!firestore) return () => {}
  const q = query(collection(firestore, 'bans'), limit(100))
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })))
  }, () => cb([]))
}

async function deleteQuery(firestore, name, field, value) {
  const snap = await getDocs(query(collection(firestore, name), where(field, '==', value)))
  await Promise.all(snap.docs.map((row) => deleteDoc(row.ref)))
  return snap.size
}

export async function wipePublicContent(targetUid) {
  if (!targetUid) return { ok: false, error: 'Pick an account first.' }
  const firestore = db()
  if (!firestore) return { ok: false, error: 'Wiping public posts needs the live account database.' }
  const counts = await Promise.all([
    deleteQuery(firestore, 'community_pins', 'ownerUid', targetUid),
    deleteQuery(firestore, 'threads', 'authorUid', targetUid),
    deleteQuery(firestore, 'posts', 'authorUid', targetUid),
    deleteQuery(firestore, 'profile_posts', 'ownerUid', targetUid),
  ])
  return { ok: true, removed: counts.reduce((sum, n) => sum + n, 0) }
}

export async function deletePublicDoc(collectionName, id) {
  if (!id) return { ok: false }
  const firestore = db()
  if (!firestore) return { ok: false, error: 'This needs the live account database.' }
  await deleteDoc(doc(firestore, collectionName, id))
  return { ok: true }
}

export function subscribeRecentThreads(cb) {
  const firestore = db()
  if (!firestore) return () => {}
  const q = query(collection(firestore, 'threads'), orderBy('lastPostAtMs', 'desc'), limit(40))
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })))
  }, () => cb([]))
}

export function subscribeRecentPosts(cb) {
  const firestore = db()
  if (!firestore) return () => {}
  const q = query(collection(firestore, 'posts'), orderBy('createdAtMs', 'desc'), limit(40))
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })))
  }, () => cb([]))
}

export function subscribeRecentProfilePosts(cb) {
  const firestore = db()
  if (!firestore) return () => {}
  const q = query(collection(firestore, 'profile_posts'), orderBy('createdAtMs', 'desc'), limit(40))
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })))
  }, () => cb([]))
}
