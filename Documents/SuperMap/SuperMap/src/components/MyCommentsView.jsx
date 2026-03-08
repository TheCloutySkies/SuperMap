import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import './SavedArticlesView.css'

export default function MyCommentsView({ onSignInRequired }) {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchMine = useCallback(async () => {
    if (!supabase || !user?.id) {
      setRows([])
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('user_updates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    fetchMine()
  }, [fetchMine])

  if (!user) {
    return (
      <div className="saved-articles-view">
        <h2 className="saved-articles-title">My Comments</h2>
        <p className="saved-articles-empty">Sign in to access your comments.</p>
        <button type="button" className="saved-articles-unsave" onClick={onSignInRequired}>Sign in</button>
      </div>
    )
  }

  return (
    <div className="saved-articles-view">
      <h2 className="saved-articles-title">My Comments ({rows.length})</h2>
      {loading ? <p className="saved-articles-loading">Loading comments…</p> : (
        <ul className="saved-articles-list">
          {rows.map((c) => (
            <li key={c.id} className="saved-articles-item">
              <p className="saved-articles-snippet">{c.content}</p>
              <span className="saved-articles-source">{new Date(c.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

