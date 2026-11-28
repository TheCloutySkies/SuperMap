/** Results appear only after a search or a narrowed view. Never a data firehose. */
import { useMemo, useState } from 'react'
import { OBJECT_KINDS, theaterLabel } from './discoveryIndex'
import { requestAddToCase } from '../caseStore'

const PAGE_SIZE = 24

function stamp(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function cardItem(row) {
  return {
    title: row.title,
    summary: row.summary,
    type: row.kind,
    source: row.source,
    url: row.url,
    id: row.sourceId || row.id,
    tags: row.tags,
    timestampMs: row.t,
    lat: row.lat,
    lon: row.lon,
  }
}

export default function ResultsGrid({ rows, active, onOpen, onClear }) {
  const [page, setPage] = useState(0)
  const grouped = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      const list = map.get(row.kind) || []
      list.push(row)
      map.set(row.kind, list)
    }
    return [...map.entries()]
      .sort((a, b) => OBJECT_KINDS.findIndex((k) => k.id === a[0]) - OBJECT_KINDS.findIndex((k) => k.id === b[0]))
  }, [rows])

  if (!active) {
    return (
      <section className="bm-results bm-results-empty">
        <div className="bm-empty-mark" aria-hidden>⌕</div>
        <h3>Start with a question</h3>
        <p>
          Search for a name, place or event, or pick an object type above. Nothing is loaded into this
          page until you ask — the published data is indexed quietly in the background.
        </p>
      </section>
    )
  }
  if (!rows.length) {
    return (
      <section className="bm-results bm-results-empty">
        <h3>No matches</h3>
        <p>Try a shorter word, clear a filter, or widen the time range.</p>
        <button type="button" className="batman-btn batman-btn-ghost" onClick={onClear}>Clear filters</button>
      </section>
    )
  }

  const visibleCount = (page + 1) * PAGE_SIZE
  return (
    <section className="bm-results" aria-label="Search results">
      <div className="bm-results-head">
        <h3>{rows.length} objects found</h3>
        <span>Showing the first {Math.min(visibleCount, rows.length)}</span>
      </div>
      {grouped.map(([kind, group]) => {
        const meta = OBJECT_KINDS.find((entry) => entry.id === kind)
        return (
          <div className="bm-result-group" key={kind}>
            <h4>{meta?.icon || '◈'} {meta?.label || kind} <span>{group.length}</span></h4>
            <div className="bm-result-grid">
              {group.slice(0, visibleCount).map((row) => (
                <article className="bm-result-card" key={row.id}>
                  <button type="button" className="bm-result-open" onClick={() => onOpen(row)}>
                    <strong>{row.title}</strong>
                    <p>{row.summary || 'No summary published.'}</p>
                  </button>
                  <div className="bm-result-meta">
                    <span>{row.source || '—'}</span>
                    <span>{stamp(row.t)}</span>
                    <span>{theaterLabel(row.theater)}</span>
                    <span>{Math.round(row.confidence * 100)}%</span>
                  </div>
                  <div className="bm-result-actions">
                    <button type="button" className="batman-btn batman-btn-ghost" onClick={() => onOpen(row)}>Open</button>
                    <button type="button" className="batman-btn" onClick={() => requestAddToCase(cardItem(row))}>Add to Case</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )
      })}
      {visibleCount < rows.length ? (
        <button type="button" className="batman-btn batman-btn-ghost" onClick={() => setPage(page + 1)}>
          Show more ({rows.length - visibleCount} left)
        </button>
      ) : null}
    </section>
  )
}
