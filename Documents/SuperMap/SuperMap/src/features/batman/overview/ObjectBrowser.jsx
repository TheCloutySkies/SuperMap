/**
 * The object record panel: Properties / Relationships / Sources.
 * Every displayed value is tethered to the published source that produced it.
 */
import { useState } from 'react'
import { ExternalLink, Link2, MapPin, Plus } from 'lucide-react'
import { OBJECT_KINDS, relatedObjects, theaterLabel } from './discoveryIndex'
import { requestAddToCase } from '../caseStore'

function stamp(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })
}

function toCaseItem(row) {
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
    ...(row.ref?.signal ? { signal: row.ref.signal } : {}),
    ...(row.ref?.caseId ? { caseId: row.ref.caseId } : {}),
  }
}

export default function ObjectBrowser({ object, index, onOpen, onOpenInMap }) {
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)
  if (!object) return null

  const meta = OBJECT_KINDS.find((entry) => entry.id === object.kind)
  const related = relatedObjects(index, object)
  const noteKey = `bm:notes:${object.id}`
  const currentNote = note || (() => { try { return localStorage.getItem(noteKey) || '' } catch { return '' } })()
  const saveNote = () => {
    try { localStorage.setItem(noteKey, currentNote) } catch { /* private mode */ }
    setNote(currentNote)
    setSaved(true)
  }
  const properties = [
    ['Type', meta?.label || object.kind],
    ['Source', object.source || '—'],
    ['Theater', theaterLabel(object.theater)],
    ['Time', stamp(object.t)],
    ['Coordinates', object.lat != null ? `${object.lat.toFixed(4)}, ${object.lon?.toFixed(4)}` : '—'],
    ['Confidence', `${Math.round(object.confidence * 100)}%`],
    ['Record id', object.sourceId || object.id],
    ...(object.tags?.length ? [['Tags', object.tags.join(', ')]] : []),
  ]

  return (
    <aside className="gm-detail" aria-label={object.title}>
      <header className="gm-detail-head">
        <div>
          <p className="gm-detail-kind">{meta?.label || object.kind} · {theaterLabel(object.theater)}</p>
          <h2>{object.title}</h2>
          <p className="gm-detail-summary">{object.summary || 'No summary was published with this record.'}</p>
        </div>
      </header>

      <div className="gm-detail-body">
        <section className="gm-detail-section">
          <h3>Properties</h3>
          <dl className="gm-properties">
            {properties.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd className="gm-num">{value}</dd></div>
            ))}
          </dl>
        </section>

        <section className="gm-detail-section">
          <h3>Relationships <span className="gm-num">{related.length}</span></h3>
          {related.length ? (
            <ul className="gm-related">
              {related.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => onOpen(row)}>
                    <Link2 size={13} strokeWidth={1.5} aria-hidden />
                    <span>{row.title}</span>
                    <em>{OBJECT_KINDS.find((entry) => entry.id === row.kind)?.label || row.kind}</em>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="gm-hint">No other records share this one's tags, theater or time.</p>}
        </section>

        <section className="gm-detail-section">
          <h3>Sources</h3>
          <ul className="gm-sources">
            <li>
              <span className="gm-source-label">Published feed</span>
              <span className="gm-num">{object.source || '—'}</span>
            </li>
            {object.url ? (
              <li>
                <span className="gm-source-label">Original document</span>
                {/^https?:\/\//.test(object.url) ? (
                  <a href={object.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={13} strokeWidth={1.5} aria-hidden /> {object.url}
                  </a>
                ) : (
                  <button type="button" onClick={() => onOpenInMap?.(object)}>
                    <MapPin size={13} strokeWidth={1.5} aria-hidden /> Show on map
                  </button>
                )}
              </li>
            ) : null}
            {object.ref?.entity ? (
              <li>
                <span className="gm-source-label">Derived from</span>
                <span className="gm-num">{object.ref.entity.eventCount} ingested events</span>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="gm-detail-section">
          <h3>Analyst note</h3>
          <textarea rows={3} value={currentNote} onChange={(event) => setNote(event.target.value)} placeholder="Note about this record" />
          <button type="button" className="gm-btn" onClick={saveNote}>Save note{saved ? ' · saved' : ''}</button>
        </section>
      </div>

      <footer className="gm-detail-actions">
        <button type="button" className="gm-btn gm-btn-primary" onClick={() => requestAddToCase(toCaseItem(object))}>
          <Plus size={14} strokeWidth={1.5} aria-hidden /> Add to case
        </button>
        <button type="button" className="gm-btn" onClick={() => requestAddToCase({ ...toCaseItem(object), type: 'signal' })}>Open in graph</button>
        <button type="button" className="gm-btn" onClick={() => onOpenInMap?.(object)} disabled={object.lat == null}>Open in map</button>
      </footer>
    </aside>
  )
}
