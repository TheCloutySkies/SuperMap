/**
 * Tabs inside a panel that can be dragged into a new order.
 *
 * Native drag events keep this small: a tab is picked up, another tab accepts
 * the drop, and the order is handed back to whoever owns it (persisted there).
 */
import { useState } from 'react'

export default function DraggableTabs({ tabs, active, onChange, onReorder, label = 'Tabs' }) {
  const [from, setFrom] = useState(null)
  const [over, setOver] = useState(null)

  return (
    <div className="op-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab}
          type="button"
          role="tab"
          draggable
          aria-selected={active === tab}
          className={`${active === tab ? 'is-on' : ''}${over === index && from != null && from !== index ? ' is-drop' : ''}`}
          onClick={() => onChange(tab)}
          onDragStart={(event) => {
            setFrom(index)
            event.dataTransfer?.setData('text/plain', tab)
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setOver(index)
          }}
          onDragLeave={() => setOver((current) => (current === index ? null : current))}
          onDrop={(event) => {
            event.preventDefault()
            if (from != null && from !== index) onReorder?.(from, index)
            setFrom(null)
            setOver(null)
          }}
          onDragEnd={() => { setFrom(null); setOver(null) }}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
