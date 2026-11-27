/** Real aggregates only; a chart with no published rows is not shown at all. */
export default function TrendCharts({ charts }) {
  if (!charts.length) {
    return <p className="console-empty">No aggregate series in this snapshot yet.</p>
  }

  return (
    <div className="console-charts">
      {charts.map((chart) => {
        const max = Math.max(...chart.bars.map((bar) => bar.v), 1)
        return (
          <article className="console-chart" key={chart.id}>
            <h3>
              <span className="console-chart-dot" style={{ background: chart.color }} aria-hidden />
              {chart.title}
            </h3>
            <p className="console-chart-sub">{chart.sub}</p>
            <div className="console-bars">
              {chart.bars.map((bar) => (
                <div className="console-bar-row" key={bar.k}>
                  <span className="console-bar-label" title={bar.k}>{bar.k}</span>
                  <span className="console-bar-track" aria-hidden>
                    <i style={{ width: `${(bar.v / max) * 100}%`, background: chart.color }} />
                  </span>
                  <span className="console-bar-value">{bar.v.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </article>
        )
      })}
    </div>
  )
}
