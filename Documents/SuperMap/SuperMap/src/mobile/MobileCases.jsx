/**
 * Cases on a phone: the list, then the case as a readable page.
 * The board itself is a desktop editor; here it is a list of what is in it.
 */
import { useEffect, useState } from 'react'
import { localCases, subscribeCases } from '../features/batman/caseStore'
import { useSuperMapAccount } from '../features/accounts/SuperMapAccounts'

function ago(ms) {
  if (!ms) return ''
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}

function nodeTitle(node) {
  return node?.title || node?.label || node?.name || node?.kind || 'Item'
}

export default function MobileCases() {
  const { user } = useSuperMapAccount()
  const [cases, setCases] = useState(() => localCases(user?.uid || null))
  const [openId, setOpenId] = useState(null)

  useEffect(() => subscribeCases(user?.uid || 'local', setCases), [user?.uid])

  const open = cases.find((row) => row.id === openId) || null

  if (open) {
    const nodes = Array.isArray(open.nodes) ? open.nodes : []
    return (
      <div className="mob-stack">
        <button type="button" className="mob-action" onClick={() => setOpenId(null)}>‹ All cases</button>
        <section className="mob-card">
          <p className="mob-card-kicker">Case</p>
          <h2 className="mob-card-title">{open.title || 'Untitled case'}</h2>
          <p className="mob-card-meta">{nodes.length} item{nodes.length === 1 ? '' : 's'}{open.updatedAtMs ? ` · ${ago(open.updatedAtMs)}` : ''}</p>
          {nodes.length ? (
            <ul className="mob-list">
              {nodes.map((node, index) => (
                <li key={node.id || index}>{nodeTitle(node)}</li>
              ))}
            </ul>
          ) : <p className="mob-card-text">Nothing in this case yet. Add items from any story or pin's menu.</p>}
          <p className="mob-card-meta">The board and the timeline read best on the desktop; this page lists what the case holds.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="mob-stack">
      {cases.length ? (
        <ul className="mob-list mob-list--cards">
          {cases.map((row) => (
            <li key={row.id}>
              <button type="button" className="mob-row" onClick={() => setOpenId(row.id)}>
                <span className="mob-row-title">{row.title || 'Untitled case'}</span>
                <span className="mob-row-meta">{(row.nodes || []).length} items{row.updatedAtMs ? ` · ${ago(row.updatedAtMs)}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <section className="mob-card">
          <p className="mob-card-kicker">Cases</p>
          <p className="mob-card-text">
            No cases yet. A story, a pin or a saved item can be added to a case from its ⋯ menu, and it will appear here.
          </p>
        </section>
      )}
    </div>
  )
}
