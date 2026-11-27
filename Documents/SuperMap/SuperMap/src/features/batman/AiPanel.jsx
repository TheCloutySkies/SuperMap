/**
 * Ask the desk about the selection. The answer is generated from node ids only,
 * every sentence has to cite them, and it is kept on the case as an AI note.
 */
import { useMemo, useState } from 'react'
import { getApiBase } from '../../lib/homeBootstrap'
import { kindMeta } from './caseModel'

const API_BASE = getApiBase()

export default function AiPanel({ caseDoc, selectedId, onSaveNote }) {
  const [question, setQuestion] = useState('What connects these items, and what contradicts?')
  const [scope, setScope] = useState('selection')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [answer, setAnswer] = useState(null)

  const nodes = useMemo(() => caseDoc?.nodes || [], [caseDoc])
  const chosen = useMemo(() => {
    if (scope === 'all') return nodes
    if (selectedId) return nodes.filter((node) => node.id === selectedId)
    return nodes.slice(0, 12)
  }, [nodes, scope, selectedId])

  async function run() {
    if (!chosen.length || busy) return
    setBusy(true)
    setError('')
    setAnswer(null)
    try {
      const ids = chosen.map((node) => node.id)
      const res = await fetch(`${API_BASE}/api/batman/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          nodes: chosen.map((node) => ({
            id: node.id,
            kind: node.kind,
            title: node.title,
            note: node.note,
            source: node.ref?.source || null,
            at: node.t || null,
          })),
          edges: (caseDoc?.edges || [])
            .filter((edge) => ids.includes(edge.from) && ids.includes(edge.to))
            .map((edge) => ({ from: edge.from, to: edge.to, type: edge.type, confidence: edge.confidence })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || `The desk answered ${res.status}.`)
        return
      }
      setAnswer(body)
      onSaveNote?.({
        id: `ai-${Date.now()}`,
        createdAtMs: Date.now(),
        nodeIds: ids,
        prompt: question,
        result: body,
      })
    } catch {
      setError('Could not reach the desk. The case is unchanged.')
    } finally {
      setBusy(false)
    }
  }

  const byId = new Map(nodes.map((node) => [node.id, node]))

  return (
    <section className="batman-ai">
      <div className="batman-row">
        <select value={scope} onChange={(event) => setScope(event.target.value)} aria-label="Scope">
          <option value="selection">Selected item</option>
          <option value="recent">Up to 12 items</option>
          <option value="all">The whole case</option>
        </select>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          aria-label="Question"
          placeholder="What should the desk answer?"
        />
        <button type="button" className="batman-btn" onClick={run} disabled={busy || !chosen.length}>
          {busy ? 'Reading…' : `Analyse ${chosen.length} item${chosen.length === 1 ? '' : 's'}`}
        </button>
      </div>
      {error ? <p className="batman-error">{error}</p> : null}
      {answer ? (
        <article className="batman-ai-answer">
          <h3>Narrative</h3>
          <p>{answer.narrative}</p>
          {answer.connections?.length ? (
            <>
              <h3>Connections</h3>
              <ul>
                {answer.connections.map((row, index) => (
                  <li key={`c${index}`}>
                    {row.claim}
                    <em>{(row.nodeIds || []).map((id) => byId.get(id)?.title || id).join(', ')}</em>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {answer.contradictions?.length ? (
            <>
              <h3>Contradictions</h3>
              <ul>
                {answer.contradictions.map((row, index) => (
                  <li key={`x${index}`}>
                    {row.claim}
                    <em>{(row.nodeIds || []).map((id) => byId.get(id)?.title || id).join(', ')}</em>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {answer.gaps?.length ? (
            <>
              <h3>What is missing</h3>
              <ul>{answer.gaps.map((gap, index) => <li key={`g${index}`}>{gap}</li>)}</ul>
            </>
          ) : null}
          <p className="batman-hint">
            Confidence {Math.round((Number(answer.confidence) || 0) * 100)}% · from {chosen.length} items ·{' '}
            {chosen.slice(0, 6).map((node) => `${kindMeta(node.kind).icon} ${node.title}`).join(' · ')}
          </p>
        </article>
      ) : null}
      {caseDoc?.aiNotes?.length ? (
        <>
          <h3>Saved notes</h3>
          <ul className="batman-ai-notes">
            {caseDoc.aiNotes.slice(-5).reverse().map((note) => (
              <li key={note.id}>
                <strong>{note.prompt}</strong>
                <em>{new Date(note.createdAtMs).toLocaleString()}</em>
                <p>{note.result?.narrative}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
