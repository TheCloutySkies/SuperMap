#!/usr/bin/env node
/**
 * Delete what has expired, every five minutes.
 *
 * Disappearing photos and secure drops are removed by the client that is open,
 * but nothing is open at 4am: this worker is the guarantee. It uses the Admin
 * SDK, so Firestore rules never have to allow a stranger to delete anything.
 */
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const raw = process.env.FIREBASE_SERVICE_ACCOUNT
const projectId = process.env.FIREBASE_PROJECT_ID || 'good-palantir'
if (!raw) {
  console.error('[sweeper] FIREBASE_SERVICE_ACCOUNT is missing')
  process.exit(1)
}

const app = initializeApp({ credential: cert(JSON.parse(raw)), projectId })
const db = getFirestore(app)
const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`
const bucket = getStorage(app).bucket(bucketName)
const now = Date.now()
let deletedDocs = 0
let deletedFiles = 0

async function removeFile(path) {
  if (!path) return
  try {
    await bucket.file(path).delete({ ignoreNotFound: true })
    deletedFiles += 1
  } catch (err) {
    console.warn('[sweeper] file', path, err.message)
  }
}

async function sweepMessages() {
  const snap = await db.collectionGroup('messages')
    .where('expiresAtMs', '<=', now)
    .limit(300)
    .get()
  for (const row of snap.docs) {
    const data = row.data() || {}
    if (data.media?.path) await removeFile(data.media.path)
    await row.ref.delete().catch((err) => console.warn('[sweeper] message', err.message))
    deletedDocs += 1
  }
  return snap.size
}

async function sweepChatMedia() {
  // A photo whose document is already gone still has its object: compare the
  // bucket against the live message paths and delete what nothing points at.
  const [files] = await bucket.getFiles({ prefix: 'chat_media/', maxResults: 500 })
  if (!files.length) return 0
  const live = await db.collectionGroup('messages').limit(500).get()
  const keep = new Set()
  for (const row of live.docs) {
    const path = row.data()?.media?.path
    if (path) keep.add(path)
  }
  let removed = 0
  for (const file of files) {
    if (keep.has(file.name)) continue
    const [, conversationId, messageId] = file.name.split('/')
    if (!conversationId || !messageId) continue
    const snap = await db.doc(`conversations/${conversationId}/messages/${messageId}`).get()
    if (snap.exists) continue
    await removeFile(file.name)
    removed += 1
  }
  return removed
}

async function sweepDrops() {
  const snap = await db.collection('secure_drops').where('expiresAtMs', '<=', now).limit(200).get()
  for (const row of snap.docs) {
    await removeFile(`secure_drops/${row.id}`)
    await row.ref.delete().catch((err) => console.warn('[sweeper] drop', err.message))
    deletedDocs += 1
  }
  return snap.size
}

try {
  const [messages, media, drops] = await Promise.all([sweepMessages(), sweepChatMedia(), sweepDrops()])
  console.log(JSON.stringify({ at: new Date(now).toISOString(), messages, media, drops, deletedDocs, deletedFiles }))
  process.exit(0)
} catch (err) {
  console.error('[sweeper] failed:', err.message)
  process.exit(1)
}
