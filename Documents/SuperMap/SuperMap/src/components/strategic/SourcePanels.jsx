function when(value) {
  if (!value) return '—'
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return String(value)
  return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function shortDate(value) {
  if (!value) return '—'
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return String(value)
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Panel({ title, hint, children }) {
  return (
    <section className="console-panel">
      <header className="console-panel-head">
        <h3 className="console-panel-title">{title}</h3>
        {hint ? <span className="console-panel-hint">{hint}</span> : null}
      </header>
      <div className="console-panel-body">{children}</div>
    </section>
  )
}

function Empty({ children }) {
  return <p className="console-empty">{children}</p>
}

function missingCopy(source) {
  if (!source || source.from === 'missing') {
    return 'Not in the published snapshot yet. The next collector run fills it; until then the desk says so instead of guessing.'
  }
  if (source.from === 'warming') return 'The API is still filling this source; the last published copy stays on screen when there is one.'
  if (source.from === 'error') return 'The last fetch failed and no published copy exists yet.'
  return ''
}

/**
 * The eight source panels the desk has always had, kept as the citable record
 * under the console. Same published payloads, console styling.
 */
export default function SourcePanels({ payloads = {}, sources = {} }) {
  const ucdp = payloads.ucdp
  const warspotting = payloads.warspotting
  const launches = payloads.launches
  const satellites = payloads.satellites
  const briefs = payloads.briefs
  const censorship = payloads.censorship
  const kev = payloads.kev
  const ransomware = payloads.ransomware
  const radiation = payloads.radiation
  const balloons = payloads.balloons
  const groups = satellites?.groups || {}

  return (
    <section className="console-section" aria-label="Source panels">
      <div className="console-section-head">
        <span className="console-tag">Published record</span>
        <h2>Source panels</h2>
      </div>
      <p className="console-section-sub">
        The citable detail behind the board: one panel per published source, exactly as the collector wrote it.
      </p>

      <div className="console-panels">
        <Panel title="Conflict events" hint={ucdp?.window ? `UCDP GED ${ucdp.window.version}` : 'UCDP GED'}>
          {ucdp?.totals ? (
            <>
              <div className="console-stats">
                <span><b>{ucdp.totals.events}</b> events</span>
                <span><b>{ucdp.totals.deaths}</b> deaths</span>
                <span><b>{ucdp.totals.mapped}</b> mapped</span>
              </div>
              <ul className="console-list">
                {(ucdp.totals.byCountry || []).slice(0, 6).map((row) => (
                  <li key={row.country}><span>{row.country}</span><b>{row.count}</b></li>
                ))}
              </ul>
              {(ucdp.recent || []).slice(0, 4).map((row, index) => (
                <p key={`${row.country}-${index}`} className="console-row">
                  <span className="console-row-strong">{row.sideA || '—'} vs {row.sideB || '—'}</span>
                  <span className="console-row-meta">{row.country} · {row.deaths} deaths · {shortDate(row.date)}</span>
                </p>
              ))}
            </>
          ) : (
            <Empty>
              {sources.ucdp?.from === 'snapshot' || sources.ucdp?.from === 'api'
                ? 'The last copy had no rows. UCDP needs a free access token (UCDP_ACCESS_TOKEN) before it publishes events.'
                : 'UCDP needs a free access token (UCDP_ACCESS_TOKEN); until then this panel keeps its last-good.'}
            </Empty>
          )}
        </Panel>

        <Panel title="Equipment losses" hint="WarSpotting">
          {warspotting?.totals ? (
            <>
              <div className="console-stats">
                <span><b>{warspotting.totals.rows}</b> losses</span>
                <span><b>{warspotting.totals.mapped}</b> mapped</span>
                {warspotting.totals.topType ? <span><b>{warspotting.totals.topType.count}</b> {warspotting.totals.topType.type}</span> : null}
              </div>
              {(warspotting.recent || []).slice(0, 5).map((row, index) => (
                <p key={`${row.id}-${index}`} className="console-row">
                  <span className="console-row-strong">{row.model || row.type}</span>
                  <span className="console-row-meta">{row.status} · {row.place || '—'} · {shortDate(row.date)}</span>
                </p>
              ))}
            </>
          ) : (
            <Empty>{missingCopy(sources.warspotting) || 'No losses published yet.'}</Empty>
          )}
        </Panel>

        <Panel title="Daily assessments" hint="ISW / Critical Threats">
          {briefs?.items?.length ? (
            <ul className="console-links">
              {briefs.items.slice(0, 5).map((item) => (
                <li key={item.link || item.title}>
                  <a href={item.link} target="_blank" rel="noopener noreferrer">{item.title}</a>
                  <span className="console-row-meta">{item.source || 'Google News'} · {shortDate(item.published)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{missingCopy(sources.briefs) || 'No assessments in the snapshot yet.'}</Empty>
          )}
        </Panel>

        <Panel title="Orbital" hint="CelesTrak · Launch Library">
          {launches?.launches?.length ? (
            <ul className="console-links">
              {launches.launches.slice(0, 4).map((launch) => (
                <li key={launch.id || launch.name}>
                  <span className="console-row-strong">{launch.name}</span>
                  <span className="console-row-meta">
                    {when(launch.net)} · {launch.provider || '—'} · {launch.padLocation || launch.pad || '—'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{missingCopy(sources.launches) || 'No upcoming launches published yet.'}</Empty>
          )}
          {satellites?.features?.length ? (
            <div className="console-stats console-stats--spaced">
              <span><b>{satellites.features.length}</b> tracked</span>
              {['stations', 'military', 'gps-ops', 'weather', 'resource'].filter((group) => groups[group]).map((group) => (
                <span key={group}>{group} <b>{groups[group]}</b></span>
              ))}
            </div>
          ) : null}
          {satellites?.propagatedAt ? (
            <p className="console-note">Tracks propagated {when(satellites.propagatedAt)} · {satellites.approximation}</p>
          ) : null}
        </Panel>

        <Panel title="Cyber" hint="CISA KEV · ransomware.live">
          {kev?.count ? (
            <>
              <div className="console-stats">
                <span><b>{kev.count}</b> exploited CVEs</span>
                <span><b>{kev.ransomwareLinked}</b> ransomware-linked</span>
              </div>
              {(kev.recent || []).slice(0, 4).map((row) => (
                <p key={row.cve} className="console-row">
                  <span className="console-row-strong">{row.cve} · {row.product || row.vendor}</span>
                  <span className="console-row-meta">added {shortDate(row.added)}{row.ransomware ? ' · ransomware' : ''}</span>
                </p>
              ))}
            </>
          ) : (
            <Empty>{missingCopy(sources.kev) || 'No exploited-CVE catalog in the snapshot yet.'}</Empty>
          )}
          {ransomware?.victims ? (
            <div className="console-stats console-stats--spaced">
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
              <div className="console-stats">
                <span><b>{censorship.totals?.measurements ?? 0}</b> measurements</span>
                <span><b>{censorship.totals?.suspect ?? 0}</b> suspect</span>
              </div>
              <ul className="console-list">
                {censorship.countries.slice(0, 6).map((row) => (
                  <li key={row.country}><span>{row.country}</span><b>{row.suspect || 0}/{row.total}</b></li>
                ))}
              </ul>
            </>
          ) : (
            <Empty>{missingCopy(sources.censorship) || 'No censorship measurements in the snapshot yet.'}</Empty>
          )}
        </Panel>

        <Panel title="Radiation" hint="Safecast">
          {radiation?.features?.length ? (
            <>
              <div className="console-stats">
                <span><b>{radiation.features.length}</b> readings</span>
                {radiation.highest ? <span><b>{radiation.highest.value}</b> {radiation.highest.unit} peak</span> : null}
              </div>
              {(radiation.units || []).slice(0, 3).map((row) => (
                <p key={row.unit} className="console-row-meta">{row.count} readings in {row.unit}</p>
              ))}
            </>
          ) : (
            <Empty>{missingCopy(sources.radiation) || 'No radiation readings in the snapshot yet.'}</Empty>
          )}
        </Panel>

        <Panel title="Radiosondes" hint="SondeHub">
          {balloons?.features?.length ? (
            <>
              <div className="console-stats">
                <span><b>{balloons.features.length}</b> sondes</span>
              </div>
              <ul className="console-list">
                {(balloons.totals?.byType || []).slice(0, 6).map((row) => (
                  <li key={row.type}><span>{row.type}</span><b>{row.count}</b></li>
                ))}
              </ul>
            </>
          ) : (
            <Empty>{missingCopy(sources.balloons) || 'No radiosondes in the snapshot yet.'}</Empty>
          )}
        </Panel>
      </div>
    </section>
  )
}
