import { useEffect, useMemo, useRef, useState } from 'react'
import { DOMAINS, DOMAIN_ORDER, REGIONS, REGION_OPTIONS, relTime } from '../../lib/consoleSignals'

const SUGGESTIONS = [
  "What's happening in the Baltic?",
  'Any ransomware surge?',
  'Show radiation readings',
  'What changed in the last hour?',
  'Ukraine equipment losses',
]

const DOMAIN_WORDS = {
  conflict: ['conflict', 'war', 'strike', 'battle', 'fighting'],
  losses: ['losse', 'equipment', 'tank', 'vehicle', 'artillery'],
  hazards: ['hazard', 'earthquake', 'quake', 'volcano', 'flood', 'wildfire'],
  infrastructure: ['infrastructure', 'outage', 'power', 'grid', 'utility'],
  cyber: ['cyber', 'ransom', 'cve', 'hack', 'exploit', 'malware'],
  censorship: ['censor', 'ooni', 'block'],
  radiation: ['radiation', 'safecast', 'cpm', 'nuclear'],
  orbital: ['satellite', 'orbital', 'launch', 'space'],
  balloons: ['balloon', 'sonde', 'radiosonde'],
  assessments: ['brief', 'assessment', 'isw'],
}

function matchRegion(query) {
  const q = query.toLowerCase()
  const option = REGION_OPTIONS.find((entry) => entry.id !== 'global'
    && q.includes(entry.label.toLowerCase().split(' / ')[0]))
  return option ? option.id : null
}

function matchDomain(query) {
  const q = query.toLowerCase()
  const id = DOMAIN_ORDER.find((domain) => DOMAIN_WORDS[domain].some((word) => q.includes(word)))
  return id || null
}

function answerFor(query, signals, now) {
  const q = query.trim()
  if (!q) return { text: '', matches: [] }
  const region = matchRegion(q)
  const domain = matchDomain(q)

  let matches = signals
  if (region) matches = matches.filter((signal) => signal.region === region)
  if (domain) matches = matches.filter((signal) => signal.domain === domain)
  if (!region && !domain) {
    const needle = q.toLowerCase()
    matches = matches.filter((signal) => `${signal.title} ${signal.detail} ${signal.source}`.toLowerCase().includes(needle))
  }
  matches = matches
    .slice()
    .sort((a, b) => (b.magnitude * b.confidence) - (a.magnitude * a.confidence))

  const top = matches[0]
  const regionLabel = region ? REGIONS[region]?.label || region : null
  const domainLabel = domain ? DOMAINS[domain]?.label.toLowerCase() : null
  let text

  if (region && domain) {
    text = `${matches.length} ${domainLabel} signal${matches.length === 1 ? '' : 's'} in ${regionLabel}.${top ? ` Strongest: ${top.title}, ${relTime(top.at, now)} ago from ${top.source || 'a published feed'}.` : ' Nothing published there in this window.'}`
  } else if (region) {
    const domains = [...new Set(matches.map((signal) => signal.domain))]
    text = `${matches.length} signal${matches.length === 1 ? '' : 's'} in ${regionLabel} across ${domains.length} domain${domains.length === 1 ? '' : 's'}.${top ? ` Strongest: ${top.title} (${DOMAINS[top.domain]?.label.toLowerCase()}).` : ' Nothing published there in this window.'}`
  } else if (domain) {
    text = `${matches.length} ${domainLabel} signal${matches.length === 1 ? '' : 's'} in the loaded window.${top ? ` Strongest: ${top.title}, ${relTime(top.at, now)} ago.` : ''}`
  } else if (matches.length) {
    text = `${matches.length} signal${matches.length === 1 ? '' : 's'} mention “${q}”. Strongest: ${top.title}.`
  } else {
    text = `Nothing in the loaded signals matches “${q}”. Try a theater (Baltic, Ukraine, Middle East), a domain (cyber, cyber, hazards, orbital) or a word from a headline.`
  }

  return { text, matches: matches.slice(0, 8) }
}

/**
 * Local ask palette: it reads the signals already on the desk, answers from
 * counts and titles, and jumps to the match. No API call, no waiting.
 */
export default function AskPalette({ onClose, signals, onOpenSignal, now }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  // The desk mounts this palette when it opens, so the query starts empty
  // without an effect writing state.
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 40)
    return () => clearTimeout(id)
  }, [])

  const result = useMemo(() => answerFor(query, signals, now), [query, signals, now])

  return (
    <div
      className="console-ask-scrim"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="console-ask" role="dialog" aria-modal="true" aria-label="Ask the console">
        <div className="console-ask-input">
          <span className="console-ask-icon" aria-hidden>⌕</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose()
              if (event.key === 'Enter' && result.matches[0]) {
                onOpenSignal(result.matches[0].id)
                onClose()
              }
            }}
            placeholder="Ask about a theater, a domain or a headline…"
            aria-label="Ask the console"
          />
          <button type="button" className="console-ask-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {result.text ? <p className="console-ask-answer">{result.text}</p> : null}

        {!query ? (
          <div className="console-ask-suggest">
            {SUGGESTIONS.map((suggestion) => (
              <button type="button" key={suggestion} className="console-chip" onClick={() => setQuery(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        {result.matches.length ? (
          <div className="console-ask-results">
            {result.matches.map((signal) => (
              <button
                type="button"
                key={signal.id}
                className="console-ask-result"
                onClick={() => {
                  onOpenSignal(signal.id)
                  onClose()
                }}
              >
                <span className="console-ask-dot" style={{ background: DOMAINS[signal.domain]?.hex }} aria-hidden />
                <span className="console-ask-title">{signal.title}</span>
                <span className="console-ask-region">{REGIONS[signal.region]?.label || signal.region}</span>
              </button>
            ))}
          </div>
        ) : null}

        <p className="console-ask-note">Answers come from the signals already loaded on this desk — no request leaves the page.</p>
      </div>
    </div>
  )
}
