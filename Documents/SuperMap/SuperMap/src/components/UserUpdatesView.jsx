import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import './UserUpdatesView.css'

export default function UserUpdatesView({ onSignInRequired }) {
  const { user } = useAuth()
  const [updates, setUpdates] = useState([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  const fetchUpdates = useCallback(async () => {
    if (!supabase || !user?.id) {
      setUpdates([])
      return
    }
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('user_updates')
      .select('id,user_id,content,created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (fetchError) {
      setError(fetchError.message || 'Failed to load updates')
      setUpdates([])
    } else {
      setError('')
      setUpdates(data || [])
    }
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    fetchUpdates()
  }, [fetchUpdates])

  const submit = async () => {
    if (!user?.id) {
      onSignInRequired?.()
      return
    }
    const text = content.trim()
    if (!text) return
    setPosting(true)
    setError('')
    const { error: postError } = await supabase.from('user_updates').insert({
      user_id: user.id,
      content: text.slice(0, 2000),
    })
    if (postError) {
      setError(postError.message || 'Failed to post update')
    } else {
      setContent('')
      await fetchUpdates()
    }
    setPosting(false)
  }

  if (!user) {
    return (
      <div className="user-updates-view">
        <h2>User Updates</h2>
        <p>Sign in to post and read community updates.</p>
        <button type="button" onClick={onSignInRequired}>Sign in</button>
      </div>
    )
  }

  return (
    <div className="user-updates-view">
      <h2>User Updates</h2>
      <p className="user-updates-subtitle">Forum-style stream for signed-in users.</p>
      <div className="user-updates-compose">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share an update, report note, or intel tip..."
          rows={4}
        />
        <button type="button" onClick={submit} disabled={posting || !content.trim()}>
          {posting ? 'Posting…' : 'Post update'}
        </button>
      </div>
      {error && <p className="user-updates-error">{error}</p>}
      {loading ? (
        <p>Loading updates…</p>
      ) : (
        <ul className="user-updates-list">
          {updates.map((u) => (
            <li key={u.id} className="user-updates-item">
              <div className="user-updates-meta">
                <span>{u.user_id === user.id ? 'You' : `User ${String(u.user_id || '').slice(0, 8)}`}</span>
                <span>{new Date(u.created_at).toLocaleString()}</span>
              </div>
              <p>{u.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

