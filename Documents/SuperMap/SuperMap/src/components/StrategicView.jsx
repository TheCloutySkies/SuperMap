/**
 * Strategic desk: what the collectors published, in one place.
 *
 * Every panel reads the shared snapshot (then the API's cache-first route), so
 * opening this page never waits on an upstream and never depends on who is looking.
 */
import { useEffect, useState } from 'react'
import { loadStrategicDesk } from '../services/strategicLayers'
import DataFreshness from './DataFreshness'
import './StrategicView.css'

const SAT_GROUPS = ['stations', 'military', 'gps-ops', 'weather', 'resource']

function when(iso) {
  if (!iso) return '—'
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return iso
  return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function shortDate(value) {
  if (!value) return '—'
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return value
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Empty({ children }) {
  return <p className="strategic-empty">{children}</p>
}

function Panel({ title, hint, children }) {
  return (
    <section className="strategic-panel card-y2k">
      <header className="strategic-panel-head">
        <h2 className="strategic-panel-title">{title}</h2>
        {hint && <span className="strategic-panel-hint">{hint}</span>}
      </header>
      <div className="strategic-panel-body">{children}</div>
    </section>
  )
}

export default function StrategicView() {
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      loadStrategicDesk()
        .then((next) => {
          if (!cancelled) setData(next)
        })
        .catch(() => { /* the desk shows what it has */ })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    load()
    const timer = setInterval(load, 30 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const ucdp = data.ucdp
  const warspotting = data.warspotting
  const launches = data.launches
  const satellites = data.satellites
  const briefs = data.briefs
  const censorship = data.censorship
  const kev = data.kev
  const ransomware = data.ransomware
  const radiation = data.radiation
  const balloons = data.balloons

  const satelliteGroups = satellites?.groups || {}
  const balloonTypes = balloons?.totals?.byType || []

  return (
    <div className="strategic-view">
      <header className="strategic-head">
        <div>
          <p className="strategic-eyebrow">Good Palantir</p>
          <h1 className="strategic-title">Strategic</h1>
          <p className="strategic-sub">Conflict, orbital, cyber and infrastructure from the shared snapshot.</p>
        </div>
        <DataFreshness className="strategic-freshness" />
      </header>

      {loading && Object.keys(data).length === 0 ? (
        <p className="strategic-loading">Loading the published snapshot…</p>
      ) : null}

      <div className="strategic-grid">
        <Panel title="Conflict events" hint={ucdp?.window ? `UCDP GED ${ucdp.window.version}` : 'UCDP GED'}>
          {ucdp?.totals ? (
            <>
              <div className="strategic-stats">
                <span><b>{ucdp.totals.events}</b> events</span>
                <span><b>{ucdp.totals.deaths}</b> deaths</span>
                <span><b>{ucdp.totals.mapped}</b> mapped</span>
              </div>
              <ul className="strategic-list">
                {(ucdp.totals.byCountry || []).slice(0, 6).map((row) => (
                  <li key={row.country}><span>{row.country}</span><b>{row.count}</b></li>
                ))}
              </ul>
              {(ucdp.recent || []).slice(0, 5).map((row, index) => (
                <p key={`${row.country}-${index}`} className="strategic-row">
                  <span className="strategic-row-strong">{row.sideA || '—'} vs {row.sideB || '—'}</span>
                  <span className="strategic-row-meta">{row.country} · {row.deaths} deaths · {shortDate(row.date)}</span>
                </p>
              ))}
            </>
          ) : (
            <Empty>UCDP needs a free access token (UCDP_ACCESS_TOKEN); until then this panel keeps its last-good.</Empty>
          )}
        </Panel>

        <Panel title="Equipment losses" hint="WarSpotting">
          {warspotting?.totals ? (
            <>
              <div className="strategic-stats">
                <span><b>{warspotting.totals.rows}</b> losses</span>
                <span><b>{warspotting.totals.mapped}</b> mapped</span>
                {warspotting.totals.topType ? <span><b>{warspotting.totals.topType.count}</b> {warspotting.totals.topType.type}</span> : null}
              </div>
              {(warspotting.recent || []).slice(0, 6).map((row, index) => (
                <p key={`${row.id}-${index}`} className="strategic-row">
                  <span className="strategic-row-strong">{row.model || row.type}</span>
                  <span className="strategic-row-meta">{row.status} · {row.place || '—'} · {shortDate(row.date)}</span>
                </p>
              ))}
            </>
          ) : (
            <Empty>No losses published yet.</Empty>
          )}
        </Panel>

        <Panel title="Daily assessments" hint="ISW / Critical Threats">
          {briefs?.items?.length ? (
            <ul className="strategic-links">
              {briefs.items.slice(0, 6).map((item) => (
                <li key={item.link || item.title}>
                  <a href={item.link} target="_blank" rel="noopener noreferrer">{item.title}</a>
                  <span className="strategic-row-meta">{item.source || 'Google News'} · {shortDate(item.published)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No assessments in the snapshot yet.</Empty>
          )}
        </Panel>

        <Panel title="Orbital" hint="CelesTrak · Launch Library">
          {launches?.launches?.length ? (
            <ul className="strategic-links">
              {launches.launches.slice(0, 4).map((launch) => (
                <li key={launch.id || launch.name}>
                  <span className="strategic-row-strong">{launch.name}</span>
                  <span className="strategic-row-meta">
                    {when(launch.net)} · {launch.provider || '—'} · {launch.padLocation || launch.pad || '—'}
                    {launch.status ? ` · ${launch.status}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No upcoming launches published yet.</Empty>
          )}
          {satellites?.features?.length ? (
            <div className="strategic-stats strategic-stats--spaced">
              <span><b>{satellites.features.length}</b> tracked</span>
              {SAT_GROUPS.filter((group) => satelliteGroups[group]).map((group) => (
                <span key={group}>{group} <b>{satelliteGroups[group]}</b></span>
              ))}
            </div>
          ) : null}
          {satellites?.propagatedAt ? (
            <p className="strategic-note">Tracks propagated {when(satellites.propagatedAt)} · {satellites.approximation}</p>
          ) : null}
        </Panel>

        <Panel title="Cyber" hint="CISA KEV · ransomware.live">
          {kev?.count ? (
            <>
              <div className="strategic-stats">
                <span><b>{kev.count}</b> exploited CVEs</span>
                <span><b>{kev.ransomwareLinked}</b> ransomware-linked</span>
              </div>
              {(kev.recent || []).slice(0, 5).map((row) => (
                <p key={row.cve} className="strategic-row">
                  <span className="strategic-row-strong">{row.cve} · {row.product || row.vendor}</span>
                  <span className="strategic-row-meta">added {shortDate(row.added)}{row.ransomware ? ' · ransomware' : ''}</span>
                </p>
              ))}
            </>
          ) : (
            <Empty>No exploited-CVE catalog in the snapshot yet.</Empty>
          )}
          {ransomware?.victims ? (
            <div className="strategic-stats strategic-stats--spaced">
              <span><b>{ransomware.victims}</b> recent victims</span>
              {(ransomware.byGroup || []).slice(0, 3).map((row) => (
                <span key={row.group}>{row.group} <b>{row.count}</b></span>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel title="Censorship" hint="OONI">
          {censorship?.countries?.length ? (
            <>
              <div className="strategic-stats">
                <span><b>{censorship.totals?.measurements ?? 0}</b> measurements</span>
                <span><b>{censorship.totals?.suspect ?? 0}</b> suspect</span>
              </div>
              <ul className="strategic-list">
                {censorship.countries.slice(0, 6).map((row) => (
                  <li key={row.country}><span>{row.country}</span><b>{row.suspect || 0}/{row.total}</b></li>
                ))}
              </ul>
            </>
          ) : (
            <Empty>No censorship measurements in the snapshot yet.</Empty>
          )}
        </Panel>

        <Panel title="Radiation" hint="Safecast">
          {radiation?.features?.length ? (
            <>
              <div className="strategic-stats">
                <span><b>{radiation.features.length}</b> readings</span>
                {radiation.highest ? (
                  <span><b>{radiation.highest.value}</b> {radiation.highest.unit} peak</span>
                ) : null}
              </div>
              {(radiation.units || []).slice(0, 3).map((row) => (
                <p key={row.unit} className="strategic-row-meta">{row.count} readings in {row.unit}</p>
              ))}
            </>
          ) : (
            <Empty>No radiation readings in the snapshot yet.</Empty>
          )}
        </Panel>

        <Panel title="Balloons" hint="SondeHub">
          {balloons?.features?.length ? (
            <>
              <div className="strategic-stats">
                <span><b>{balloons.features.length}</b> sondes</span>
              </div>
              <ul className="strategic-list">
                {balloonTypes.slice(0, 6).map((row) => (
                  <li key={row.type}><span>{row.type}</span><b>{row.count}</b></li>
                ))}
              </ul>
            </>
          ) : (
            <Empty>No radiosondes in the snapshot yet.</Empty>
          )}
        </Panel>
      </div>

      <footer className="strategic-foot">
        <p>
          Sources: UCDP GED · WarSpotting · ISW / Critical Threats (via Google News) · CelesTrak ·
          Launch Library 2 · OONI · CISA KEV · ransomware.live · Safecast · SondeHub.
        </p>
        <p className="strategic-note">
          Refresh twice an hour on the shared collector. Nothing here calls an upstream from your browser.
        </p>
      </footer>
    </div>
  )
}
