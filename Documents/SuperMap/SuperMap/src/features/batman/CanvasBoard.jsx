/**
 * The case board: React Flow nodes for evidence, typed edges for the links.
 *
 * The case document stays the source of truth — a drag writes x/y back into it
 * and a connection writes a new edge — so the board, the timeline, the map and
 * the report are four views of one object, never four copies.
 */
import { useCallback, useMemo } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
} from '@xyflow/react'
import dagre from 'dagre'
import '@xyflow/react/dist/style.css'
import { EDGE_TYPES, edgeMeta, kindMeta } from './caseModel'
import KindIcon from './kindIcons'

const NODE_WIDTH = 190
const NODE_HEIGHT = 86

function EvidenceNode({ data, selected }) {
  const meta = kindMeta(data.kind)
  return (
    <article className={`batman-rf-card${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="batman-rf-handle" />
      <header>
        <span aria-hidden><KindIcon name={meta.icon} /></span>
        <strong title={data.title}>{data.title}</strong>
      </header>
      <p>{data.subtitle || meta.label}</p>
      {data.note ? <p className="batman-rf-note">{data.note}</p> : null}
      <Handle type="source" position={Position.Right} className="batman-rf-handle" />
    </article>
  )
}

const NODE_TYPES = { evidence: EvidenceNode }

function whenText(ms) {
  const at = Number(ms)
  if (!Number.isFinite(at) || at <= 0) return ''
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function autoLayout(nodes, edges) {
  if (!nodes.length) return nodes
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 90, marginx: 20, marginy: 20 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const node of nodes) graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  for (const edge of edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) graph.setEdge(edge.source, edge.target)
  }
  dagre.layout(graph)
  return nodes.map((node) => {
    const placed = graph.node(node.id)
    if (!placed) return node
    return { ...node, position: { x: placed.x - NODE_WIDTH / 2, y: placed.y - NODE_HEIGHT / 2 } }
  })
}

export default function CanvasBoard({ caseDoc, selectedId, onSelect, onMoveNode, onConnectNodes }) {
  const nodes = useMemo(() => (caseDoc?.nodes || []).map((node, index) => ({
    id: node.id,
    type: 'evidence',
    position: {
      x: Number.isFinite(node.x) ? node.x : 40 + (index % 5) * 230,
      y: Number.isFinite(node.y) ? node.y : 40 + Math.floor(index / 5) * 130,
    },
    data: {
      kind: node.kind,
      title: node.title || 'Untitled',
      subtitle: [node.ref?.source || kindMeta(node.kind).label, whenText(node.t)].filter(Boolean).join(' · '),
      note: node.note,
    },
    selected: node.id === selectedId,
  })), [caseDoc, selectedId])

  const edges = useMemo(() => (caseDoc?.edges || []).map((edge) => {
    const meta = edgeMeta(edge.type)
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: `${meta.label}${Number.isFinite(edge.confidence) ? ` ${Math.round(edge.confidence * 100)}%` : ''}`,
      labelStyle: { fill: meta.color, fontSize: 10 },
      labelBgStyle: { fill: '#060b13', fillOpacity: 0.85 },
      markerEnd: edge.direction === 'directed' ? { type: MarkerType.ArrowClosed, color: meta.color } : undefined,
      style: {
        stroke: meta.color,
        strokeWidth: edge.confidence > 0.75 ? 2.5 : 1.6,
        strokeDasharray: edge.confidence < 0.4 ? '6 6' : undefined,
      },
    }
  }), [caseDoc])

  const onNodesChange = useCallback((changes) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        onMoveNode?.(change.id, change.position, Boolean(change.dragging))
      }
    }
  }, [onMoveNode])

  const onConnect = useCallback((connection) => {
    if (!connection?.source || !connection?.target || connection.source === connection.target) return
    onConnectNodes?.(connection.source, connection.target, 'related')
  }, [onConnectNodes])

  const layout = useCallback(() => {
    const placed = autoLayout(nodes, edges)
    for (const node of placed) onMoveNode?.(node.id, node.position, false)
  }, [nodes, edges, onMoveNode])

  return (
    <div className="batman-canvas">
      <div className="batman-canvas-tools">
        <span className="batman-hint">
          Drag a card to place it · drag from a card&rsquo;s right dot to another&rsquo;s left dot to link them
        </span>
        <button type="button" className="batman-btn batman-btn-ghost" onClick={layout}>Auto-layout</button>
        <select
          aria-label="Link type for new connections"
          value=""
          onChange={() => {}}
          hidden
        >
          {EDGE_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
        </select>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => onSelect?.(node.id)}
        onPaneClick={() => onSelect?.(null)}
        fitView
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#12203a" gap={26} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="#1b2a40" maskColor="rgba(3,7,13,0.75)" />
      </ReactFlow>
    </div>
  )
}
