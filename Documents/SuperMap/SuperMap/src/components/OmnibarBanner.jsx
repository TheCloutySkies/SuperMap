import { useState, useEffect, useMemo, useRef } from 'react'
import './OmnibarBanner.css'

const FALLBACK_ITEMS = [
  'OSINT • SuperMap — Open-source intel & tactical dashboard',
  'Track events, news, and layers on the map',
  'Use the footer to switch HOME, MAPS, FEEDS, COMMUNITY, RESOURCES, SETTINGS',
  'Search the map and feeds from the bar above',
  'Drawing & targeting tools available on the map when Layers → AOI Draw is on',
]

const SCROLL_DURATION_BASE_MS = 20000
const MIN_DURATION_MS = 12000

export default function OmnibarBanner({ headlines = [] }) {
  const items = useMemo(() => {
    const list = Array.isArray(headlines) && headlines.length > 0
      ? headlines.filter(Boolean).slice(0, 30)
      : FALLBACK_ITEMS
    return list.length ? list : FALLBACK_ITEMS
  }, [headlines])

  const [index, setIndex] = useState(0)
  const current = items[index % items.length]
  const durationMs = useMemo(() => {
    const len = String(current).length
    return Math.max(MIN_DURATION_MS, Math.min(40000, SCROLL_DURATION_BASE_MS + len * 80))
  }, [current])
  const innerRef = useRef(null)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const onEnd = () => setIndex((i) => i + 1)
    el.addEventListener('animationend', onEnd)
    return () => el.removeEventListener('animationend', onEnd)
  }, [index])

  return (
    <div className="omnibar-banner" aria-live="polite" aria-label="Headline">
      <div className="omnibar-banner-scroll">
        <div
          key={index}
          ref={innerRef}
          className="omnibar-banner-scroll-inner"
          style={{ animationDuration: `${durationMs}ms` }}
        >
          <span className="omnibar-banner-text">{current}</span>
          <span className="omnibar-banner-text" aria-hidden>{current}</span>
        </div>
      </div>
    </div>
  )
}
