import './WidgetCard.css'

export default function WidgetCard({ title, children, updatedAt, loading, error }) {
  return (
    <div className="widget-card card-y2k">
      <h3 className="widget-card-title">{title}</h3>
      <div className="widget-card-content">
        {loading && <p className="widget-card-loading">Loading…</p>}
        {error && <p className="widget-card-error">{error}</p>}
        {!loading && !error && children}
      </div>
      {updatedAt && !loading && !error && (
        <p className="widget-card-updated">Updated {updatedAt}</p>
      )}
    </div>
  )
}
