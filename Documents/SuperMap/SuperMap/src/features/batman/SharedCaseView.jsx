/**
 * A read-only case, for whoever holds the link. No account needed: the rules
 * allow reading a case whose visibility is 'link', and only its owner can write
 * it, so this view deliberately passes no handlers to the board.
 */
import { useEffect, useState } from 'react'
import { fetchCase } from './caseStore'
import { caseKml, caseMarkdown } from './caseModel'
import CanvasBoard from './CanvasBoard'
import './batman.css'

function download(filename, text, mime = 'text/plain') {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  } catch { /* private mode */ }
}

export default function SharedCaseView({ caseId }) {
  const [caseDoc, setCaseDoc] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let alive = true
    fetchCase(caseId).then((doc) => {
      if (!alive) return
      setCaseDoc(doc)
      setState(doc ? 'ready' : 'missing')
    })
    return () => { alive = false }
  }, [caseId])

  if (state === 'loading') return <div className="batman-mode batman-empty"><p>Opening the case…</p></div>
  if (state === 'missing' || !caseDoc) {
    return (
      <div className="batman-mode batman-empty">
        <h2>This case is not shared</h2>
        <p>The owner may have made it private again, or the link is wrong.</p>
      </div>
    )
  }

  return (
    <div className="batman-mode">
      <header className="batman-head">
        <div className="batman-title">
          <h1>{caseDoc.title || 'Untitled case'}</h1>
          <p>{caseDoc.description || 'A read-only case from Batman Mode.'}</p>
        </div>
        <span className="batman-badge is-shared">Read-only</span>
      </header>
      <p className="batman-counts">
        {(caseDoc.nodes || []).length} items · {(caseDoc.edges || []).length} links
      </p>
      <CanvasBoard caseDoc={caseDoc} selectedId={null} />
      <div className="batman-row">
        <button type="button" className="batman-btn" onClick={() => download(`${caseDoc.title || 'case'}.md`, caseMarkdown(caseDoc), 'text/markdown')}>
          Download Markdown
        </button>
        <button type="button" className="batman-btn batman-btn-ghost" onClick={() => download(`${caseDoc.title || 'case'}.kml`, caseKml(caseDoc), 'application/vnd.google-earth.kml+xml')}>
          KML
        </button>
      </div>
    </div>
  )
}
