#!/usr/bin/env node
/**
 * Passive enrichment, in Actions, never on Render.
 *
 * The panel drops a target into `scan_requests`; this worker runs SpiderFoot's
 * passive modules only (no port scan, no brute force), maps what it found into
 * nodes, and writes it to `enrichment/{id}` — which the rules keep private to
 * the owner. Targets and results are never written to the repository.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const PASSIVE_MODULES = [
  'dnsresolve', 'dnsbrute', 'whois', 'sfp_crt', 'sfp_wayback', 'sfp_github',
  'sfp_email', 'sfp_pgp', 'sfp_abusech', 'sfp_spur', 'sfp_ipinfo', 'sfp_threatminer',
].join(',')

const raw = process.env.FIREBASE_SERVICE_ACCOUNT
const projectId = process.env.FIREBASE_PROJECT_ID || 'good-palantir'
if (!raw) {
  console.error('[spiderfoot] FIREBASE_SERVICE_ACCOUNT is missing')
  process.exit(1)
}

const app = initializeApp({ credential: cert(JSON.parse(raw)), projectId })
const db = getFirestore(app)
const sf = path.resolve(process.env.SPIDERFOOT_DIR || '../spiderfoot/sf.py')

function runSpiderFoot(target, targetType) {
  return new Promise((resolve, reject) => {
    if (!existsSync(sf)) {
      reject(new Error('SpiderFoot is not installed on this runner'))
      return
    }
    const args = ['-s', target, '-t', targetType, '-m', PASSIVE_MODULES, '-o', 'json', '-q', '-n', 'github.com']
    const child = spawn('python3', [sf, ...args], { cwd: path.dirname(sf) })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('the scan passed 20 minutes'))
    }, 20 * 60 * 1000)
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(err.slice(-300) || `SpiderFoot exited ${code}`))
        return
      }
      resolve(out)
    })
  })
}

function nodesFrom(output, target) {
  const nodes = []
  const seen = new Set()
  for (const line of String(output || '').split('\n')) {
    const text = line.trim()
    if (!text.startsWith('{')) continue
    let row
    try {
      row = JSON.parse(text)
    } catch {
      continue
    }
    const data = row.data || row.raw || ''
    if (!data || data === target) continue
    const key = `${row.type}:${data}`
    if (seen.has(key)) continue
    seen.add(key)
    nodes.push({
      id: `sf-${nodes.length}`,
      kind: /@/.test(data) ? 'person' : /\./.test(data) ? 'org' : 'link',
      title: String(data).slice(0, 180),
      data: { module: row.module || '', event: row.type || '' },
      confidence: 0.5,
      source: 'SpiderFoot',
    })
    if (nodes.length >= 120) break
  }
  return nodes
}

try {
  const snap = await db.collection('scan_requests').where('status', '==', 'pending').limit(3).get()
  const results = []
  for (const request of snap.docs) {
    const data = request.data() || {}
    await request.ref.set({ status: 'running', startedAtMs: Date.now() }, { merge: true })
    try {
      const output = await runSpiderFoot(String(data.target || ''), String(data.targetType || 'domain'))
      const nodes = nodesFrom(output, data.target)
      await db.doc(`enrichment/${request.id}`).set({
        ownerUid: data.ownerUid,
        target: data.target,
        nodes,
        edges: [],
        status: 'done',
        at: FieldValue.serverTimestamp(),
        atMs: Date.now(),
      })
      await request.ref.set({ status: 'done', nodeCount: nodes.length, doneAtMs: Date.now() }, { merge: true })
      results.push({ id: request.id, nodes: nodes.length })
    } catch (err) {
      await request.ref.set({ status: 'error', error: String(err.message || err).slice(0, 300) }, { merge: true })
      results.push({ id: request.id, error: true })
    }
  }
  console.log(JSON.stringify({ pending: snap.size, results }))
  process.exit(0)
} catch (err) {
  console.error('[spiderfoot] failed:', err.message)
  process.exit(1)
}
