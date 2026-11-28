/** Object-type list and histogram facets — the console's left navigator. */
import { useMemo } from 'react'
import {
  Building2, Briefcase, Crosshair, FileText, FolderOpen, Globe,
  MapPin, Radio, User, AtSign,
} from 'lucide-react'
import { OBJECT_KINDS, facetCounts, theaterLabel } from './discoveryIndex'

const ICONS = {
  FileText, AtSign, MapPin, Radio, User, Building2,
  Globe, FolderOpen, Crosshair, Briefcase,
}

const TIME_RANGES = [
  { id: 'any', label: 'Any time' },
  { id: '24h', label: 'Last 24 hours' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
]

function FacetGroup({ title, entries, selected, onToggle, format = (value) => value, limit = 7 }) {
  const shown = entries.slice(0, limit)
  const max = entries[0]?.count || 1
  if (!entries.length) return null
  return (
    <section className="gm-facet">
      <h4>{title}</h4>
      <ul>
        {shown.map((entry) => (
          <li key={entry.value}>
            <button
              type="button"
              className={selected.includes(entry.value) ? 'is-on' : ''}
              onClick={() => onToggle(entry.value)}
              aria-pressed={selected.includes(entry.value)}
              title={`${format(entry.value)} — ${entry.count} records`}
            >
              <span className="gm-facet-name">{format(entry.value)}</span>
              <span className="gm-facet-bar" aria-hidden><i style={{ width: `${Math.round((entry.count / max) * 100)}%` }} /></span>
              <b>{entry.count}</b>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function FacetRail({ records, filters, onToggle, onClear, active }) {
  const types = useMemo(
    () => OBJECT_KINDS
      .map((kind) => ({ id: kind.id, count: records.filter((row) => row.kind === kind.id).length }))
      .filter((entry) => entry.count > 0),
    [records],
  )
  const sources = useMemo(() => facetCounts(records, 'source', (row) => !filters.source.length || filters.source.includes(row.source)), [records, filters.source])
  const theaters = useMemo(() => facetCounts(records, 'theater', (row) => !filters.theater.length || filters.theater.includes(row.theater)), [records, filters.theater])
  const tags = useMemo(() => facetCounts(records, 'tags', (row) => !filters.tag.length || row.tags.some((tag) => filters.tag.includes(tag))), [records, filters.tag])

  return (
    <aside className="gm-navigator" aria-label="Object navigator">
      <section className="gm-nav-section">
        <h3>Object types</h3>
        <ul className="gm-type-list">
          {OBJECT_KINDS.map((kind) => {
            const Icon = ICONS[kind.icon] || FileText
            const count = types.find((entry) => entry.id === kind.id)?.count || 0
            return (
              <li key={kind.id}>
                <button
                  type="button"
                  className={filters.kind.includes(kind.id) ? 'is-on' : ''}
                  onClick={() => onToggle('kind', kind.id)}
                  aria-pressed={filters.kind.includes(kind.id)}
                  disabled={!count}
                >
                  <Icon size={15} strokeWidth={1.5} aria-hidden />
                  <span>{kind.label}</span>
                  <b>{count}</b>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <FacetGroup title="Source" entries={sources} selected={filters.source} onToggle={(value) => onToggle('source', value)} />
      <FacetGroup title="Theater" entries={theaters} selected={filters.theater} onToggle={(value) => onToggle('theater', value)} format={theaterLabel} />
      <FacetGroup title="Tags" entries={tags} selected={filters.tag} onToggle={(value) => onToggle('tag', value)} />

      <section className="gm-facet">
        <h4>Time</h4>
        <ul>
          {TIME_RANGES.map((range) => (
            <li key={range.id}>
              <button
                type="button"
                className={filters.time === range.id ? 'is-on' : ''}
                onClick={() => onToggle('time', range.id)}
                aria-pressed={filters.time === range.id}
              >
                <span className="gm-facet-name">{range.label}</span>
                <b>{filters.time === range.id ? '•' : ''}</b>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="gm-facet">
        <h4>Confidence ≥ {Math.round(filters.minConfidence * 100)}%</h4>
        <input
          type="range" min="0" max="90" step="10"
          value={Math.round(filters.minConfidence * 100)}
          onChange={(event) => onToggle('minConfidence', Number(event.target.value) / 100)}
          aria-label="Minimum confidence"
        />
      </section>

      {active ? <button type="button" className="gm-clear" onClick={onClear}>Clear all filters</button> : null}
    </aside>
  )
}
