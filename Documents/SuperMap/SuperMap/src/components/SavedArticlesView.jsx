import { useSavedArticles } from '../contexts/SavedArticlesContext'
import { useSavedXPosts } from '../contexts/SavedXPostsContext'
import './SavedArticlesView.css'

export default function SavedArticlesView() {
  const { saved, remove, loading } = useSavedArticles()
  const { savedPosts, removePost, loading: loadingPosts } = useSavedXPosts()

  if (loading || loadingPosts) return <div className="saved-articles-view"><p className="saved-articles-loading">Loading saved items…</p></div>
  if (saved.length === 0 && savedPosts.length === 0) {
    return (
      <div className="saved-articles-view">
        <h2 className="saved-articles-title">Saved items</h2>
        <p className="saved-articles-empty">No saved items yet. Sign in and use <strong>Save</strong> on articles or X posts.</p>
      </div>
    )
  }

  return (
    <div className="saved-articles-view">
      <h2 className="saved-articles-title">Saved articles ({saved.length})</h2>
      <ul className="saved-articles-list">
        {saved.map((a) => (
          <li key={a.id || a.url} className="saved-articles-item">
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="saved-articles-link">
              {a.title || 'Untitled'}
            </a>
            {a.source && <span className="saved-articles-source">{a.source}</span>}
            {a.snippet && <p className="saved-articles-snippet">{a.snippet}</p>}
            <button
              type="button"
              className="saved-articles-unsave"
              onClick={() => remove(a.url)}
              title="Remove from saved"
            >
              Unsave
            </button>
          </li>
        ))}
      </ul>
      <h2 className="saved-articles-title" style={{ marginTop: '1rem' }}>Saved X posts ({savedPosts.length})</h2>
      <ul className="saved-articles-list">
        {savedPosts.map((p) => (
          <li key={p.id || p.url} className="saved-articles-item">
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="saved-articles-link">
              {p.title || p.url}
            </a>
            {p.account && <span className="saved-articles-source">@{p.account}</span>}
            {p.content && <p className="saved-articles-snippet">{p.content}</p>}
            <button
              type="button"
              className="saved-articles-unsave"
              onClick={() => removePost(p.url)}
              title="Remove from saved"
            >
              Unsave
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
