/** Dense, sortable results table. Empty until the user searches or narrows. */
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { OBJECT_KINDS, theaterLabel } from './discoveryIndex'
import { requestAddToCase } from '../caseStore'

const PAGE_SIZE = 80

function stamp(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleDateString('en-CA')
}

const KIND_LABEL = Object.fromEntries(OBJECT_KINDS.map((kind) => [kind.id, kind.label]))

const COLUMNS = [
  { id: 'title', label: 'Title' },
  { id: 'kind', label: 'Type' },
  { id: 'source', label: 'Source' },
  { id: 'theater', label: 'Theater' },
  { id: 't', label: 'Time', mono: true },
  { id: 'confidence', label: 'Confidence', mono: true },
]

export default function ResultsGrid({ rows, active, selectedId, onSelect, onClear, indexSize }) {
  const [sort, setSort] = useState({ field: 't', dir: 'desc' })
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    const list = rows.slice()
    list.sort((a, b) => {
      const av = a[sort.field] ?? ''
      const bv = b[sort.field] ?? ''
      const result = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? result : -result
    })
    return list
  }, [rows, sort])

  const visible = sorted.slice(0, (page + 1) * PAGE_SIZE)
  const toggleSort = (field) => setSort((prev) => ({
    field,
    dir: prev.field === field && prev.dir === 'desc' ? 'asc' : 'desc',
  }))

  if (!active) {
    return (
      <section className="gm-results gm-empty">
        <h2>No query active</h2>
        <p>Enter a name, place or event in the search field, or select an object type or filter in the navigator.</p>
        <p className="gm-empty-note">{indexSize} objects are indexed from published sources. Nothing is displayed until you ask for it.</p>
      </section>
    )
  }
  if (!rows.length) {
    return (
      <section className="gm-results gm-empty">
        <h2>No matching records</h2>
        <p>Widen the time range or remove a filter.</p>
        <button type="button" className="gm-btn" onClick={onClear}>Clear filters</button>
      </section>
    )
  }

  return (
    <section className="gm-results" aria-label="Results">
      <div className="gm-results-head">
        <h2>Results <span className="gm-num">{rows.length}</span></h2>
        <span className="gm-hint">Showing {visible.length} of {rows.length}</span>
      </div>
      <div className="gm-table-wrap">
        <table className="gm-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.id} className={column.mono ? 'gm-num' : ''}>
                  <button type="button" onClick={() => toggleSort(column.id)} aria-label={`Sort by ${column.label}`}>
                    {column.label}
                    {sort.field === column.id ? (
                      sort.dir === 'asc' ? <ArrowUp size={12} strokeWidth={1.5} aria-hidden /> : <ArrowDown size={12} strokeWidth={1.5} aria-hidden />
                    ) : null}
                  </button>
                </th>
              ))}
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                className={selectedId === row.id ? 'is-selected' : ''}
                onClick={() => onSelect(row)}
                tabIndex={0}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(row) }}
              >
                <td className="gm-title-cell">
                  <strong>{row.title}</strong>
                  {row.summary ? <span className="gm-row-summary">{row.summary}</span> : null}
                </td>
                <td>{KIND_LABEL[row.kind] || row.kind}</td>
                <td>{row.source || '—'}</td>
                <td>{theaterLabel(row.theater)}</td>
                <td className="gm-num">{stamp(row.t)}</td>
                <td className="gm-num">{Math.round(row.confidence * 100)}%</td>
                <td>
                  <button
                    type="button"
                    className="gm-row-action"
                    onClick={(event) => {
                      event.stopPropagation()
                      requestAddToCase({
                        title: row.title, summary: row.summary, type: row.kind,
                        source: row.source, url: row.url, id: row.sourceId || row.id,
                        tags: row.tags, timestampMs: row.t, lat: row.lat, lon: row.lon,
                      })
                    }}
                  >
                    Add to case
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length < rows.length ? (
        <button type="button" className="gm-btn" onClick={() => setPage(page + 1)}>Load {Math.min(PAGE_SIZE, rows.length - visible.length)} more rows</button>
      ) : null}
    </section>
  )
}
