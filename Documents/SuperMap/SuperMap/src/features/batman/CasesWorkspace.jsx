/**
 * The investigation workbench: one case document seen as a board, a timeline,
 * an evidence list, a report and a desk answer. This was BatmanView before the
 * Overview was added; it is mounted unchanged inside the two-view shell.
 */
import { useEffect, useMemo, useState } from 'react'
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
  requestAddToCase,
  scheduleSave,
  setVisibility,
  shareUrl,
  subscribeCases,
} from './caseStore'
import CanvasBoard from './CanvasBoard'
import TimelineBoard from './TimelineBoard'
import AnalysisPanel from './AnalysisPanel'
import AiPanel from './AiPanel'
import EnrichmentPanel from './EnrichmentPanel'
import './batman.css'

const TABS = [
  { id: 'board', label: 'Board' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'enrich', label: 'Enrichment' },
  { id: 'report', label: 'Report' },
  { id: 'ai', label: 'AI' },
]

function download(filename, text, mime = 'text/plain') {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }))
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

export default function CasesWorkspace() {
  const { user } = useSuperMapAccount()
  const ownerUid = user?.uid || 'local'
  const [cases, setCases] = useState([])
  const [pickedId, setPickedId] = useState(null)
  const [caseDoc, setCaseDoc] = useState(null)
  const [tab, setTab] = useState('board')
  const [selectedId, setSelectedId] = useState(null)
  const [status, setStatus] = useState('')
  const [newTitle, setNewTitle] = useState('')

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
  const nodes = caseDoc?.nodes || []
  const edges = caseDoc?.edges || []
  const byId = new Map(nodes.map((node) => [node.id, node]))

  const patch = (updater, { debounce = false } = {}) => {
    setCaseDoc((prev) => {
      if (!prev) return prev
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

  function addNode(kind) {
    if (!caseDoc) return
    if (nodes.length >= CASE_LIMITS.nodes) {
      setStatus(`A case holds ${CASE_LIMITS.nodes} items.`)
      return
    }
    const node = nodeOf({ kind, title: kindMeta(kind).label })
    patch((prev) => ({ ...prev, nodes: [...(prev.nodes || []), node] }))
    setSelectedId(node.id)
    setTab('board')
  }

  function moveNode(nodeId, position, dragging) {
    patchNode(nodeId, { x: Math.round(position.x), y: Math.round(position.y) }, { debounce: Boolean(dragging) })
  }

  function connectNodes(from, to, type) {
    if (!caseDoc || from === to) return
    if (edges.length >= CASE_LIMITS.edges) {
      setStatus(`A case holds ${CASE_LIMITS.edges} links.`)
      return
    }
    if (edges.some((edge) => edge.from === from && edge.to === to)) return
    const edge = edgeOf({ from, to, type: type || 'related', confidence: 0.6 })
    patch((prev) => ({ ...prev, edges: [...(prev.edges || []), edge] }))
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

  return (
    <>
      <header className="batman-head">
        <div className="batman-title">
          <h2>Cases</h2>
          <p>Build the picture: connect what you found, keep the sources, write the report.</p>
        </div>
        <div className="batman-head-tools">
          <select
            value={pickedId || ''}
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
          <h3>No case open</h3>
          <p>
            A case holds the people, articles, posts, places and tracks around one question, the links
            between them, a timeline and a report. Create one above, or send evidence from anywhere in
            Batman Mode with <b>Add to Batman Mode case</b>.
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
              </div>

              <CanvasBoard
                caseDoc={caseDoc}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onMoveNode={moveNode}
                onConnectNodes={(from, to) => connectNodes(from, to, 'related')}
              />

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
                  {selected.ref?.url ? (
                    <a href={selected.ref.url} target="_blank" rel="noopener noreferrer">Open the source</a>
                  ) : null}
                  <div className="batman-row">
                    <button type="button" className="batman-btn batman-btn-ghost" onClick={() => requestAddToCase(selected)}>
                      Copy to another case
                    </button>
                    <button type="button" className="batman-btn batman-btn-danger" onClick={() => removeNode(selected.id)}>Remove</button>
                  </div>
                  <h4>Links</h4>
                  {edges.filter((edge) => edge.from === selected.id || edge.to === selected.id).length === 0 ? (
                    <p className="batman-hint">No links yet. Drag from a card's dot to another card to make one.</p>
                  ) : null}
                  <ul className="batman-edges">
                    {edges.filter((edge) => edge.from === selected.id || edge.to === selected.id).map((edge) => (
                      <li key={edge.id}>
                        <span>{byId.get(edge.from)?.title || '?'} → {byId.get(edge.to)?.title || '?'}</span>
                        <select value={edge.type} onChange={(event) => patchEdge(edge.id, { type: event.target.value })} aria-label="Link type">
                          {EDGE_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                        </select>
                        <select value={edge.direction} onChange={(event) => patchEdge(edge.id, { direction: event.target.value })} aria-label="Link direction">
                          <option value="directed">Directed</option>
                          <option value="undirected">Undirected</option>
                        </select>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={edge.confidence ?? 0.6}
                          onChange={(event) => patchEdge(edge.id, { confidence: Number(event.target.value) })}
                          aria-label="Link confidence"
                        />
                        <em style={{ color: edgeMeta(edge.type).color }}>{Math.round((edge.confidence || 0) * 100)}%</em>
                        <button type="button" className="batman-btn batman-btn-ghost" onClick={() => removeEdge(edge.id)}>✕</button>
                      </li>
                    ))}
                  </ul>
                </aside>
              ) : null}
            </section>
          ) : null}

          {tab === 'timeline' ? (
            <TimelineBoard
              caseDoc={caseDoc}
              onSelect={(id) => { setSelectedId(id); setTab('board') }}
              onRetime={(id, at) => patchNode(id, { t: at })}
            />
          ) : null}

          {tab === 'analysis' ? (
            <AnalysisPanel
              caseDoc={caseDoc}
              selectedId={selectedId}
              onSelect={(id) => { setSelectedId(id); setTab('board') }}
            />
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

          {tab === 'enrich' ? (
            <EnrichmentPanel
              caseDoc={caseDoc}
              ownerUid={ownerUid}
              onImport={(incoming) => patch((prev) => ({
                ...prev,
                nodes: [...(prev.nodes || []), ...incoming].slice(0, CASE_LIMITS.nodes),
              }))}
            />
          ) : null}

          {tab === 'ai' ? (
            <AiPanel
              caseDoc={caseDoc}
              selectedId={selectedId}
              onSaveNote={(note) => patch((prev) => ({ ...prev, aiNotes: [...(prev.aiNotes || []), note].slice(-20) }))}
            />
          ) : null}
        </>
      )}
    </>
  )
}
