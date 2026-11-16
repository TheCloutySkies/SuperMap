import { useEffect, useState } from 'react'
import { searchDiscoverableUsers } from './socialData'
import {
  banUser,
  deletePublicDoc,
  subscribeBans,
  subscribeCommunityPins,
  subscribeRecentPosts,
  subscribeRecentProfilePosts,
  subscribeRecentThreads,
  unbanUser,
  wipePublicContent,
} from './communityPins'
import { useSuperMapAccount } from './SuperMapAccounts'

function Row({ title, meta, onDelete }) {
  return (
    <article className="sm-card">
      <h3>{title}</h3>
      <p className="sm-card-summary">{meta}</p>
      <button type="button" className="sm-ghost-btn" onClick={onDelete}>Delete</button>
    </article>
  )
}

export default function ModerationPanel() {
  const { user, showToast } = useSuperMapAccount()
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState([])
  const [reason, setReason] = useState('')
  const [bans, setBans] = useState([])
  const [pins, setPins] = useState([])
  const [threads, setThreads] = useState([])
  const [posts, setPosts] = useState([])
  const [profiles, setProfiles] = useState([])

  useEffect(() => subscribeBans(setBans), [])
  useEffect(() => subscribeCommunityPins(setPins), [])
  useEffect(() => subscribeRecentThreads(setThreads), [])
  useEffect(() => subscribeRecentPosts(setPosts), [])
  useEffect(() => subscribeRecentProfilePosts(setProfiles), [])

  async function run(action, okMessage) {
    try {
      const result = await action()
      if (result?.ok === false) showToast({ tone: 'danger', message: result.error || 'That action failed.' })
      else showToast({ tone: 'success', message: okMessage })
    } catch (error) {
      showToast({ tone: 'danger', message: error.message || 'That action failed.' })
    }
  }

  return (
    <section className="sm-vault">
      <h3>Moderation</h3>
      <p className="sm-local-note">Delete public posts and pins, or ban an account from posting and pinning. This does not delete their sign-in. That stays in the Firebase console.</p>
      <form className="sm-auth-form" onSubmit={async (event) => {
        event.preventDefault()
        setPeople(await searchDiscoverableUsers(query))
      }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a handle" aria-label="Search a handle" />
        <button type="submit">Find</button>
      </form>
      <label className="sm-check">
        <span>Ban note</span>
        <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this ban" />
      </label>
      {people.map((person) => (
        <article key={person.uid} className="sm-card">
          <h3>{person.displayName || person.handle}</h3>
          <p className="sm-card-summary">{person.handle}</p>
          <button type="button" className="sm-ghost-btn" onClick={() => run(() => banUser({ uid: person.uid, handle: person.handle, reason, byEmail: user?.email }), 'Account banned.')}>Ban</button>
          <button type="button" className="sm-ghost-btn" onClick={() => run(() => unbanUser(person.uid), 'Ban removed.')}>Unban</button>
          <button type="button" className="sm-ghost-btn" onClick={() => run(() => wipePublicContent(person.uid), 'Public posts removed.')}>Wipe public content</button>
        </article>
      ))}
      {bans.map((ban) => (
        <article key={ban.id} className="sm-card">
          <h3>Banned {ban.handle || ban.uid}</h3>
          <p className="sm-card-summary">{ban.reason || 'No note.'}</p>
          <button type="button" className="sm-ghost-btn" onClick={() => run(() => unbanUser(ban.uid || ban.id), 'Ban removed.')}>Unban</button>
        </article>
      ))}
      {pins.slice(0, 12).map((pin) => (
        <Row key={pin.id} title={pin.title || 'Community pin'} meta={`${pin.kind || 'pin'} · ${pin.ownerName || ''}`} onDelete={() => run(() => deletePublicDoc('community_pins', pin.id), 'Pin deleted.')} />
      ))}
      {threads.slice(0, 12).map((thread) => (
        <Row key={thread.id} title={thread.title} meta={thread.authorName || ''} onDelete={() => run(() => deletePublicDoc('threads', thread.id), 'Thread deleted.')} />
      ))}
      {posts.slice(0, 12).map((post) => (
        <Row key={post.id} title={post.body?.slice(0, 80) || 'Reply'} meta={post.authorName || ''} onDelete={() => run(() => deletePublicDoc('posts', post.id), 'Reply deleted.')} />
      ))}
      {profiles.slice(0, 12).map((post) => (
        <Row key={post.id} title={post.title || 'Profile post'} meta={post.ownerName || post.authorName || ''} onDelete={() => run(() => deletePublicDoc('profile_posts', post.id), 'Profile post deleted.')} />
      ))}
    </section>
  )
}
