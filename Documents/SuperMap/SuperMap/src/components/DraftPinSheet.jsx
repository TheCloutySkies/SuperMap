import { useMemo } from 'react'
import { MIL_SYMBOLS, PIN_CATEGORIES, categorySidc, sidcDataUrl } from '../lib/milSymbols'
import './DraftPinSheet.css'

export default function DraftPinSheet({
  draft,
  saving = false,
  destination = 'community',
  showDestination = false,
  onChange,
  onDestination,
  onSave,
  onRemove,
}) {
  const thumbs = useMemo(
    () => MIL_SYMBOLS.map((symbol) => ({ ...symbol, src: sidcDataUrl(symbol.sidc, 28) })),
    [],
  )
  if (!draft) return null
  const category = draft.category || 'news'
  const sidc = draft.sidc || categorySidc(category)

  return (
    <form className="draft-pin" onSubmit={(event) => { event.preventDefault(); onSave?.() }}>
      <div className="draft-pin-head">
        <strong>Draft pin</strong>
        <span>{draft.locating ? 'Reading the headline for a place…' : 'Drag the symbol to the right place.'}</span>
      </div>
      {draft.image ? <img className="draft-pin-photo" src={draft.image} alt="" referrerPolicy="no-referrer" /> : null}
      {draft.place ? <p className="draft-pin-place">{draft.place}</p> : null}
      {draft.reasoning ? <p className="draft-pin-reason">{draft.reasoning}</p> : null}
      <label>
        Category
        <select value={category} onChange={(event) => {
          const next = event.target.value
          onChange?.({ category: next, sidc: categorySidc(next) })
        }}>
          {PIN_CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <div className="draft-pin-symbols" role="listbox" aria-label="MIL-STD-2525 symbols">
        {thumbs.map((symbol) => (
          <button
            key={symbol.sidc}
            type="button"
            className={symbol.sidc === sidc ? 'is-on' : ''}
            title={`${symbol.group}: ${symbol.label}`}
            onClick={() => onChange?.({ sidc: symbol.sidc })}
          >
            {symbol.src ? <img src={symbol.src} alt="" /> : symbol.label}
          </button>
        ))}
      </div>
      <label>
        Label
        <input
          value={draft.label ?? ''}
          onChange={(event) => onChange?.({ label: event.target.value })}
          placeholder="Short name, shown up close"
          maxLength={80}
        />
      </label>
      {showDestination ? (
        <div className="draft-pin-destination">
          <span>Save to</span>
          <button type="button" className={destination === 'mine' ? 'is-on' : ''} onClick={() => onDestination?.('mine')}>My maps</button>
          <button type="button" className={destination === 'community' ? 'is-on' : ''} onClick={() => onDestination?.('community')}>Community</button>
        </div>
      ) : null}
      <div className="draft-pin-actions">
        <button type="button" onClick={onRemove}>Remove pin</button>
        <button type="submit" disabled={saving || draft.locating}>{draft.locating ? 'Reading…' : (saving ? 'Saving…' : 'Save pin')}</button>
      </div>
    </form>
  )
}
