import { useEffect, useRef, useState } from 'react'
import { getApiBase } from '../lib/homeBootstrap'
import { useSuperMapAccount } from '../features/accounts/SuperMapAccounts'
import { fileReport } from '../features/accounts/socialData'
import './ThreatScoreButton.css'

/**
 * Score chip for a news article or X post.
 * Opens the reading and the recent-norm comparison, and sends a suggested score.
 */
export default function ThreatScoreButton({ item, kind = 'news', placement = 'card' }) {
  const score = Number(item?.risk_score)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState(null)
  const [suggested, setSuggested] = useState(Number.isFinite(score) ? score : 1)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)
  const { user } = useSuperMapAccount()

  useEffect(() => {
    if (!open) return undefined
    function onPointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!Number.isFinite(score) || score < 1) return null

  const label = item.risk_label && item.risk_label !== 'GUARDED' ? item.risk_label : ''
  const baseline = item.risk_baseline == null || item.risk_baseline === '' ? null : Number(item.risk_baseline)
  const delta = item.risk_delta == null || item.risk_delta === '' ? null : Number(item.risk_delta)
  const reading = item.risk_rationale
    || 'This item was scored before comparison notes were saved. Newer items include a reading of the text against the last few days.'

  function toggle(event) {
    event.preventDefault()
    event.stopPropagation()
    if (open) {
      setOpen(false)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      const width = 280
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const below = rect.bottom + 8
      const openUp = below + 260 > window.innerHeight
      setPanelStyle(openUp
        ? { left, width, bottom: Math.max(8, window.innerHeight - rect.top + 8) }
        : { left, width, top: below })
    }
    setStatus('')
    setOpen(true)
  }

  async function send(event) {
    event.preventDefault()
    event.stopPropagation()
    const suggestedScore = Number(suggested)
    if (suggestedScore < 1 || suggestedScore > 5) return
    setSending(true)
    setStatus('')
    const payload = {
      id: item.id || item._key || '',
      title: item.title || '',
      url: item.link || item.url || '',
      source: item.source || item.account || '',
      kind: kind === 'x' ? 'x' : 'news',
      currentScore: score,
      suggestedScore,
      note,
      reporter: user?.handle || user?.displayName || 'signed-out',
    }
    let sheetOk = false
    try {
      const res = await fetch(`${getApiBase()}/api/threat-score-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      sheetOk = res.ok
    } catch {
      sheetOk = false
    }
    let inboxOk = !user?.uid
    if (user?.uid) {
      const result = await fileReport({
        reporter: user,
        reason: 'score',
        suggestedScore,
        note: `Suggested threat score ${suggestedScore}/5. The item is scored ${score}/5. ${note}`.trim(),
        item: {
          type: 'article',
          title: item.title || (kind === 'x' ? 'X post' : 'News article'),
          url: item.link || item.url || '',
          summary: item.contentSnippet || item.content || item.description || '',
        },
      }).catch(() => ({ ok: false }))
      inboxOk = !!result?.ok
    }
    setSending(false)
    if (sheetOk && inboxOk) setStatus('Sent.')
    else if (sheetOk) setStatus('Saved. The inbox copy did not go through.')
    else setStatus('Could not send that. Try again.')
  }

  const comparison = baseline == null
    ? 'Not enough similar items from the last 3 days to compare yet.'
    : `Similar items over the last 3 days averaged ${baseline}/5. This score is ${delta > 0 ? '+' : ''}${delta ?? 0} from that.`

  return (
    <div
      className={`threat-score threat-score--${placement}`}
      ref={rootRef}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`threat-score-chip threat-score-chip--${score}`}
        aria-expanded={open}
        aria-label={`Threat score ${score} out of 5. Show details.`}
        onClick={toggle}
      >
        {score}/5
      </button>
      {open && (
        <div className="threat-score-panel" style={panelStyle} role="dialog" aria-label="Threat score details">
          <p className="threat-score-panel-kicker">
            {score}/5{label ? ` · ${label}` : ''}
          </p>
          <p>{reading}</p>
          <p>{comparison}</p>
          <form onSubmit={send}>
            <label>
              What should this be?
              <select value={suggested} onChange={(event) => setSuggested(Number(event.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}/5</option>
                ))}
              </select>
            </label>
            <textarea
              value={note}
              maxLength={500}
              rows={3}
              placeholder="Optional note"
              onChange={(event) => setNote(event.target.value)}
            />
            <button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send report'}</button>
            {status ? <p className="threat-score-status">{status}</p> : null}
          </form>
        </div>
      )}
    </div>
  )
}
