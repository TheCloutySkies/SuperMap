/**
 * Gotham-style facet rail. Counts come from the records in scope before the
 * facet itself is applied, so each number tells you what narrowing would give.
 */
import { useMemo } from 'react'
import { OBJECT_KINDS, facetCounts, theaterLabel } from './discoveryIndex'

const TIME_RANGES = [
  { id: 'any', label: 'Any time', ms: 0 },
  { id: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000 },
]

function FacetGroup({ title, entries, selected, onToggle, format = (value) => value, limit = 8 }) {
  const [shown, more] = [entries.slice(0, limit), entries.length - limit]
  if (!entries.length) return null
  return (
    <section className="bm-facet-group">
      <h4>{title}</h4>
      <ul>
        {shown.map((entry) => {
          const on = selected.includes(entry.value)
          return (
            <li key={entry.value}>
              <button type="button" className={on ? 'is-on' : ''} onClick={() => onToggle(entry.value)} aria-pressed={on}>
                <span>{format(entry.value)}</span><b>{entry.count}</b>
              </button>
            </li>
          )
        })}
      </ul>
      {more > 0 ? <p className="bm-facet-more">+{more} more</p> : null}
    </section>
  )
}

export default function FacetRail({ scoped, filters, onToggle, onClear, indexSize }) {
  const kinds = useMemo(() => facetCounts(scoped, 'kind', (row) => !filters.kind.length || filters.kind.includes(row.kind)), [scoped, filters.kind])
  const sources = useMemo(() => facetCounts(scoped, 'source', (row) => !filters.source.length || filters.source.includes(row.source)), [scoped, filters.source])
  const theaters = useMemo(() => facetCounts(scoped, 'theater', (row) => !filters.theater.length || filters.theater.includes(row.theater)), [scoped, filters.theater])
  const tags = useMemo(() => facetCounts(scoped, 'tags', (row) => !filters.tag.length || row.tags.some((tag) => filters.tag.includes(tag))), [scoped, filters.tag])
  const active = filters.kind.length + filters.source.length + filters.theater.length + filters.tag.length
    + (filters.time !== 'any' ? 1 : 0) + (filters.minConfidence > 0 ? 1 : 0)

  return (
    <aside className="bm-facets" aria-label="Filters">
      <div className="bm-facets-head">
        <h3>Filters {active ? <span className="bm-facet-active">{active}</span> : null}</h3>
        {active ? <button type="button" className="batman-btn batman-btn-ghost" onClick={onClear}>Clear</button> : null}
      </div>
      <p className="bm-facet-scope">{scoped.length} of {indexSize} objects in view</p>

      <FacetGroup
        title="Object type" entries={kinds} selected={filters.kind} limit={10}
        onToggle={(value) => onToggle('kind', value)}
        format={(value) => {
          const kind = OBJECT_KINDS.find((entry) => entry.id === value)
          return kind ? `${kind.icon} ${kind.label}` : value
        }}
      />
      <FacetGroup title="Source" entries={sources} selected={filters.source} onToggle={(value) => onToggle('source', value)} />
      <FacetGroup
        title="Region" entries={theaters} selected={filters.theater} onToggle={(value) => onToggle('theater', value)}
        format={theaterLabel}
      />
      <FacetGroup title="Tags" entries={tags} selected={filters.tag} onToggle={(value) => onToggle('tag', value)} />

      <section className="bm-facet-group">
        <h4>Time</h4>
        <div className="bm-facet-times">
          {TIME_RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              className={filters.time === range.id ? 'is-on' : ''}
              onClick={() => onToggle('time', range.id)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </section>

      <section className="bm-facet-group">
        <h4>Confidence at least {Math.round(filters.minConfidence * 100)}%</h4>
        <input
          type="range" min="0" max="90" step="10"
          value={Math.round(filters.minConfidence * 100)}
          onChange={(event) => onToggle('minConfidence', Number(event.target.value) / 100)}
          aria-label="Minimum confidence"
        />
      </section>
    </aside>
  )
}
