/**
 * Batman — the case workspace.
 *
 * v1 shipped without the canvas libraries: cards are positioned with plain CSS and
 * dragged with pointer events, so the board runs on the dependencies the app
 * already has. React Flow and vis-timeline replace the board and the list when
 * those packages are installed; the case document is the same either way.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSuperMapAccount } from '../accounts/SuperMapAccounts'
import {
  CASE_LIMITS,
  EDGE_TYPES,
  NODE_KINDS,
  caseGeoJson,
  caseKml,
  caseMarkdown,
  edgeMeta,
  edgeOf,
  kindMeta,
  nodeOf,
} from './caseModel'
import {
  createCase,
  fetchCase,
  persistCase,
  removeCase,
  scheduleSave,
  setVisibility,
  shareUrl,
  subscribeCases,
} from './caseStore'
import { requestAddToCase } from './caseStore'
import './batman.css'

const TABS = [
  { id: 'board', label: 'Board' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'report', label: 'Report' },
]

function download(filename, text, mime = 'text/plain') {
  try {
    const blob = new Blob([text], { type: mime })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  } catch { /* private mode */ }
}

function stamp(ms) {
  const at = Number(ms)
  if (!Number.isFinite(at) || at <= 0) return ''
  return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function BatmanView() {
  const { user } = useSuperMapAccount()
  const ownerUid = user?.uid || 'local'
  const [cases, setCases] = useState([])
  const [pickedId, setPickedId] = useState(null)
  const [caseDoc, setCaseDoc] = useState(null)
  const [tab, setTab] = useState('board')
  const [selectedId, setSelectedId] = useState(null)
  const [linkFrom, setLinkFrom] = useState(null)
  const [status, setStatus] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const dragRef = useRef(null)
  const boardRef = useRef(null)

  useEffect(() => subscribeCases(ownerUid, setCases), [ownerUid])

  // The open case is derived, not stored: the first case is open until one is picked.
  const caseId = pickedId || cases[0]?.id || null

  useEffect(() => {
    let alive = true
    fetchCase(caseId).then((doc) => {
      if (alive) setCaseDoc(doc || null)
    })
    return () => { alive = false }
  }, [caseId])

  const selected = useMemo(
    () => (caseDoc?.nodes || []).find((node) => node.id === selectedId) || null,
    [caseDoc, selectedId],
  )

  const patch = (updater, { debounce = false } = {}) => {
    setCaseDoc((prev) => {
      if (!prev) return prev
      // The store stamps updatedAtMs on every save.
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      if (debounce) {
        scheduleSave(next)
      } else {
        persistCase(next).then((result) => {
          setStatus(result.ok ? '' : (result.error || ''))
        })
      }
      return next
    })
  }

  async function onCreateCase(event) {
    event.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    const created = await createCase({ ownerUid, title })
    if (!created.ok) {
      setStatus(created.error || 'Could not create the case.')
      return
    }
    setNewTitle('')
    setPickedId(created.caseDoc.id)
    setStatus('')
  }

  async function onDeleteCase() {
    if (!caseDoc) return
    const result = await removeCase(caseDoc)
    if (!result.ok) {
      setStatus(result.error || 'Could not delete the case.')
      return
    }
    setCaseDoc(null)
    setPickedId(null)
  }

  async function onToggleShare() {
    if (!caseDoc) return
    const visible = caseDoc.visibility !== 'link'
    const result = await setVisibility(caseDoc, visible)
    if (!result.ok) {
      setStatus(result.error || 'Could not change sharing.')
      return
    }
    setCaseDoc(result.caseDoc)
    setStatus(visible ? 'Read-only link on. Anyone with the link can read this case.' : 'Private again.')
  }

  function addNode(kind) {
    if (!caseDoc) return
    if ((caseDoc.nodes || []).length >= CASE_LIMITS.nodes) {
      setStatus(`A case holds ${CASE_LIMITS.nodes} items.`)
      return
    }
    const index = (caseDoc.nodes || []).length
    const node = nodeOf({
      kind,
      title: kindMeta(kind).label,
      x: 40 + (index % 6) * 210,
      y: 40 + Math.floor(index / 6) * 130,
    })
    patch((prev) => ({ ...prev, nodes: [...(prev.nodes || []), node] }))
    setSelectedId(node.id)
    setTab('board')
  }

  function patchNode(nodeId, changes, options) {
    patch((prev) => ({
      ...prev,
      nodes: (prev.nodes || []).map((node) => (node.id === nodeId ? { ...node, ...changes } : node)),
    }), options)
  }

  function removeNode(nodeId) {
    patch((prev) => ({
      ...prev,
      nodes: (prev.nodes || []).filter((node) => node.id !== nodeId),
      edges: (prev.edges || []).filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
    }))
    if (selectedId === nodeId) setSelectedId(null)
    if (linkFrom === nodeId) setLinkFrom(null)
  }

  function onNodeClick(node) {
    if (linkFrom && linkFrom !== node.id) {
      if ((caseDoc.edges || []).length >= CASE_LIMITS.edges) {
        setStatus(`A case holds ${CASE_LIMITS.edges} links.`)
        setLinkFrom(null)
        return
      }
      const edge = edgeOf({ from: linkFrom, to: node.id, type: 'related', confidence: 0.6 })
      patch((prev) => ({ ...prev, edges: [...(prev.edges || []), edge] }))
      setLinkFrom(null)
      return
    }
    setSelectedId(node.id)
  }

  function patchEdge(edgeId, changes) {
    patch((prev) => ({
      ...prev,
      edges: (prev.edges || []).map((edge) => (edge.id === edgeId ? { ...edge, ...changes } : edge)),
    }))
  }

  function removeEdge(edgeId) {
    patch((prev) => ({ ...prev, edges: (prev.edges || []).filter((edge) => edge.id !== edgeId) }))
  }

  function onCardPointerDown(event, node) {
    if (event.button !== 0) return
    if (event.target.closest('button')) return
    const board = boardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    dragRef.current = {
      id: node.id,
      dx: event.clientX - rect.left + board.scrollLeft - (node.x || 0),
      dy: event.clientY - rect.top + board.scrollTop - (node.y || 0),
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function onCardPointerMove(event) {
    const drag = dragRef.current
    const board = boardRef.current
    if (!drag || !board) return
    const rect = board.getBoundingClientRect()
    const x = Math.max(0, event.clientX - rect.left + board.scrollLeft - drag.dx)
    const y = Math.max(0, event.clientY - rect.top + board.scrollTop - drag.dy)
    setCaseDoc((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        nodes: (prev.nodes || []).map((node) => (node.id === drag.id ? { ...node, x, y } : node)),
      }
    })
  }

  function onCardPointerUp() {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || !caseDoc) return
    persistCase(caseDoc).then((result) => setStatus(result.ok ? '' : (result.error || '')))
  }

  const nodes = caseDoc?.nodes || []
  const edges = caseDoc?.edges || []
  const timeline = nodes.filter((node) => Number.isFinite(node.t)).sort((a, b) => a.t - b.t)
  const byId = new Map(nodes.map((node) => [node.id, node]))

  return (
    <div className="batman-mode">
      <header className="batman-head">
        <div className="batman-title">
          <h1><span aria-hidden>🦇</span> Batman</h1>
          <p>Your Gotham: evidence in, structure out. Private until you share a read-only link.</p>
        </div>
        <div className="batman-head-tools">
          <select
            value={caseId || ''}
            onChange={(event) => { setPickedId(event.target.value || null); setSelectedId(null) }}
            aria-label="Open a case"
          >
            <option value="">{cases.length ? 'Pick a case' : 'No cases yet'}</option>
            {cases.map((row) => (
              <option key={row.id} value={row.id}>{row.title || 'Untitled case'}</option>
            ))}
          </select>
          <form className="batman-new" onSubmit={onCreateCase}>
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="New case"
              aria-label="New case name"
            />
            <button type="submit" className="batman-btn" disabled={!newTitle.trim()}>Open</button>
          </form>
        </div>
      </header>

      {!caseDoc ? (
        <section className="batman-empty">
          <h2>No case open</h2>
          <p>
            A case holds the people, articles, posts, places and tracks around one question, the links
            between them, a timeline and a report. Create one above, or send evidence from anywhere in
            the app with <b>Add to Batman case</b>.
          </p>
        </section>
      ) : (
        <>
          <div className="batman-case-bar">
            <input
              className="batman-case-title"
              value={caseDoc.title || ''}
              onChange={(event) => patch({ title: event.target.value.slice(0, 120) }, { debounce: true })}
              aria-label="Case title"
            />
            <span className={`batman-badge ${caseDoc.visibility === 'link' ? 'is-shared' : ''}`}>
              {caseDoc.visibility === 'link' ? 'Read-only link' : 'Private'}
            </span>
            <span className="batman-counts">{nodes.length} / {CASE_LIMITS.nodes} items · {edges.length} links</span>
            <div className="batman-bar-actions">
              <button type="button" className="batman-btn" onClick={onToggleShare}>
                {caseDoc.visibility === 'link' ? 'Make private' : 'Share read-only'}
              </button>
              <button type="button" className="batman-btn batman-btn-ghost" onClick={onDeleteCase}>Delete</button>
            </div>
          </div>

          {caseDoc.visibility === 'link' ? (
            <p className="batman-share">
              Link: <code>{shareUrl(caseDoc.id)}</code>{' '}
              <button
                type="button"
                className="batman-btn batman-btn-ghost"
                onClick={() => navigator.clipboard?.writeText(shareUrl(caseDoc.id)).catch(() => {})}
              >
                Copy
              </button>
            </p>
          ) : null}

          <nav className="batman-tabs" aria-label="Case views">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`batman-tab ${tab === entry.id ? 'is-on' : ''}`}
                aria-current={tab === entry.id ? 'page' : undefined}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          {status ? <p className="batman-status">{status}</p> : null}

          {tab === 'board' ? (
            <section className="batman-board-wrap">
              <div className="batman-palette" aria-label="Add an item">
                {NODE_KINDS.map((kind) => (
                  <button
                    key={kind.id}
                    type="button"
                    className="batman-palette-btn"
                    onClick={() => addNode(kind.id)}
                    title={`Add ${kind.label.toLowerCase()}`}
                  >
                    <span aria-hidden>{kind.icon}</span> {kind.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`batman-palette-btn ${linkFrom ? 'is-on' : ''}`}
                  onClick={() => setLinkFrom(linkFrom ? null : (selectedId || true))}
                  title="Connect two items"
                >
                  <span aria-hidden>↔</span> {linkFrom ? 'Pick the second item' : 'Connect'}
                </button>
              </div>

              <div
                className="batman-board"
                ref={boardRef}
                onPointerMove={onCardPointerMove}
                onPointerUp={onCardPointerUp}
                onPointerCancel={onCardPointerUp}
              >
                {nodes.length === 0 ? (
                  <p className="batman-hint">Add an item from the palette, or send evidence here from any screen.</p>
                ) : null}
                {nodes.map((node) => {
                  const meta = kindMeta(node.kind)
                  const isSelected = node.id === selectedId
                  const isSource = linkFrom && (linkFrom === true ? node.id === selectedId : linkFrom === node.id)
                  return (
                    <article
                      key={node.id}
                      className={`batman-card ${isSelected ? 'is-selected' : ''} ${isSource ? 'is-link-source' : ''}`}
                      style={{ left: `${node.x || 0}px`, top: `${node.y || 0}px` }}
                      onPointerDown={(event) => onCardPointerDown(event, node)}
                      onClick={() => onNodeClick(node)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => { if (event.key === 'Enter') onNodeClick(node) }}
                    >
                      <header>
                        <span aria-hidden>{meta.icon}</span>
                        <strong>{node.title}</strong>
                      </header>
                      <p>{node.ref?.source || meta.label}{node.t ? ` · ${stamp(node.t)}` : ''}</p>
                      {node.note ? <p className="batman-card-note">{node.note}</p> : null}
                      {node.ref?.url ? (
                        <a href={node.ref.url} target="_blank" rel="noopener noreferrer">Open source</a>
                      ) : null}
                    </article>
                  )
                })}
                <svg className="batman-wires" aria-hidden>
                  {edges.map((edge) => {
                    const a = byId.get(edge.from)
                    const b = byId.get(edge.to)
                    if (!a || !b) return null
                    const ax = (a.x || 0) + 90
                    const ay = (a.y || 0) + 40
                    const bx = (b.x || 0) + 90
                    const by = (b.y || 0) + 40
                    return (
                      <line
                        key={edge.id}
                        x1={ax}
                        y1={ay}
                        x2={bx}
                        y2={by}
                        stroke={edgeMeta(edge.type).color}
                        strokeWidth={edge.confidence > 0.75 ? 3 : 2}
                        strokeDasharray={edge.confidence < 0.4 ? '6 6' : undefined}
                        markerEnd={edge.direction === 'directed' ? 'url(#batman-arrow)' : undefined}
                      />
                    )
                  })}
                  <defs>
                    <marker id="batman-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b9bb4" />
                    </marker>
                  </defs>
                </svg>
              </div>

              {selected ? (
                <aside className="batman-inspector">
                  <h3>{kindMeta(selected.kind).label} details</h3>
                  <label>
                    Title
                    <input
                      value={selected.title}
                      onChange={(event) => patchNode(selected.id, { title: event.target.value.slice(0, 180) }, { debounce: true })}
                    />
                  </label>
                  <label>
                    Kind
                    <select value={selected.kind} onChange={(event) => patchNode(selected.id, { kind: event.target.value })}>
                      {NODE_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Note
                    <textarea
                      rows={3}
                      value={selected.note || ''}
                      onChange={(event) => patchNode(selected.id, { note: event.target.value.slice(0, 500) }, { debounce: true })}
                    />
                  </label>
                  <div className="batman-row">
                    <label>
                      Confidence
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selected.confidence ?? 0.6}
                        onChange={(event) => patchNode(selected.id, { confidence: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      When
                      <input
                        type="datetime-local"
                        value={selected.t ? new Date(selected.t).toISOString().slice(0, 16) : ''}
                        onChange={(event) => patchNode(selected.id, { t: event.target.value ? Date.parse(event.target.value) : null })}
                      />
                    </label>
                  </div>
                  <div className="batman-row">
                    <label>
                      Latitude
                      <input
                        type="number"
                        step="0.0001"
                        value={selected.lat ?? ''}
                        onChange={(event) => patchNode(selected.id, { lat: event.target.value ? Number(event.target.value) : null })}
                      />
                    </label>
                    <label>
                      Longitude
                      <input
                        type="number"
                        step="0.0001"
                        value={selected.lon ?? ''}
                        onChange={(event) => patchNode(selected.id, { lon: event.target.value ? Number(event.target.value) : null })}
                      />
                    </label>
                  </div>
                  <div className="batman-row">
                    <button type="button" className="batman-btn batman-btn-ghost" onClick={() => setLinkFrom(selected.id)}>Connect from here</button>
                    <button type="button" className="batman-btn batman-btn-danger" onClick={() => removeNode(selected.id)}>Remove</button>
                  </div>
                  <h4>Links</h4>
                  {edges.filter((edge) => edge.from === selected.id || edge.to === selected.id).length === 0 ? (
                    <p className="batman-hint">No links yet. Use Connect, then click a second item.</p>
                  ) : null}
                  <ul className="batman-edges">
                    {edges.filter((edge) => edge.from === selected.id || edge.to === selected.id).map((edge) => (
                      <li key={edge.id}>
                        <span>{byId.get(edge.from)?.title || '?'} → {byId.get(edge.to)?.title || '?'}</span>
                        <select value={edge.type} onChange={(event) => patchEdge(edge.id, { type: event.target.value })}>
                          {EDGE_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                        </select>
                        <select value={edge.direction} onChange={(event) => patchEdge(edge.id, { direction: event.target.value })}>
                          <option value="directed">Directed</option>
                          <option value="undirected">Undirected</option>
                        </select>
                        <button type="button" className="batman-btn batman-btn-ghost" onClick={() => removeEdge(edge.id)}>✕</button>
                      </li>
                    ))}
                  </ul>
                </aside>
              ) : null}
            </section>
          ) : null}

          {tab === 'timeline' ? (
            <section className="batman-timeline">
              {timeline.length === 0 ? (
                <p className="batman-hint">No dated items yet. Set “When” on an item and it appears here in order.</p>
              ) : null}
              <ol>
                {timeline.map((node) => (
                  <li key={node.id}>
                    <time>{stamp(node.t)}</time>
                    <button type="button" onClick={() => { setSelectedId(node.id); setTab('board') }}>
                      {kindMeta(node.kind).icon} {node.title}
                    </button>
                    <em>{node.ref?.source || kindMeta(node.kind).label}</em>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {tab === 'evidence' ? (
            <section className="batman-evidence">
              {nodes.length === 0 ? <p className="batman-hint">Nothing collected yet.</p> : null}
              <ul>
                {nodes.map((node) => (
                  <li key={node.id}>
                    <span aria-hidden>{kindMeta(node.kind).icon}</span>
                    <span>
                      <strong>{node.title}</strong>
                      <em>{node.ref?.source || kindMeta(node.kind).label}{node.t ? ` · ${stamp(node.t)}` : ''}</em>
                    </span>
                    <button type="button" className="batman-btn batman-btn-ghost" onClick={() => requestAddToCase(node)}>
                      Copy to another case
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {tab === 'report' ? (
            <section className="batman-report">
              <label>
                Summary
                <textarea
                  rows={4}
                  value={caseDoc.report?.body || ''}
                  onChange={(event) => patch((prev) => ({
                    ...prev,
                    report: { ...(prev.report || {}), body: event.target.value.slice(0, 4000) },
                  }), { debounce: true })}
                />
              </label>
              <pre className="batman-markdown">{caseMarkdown(caseDoc)}</pre>
              <div className="batman-row">
                <button
                  type="button"
                  className="batman-btn"
                  onClick={() => download(`${caseDoc.title || 'case'}.md`, caseMarkdown(caseDoc), 'text/markdown')}
                >
                  Download Markdown
                </button>
                <button
                  type="button"
                  className="batman-btn batman-btn-ghost"
                  onClick={() => download(`${caseDoc.title || 'case'}.geojson`, JSON.stringify(caseGeoJson(caseDoc), null, 2), 'application/geo+json')}
                >
                  GeoJSON
                </button>
                <button
                  type="button"
                  className="batman-btn batman-btn-ghost"
                  onClick={() => download(`${caseDoc.title || 'case'}.kml`, caseKml(caseDoc), 'application/vnd.google-earth.kml+xml')}
                >
                  KML
                </button>
                <button
                  type="button"
                  className="batman-btn batman-btn-ghost"
                  onClick={() => download(`${caseDoc.title || 'case'}.json`, JSON.stringify(caseDoc, null, 2), 'application/json')}
                >
                  Case JSON
                </button>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
