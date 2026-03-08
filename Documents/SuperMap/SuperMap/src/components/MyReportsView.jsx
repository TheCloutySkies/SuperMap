import { useAuth } from '../contexts/AuthContext'
import { useSavedReports } from '../contexts/SavedReportsContext'
import './SavedArticlesView.css'

const REPORT_DRAFT_KEY = 'supermap_report_draft'

export default function MyReportsView({ onOpenReportMaker, onSignInRequired }) {
  const { user } = useAuth()
  const { reports, loading, deleteReport } = useSavedReports()

  if (!user) {
    return (
      <div className="saved-articles-view">
        <h2 className="saved-articles-title">My Reports</h2>
        <p className="saved-articles-empty">Sign in to access saved reports.</p>
        <button type="button" className="saved-articles-unsave" onClick={onSignInRequired}>Sign in</button>
      </div>
    )
  }

  return (
    <div className="saved-articles-view">
      <h2 className="saved-articles-title">My Reports ({reports.length})</h2>
      {loading ? (
        <p className="saved-articles-loading">Loading reports…</p>
      ) : reports.length === 0 ? (
        <p className="saved-articles-empty">No saved reports yet. Open Report Maker and click "Save to account".</p>
      ) : (
        <ul className="saved-articles-list">
          {reports.map((r) => (
            <li key={r.id} className="saved-articles-item">
              <button
                type="button"
                className="saved-articles-link"
                onClick={() => {
                  localStorage.setItem(REPORT_DRAFT_KEY, JSON.stringify({ ...(r.payload || {}), id: r.id }))
                  onOpenReportMaker?.()
                }}
              >
                {r.title || 'Untitled Report'}
              </button>
              <span className="saved-articles-source">{new Date(r.updated_at || r.created_at).toLocaleString()}</span>
              <button type="button" className="saved-articles-unsave" onClick={() => deleteReport(r.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

