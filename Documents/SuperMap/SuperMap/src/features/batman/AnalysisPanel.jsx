/**
 * What the board is shaped like: the busiest items, the communities they fall
 * into, and the shortest chain between two selected items. graphology does the
 * maths on the client; the case document is unchanged.
 */
import { useMemo, useState } from 'react'
import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import betweenness from 'graphology-metrics/centrality/betweenness.js'
import { bidirectional } from 'graphology-shortest-path'
import { kindMeta } from './caseModel'

export default function AnalysisPanel({ caseDoc, selectedId, onSelect }) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')

  const graph = useMemo(() => {
    const g = new Graph({ multi: false, type: 'undirected' })
    for (const node of caseDoc?.nodes || []) g.addNode(node.id)
    for (const edge of caseDoc?.edges || []) {
      if (!g.hasNode(edge.from) || !g.hasNode(edge.to)) continue
      if (edge.from === edge.to) continue
      if (!g.hasEdge(edge.from, edge.to)) g.addEdge(edge.from, edge.to)
    }
    return g
  }, [caseDoc])

  const analysis = useMemo(() => {
    if (graph.order < 2) return { key: [], communities: [], degrees: new Map() }
    let centrality = {}
    try {
      centrality = betweenness(graph)
    } catch {
      centrality = {}
    }
    const degree = new Map()
    graph.forEachNode((id) => degree.set(id, graph.degree(id)))
    const key = [...degree.entries()]
      .sort((a, b) => (centrality[b[0]] || 0) - (centrality[a[0]] || 0) || b[1] - a[1])
      .slice(0, 8)
      .map(([id, deg]) => ({ id, degree: deg, betweenness: centrality[id] || 0 }))
    let communities = []
    try {
      const found = louvain(graph)
      const byCommunity = new Map()
      for (const [id, group] of Object.entries(found)) {
        const list = byCommunity.get(group) || []
        list.push(id)
        byCommunity.set(group, list)
      }
      communities = [...byCommunity.entries()]
        .filter(([, list]) => list.length > 1)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 6)
    } catch {
      communities = []
    }
    return { key, communities, degrees: degree }
  }, [graph])

  const path = useMemo(() => {
    if (!fromId || !toId || fromId === toId || !graph.hasNode(fromId) || !graph.hasNode(toId)) return null
    try {
      return bidirectional(graph, fromId, toId)
    } catch {
      return null
    }
  }, [graph, fromId, toId])

  const byId = new Map((caseDoc?.nodes || []).map((node) => [node.id, node]))

  if (graph.order < 2) {
    return <p className="batman-hint">Add two items and link them, and this panel shows what holds the case together.</p>
  }

  return (
    <section className="batman-analysis">
      <h3>Key items</h3>
      <ol>
        {analysis.key.map((row) => (
          <li key={row.id}>
            <button type="button" onClick={() => onSelect?.(row.id)}>
              {kindMeta(byId.get(row.id)?.kind).icon} {byId.get(row.id)?.title || row.id}
            </button>
            <em>{row.degree} links · betweenness {row.betweenness.toFixed(2)}</em>
          </li>
        ))}
      </ol>

      <h3>Communities</h3>
      {analysis.communities.length === 0 ? (
        <p className="batman-hint">No community separates yet — every item is chained to the rest.</p>
      ) : (
        <ul>
          {analysis.communities.map(([group, list]) => (
            <li key={group}>
              <strong>{list.length} items</strong>
              <span>{list.slice(0, 6).map((id) => byId.get(id)?.title).filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}

      <h3>Path between two items</h3>
      <div className="batman-row">
        <select value={fromId} onChange={(event) => setFromId(event.target.value)} aria-label="Path from">
          <option value="">From…</option>
          {(caseDoc?.nodes || []).map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}
        </select>
        <select value={toId} onChange={(event) => setToId(event.target.value)} aria-label="Path to">
          <option value="">To…</option>
          {(caseDoc?.nodes || []).map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}
        </select>
      </div>
      {fromId && toId ? (
        path ? (
          <p className="batman-path">
            {path.map((id) => byId.get(id)?.title || id).join(' → ')}
          </p>
        ) : (
          <p className="batman-hint">No chain joins those two yet.</p>
        )
      ) : null}
      {selectedId ? <p className="batman-hint">Selected: {byId.get(selectedId)?.title}</p> : null}
    </section>
  )
}
