import { useEffect, useState } from 'react'
import WidgetCard from './WidgetCard'
import { loadStrategic } from '../../services/strategicLayers'

function countdown(ms) {
  if (!Number.isFinite(ms)) return '—'
  const delta = ms - Date.now()
  if (delta <= 0) return 'now'
  const minutes = Math.floor(delta / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days >= 1) return `${days}d ${hours % 24}h`
  if (hours >= 1) return `${hours}h ${minutes % 60}m`
  return `${Math.max(1, minutes)}m`
}

/** The next orbital launches, from the collector's snapshot. */
export default function NextLaunchWidget({ initialData, bootstrapState }) {
  const waking = bootstrapState === 'waking'
  const [launches, setLaunches] = useState(() => (Array.isArray(initialData?.launches) ? initialData.launches : []))
  const [loading, setLoading] = useState(() => !(initialData?.launches?.length))
  const [error, setError] = useState(null)

  useEffect(() => {
    if (Array.isArray(initialData?.launches) && initialData.launches.length) {
      setLaunches(initialData.launches)
      setLoading(false)
      setError(null)
      return
    }
    if (initialData !== undefined && initialData !== null) {
      setLoading(false)
      return
    }
    let cancelled = false
    loadStrategic('launches')
      .then((data) => {
        if (cancelled || !data) return
        if (Array.isArray(data.launches)) {
          setLaunches(data.launches)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [initialData])

  const next = launches.slice(0, 3)

  return (
    <WidgetCard
      title="Next launches"
      loading={loading}
      error={error || (waking && !next.length ? 'Waking the API — retrying…' : null)}
      updatedAt={next.length ? 'every 2 hours' : null}
    >
      {next.length ? (
        <ul className="widget-outage-list">
          {next.map((launch, index) => (
            <li key={launch.id || `${launch.name}-${index}`} className="widget-outage-item">
              <span className="widget-outage-name">{launch.name}</span>
              <span className="widget-outage-meta">
                {countdown(launch.netMs)} · {launch.provider || '—'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="widget-outage-empty">No upcoming launches in the snapshot yet.</p>
      )}
    </WidgetCard>
  )
}
