/**
 * Tray balloons. The account store still calls `showToast`; this renders those
 * messages as XP balloons anchored to the tray, stacking up to three.
 */
import { useEffect, useRef, useState } from 'react'

const LIFETIME_MS = 6000
const MAX = 3

export default function XpBalloon({ toast, onClose }) {
  const [items, setItems] = useState([])
  const seen = useRef(null)
  const timers = useRef(new Map())

  useEffect(() => {
    if (!toast?.id || toast.id === seen.current) return
    seen.current = toast.id
    // Queued out of the effect body so a render never cascades into another.
    queueMicrotask(() => setItems((prev) => [...prev, toast].slice(-MAX)))
    const timer = setTimeout(() => {
      setItems((prev) => prev.filter((row) => row.id !== toast.id))
      timers.current.delete(toast.id)
      onClose?.()
    }, LIFETIME_MS)
    timers.current.set(toast.id, timer)
  }, [toast, onClose])

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer)
    timers.current.clear()
  }, [])

  if (!items.length) return null

  return (
    <div className="xp-balloons" role="status" aria-live="polite">
      {items.map((row) => (
        <div key={row.id} className={`xp-balloon is-${row.tone || 'info'}`}>
          <div className="xp-balloon-title">{row.tone === 'danger' ? 'Something went wrong' : row.tone === 'success' ? 'Done' : 'Good Palantir'}</div>
          <p>{row.message}</p>
          <button
            type="button"
            className="xp-balloon-close"
            aria-label="Dismiss"
            onClick={() => {
              setItems((prev) => prev.filter((entry) => entry.id !== row.id))
              const timer = timers.current.get(row.id)
              if (timer) clearTimeout(timer)
              timers.current.delete(row.id)
              onClose?.()
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
