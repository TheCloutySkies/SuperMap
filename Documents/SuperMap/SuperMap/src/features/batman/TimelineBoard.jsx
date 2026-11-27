/**
 * The same case as time: vis-timeline across every dated item, grouped by kind.
 * Moving an item re-times it, which writes straight back into the case.
 */
import { useEffect, useMemo, useRef } from 'react'
import { Timeline } from 'vis-timeline/standalone'
import 'vis-timeline/styles/vis-timeline-graph2d.css'
import { NODE_KINDS } from './caseModel'

export default function TimelineBoard({ caseDoc, onRetime, onSelect }) {
  const holder = useRef(null)
  const timeline = useRef(null)

  const groups = useMemo(() => NODE_KINDS
    .filter((kind) => (caseDoc?.nodes || []).some((node) => node.kind === kind.id && Number.isFinite(node.t)))
    .map((kind) => ({ id: kind.id, content: `${kind.icon} ${kind.label}` })), [caseDoc])

  const items = useMemo(() => (caseDoc?.nodes || [])
    .filter((node) => Number.isFinite(node.t))
    .map((node) => ({
      id: node.id,
      group: node.kind,
      content: node.title,
      start: new Date(node.t),
      title: [node.ref?.source, node.note].filter(Boolean).join(' · '),
    })), [caseDoc])

  useEffect(() => {
    if (!holder.current) return undefined
    if (!timeline.current) {
      timeline.current = new Timeline(holder.current, [], { stack: true, zoomMin: 3600000 })
      timeline.current.on('select', (event) => {
        const id = event.items?.[0]
        if (id) onSelect?.(id)
      })
      timeline.current.on('move', (item, callback) => {
        const at = item.start ? new Date(item.start).getTime() : null
        if (Number.isFinite(at)) onRetime?.(item.id, at)
        callback(item)
      })
    }
    return undefined
  }, [onRetime, onSelect])

  useEffect(() => {
    if (!timeline.current) return
    timeline.current.setGroups(groups)
    timeline.current.setItems(items)
    if (items.length) {
      const first = items[0].start.getTime()
      const last = items[items.length - 1].start.getTime()
      timeline.current.setWindow(new Date(first - 86400000), new Date(last + 86400000))
    }
  }, [groups, items])

  if (!items.length) {
    return <p className="batman-hint">No dated items yet. Set “When” on an item and it appears on this line.</p>
  }

  return <div className="batman-timeline-holder" ref={holder} />
}
