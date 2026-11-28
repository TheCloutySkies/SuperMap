/** Full gas-price readout, driven by the same /api/home payload the old home used. */
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { getApiBase } from '../../lib/homeBootstrap'
import { Skeleton } from './Panel'

function fuelSlice(gas, fuel) {
  if (!gas) return null
  const nested = fuel === 'diesel' ? gas.diesel : gas.gasoline
  if (nested && typeof nested === 'object') return { ...nested, unit: gas.unit || nested.unit || 'USD/gal' }
  if (fuel === 'diesel') return null
  return gas
}

export default function GasPrices({ gas, states = [], onRefresh }) {
  const [fuel, setFuel] = useState('gasoline')
  const [state, setState] = useState('')
  const [local, setLocal] = useState(gas)
  const [loading, setLoading] = useState(false)
  useEffect(() => setLocal(gas), [gas])

  const refresh = async () => {
    const url = new URL(`${getApiBase()}/api/gas-prices`)
    if (state) url.searchParams.set('state', state)
    url.searchParams.set('refresh', '1')
    setLoading(true)
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
      setLocal(await res.json())
    } catch { /* keep last-good */ } finally { setLoading(false) }
    onRefresh?.()
  }
  useEffect(() => {
    if (!state) return
    let cancelled = false
    const url = new URL(`${getApiBase()}/api/gas-prices`)
    url.searchParams.set('state', state)
    setLoading(true)
    fetch(url, { signal: AbortSignal.timeout(20000) })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setLocal(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [state])

  const active = fuelSlice(local, fuel)
  const unavailable = !local || local.gasUnavailable || local.ok === false
  const national = active?.states?.[0]?.price ?? active?.national
  const label = active?.states?.[0]?.name || 'US average'

  return (
    <div className="op-gas-detail">
      <div className="op-gas-controls">
        <div className="op-tabs" role="tablist">
          {['gasoline', 'diesel'].map((value) => (
            <button key={value} type="button" role="tab" aria-selected={fuel === value} className={fuel === value ? 'is-on' : ''} onClick={() => setFuel(value)}>{value}</button>
          ))}
        </div>
        {states.length ? (
          <select value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
            <option value="">All regions</option>
            {states.map((row) => <option key={row.code} value={row.code}>{row.name}</option>)}
          </select>
        ) : null}
        <button type="button" className="op-btn" onClick={refresh} disabled={loading} aria-label="Refresh gas prices"><RefreshCw size={12} strokeWidth={1.5} /></button>
      </div>
      {loading && !national ? <Skeleton rows={3} /> : null}
      {unavailable ? (
        <p className="op-muted">{local?.error || 'Live EIA prices are unavailable. No estimate shown.'}</p>
      ) : national == null ? (
        <p className="op-muted">No price rows in the EIA response.</p>
      ) : (
        <>
          <div className="op-stat-row">
            <div>
              <span className="op-stat-label">{label}</span>
              <strong className="op-num op-stat-value">${Number(national).toFixed(2)}</strong>
              <span className="op-faint">{active.unit || 'USD/gal'}</span>
            </div>
            {active.national != null && active.states?.[0]?.price != null ? (
              <div>
                <span className="op-stat-label">US average</span>
                <strong className="op-num op-stat-value">${Number(active.national).toFixed(2)}</strong>
              </div>
            ) : null}
          </div>
          {active.states?.[0]?.useRegionalFallback ? <p className="op-faint">No state series published; showing {active.states[0].regionLabel || 'regional'} (PADD) average.</p> : null}
          {Array.isArray(active.extremes) && active.extremes[0] && active.extremes[1] && !state ? (
            <div className="op-gas-extremes">
              <span>Highest <b className="op-num">{active.extremes[0].name} ${Number(active.extremes[0].price).toFixed(2)}</b></span>
              <span>Lowest <b className="op-num">{active.extremes[1].name} ${Number(active.extremes[1].price).toFixed(2)}</b></span>
            </div>
          ) : active.extremes?.highest && !state ? (
            <div className="op-gas-extremes">
              <span>Highest <b className="op-num">{active.extremes.highest.name} ${Number(active.extremes.highest.price).toFixed(2)}</b></span>
              <span>Lowest <b className="op-num">{active.extremes.lowest.name} ${Number(active.extremes.lowest.price).toFixed(2)}</b></span>
            </div>
          ) : null}
          {Array.isArray(active.regions) && active.regions.length && !state ? (
            <ul className="op-gas-regions">
              {active.regions.slice(0, 12).map((row) => <li key={row.name}><span>{row.name}</span><b className="op-num">${Number(row.price).toFixed(2)}</b></li>)}
            </ul>
          ) : null}
          {(local.asOf || local.weekEnding || local.releaseDate || local.sourceLabel) ? (
            <p className="op-faint">
              {local.sourceLabel || 'EIA'}
              {local.asOf || local.weekEnding ? ` · week ending ${local.asOf || local.weekEnding}` : ''}
              {local.releaseDate ? ` · released ${local.releaseDate}` : ''}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
