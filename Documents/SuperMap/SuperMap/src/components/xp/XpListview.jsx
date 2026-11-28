/**
 * XP details view: sortable header, dense rows, keyboard navigation, one
 * selection. The app's tables use it so a list reads as a Windows list.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

export default function XpListview({
  columns = [], rows = [], rowKey = (row, i) => row.id || String(i),
  selectedId, onSelect, onOpen, emptyLabel = 'Nothing to show', label = 'List', sortable = true,
}) {
  const [sort, setSort] = useState({ field: columns[0]?.key, dir: 'asc' })
  const bodyRef = useRef(null)

  const sorted = useMemo(() => {
    const list = rows.slice()
    if (!sortable || !sort.field) return list
    list.sort((a, b) => {
      const av = a[sort.field]
      const bv = b[sort.field]
      const result = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av ?? '').localeCompare(String(bv ?? ''))
      return sort.dir === 'asc' ? result : -result
    })
    return list
  }, [rows, sort, sortable])

  useEffect(() => {
    if (!selectedId || !bodyRef.current) return
    const node = bodyRef.current.querySelector(`[data-row-id="${CSS.escape(String(selectedId))}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const move = (step) => {
    if (!sorted.length) return
    const index = sorted.findIndex((row) => rowKey(row) === selectedId)
    const next = Math.min(sorted.length - 1, Math.max(0, (index < 0 ? -1 : index) + step))
    onSelect?.(sorted[next], rowKey(sorted[next]))
  }

  return (
    <div className="xp-listview" role="grid" aria-label={label}>
      <div className="xp-listview-head" role="row">
        {columns.map((column) => (
          <button
            key={column.key}
            type="button"
            role="columnheader"
            className={sort.field === column.key ? 'is-sorted' : ''}
            style={column.width ? { flex: `0 0 ${column.width}` } : undefined}
            aria-sort={sortable && sort.field === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            disabled={!sortable}
            onClick={() => setSort((prev) => ({
              field: column.key,
              dir: prev.field === column.key && prev.dir === 'asc' ? 'desc' : 'asc',
            }))}
          >
            {column.label}
            {sortable && sort.field === column.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
          </button>
        ))}
      </div>
      <div
        className="xp-listview-scroll"
        ref={bodyRef}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); move(1) }
          if (event.key === 'ArrowUp') { event.preventDefault(); move(-1) }
          if (event.key === 'Home') { event.preventDefault(); onSelect?.(sorted[0], rowKey(sorted[0])) }
          if (event.key === 'End') {
            event.preventDefault()
            const last = sorted[sorted.length - 1]
            onSelect?.(last, rowKey(last))
          }
          if (event.key === 'Enter' && selectedId != null) {
            const row = sorted.find((entry) => rowKey(entry) === selectedId)
            if (row) onOpen?.(row)
          }
        }}
      >
        {sorted.length === 0 ? <p className="xp-listview-empty">{emptyLabel}</p> : null}
        {sorted.map((row, index) => {
          const id = rowKey(row, index)
          return (
            <div
              key={id}
              data-row-id={String(id)}
              role="row"
              aria-selected={id === selectedId}
              className={`xp-listview-row${id === selectedId ? ' is-selected' : ''}`}
              onClick={() => onSelect?.(row, id)}
              onDoubleClick={() => onOpen?.(row)}
            >
              {columns.map((column) => (
                <span
                  key={column.key}
                  role="gridcell"
                  className={column.mono ? 'is-mono' : ''}
                  style={column.width ? { flex: `0 0 ${column.width}` } : undefined}
                >
                  {column.render ? column.render(row) : row[column.key]}
                </span>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
