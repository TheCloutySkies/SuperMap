import { useEffect, useState } from 'react'
import WidgetCard from './WidgetCard'
import { loadStrategic } from '../../services/strategicLayers'

/** Four numbers that say what changed in the last week, from the snapshot. */
export default function StrategicOverviewWidget({ initialData, bootstrapState }) {
  const waking = bootstrapState === 'waking'
  const [data, setData] = useState(() => initialData || null)
  const [loading, setLoading] = useState(() => !initialData)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (initialData) {
      setData(initialData)
      setLoading(false)
      return
    }
    if (initialData !== undefined && initialData !== null) {
      setLoading(false)
      return
    }
    let cancelled = false
    Promise.all([
      loadStrategic('ucdp').catch(() => null),
      loadStrategic('warspotting').catch(() => null),
      loadStrategic('kev').catch(() => null),
      loadStrategic('balloons').catch(() => null),
    ])
      .then(([ucdp, warspotting, kev, balloons]) => {
        if (cancelled) return
        setData({
          ucdpEvents: ucdp?.totals?.events ?? null,
          ucdpDeaths: ucdp?.totals?.deaths ?? null,
          losses: warspotting?.totals?.rows ?? null,
          kev: kev?.count ?? null,
          balloons: balloons?.features?.length ?? null,
        })
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [initialData])

  const rows = data
    ? [
      ['Conflict events (30d)', data.ucdpEvents],
      ['Reported deaths', data.ucdpDeaths],
      ['Equipment losses', data.losses],
      ['Exploited CVEs', data.kev],
      ['Radiosondes', data.balloons],
    ].filter(([, value]) => value != null)
    : []

  return (
    <WidgetCard
      title="Strategic overview"
      loading={loading}
      error={error || (waking && !rows.length ? 'Waking the API — retrying…' : null)}
      updatedAt={rows.length ? 'every 2 hours' : null}
    >
      {rows.length ? (
        <ul className="widget-outage-list">
          {rows.map(([label, value]) => (
            <li key={label} className="widget-outage-item">
              <span className="widget-outage-name">{label}</span>
              <span className="widget-outage-meta">{Number(value).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="widget-outage-empty">Nothing published for the strategic desk yet.</p>
      )}
    </WidgetCard>
  )
}
