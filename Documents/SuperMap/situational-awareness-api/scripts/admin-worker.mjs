#!/usr/bin/env node
/**
 * Run the admin actions a browser is not allowed to run.
 *
 * On the free plan there are no Cloud Functions, so the panel writes a request
 * and this worker executes it with the Admin SDK: delete a sign-in, disable one,
 * or grant the admin claim. Every action is marked done and audited.
 */
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const raw = process.env.FIREBASE_SERVICE_ACCOUNT
const projectId = process.env.FIREBASE_PROJECT_ID || 'good-palantir'
if (!raw) {
  console.error('[admin] FIREBASE_SERVICE_ACCOUNT is missing')
  process.exit(1)
}

const app = initializeApp({ credential: cert(JSON.parse(raw)), projectId })
const db = getFirestore(app)
const auth = getAuth(app)

const ACTIONS = new Set(['deleteUser', 'disableUser', 'setAdmin'])

async function audit(entry) {
  await db.collection('audit').add({ ...entry, at: FieldValue.serverTimestamp(), atMs: Date.now() })
}

async function run(action) {
  const data = action.data() || {}
  const targetUid = data.targetUid
  if (!targetUid) throw new Error('no targetUid')
  if (data.type === 'deleteUser') {
    await auth.deleteUser(targetUid).catch((err) => {
      if (err.code !== 'auth/user-not-found') throw err
    })
    await db.doc(`users/${targetUid}`).delete().catch(() => {})
    await db.doc(`bans/${targetUid}`).delete().catch(() => {})
    return 'deleted'
  }
  if (data.type === 'disableUser') {
    await auth.updateUser(targetUid, { disabled: data.disabled !== false })
    return data.disabled === false ? 'enabled' : 'disabled'
  }
  if (data.type === 'setAdmin') {
    await auth.setCustomUserClaims(targetUid, { admin: data.enabled !== false })
    return data.enabled === false ? 'admin removed' : 'admin granted'
  }
  throw new Error(`unknown action ${data.type}`)
}

try {
  const snap = await db.collection('admin_actions')
    .where('status', '==', 'pending')
    .limit(5)
    .get()
  const results = []
  for (const action of snap.docs) {
    const data = action.data() || {}
    if (!ACTIONS.has(data.type)) {
      await action.ref.set({ status: 'error', error: `unknown type ${data.type}` }, { merge: true })
      continue
    }
    try {
      const outcome = await run(action)
      await action.ref.set({ status: 'done', doneAtMs: Date.now(), outcome }, { merge: true })
      await audit({ actionId: action.id, type: data.type, targetUid: data.targetUid, byUid: data.byUid || null, outcome })
      results.push({ id: action.id, type: data.type, outcome })
    } catch (err) {
      await action.ref.set({ status: 'error', error: String(err.message || err).slice(0, 300) }, { merge: true })
      results.push({ id: action.id, type: data.type, error: true })
    }
  }
  console.log(JSON.stringify({ pending: snap.size, results }))
  process.exit(0)
} catch (err) {
  console.error('[admin] failed:', err.message)
  process.exit(1)
}
