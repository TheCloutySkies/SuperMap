/** Reusable operations-panel chrome: index number, title, meta and corner ticks. */
import { ArrowUpRight, GripVertical } from 'lucide-react'
import './operations.css'

export default function Panel({
  index, title, meta, openLabel = 'Open',
  onOpen, children, area, className = '', flush = false,
  refreshing = false, style,
  panelId, onDragHandle, onResize, maxHeight, floating,
}) {
  const head = (
    <>
      {index ? <span className="op-panel-index">{String(index).padStart(2, '0')}</span> : null}
      <h2 className="op-panel-title">{title}</h2>
      {meta ? <span className="op-panel-meta">{meta}</span> : null}
      {onOpen ? <span className="op-panel-open">{openLabel} <ArrowUpRight size={12} strokeWidth={1.5} aria-hidden /></span> : null}
    </>
  )
  const floatingStyle = floating
    ? {
      position: 'fixed',
      left: `${floating.left}px`,
      top: `${floating.top}px`,
      width: `${floating.width}px`,
      height: floating.height ? `${floating.height}px` : undefined,
      zIndex: 60,
      margin: 0,
    }
    : null

  return (
    <section
      data-panel-id={panelId}
      className={`op-panel${refreshing ? ' is-refreshing' : ''}${floating ? ' is-dragging' : ''}${floating?.landing ? ' is-landing' : ''} ${className}`}
      style={{ gridArea: area ? `${area}` : undefined, maxHeight: maxHeight ? `${maxHeight}px` : undefined, ...floatingStyle, ...style }}
    >
      {onOpen ? (
        <button type="button" className="op-panel-head is-link" onClick={onOpen} aria-label={`Open ${title}`}>
          {head}
        </button>
      ) : (
        <header className="op-panel-head">{head}</header>
      )}
      <div className={`op-panel-body${flush ? ' is-flush' : ''}`}>{children}</div>
      {onDragHandle ? (
        <span className="op-panel-grip" onPointerDown={onDragHandle} aria-hidden>
          <GripVertical size={12} strokeWidth={1.5} />
        </span>
      ) : null}
      {onResize ? (
        <span
          className="op-panel-resize"
          onPointerDown={onResize}
          role="separator"
          aria-label="Resize panel"
        />
      ) : null}
    </section>
  )
}

export function Skeleton({ rows = 3, label = 'Loading' }) {
  return (
    <div className="op-skeleton" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => <i key={i} />)}
    </div>
  )
}

export function Status({ state, label }) {
  const kind = state === 'live' ? 'is-live' : state === 'error' ? 'is-error' : state === 'stale' ? 'is-stale' : ''
  return <span className={`op-status ${kind}`}>{label || state}</span>
}
