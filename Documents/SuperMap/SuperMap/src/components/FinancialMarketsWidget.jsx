import { useState, useEffect } from 'react'
import axios from 'axios'
import './FinancialMarketsWidget.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env.DEV ? '' : 'http://localhost:3000')

const SCREENER_LISTS = [
  { value: 'day_gainers', label: 'Day gainers' },
  { value: 'day_losers', label: 'Day losers' },
  { value: 'most_actives', label: 'Most actives' },
]

export default function FinancialMarketsWidget() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [list, setList] = useState('day_gainers')

  useEffect(() => {
    if (!API_BASE) return
    setLoading(true)
    setError(null)
    axios
      .get(`${API_BASE}/api/finance/screener`, { params: { list }, timeout: 15000 })
      .then((res) => {
        if (res.data?.error) {
          setError(res.data.error.includes('subscribed') ? 'Markets data requires a RapidAPI subscription (Yahoo Finance). Subscribe on rapidapi.com or skip this section.' : res.data.error)
          setData(null)
          return
        }
        setData(res.data)
      })
      .catch((err) => {
        const msg = err.response?.data?.error || (err.response?.status === 503 ? 'Set RAPIDAPI_KEY in backend .env' : err.message)
        setError(msg)
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [list])

  const rows = data?.body?.body ?? data?.body ?? (Array.isArray(data) ? data : [])
  const raw = Array.isArray(rows) ? rows : []
  const sorted =
    list === 'day_gainers'
      ? [...raw].sort((a, b) => (Number(b.regularMarketChangePercent) || 0) - (Number(a.regularMarketChangePercent) || 0))
      : list === 'day_losers'
        ? [...raw].sort((a, b) => (Number(a.regularMarketChangePercent) || 0) - (Number(b.regularMarketChangePercent) || 0))
        : raw
  const items = sorted.slice(0, 15)

  function formatPrice(v) {
    if (v == null) return '—'
    const n = Number(v)
    if (Number.isNaN(n)) return String(v)
    if (n >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    if (n >= 1) return n.toFixed(2)
    if (n > 0) return n.toFixed(4)
    return n.toFixed(2)
  }

  function changeCell(pct) {
    if (pct == null) return { text: '—', dir: 0 }
    const n = Number(pct)
    const text = `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
    const dir = n < 0 ? -1 : n > 0 ? 1 : 0
    return { text, dir }
  }

  return (
    <section className="financial-markets-widget">
      <h3 className="financial-markets-title">Markets</h3>
      <div className="financial-markets-toolbar">
        {SCREENER_LISTS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`financial-markets-chip ${list === value ? 'active' : ''}`}
            onClick={() => setList(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {loading && <p className="financial-markets-loading">Loading…</p>}
      {error && (
        <p className="financial-markets-error">
          {error.includes('503') || error.includes('RAPIDAPI') ? 'Markets data unavailable. Add RAPIDAPI_KEY in backend .env to enable.' : error}
        </p>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="financial-markets-table-wrap">
          <table className="financial-markets-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Price</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => {
                const pct = row.regularMarketChangePercent ?? row.changePercent
                const { text: changeText, dir } = changeCell(pct)
                const changeClass = dir < 0 ? 'negative' : dir > 0 ? 'positive' : ''
                return (
                  <tr key={row.symbol || row.ticker || i}>
                    <td className="financial-markets-symbol">{row.symbol || row.ticker || row.code || '—'}</td>
                    <td className="financial-markets-name">{(row.shortName || row.name || row.title || '').slice(0, 24)}</td>
                    <td className="financial-markets-price">${formatPrice(row.regularMarketPrice ?? row.price ?? row.close)}</td>
                    <td className={`financial-markets-change ${changeClass}`}>
                      <span className="financial-markets-change-inner">
                        {dir !== 0 && <span className="financial-markets-arrow" aria-hidden>{dir > 0 ? '↑' : '↓'}</span>}
                        {changeText}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && items.length === 0 && API_BASE && (
        <p className="financial-markets-empty">No data. Add RAPIDAPI_KEY in backend .env for Yahoo Finance.</p>
      )}
    </section>
  )
}
