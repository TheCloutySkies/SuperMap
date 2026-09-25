import { useEffect, useState } from 'react'
import { STORAGE_KEYS, getVisualsPrefs, setVisualsPrefs } from '../constants'
import './MobileLayoutPrompt.css'

function shouldOfferPrompt() {
  try {
    if (localStorage.getItem(STORAGE_KEYS.MOBILE_PROMPT_SEEN) === '1') return false
  } catch {
    return false
  }
  const prefs = getVisualsPrefs()
  if (prefs.layoutMode && prefs.layoutMode !== 'auto') return false
  if (typeof window === 'undefined') return false
  const narrow = window.matchMedia('(max-width: 900px)').matches
  const coarse = window.matchMedia('(pointer: coarse)').matches
  return narrow || coarse
}

/**
 * One-time chooser: Use mobile layout / Keep desktop.
 * Writes visuals.layoutMode and marks prompt as seen.
 */
export default function MobileLayoutPrompt({ onChoice }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(shouldOfferPrompt())
  }, [])

  if (!open) return null

  const choose = (layoutMode) => {
    const prefs = getVisualsPrefs()
    setVisualsPrefs({ ...prefs, layoutMode })
    try {
      localStorage.setItem(STORAGE_KEYS.MOBILE_PROMPT_SEEN, '1')
    } catch { /* ignore */ }
    setOpen(false)
    onChoice?.(layoutMode)
  }

  return (
    <div className="mobile-layout-prompt" role="dialog" aria-modal="true" aria-labelledby="mobile-layout-prompt-title">
      <div className="mobile-layout-prompt-card">
        <h2 id="mobile-layout-prompt-title" className="mobile-layout-prompt-title">Layout</h2>
        <p className="mobile-layout-prompt-copy">
          This screen works better with the mobile Good Palantir hub. Choose a layout — you can change it anytime in Settings.
        </p>
        <div className="mobile-layout-prompt-actions">
          <button type="button" className="mobile-layout-prompt-btn mobile-layout-prompt-btn--primary" onClick={() => choose('mobile')}>
            Use mobile layout
          </button>
          <button type="button" className="mobile-layout-prompt-btn" onClick={() => choose('desktop')}>
            Keep desktop
          </button>
        </div>
      </div>
    </div>
  )
}
