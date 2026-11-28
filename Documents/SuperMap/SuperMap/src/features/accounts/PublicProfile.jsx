import { useEffect, useState } from 'react'
import { personHandle, personNumber, personTitle } from './accountIdentity'
import { presenceLabel, presenceValue } from './messageBits'
import { loadUserProfile, subscribeProfilePosts } from './socialData'

function PresenceDot({ presence }) {
  const label = presenceLabel(presence)
  return <span className={`sm-presence sm-presence--${presenceValue(presence)}`} title={label} aria-label={label} />
}

export default function PublicProfile({ seed, onClose }) {
  const [profile, setProfile] = useState(seed)
  const [posts, setPosts] = useState([])

  useEffect(() => {
    setProfile(seed)
    let stop = false
    loadUserProfile(seed.uid).then((row) => {
      if (!stop && row) setProfile((current) => ({ ...current, ...row, uid: seed.uid }))
    })
    return () => { stop = true }
  }, [seed])

  useEffect(() => subscribeProfilePosts(seed.uid, setPosts), [seed.uid])

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const thoughts = posts.filter((post) => post.type === 'thought' && post.parentId)
  const visible = posts.filter((post) => !post.parentId)
  const tagline = String(profile?.bulletinTagline || '').trim()

  return (
    <div className="sm-public-scrim" role="presentation" onClick={onClose}>
      <section
        className="sm-public"
        role="dialog"
        aria-modal="true"
        aria-label={`${personTitle(profile)} profile`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sm-public-head">
          <div>
            <p className="sm-public-emoji" aria-hidden>{profile?.emoji || '◈'}</p>
            <h2><PresenceDot presence={profile?.presence} />{personTitle(profile)}</h2>
            <p className="sm-local-note">{personHandle(profile)} · #{personNumber(profile)}</p>
            {tagline ? <p className="sm-public-tagline">{tagline}</p> : null}
            {profile?.bio ? <p className="sm-bio">{profile.bio}</p> : null}
            {!profile?.isSelf ? (
              <button
                type="button"
                className="sm-primary-btn sm-public-message"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('supermap:open-messages', {
                    detail: {
                      uid: profile.uid,
                      displayName: profile.displayName || '',
                      emoji: profile.emoji || '◈',
                      handle: personHandle(profile),
                    },
                  }))
                  onClose()
                }}
              >
                Message
              </button>
            ) : null}
          </div>
          <button type="button" className="sm-modal-close" onClick={onClose} aria-label="Close profile">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="sm-public-posts">
          {visible.map((post) => {
            const notes = thoughts.filter((row) => row.parentId === post.id)
            return (
              <article key={post.id} className="sm-card">
                {post.type === 'thought' ? <span className="sm-type-badge">Thought</span> : null}
                <h3>{post.type === 'thought' ? (post.summary || post.title) : post.title}</h3>
                {post.type !== 'thought' && post.summary ? <p className="sm-card-summary">{post.summary}</p> : null}
                {post.sourceUrl ? <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a> : null}
                {notes.map((note) => (
                  <p key={note.id} className="sm-thought">{note.summary || note.title}</p>
                ))}
              </article>
            )
          })}
          {visible.length === 0 ? <p className="sm-local-note">No public posts yet.</p> : null}
        </div>
      </section>
    </div>
  )
}
