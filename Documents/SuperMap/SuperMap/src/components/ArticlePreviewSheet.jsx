import './ArticlePreviewSheet.css'

function isRealImage(url) {
  if (!url || typeof url !== 'string') return false
  if (url.includes('google.com/s2/favicons')) return false
  return /^https?:\/\//i.test(url)
}

function articleImage(item) {
  const url = item?.image || item?.thumbnail
  return isRealImage(url) ? url : null
}

function formatRelativeTime(item) {
  const raw = item?.pubDate || item?.timestamp
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return `${Math.max(1, sec)}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Shared in-app article preview (Glowie + OSINT).
 * No publisher iframe / full HTML reader — preview + Open original.
 */
export default function ArticlePreviewSheet({
  item,
  open,
  onClose,
  sourceLabel,
  onPin,
  pinning = false,
  pinError = null,
}) {
  if (!open || !item) return null

  const img = articleImage(item)
  const title = item.title || 'Untitled'
  const source = sourceLabel || item.source || 'Source'
  const snippet = String(item.contentSnippet || item.description || '').replace(/\s+/g, ' ').trim()
  const href = item.link || item.url || null
  const timeLabel = formatRelativeTime(item)

  return (
    <div
      className="article-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose?.() }}
    >
      <div className="article-preview-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="article-preview-handle" aria-hidden />
        {img && (
          <div className="article-preview-media">
            <img src={img} alt="" />
          </div>
        )}
        <div className="article-preview-body">
          <div className="article-preview-meta">
            <span className="article-preview-source">{source}</span>
            {timeLabel && <span>{timeLabel}</span>}
          </div>
          <h2 className="article-preview-title">{title}</h2>
          {snippet && (
            <p className="article-preview-snippet">{snippet.slice(0, 420)}</p>
          )}
          {pinError && <p className="article-preview-snippet" style={{ color: '#fca5a5' }}>{pinError}</p>}
          <div className="article-preview-actions">
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="article-preview-btn article-preview-btn--primary"
              >
                Open original
              </a>
            )}
            {typeof onPin === 'function' && (
              <button
                type="button"
                className="article-preview-btn"
                onClick={() => onPin(item)}
                disabled={pinning}
              >
                {pinning ? 'Pinning…' : 'Pin to map'}
              </button>
            )}
            <button type="button" className="article-preview-btn article-preview-btn--ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
