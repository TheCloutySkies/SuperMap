import { useState, useEffect } from 'react'
import axios from 'axios'
import WidgetCard from './WidgetCard'
import EChartWidget from './EChartWidget'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

export default function ConflictMetricsWidget() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    let cancelled = false
    axios.get(`${API_BASE}/api/conflict-metrics`, { timeout: 10000 })
      .then((res) => {
        if (!cancelled && res.data) {
          setData(res.data)
          setUpdatedAt(res.data.updatedAt || new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }))
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const option = data?.byType?.length
    ? {
        tooltip: { trigger: 'axis' },
        grid: { left: 44, right: 12, top: 8, bottom: 32 },
        xAxis: { type: 'category', data: data.byType.map((t) => t.type || t.name), axisLabel: { rotate: 25 } },
        yAxis: { type: 'value', name: 'Events' },
        series: [{ type: 'bar', data: data.byType.map((t) => t.count), itemStyle: { color: 'var(--y2k-accent)' } }],
      }
    : data?.byRegion?.length
      ? {
          tooltip: { trigger: 'axis' },
          grid: { left: 44, right: 12, top: 8, bottom: 32 },
          xAxis: { type: 'category', data: data.byRegion.map((r) => r.region || r.name), axisLabel: { rotate: 25 } },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: data.byRegion.map((r) => r.count), itemStyle: { color: 'var(--y2k-accent)' } }],
        }
      : null

  return (
    <WidgetCard title="Conflict & intel metrics" loading={loading} error={error} updatedAt={updatedAt}>
      {data?.totals && (
        <div className="widget-conflict-totals">
          <span>Events (24h): {data.totals.events ?? '—'}</span>
          {data.totals.cyber != null && <span>Cyber: {data.totals.cyber}</span>}
          {data.totals.military != null && <span>Military: {data.totals.military}</span>}
        </div>
      )}
      {data?.headlines && data.headlines.length > 0 && (
        <ul className="widget-conflict-headlines">
          {data.headlines.map((h, i) => (
            <li key={i} className="widget-conflict-headline">{h}</li>
          ))}
        </ul>
      )}
      {option && <EChartWidget option={option} height="160px" />}
      {!loading && !error && data && !option && (!data.totals || data.totals.events === 0) && (
        <p className="widget-outage-empty">No conflict metrics. Ingest events via feeds to populate.</p>
      )}
    </WidgetCard>
  )
}
