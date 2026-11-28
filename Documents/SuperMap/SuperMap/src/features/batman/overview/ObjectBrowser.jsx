/**
 * Browser-style drawer for one object: properties, the original source, media,
 * related objects and the actions that carry it into a case / graph / map.
 */
import { useState } from 'react'
import { OBJECT_KINDS, relatedObjects, theaterLabel } from './discoveryIndex'
import { requestAddToCase } from '../caseStore'

function stamp(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
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

export default function ObjectBrowser({ object, index, onClose, onOpen, onOpenInMap }) {
  const noteKey = object ? `bm:notes:${object.id}` : ''
  const [note, setNote] = useState(() => {
    try { return localStorage.getItem(noteKey) || '' } catch { return '' }
  })
  const [saved, setSaved] = useState(false)

  if (!object) return null
  const meta = OBJECT_KINDS.find((entry) => entry.id === object.kind)
  const related = relatedObjects(index, object)
  const saveNote = () => {
    try { localStorage.setItem(`bm:notes:${object.id}`, note) } catch { /* private mode */ }
    setSaved(true)
  }

  return (
    <>
      <div className="bm-browser-scrim" onClick={onClose} aria-hidden />
      <aside className="bm-browser" role="dialog" aria-modal="true" aria-label={object.title}>
        <header className="bm-browser-head">
          <div>
            <p className="bm-browser-kind">{meta?.icon || '◈'} {meta?.label || object.kind} · {theaterLabel(object.theater)}</p>
            <h2>{object.title}</h2>
          </div>
          <button type="button" className="batman-btn batman-btn-ghost" onClick={onClose}>✕</button>
        </header>

        <div className="bm-browser-body">
          <section className="bm-browser-block">
            <h3>What it says</h3>
            <p>{object.summary || 'No summary was published with this object.'}</p>
            {object.url ? (
              <a href={/^https?:\/\//.test(object.url) ? object.url : undefined} onClick={! /^https?:\/\//.test(object.url) ? (event) => { event.preventDefault(); onOpenInMap?.(object) } : undefined} target={/^https?:\/\//.test(object.url) ? '_blank' : undefined} rel="noopener noreferrer">
                {/^https?:\/\//.test(object.url) ? 'Open the original →' : 'Open in map →'}
              </a>
            ) : null}
          </section>

          <section className="bm-browser-block">
            <h3>Properties</h3>
            <dl className="bm-properties">
              <div><dt>Source</dt><dd>{object.source || '—'}</dd></div>
              <div><dt>Type</dt><dd>{meta?.label || object.kind}</dd></div>
              <div><dt>Time</dt><dd>{stamp(object.t)}</dd></div>
              <div><dt>Confidence</dt><dd>{Math.round(object.confidence * 100)}%</dd></div>
              <div><dt>Location</dt><dd>{object.lat != null ? `${object.lat.toFixed(3)}, ${object.lon?.toFixed(3)}` : '—'}</dd></div>
              <div><dt>Region</dt><dd>{theaterLabel(object.theater)}</dd></div>
              {object.tags?.length ? <div><dt>Tags</dt><dd>{object.tags.join(', ')}</dd></div> : null}
            </dl>
          </section>

          <section className="bm-browser-block">
            <h3>Related objects</h3>
            {related.length ? (
              <ul className="bm-related">
                {related.map((row) => (
                  <li key={row.id}>
                    <button type="button" onClick={() => onOpen(row)}>
                      <span>{OBJECT_KINDS.find((entry) => entry.id === row.kind)?.icon || '◈'}</span>
                      <span>{row.title}</span>
                      <em>{row.source}</em>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="batman-hint">Nothing else published here shares its tags, place or time.</p>}
          </section>

          <section className="bm-browser-block">
            <h3>My note <span className="batman-hint">{saved ? ' · saved' : ''}</span></h3>
            <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What matters about this?" />
            <button type="button" className="batman-btn batman-btn-ghost" onClick={saveNote}>Save note</button>
          </section>
        </div>

        <footer className="bm-browser-actions">
          <button type="button" className="batman-btn" onClick={() => requestAddToCase(toCaseItem(object))}>🦇 Add to Case</button>
          <button type="button" className="batman-btn batman-btn-ghost" onClick={() => requestAddToCase({ ...toCaseItem(object), type: 'signal' })}>Open in Graph</button>
          <button type="button" className="batman-btn batman-btn-ghost" onClick={() => onOpenInMap?.(object)}>Open in Map</button>
        </footer>
      </aside>
    </>
  )
}
