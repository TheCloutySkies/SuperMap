import { useEffect, useMemo, useState } from 'react'
import { useSuperMapAccount } from '../accounts/SuperMapAccounts'
import {
  addThreadPost,
  createBoard,
  createThread,
  ensureStarterBoards,
  setThreadSticky,
  subscribeBoards,
  subscribeLatestThreads,
  subscribePosts,
  subscribeThreads,
} from '../accounts/socialData'
import './BulletinBoard.css'

function when(ms) {
  if (!ms) return '—'
  const date = new Date(ms)
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function LatestBulletin({ onOpen }) {
  const [threads, setThreads] = useState([])
  useEffect(() => {
    ensureStarterBoards().catch(() => {})
    return subscribeLatestThreads(setThreads)
  }, [])
  return (
    <section className="bb-home" aria-label="The Bulletin Board">
      <header className="bb-home-head">
        <h2>The Bulletin Board</h2>
        <button type="button" onClick={onOpen}>Open the board</button>
      </header>
      {threads.length === 0 ? (
        <p className="bb-home-empty">No threads yet. Open the board and start one.</p>
      ) : (
        <ul>
          {threads.map((thread) => (
            <li key={thread.id}>
              <button type="button" onClick={onOpen}>
                <span className="bb-home-emoji" aria-hidden>{thread.lastEmoji || thread.authorEmoji || '▤'}</span>
                <span className="bb-home-title">{thread.title}</span>
                <span className="bb-home-meta">{thread.lastAuthorName || thread.authorName} · {when(thread.lastPostAtMs)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function BulletinBoardView() {
  const { user, setOverlay } = useSuperMapAccount()
  const [boards, setBoards] = useState([])
  const [boardId, setBoardId] = useState(null)
  const [threadId, setThreadId] = useState(null)
  const [threads, setThreads] = useState([])
  const [posts, setPosts] = useState([])
  const [groupName, setGroupName] = useState('')
  const [groupAbout, setGroupAbout] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    ensureStarterBoards().catch(() => {})
    return subscribeBoards(setBoards)
  }, [])

  useEffect(() => {
    if (!boardId) return undefined
    return subscribeThreads(boardId, setThreads)
  }, [boardId])

  const board = boards.find((item) => item.id === boardId) || null
  const thread = threads.find((item) => item.id === threadId) || null

  useEffect(() => {
    if (!threadId) return undefined
    return subscribePosts(threadId, setPosts)
  }, [threadId])

  const orderedThreads = useMemo(() => {
    return [...threads].sort((a, b) => {
      if (Boolean(a.sticky) !== Boolean(b.sticky)) return a.sticky ? -1 : 1
      return (b.lastPostAtMs || 0) - (a.lastPostAtMs || 0)
    })
  }, [threads])

  function requireUser() {
    if (user) return true
    setOverlay('auth')
    return false
  }

  async function onCreateGroup(event) {
    event.preventDefault()
    if (!requireUser()) return
    setError('')
    const result = await createBoard({ name: groupName, description: groupAbout, emoji: '▤', author: user })
    if (!result.ok) setError(result.error || 'Could not create the group.')
    else { setGroupName(''); setGroupAbout('') }
  }

  async function onCreateThread(event) {
    event.preventDefault()
    if (!requireUser()) return
    setError('')
    const result = await createThread({ boardId, title: subject, body, author: user })
    if (!result.ok) setError(result.error || 'Could not post.')
    else { setSubject(''); setBody(''); setThreadId(result.id) }
  }

  async function onReply(event) {
    event.preventDefault()
    if (!requireUser() || !thread) return
    setError('')
    const result = await addThreadPost({ thread, body: reply, author: user })
    if (!result.ok) setError(result.error || 'Could not reply.')
    else setReply('')
  }

  return (
    <div className="bb">
      <header className="bb-mast">
        <p className="bb-kicker">Good Palantir</p>
        <h1>The Bulletin Board</h1>
        <p className="bb-lede">Groups, threads, and replies. New posts show up on their own.</p>
      </header>

      {error ? <p className="bb-error">{error}</p> : null}

      {!boardId ? (
        <section>
          <table className="bb-index">
            <thead>
              <tr>
                <th>Group</th>
                <th>Threads</th>
                <th>Last post</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button type="button" className="bb-group" onClick={() => { setBoardId(item.id); setThreadId(null) }}>
                      <span className="bb-emoji" aria-hidden>{item.emoji || '▤'}</span>
                      <span>
                        <strong>{item.name}</strong>
                        <em>{item.description}</em>
                      </span>
                    </button>
                  </td>
                  <td className="bb-num">{item.threadCount || 0}</td>
                  <td className="bb-last">
                    {item.lastTitle ? (
                      <>
                        <span>{item.lastEmoji || '◈'} {item.lastAuthorName}</span>
                        <em>{item.lastTitle}</em>
                        <time>{when(item.lastPostAtMs)}</time>
                      </>
                    ) : <em>No posts yet</em>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form className="bb-compose" onSubmit={onCreateGroup}>
            <h2>New group</h2>
            <label>Name<input value={groupName} onChange={(event) => setGroupName(event.target.value)} required maxLength={80} /></label>
            <label>Description<input value={groupAbout} onChange={(event) => setGroupAbout(event.target.value)} maxLength={240} /></label>
            <button type="submit">Create group</button>
          </form>
        </section>
      ) : null}

      {board && !threadId ? (
        <section>
          <button type="button" className="bb-back" onClick={() => setBoardId(null)}>All groups</button>
          <h2 className="bb-section-title"><span aria-hidden>{board.emoji || '▤'}</span> {board.name}</h2>
          <p className="bb-section-about">{board.description}</p>
          <table className="bb-index">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Author</th>
                <th>Replies</th>
                <th>Last post</th>
              </tr>
            </thead>
            <tbody>
              {orderedThreads.map((item) => (
                <tr key={item.id} className={item.sticky ? 'is-sticky' : ''}>
                  <td>
                    <button type="button" className="bb-subject" onClick={() => setThreadId(item.id)}>
                      {item.sticky ? <span className="bb-pin">Pinned</span> : null}
                      {item.title}
                    </button>
                  </td>
                  <td>{item.authorEmoji || '◈'} {item.authorName}</td>
                  <td className="bb-num">{item.replyCount || 0}</td>
                  <td className="bb-last">
                    <span>{item.lastEmoji || item.authorEmoji || '◈'} {item.lastAuthorName || item.authorName}</span>
                    <time>{when(item.lastPostAtMs)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orderedThreads.length === 0 ? <p className="bb-section-about">This group has no threads yet.</p> : null}
          <form className="bb-compose" onSubmit={onCreateThread}>
            <h2>New thread</h2>
            <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={180} /></label>
            <label>First post<textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} required /></label>
            <button type="submit">Post thread</button>
          </form>
        </section>
      ) : null}

      {thread ? (
        <section>
          <button type="button" className="bb-back" onClick={() => setThreadId(null)}>{board?.name || 'Group'}</button>
          <header className="bb-thread-head">
            <h2>{thread.title}</h2>
            {user?.uid === thread.authorUid ? (
              <button type="button" className="bb-back" onClick={() => setThreadSticky(thread, !thread.sticky)}>
                {thread.sticky ? 'Unpin' : 'Pin thread'}
              </button>
            ) : null}
          </header>
          <ol className="bb-posts">
            {posts.map((post) => (
              <li key={post.id} className={post.original ? 'is-original' : ''}>
                <div className="bb-author">
                  <span className="bb-emoji" aria-hidden>{post.authorEmoji || '◈'}</span>
                  <strong>{post.authorName}</strong>
                  <time>{when(post.createdAtMs)}</time>
                </div>
                <div className="bb-post-body">{post.body}</div>
              </li>
            ))}
          </ol>
          <form className="bb-compose" onSubmit={onReply}>
            <h2>Reply</h2>
            <label>Message<textarea rows={4} value={reply} onChange={(event) => setReply(event.target.value)} required /></label>
            <button type="submit">Post reply</button>
          </form>
        </section>
      ) : null}
    </div>
  )
}
