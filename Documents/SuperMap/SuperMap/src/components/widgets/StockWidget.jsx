import { useState, useEffect } from 'react'
import axios from 'axios'
import WidgetCard from './WidgetCard'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

export default function StockWidget({ onOpenSettings }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  const fetchStocks = (refresh = false) => {
    setLoading(true)
    setError(null)
    const url = refresh ? `${API_BASE}/api/stocks?refresh=1` : `${API_BASE}/api/stocks`
    axios.get(url, { timeout: 15000 })
      .then((res) => {
        if (res.data) {
          setData(res.data)
          setUpdatedAt(res.data.updatedAt || new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }))
        }
      })
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchStocks(false)
  }, [])

  const tickers = (data?.current && data.current.length > 0)
    ? data.current.map((t, i) => {
        const vals = data.series?.[i]?.values
        const hasDashes = t.value === '—' || t.value === undefined || t.value === null
        if (hasDashes && Array.isArray(vals) && vals.length > 0) {
          const v = vals[vals.length - 1]
          const prev = vals[vals.length - 2]
          const change = (v != null && prev != null && prev !== 0) ? (((v - prev) / prev) * 100).toFixed(2) + '%' : (v != null ? '0.00%' : '—')
          return { symbol: t.symbol, name: data.series?.[i]?.name || t.symbol, value: v != null ? Number(v).toFixed(2) : '—', change }
        }
        return { symbol: t.symbol, name: data.series?.[i]?.name || t.symbol, value: t.value ?? '—', change: t.change ?? '—' }
      })
    : []

  return (
    <WidgetCard title="Stocks & markets" loading={loading} error={error} updatedAt={updatedAt}>
      <p className="widget-stock-settings-hint">
        {onOpenSettings && (
          <button type="button" className="widget-stock-settings-btn" onClick={onOpenSettings}>
            Set your tickers
          </button>
        )}
        <button type="button" className="widget-stock-settings-btn" onClick={() => fetchStocks(true)} disabled={loading} title="Refresh prices">
          {loading ? '…' : 'Refresh'}
        </button>
      </p>
      {tickers.length > 0 && (
        <ul className="widget-stock-tickers">
          {tickers.map((t) => (
            <li key={t.symbol}>
              <span className="widget-stock-symbol">{t.name || t.symbol}</span>
              <span className="widget-stock-value">{t.value}</span>
              <span className={`widget-stock-change ${(t.change || '').startsWith('-') ? 'negative' : 'positive'}`}>
                {t.change}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}
