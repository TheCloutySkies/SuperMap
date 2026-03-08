import { useEffect, useMemo, useState } from 'react'
import './ReportMakerView.css'

const REPORT_X_POSTS_KEY = 'supermap_report_x_posts'

function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function ReportMakerView() {
  const [title, setTitle] = useState('Untitled Report')
  const [body, setBody] = useState('')
  const [articleInput, setArticleInput] = useState('')
  const [articles, setArticles] = useState([])
  const [xInput, setXInput] = useState('')
  const [xPosts, setXPosts] = useState([])
  const [locationName, setLocationName] = useState('')
  const [locationLat, setLocationLat] = useState('')
  const [locationLon, setLocationLon] = useState('')
  const [locations, setLocations] = useState([])
  const [screenshots, setScreenshots] = useState([])

  const importPinnedXPosts = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(REPORT_X_POSTS_KEY) || '[]')
      if (!Array.isArray(raw)) return
      setXPosts((prev) => {
        const map = new Map(prev.map((p) => [p.url, p]))
        raw.forEach((p) => {
          const url = String(p?.url || '').trim()
          if (!url) return
          if (!map.has(url)) {
            map.set(url, {
              url,
              account: p?.account || '',
              title: p?.title || '',
              content: p?.content || '',
              timestamp: p?.timestamp || null,
              pinned: true,
            })
          }
        })
        return Array.from(map.values())
      })
    } catch {}
  }

  useEffect(() => {
    importPinnedXPosts()
  }, [])

  const addArticle = () => {
    const url = articleInput.trim()
    if (!url) return
    setArticles((prev) => [...prev, url])
    setArticleInput('')
  }

  const addX = () => {
    const url = xInput.trim()
    if (!url) return
    setXPosts((prev) => prev.some((p) => p.url === url) ? prev : [...prev, { url, account: '', title: '', content: '', timestamp: null, pinned: false }])
    setXInput('')
  }

  const addLocation = () => {
    const lat = Number(locationLat)
    const lon = Number(locationLon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    setLocations((prev) => [...prev, { name: locationName.trim() || 'Location', lat, lon }])
    setLocationName('')
    setLocationLat('')
    setLocationLon('')
  }

  const onScreenshotFiles = (files) => {
    const list = Array.from(files || []).map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
      url: URL.createObjectURL(f),
    }))
    setScreenshots((prev) => [...prev, ...list])
  }

  const report = useMemo(() => ({
    title: title.trim() || 'Untitled Report',
    createdAt: new Date().toISOString(),
    body,
    articles,
    locations,
    xEmbeds: xPosts,
    screenshots: screenshots.map((s) => ({ name: s.name, type: s.type, size: s.size })),
  }), [title, body, articles, locations, xPosts, screenshots])

  const markdown = useMemo(() => {
    const lines = []
    lines.push(`# ${report.title}`)
    lines.push('')
    lines.push(`Generated: ${new Date(report.createdAt).toLocaleString()}`)
    lines.push('')
    lines.push('## Narrative')
    lines.push(report.body || '_No narrative added._')
    lines.push('')
    lines.push('## Linked Articles')
    if (report.articles.length === 0) lines.push('- None')
    else report.articles.forEach((u) => lines.push(`- ${u}`))
    lines.push('')
    lines.push('## Locations')
    if (report.locations.length === 0) lines.push('- None')
    else report.locations.forEach((l) => lines.push(`- ${l.name} (${l.lat}, ${l.lon})`))
    lines.push('')
    lines.push('## Embedded X Media')
    if (report.xEmbeds.length === 0) lines.push('- None')
    else report.xEmbeds.forEach((p) => {
      lines.push(`- ${p.url}${p.account ? ` (@${p.account})` : ''}`)
      if (p.title) lines.push(`  - ${p.title}`)
      if (p.content) lines.push(`  - ${p.content.slice(0, 240)}`)
    })
    lines.push('')
    lines.push('## Screenshot References')
    if (report.screenshots.length === 0) lines.push('- None')
    else report.screenshots.forEach((s) => lines.push(`- ${s.name} (${Math.round(s.size / 1024)} KB)`))
    return lines.join('\n')
  }, [report])

  return (
    <div className="report-maker">
      <div className="report-maker-header">
        <input
          className="report-maker-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Report title"
        />
        <div className="report-maker-export">
          <button type="button" onClick={() => downloadFile(`${report.title}.md`, markdown, 'text/markdown;charset=utf-8')}>Export .md</button>
          <button type="button" onClick={() => downloadFile(`${report.title}.txt`, markdown, 'text/plain;charset=utf-8')}>Export .txt</button>
          <button type="button" onClick={() => downloadFile(`${report.title}.json`, JSON.stringify(report, null, 2), 'application/json;charset=utf-8')}>Export .json</button>
        </div>
      </div>

      <div className="report-maker-grid">
        <section className="report-maker-card">
          <h3>Report Editor</h3>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your report narrative, findings, and analysis..."
            rows={14}
          />
        </section>

        <section className="report-maker-card">
          <h3>Evidence Builder</h3>

          <div className="report-maker-row">
            <input value={articleInput} onChange={(e) => setArticleInput(e.target.value)} placeholder="Article URL" />
            <button type="button" onClick={addArticle}>Add Article</button>
          </div>

          <div className="report-maker-row">
            <input value={xInput} onChange={(e) => setXInput(e.target.value)} placeholder="X/Twitter post URL" />
            <button type="button" onClick={addX}>Add X Link</button>
            <button type="button" onClick={importPinnedXPosts}>Import pinned X posts</button>
          </div>

          <div className="report-maker-row report-maker-row-3">
            <input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Location name" />
            <input value={locationLat} onChange={(e) => setLocationLat(e.target.value)} placeholder="Lat" />
            <input value={locationLon} onChange={(e) => setLocationLon(e.target.value)} placeholder="Lon" />
            <button type="button" onClick={addLocation}>Add Location</button>
          </div>

          <div className="report-maker-row">
            <input type="file" accept="image/*" multiple onChange={(e) => onScreenshotFiles(e.target.files)} />
          </div>

          <div className="report-maker-lists">
            <div>
              <strong>Articles ({articles.length})</strong>
              <ul>{articles.map((u, i) => <li key={`${u}-${i}`}>{u}</li>)}</ul>
            </div>
            <div>
              <strong>Locations ({locations.length})</strong>
              <ul>{locations.map((l, i) => <li key={`${l.name}-${i}`}>{l.name} ({l.lat}, {l.lon})</li>)}</ul>
            </div>
            <div>
              <strong>X Embeds ({xPosts.length})</strong>
              <ul>
                {xPosts.map((p, i) => (
                  <li key={`${p.url}-${i}`}>
                    <a href={p.url} target="_blank" rel="noopener noreferrer">{p.url}</a>
                    {p.account ? ` (@${p.account})` : ''}
                    {p.pinned ? ' [pinned]' : ''}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <strong>Screenshots ({screenshots.length})</strong>
              <ul>{screenshots.map((s, i) => <li key={`${s.name}-${i}`}>{s.name}</li>)}</ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

