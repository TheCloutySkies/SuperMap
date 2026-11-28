/**
 * Tab order that survives a reload. Each surface keeps its own key, and an
 * unknown or missing order falls back to the declared tabs.
 */
import { useCallback, useEffect, useState } from 'react'

const PREFIX = 'supermap.xp.tabs.'

function read(key, defaults) {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFIX + key) || 'null')
    if (!Array.isArray(stored)) return defaults
    const known = stored.filter((tab) => defaults.includes(tab))
    return [...known, ...defaults.filter((tab) => !known.includes(tab))]
  } catch {
    return defaults
  }
}

export default function useTabOrder(key, defaults) {
  const [order, setOrder] = useState(() => read(key, defaults))
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(order))
    } catch { /* private mode */ }
  }, [key, order])

  const reorder = useCallback((from, to) => {
    setOrder((prev) => {
      if (from === to || from < 0 || to < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  return [order, reorder]
}
