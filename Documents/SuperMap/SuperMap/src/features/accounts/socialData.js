import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getAccountsFirebase } from './firebaseClient'
import { personHandle, personNumber } from './accountIdentity'
import { STARTER_BOARDS } from './menuCatalog'

const LOCAL_KEY = 'supermap.social.local.v1'
const listeners = new Set()

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function emptyStore() {
  return {
    boards: STARTER_BOARDS.map((board) => ({ ...board, threadCount: 0, createdAtMs: 0, createdBy: 'starter' })),
    threads: [],
    posts: [],
    profilePosts: [],
    conversations: [],
    messages: [],
    reports: [],
  }
}

function readStore() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw)
    const base = emptyStore()
    return {
      boards: Array.isArray(parsed.boards) && parsed.boards.length ? parsed.boards : base.boards,
      threads: Array.isArray(parsed.threads) ? parsed.threads : [],
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      profilePosts: Array.isArray(parsed.profilePosts) ? parsed.profilePosts : [],
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(next) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
  for (const listener of listeners) listener()
}

function subscribeLocal(select, cb) {
  const run = () => cb(select(readStore()))
  listeners.add(run)
  queueMicrotask(run)
  return () => listeners.delete(run)
}

function db() {
  return getAccountsFirebase()?.db || null
}

export function conversationId(a, b) {
  return [String(a), String(b)].sort().join('__')
}

/** Create or refresh a two-person thread in Firebase before the first message. */
export async function openDirectConversation({ from, to }) {
  if (!from?.uid || !to?.uid || from.uid === to.uid) return { ok: false, error: 'Pick someone else.' }
  const id = conversationId(from.uid, to.uid)
  const now = Date.now()
  const members = {
    [from.uid]: { displayName: from.displayName || 'Anonymous', emoji: from.emoji || '◈', handle: personHandle(from) },
    [to.uid]: { displayName: to.displayName || 'Anonymous', emoji: to.emoji || '◈', handle: personHandle(to) },
  }
  const memberUids = [from.uid, to.uid].sort()
  const firestore = db()
  if (!firestore) {
    const store = readStore()
    let convo = store.conversations.find((row) => row.id === id)
    if (!convo) {
      convo = { id, memberUids, members, unread: { [from.uid]: 0, [to.uid]: 0 }, lastBody: '' }
      store.conversations.push(convo)
    } else {
      convo.members = { ...(convo.members || {}), ...members }
      convo.memberUids = memberUids
    }
    convo.updatedAtMs = now
    writeStore(store)
    return { ok: true, id }
  }
  await setDoc(doc(firestore, 'conversations', id), {
    memberUids,
    members,
    updatedAtMs: now,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return { ok: true, id }
}

export async function ensureStarterBoards() {
  const firestore = db()
  if (!firestore) {
    const store = readStore()
    const ids = new Set(store.boards.map((board) => board.id))
    let changed = false
    for (const board of STARTER_BOARDS) {
      if (!ids.has(board.id)) {
        store.boards.push({ ...board, threadCount: 0, createdAtMs: 0, createdBy: 'starter' })
        changed = true
      }
    }
    if (changed) writeStore(store)
    return
  }
  for (const board of STARTER_BOARDS) {
    const ref = doc(firestore, 'boards', board.id)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      try {
        await setDoc(ref, {
          ...board,
          threadCount: 0,
          createdAtMs: Date.now(),
          createdBy: 'starter',
          createdAt: serverTimestamp(),
        })
      } catch { /* unsigned visitors cannot seed boards */ }
    }
  }
}

export function subscribeBoards(cb) {
  const firestore = db()
  if (!firestore) return subscribeLocal((store) => store.boards, cb)
  return onSnapshot(collection(firestore, 'boards'), (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })))
  }, () => cb([]))
}

export function subscribeThreads(boardId, cb) {
  const firestore = db()
  if (!firestore) {
    return subscribeLocal(
      (store) => store.threads
        .filter((thread) => thread.boardId === boardId)
        .sort((a, b) => (b.lastPostAtMs || 0) - (a.lastPostAtMs || 0)),
      cb,
    )
  }
  const q = query(
    collection(firestore, 'threads'),
    where('boardId', '==', boardId),
    orderBy('lastPostAtMs', 'desc'),
    limit(100),
  )
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })))
  }, () => cb([]))
}

export function subscribeLatestThreads(cb) {
  const firestore = db()
  if (!firestore) {
    return subscribeLocal(
      (store) => [...store.threads].sort((a, b) => (b.lastPostAtMs || 0) - (a.lastPostAtMs || 0)).slice(0, 5),
      cb,
    )
  }
  const q = query(collection(firestore, 'threads'), orderBy('lastPostAtMs', 'desc'), limit(5))
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })))
  }, () => cb([]))
}

export function subscribePosts(threadId, cb) {
  const firestore = db()
  if (!firestore) {
    return subscribeLocal(
      (store) => store.posts
        .filter((post) => post.threadId === threadId)
        .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0)),
      cb,
    )
  }
  const q = query(
    collection(firestore, 'posts'),
    where('threadId', '==', threadId),
    orderBy('createdAtMs', 'asc'),
    limit(200),
  )
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })))
  }, () => cb([]))
}

function touchBoardLocal(store, boardId, patch) {
  store.boards = store.boards.map((board) => (board.id === boardId ? { ...board, ...patch } : board))
}

export async function createBoard({ name, description, emoji, author }) {
  const board = {
    id: uid(),
    name: String(name || '').trim().slice(0, 80),
    description: String(description || '').trim().slice(0, 240),
    emoji: emoji || '▤',
    createdBy: author.uid,
    threadCount: 0,
    createdAtMs: Date.now(),
  }
  if (!board.name) return { ok: false, error: 'Name the group.' }
  const firestore = db()
  if (!firestore) {
    const store = readStore()
    store.boards = [...store.boards, board]
    writeStore(store)
    return { ok: true, id: board.id }
  }
  await setDoc(doc(firestore, 'boards', board.id), { ...board, createdAt: serverTimestamp() })
  return { ok: true, id: board.id }
}

export async function createThread({ boardId, title, body, author }) {
  const now = Date.now()
  const thread = {
    id: uid(),
    boardId,
    title: String(title || '').trim().slice(0, 180),
    body: String(body || '').trim().slice(0, 12000),
    authorUid: author.uid,
    authorName: author.displayName || 'Anonymous',
    authorEmoji: author.emoji || '◈',
    sticky: false,
    replyCount: 0,
    createdAtMs: now,
    lastPostAtMs: now,
    lastAuthorName: author.displayName || 'Anonymous',
    lastEmoji: author.emoji || '◈',
  }
  if (!thread.title || !thread.body) return { ok: false, error: 'A thread needs a subject and a first post.' }
  const post = {
    id: `${thread.id}-op`,
    threadId: thread.id,
    boardId,
    body: thread.body,
    authorUid: author.uid,
    authorName: thread.authorName,
    authorEmoji: thread.authorEmoji,
    createdAtMs: now,
    original: true,
  }
  const firestore = db()
  if (!firestore) {
    const store = readStore()
    store.threads = [thread, ...store.threads]
    store.posts = [...store.posts, post]
    const board = store.boards.find((item) => item.id === boardId)
    touchBoardLocal(store, boardId, {
      threadCount: (board?.threadCount || 0) + 1,
      lastPostAtMs: now,
      lastAuthorName: thread.authorName,
      lastEmoji: thread.authorEmoji,
      lastTitle: thread.title,
    })
    writeStore(store)
    return { ok: true, id: thread.id }
  }
  await setDoc(doc(firestore, 'threads', thread.id), { ...thread, createdAt: serverTimestamp() })
  await setDoc(doc(firestore, 'posts', post.id), { ...post, createdAt: serverTimestamp() })
  await updateDoc(doc(firestore, 'boards', boardId), {
    threadCount: increment(1),
    lastPostAtMs: now,
    lastAuthorName: thread.authorName,
    lastEmoji: thread.authorEmoji,
    lastTitle: thread.title,
  }).catch(() => {})
  return { ok: true, id: thread.id }
}

export async function addThreadPost({ thread, body, author }) {
  const text = String(body || '').trim().slice(0, 6000)
  if (!text) return { ok: false, error: 'Write a reply first.' }
  const now = Date.now()
  const post = {
    id: uid(),
    threadId: thread.id,
    boardId: thread.boardId,
    body: text,
    authorUid: author.uid,
    authorName: author.displayName || 'Anonymous',
    authorEmoji: author.emoji || '◈',
    createdAtMs: now,
    original: false,
  }
  const firestore = db()
  if (!firestore) {
    const store = readStore()
    store.posts = [...store.posts, post]
    store.threads = store.threads.map((item) => (
      item.id === thread.id
        ? { ...item, replyCount: (item.replyCount || 0) + 1, lastPostAtMs: now, lastAuthorName: post.authorName, lastEmoji: post.authorEmoji }
        : item
    ))
    touchBoardLocal(store, thread.boardId, {
      lastPostAtMs: now,
      lastAuthorName: post.authorName,
      lastEmoji: post.authorEmoji,
      lastTitle: thread.title,
    })
    writeStore(store)
    return { ok: true }
  }
  await setDoc(doc(firestore, 'posts', post.id), { ...post, createdAt: serverTimestamp() })
  await updateDoc(doc(firestore, 'threads', thread.id), {
    replyCount: increment(1),
    lastPostAtMs: now,
    lastAuthorName: post.authorName,
    lastEmoji: post.authorEmoji,
  })
  await updateDoc(doc(firestore, 'boards', thread.boardId), {
    lastPostAtMs: now,
    lastAuthorName: post.authorName,
    lastEmoji: post.authorEmoji,
    lastTitle: thread.title,
  }).catch(() => {})
  return { ok: true }
}

export async function setThreadSticky(thread, sticky) {
  const firestore = db()
  if (!firestore) {
    const store = readStore()
    store.threads = store.threads.map((item) => (item.id === thread.id ? { ...item, sticky } : item))
    writeStore(store)
    return
  }
  await updateDoc(doc(firestore, 'threads', thread.id), { sticky: Boolean(sticky) })
}

export function subscribeProfilePosts(ownerUid, cb) {
  if (!ownerUid) return () => {}
  const firestore = db()
  if (!firestore) {
    return subscribeLocal(
      (store) => store.profilePosts
        .filter((post) => post.ownerUid === ownerUid)
        .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)),
      cb,
    )
  }
  const q = query(
    collection(firestore, 'profile_posts'),
    where('ownerUid', '==', ownerUid),
    orderBy('createdAtMs', 'desc'),
    limit(50),
  )
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })))
  }, () => cb([]))
}

export async function createProfilePost(author, item) {
  const post = {
    id: uid(),
    ownerUid: author.uid,
    authorName: author.displayName || 'Anonymous',
    authorEmoji: author.emoji || '◈',
    type: item.type || 'article',
    title: String(item.title || 'Untitled').trim().slice(0, 180),
    summary: String(item.summary || '').trim().slice(0, 600),
    sourceUrl: item.url || null,
    lat: Number.isFinite(Number(item.lat)) ? Number(item.lat) : null,
    lon: Number.isFinite(Number(item.lon)) ? Number(item.lon) : null,
    createdAtMs: Date.now(),
  }
  const firestore = db()
  if (!firestore) {
    const store = readStore()
    store.profilePosts = [post, ...store.profilePosts]
    writeStore(store)
    return { ok: true, id: post.id }
  }
  await setDoc(doc(firestore, 'profile_posts', post.id), { ...post, createdAt: serverTimestamp() })
  return { ok: true, id: post.id }
}

export async function searchDiscoverableUsers(text) {
  const needle = String(text || '').trim().toLowerCase()
  const firestore = db()
  if (!firestore) return []
  const q = query(collection(firestore, 'users'), where('discoverable', '==', true), limit(60))
  const snap = await getDocs(q)
  return snap.docs
    .map((row) => ({ uid: row.id, ...row.data() }))
    .filter((user) => {
      if (!needle) return true
      const handle = personHandle(user).toLowerCase()
      const number = personNumber(user)
      const hay = `${user.displayName || ''} ${handle} ${number}`.toLowerCase()
      const q = needle.replace(/^@/, '').replace(/^#/, '')
      return hay.includes(needle) || hay.includes(q)
    })
    .slice(0, 12)
}

export function subscribeConversations(userUid, cb) {
  if (!userUid) return () => {}
  const firestore = db()
  if (!firestore) {
    return subscribeLocal(
      (store) => store.conversations
        .filter((row) => Array.isArray(row.memberUids) && row.memberUids.includes(userUid))
        .sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0)),
      cb,
    )
  }
  const q = query(
    collection(firestore, 'conversations'),
    where('memberUids', 'array-contains', userUid),
    orderBy('updatedAtMs', 'desc'),
    limit(40),
  )
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })))
  }, () => cb([]))
}

export function subscribeMessages(conversationIdValue, cb) {
  if (!conversationIdValue) return () => {}
  const firestore = db()
  if (!firestore) {
    return subscribeLocal(
      (store) => store.messages
        .filter((row) => row.conversationId === conversationIdValue)
        .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0)),
      cb,
    )
  }
  const q = query(
    collection(firestore, 'conversations', conversationIdValue, 'messages'),
    orderBy('createdAtMs', 'asc'),
    limit(200),
  )
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })))
  }, () => cb([]))
}

export async function sendDirectMessage({ from, to, body, item }) {
  if (!to?.uid || to.uid === from.uid) return { ok: false, error: 'Pick someone else.' }
  const text = String(body || '').trim().slice(0, 4000)
  const card = item?.title ? {
    title: String(item.title).slice(0, 180),
    summary: String(item.summary || '').slice(0, 300),
    url: item.url || null,
    type: item.type || 'article',
  } : null
  if (!text && !card) return { ok: false, error: 'Write a message.' }
  const id = conversationId(from.uid, to.uid)
  const now = Date.now()
  const message = {
    id: uid(),
    conversationId: id,
    fromUid: from.uid,
    body: text || (card ? `Sent “${card.title}”` : ''),
    item: card,
    createdAtMs: now,
  }
  const firestore = db()
  if (!firestore) {
    const store = readStore()
    let convo = store.conversations.find((row) => row.id === id)
    if (!convo) {
      convo = {
        id,
        memberUids: [from.uid, to.uid].sort(),
        members: {
          [from.uid]: { displayName: from.displayName, emoji: from.emoji || '◈', handle: personHandle(from) },
          [to.uid]: { displayName: to.displayName, emoji: to.emoji || '◈', handle: personHandle(to) },
        },
        unread: { [from.uid]: 0, [to.uid]: 0 },
      }
      store.conversations.push(convo)
    }
    convo.updatedAtMs = now
    convo.lastBody = message.body.slice(0, 140)
    convo.unread = { ...(convo.unread || {}), [to.uid]: (convo.unread?.[to.uid] || 0) + 1 }
    store.messages = [...store.messages, message]
    writeStore(store)
    return { ok: true, id }
  }
  const convoRef = doc(firestore, 'conversations', id)
  await setDoc(convoRef, {
    memberUids: [from.uid, to.uid].sort(),
    members: {
      [from.uid]: { displayName: from.displayName || 'Anonymous', emoji: from.emoji || '◈', handle: personHandle(from) },
      [to.uid]: { displayName: to.displayName || 'Anonymous', emoji: to.emoji || '◈', handle: personHandle(to) },
    },
    updatedAtMs: now,
    lastBody: message.body.slice(0, 140),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  await updateDoc(convoRef, { [`unread.${to.uid}`]: increment(1) })
  await setDoc(doc(firestore, 'conversations', id, 'messages', message.id), {
    ...message,
    createdAt: serverTimestamp(),
  })
  return { ok: true, id }
}

export async function markConversationRead(conversationIdValue, userUid) {
  const firestore = db()
  if (!firestore) {
    const store = readStore()
    store.conversations = store.conversations.map((row) => (
      row.id === conversationIdValue
        ? { ...row, unread: { ...(row.unread || {}), [userUid]: 0 } }
        : row
    ))
    writeStore(store)
    return
  }
  await updateDoc(doc(firestore, 'conversations', conversationIdValue), {
    [`unread.${userUid}`]: 0,
  }).catch(() => {})
}

export async function fileReport({ reporter, reason, note, item }) {
  const report = {
    id: uid(),
    reporterUid: reporter.uid,
    reporterName: reporter.displayName || 'Anonymous',
    reason,
    note: String(note || '').trim().slice(0, 2000),
    target: {
      type: item?.type || 'site',
      title: String(item?.title || 'Site').slice(0, 180),
      url: item?.url || null,
      summary: String(item?.summary || '').slice(0, 300),
    },
    createdAtMs: Date.now(),
  }
  if (!['broken', 'misleading', 'false'].includes(report.reason)) return { ok: false, error: 'Pick a reason.' }
  const firestore = db()
  if (!firestore) {
    const store = readStore()
    store.reports = [report, ...store.reports]
    writeStore(store)
    return { ok: true }
  }
  await setDoc(doc(firestore, 'reports', report.id), { ...report, createdAt: serverTimestamp() })
  return { ok: true }
}

export function subscribeReports(cb) {
  const firestore = db()
  if (!firestore) return subscribeLocal((store) => store.reports, cb)
  const q = query(collection(firestore, 'reports'), orderBy('createdAtMs', 'desc'), limit(100))
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })))
  }, () => cb([]))
}

export async function deleteOwnedContent(ownerUid) {
  const firestore = db()
  if (!firestore) {
    const store = readStore()
    store.profilePosts = store.profilePosts.filter((post) => post.ownerUid !== ownerUid)
    writeStore(store)
    return
  }
  const posts = await getDocs(query(collection(firestore, 'profile_posts'), where('ownerUid', '==', ownerUid)))
  await Promise.all(posts.docs.map((row) => deleteDoc(row.ref)))
  const saved = await getDocs(query(collection(firestore, 'saved_items'), where('ownerUid', '==', ownerUid)))
  await Promise.all(saved.docs.map((row) => deleteDoc(row.ref)))
  await deleteDoc(doc(firestore, 'users', ownerUid)).catch(() => {})
}

export const REPORT_CLIPS_KEY = 'supermap_report_clips'

export function queueReportClip(item) {
  let clips = []
  try { clips = JSON.parse(localStorage.getItem(REPORT_CLIPS_KEY) || '[]') } catch { clips = [] }
  if (!Array.isArray(clips)) clips = []
  clips.push({
    title: item.title || 'Untitled',
    summary: item.summary || '',
    url: item.url || '',
    lat: item.lat ?? null,
    lon: item.lon ?? null,
    type: item.type || 'article',
    at: Date.now(),
  })
  localStorage.setItem(REPORT_CLIPS_KEY, JSON.stringify(clips))
}
