import { useEffect, useRef, useState } from 'react'
import { PROFILE_EMOJIS } from './menuCatalog'

function systemEmojiShortcut() {
  const platform = `${navigator.platform || ''} ${navigator.userAgent || ''}`
  if (/Mac|iPhone|iPad/.test(platform)) return 'Control + Command + Space'
  if (/Win/.test(platform)) return 'Windows + .'
  return 'Control + .'
}

function lastGrapheme(value) {
  const chars = Array.from(String(value || ''))
  return chars[chars.length - 1] || ''
}

export default function SystemEmojiButton({
  value = '',
  onPick,
  targetRef = null,
  label = 'Emoji',
  placement = 'down',
  triggerClassName = '',
  triggerContent = null,
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const captureRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const field = targetRef?.current || captureRef.current
    field?.focus()
    function onPointer(event) {
      if (!boxRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open, targetRef])

  function focusField() {
    const field = targetRef?.current || captureRef.current
    field?.focus()
  }

  return (
    <div className="sm-emoji-pop" ref={boxRef}>
      <button
        type="button"
        className={triggerClassName ? `sm-emoji-launch ${triggerClassName}` : 'sm-ghost-btn sm-emoji-launch'}
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => {
          setOpen((current) => !current)
          focusField()
        }}
      >
        {triggerContent || (
          <>
            {value ? <span aria-hidden>{value}</span> : <span aria-hidden>☺</span>}
            Emoji
          </>
        )}
      </button>
      {open ? (
        <div className={`sm-emoji-panel${placement === 'up' ? ' is-up' : ''}`} role="dialog" aria-label="Emoji">
          <p>Focus is in the box. Open your computer’s emoji picker with {systemEmojiShortcut()}.</p>
          {targetRef ? null : (
            <input
              ref={captureRef}
              className="sm-emoji-capture"
              value={value}
              aria-label="Type or pick an emoji"
              onChange={(event) => {
                const mark = lastGrapheme(event.target.value)
                if (mark) onPick?.(mark)
              }}
            />
          )}
          <div className="sm-emoji-grid">
            {PROFILE_EMOJIS.map((mark) => (
              <button
                key={mark}
                type="button"
                className={value === mark ? 'active' : ''}
                aria-label={mark}
                onClick={() => {
                  onPick?.(mark)
                  setOpen(false)
                  focusField()
                }}
              >
                {mark}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
