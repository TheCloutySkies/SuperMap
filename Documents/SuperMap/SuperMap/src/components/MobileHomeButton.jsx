import './MobileHomeButton.css'

export default function MobileHomeButton({ onClick, label = 'Home' }) {
  return (
    <div className="mobile-home-btn-wrap">
      <button type="button" className="mobile-home-btn" onClick={onClick} aria-label={label}>
        <span className="mobile-home-btn-icon" aria-hidden>⌂</span>
        <span className="mobile-home-btn-label">{label}</span>
      </button>
    </div>
  )
}
