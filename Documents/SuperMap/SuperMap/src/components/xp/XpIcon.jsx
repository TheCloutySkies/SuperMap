/**
 * The XP icon set: inline SVG, flat XP palette, 16 or 32 px. No emoji.
 * One `name` prop keeps every surface on the same drawing.
 */
const FACE = '#ece9d8'
const FOLDER = '#ffd77e'
const FOLDER_EDGE = '#c9a227'
const DOC = '#ffffff'
const BLUE = '#316ac5'
const SKY = '#7fb2e5'
const GREEN = '#3d8b5f'
const GREY = '#8b8b7a'

function Draw({ name }) {
  switch (name) {
    case 'dashboard':
      return (
        <>
          <rect x="2" y="3" width="12" height="10" rx="1" fill={FACE} stroke={GREY} />
          <rect x="4" y="5" width="3" height="3" fill={BLUE} />
          <rect x="9" y="5" width="3" height="3" fill={BLUE} />
          <rect x="4" y="9" width="8" height="2" fill="#c9c5b4" />
        </>
      )
    case 'vault':
      return (
        <>
          <rect x="2" y="4" width="12" height="9" rx="1" fill={FACE} stroke={GREY} />
          <circle cx="8" cy="8.5" r="2.2" fill="none" stroke={BLUE} strokeWidth="1.2" />
          <rect x="7.4" y="8.5" width="1.2" height="2.6" fill={BLUE} />
        </>
      )
    case 'trash':
      return (
        <>
          <path d="M3 5h10l-1 9H4z" fill={FACE} stroke={GREY} />
          <rect x="2.5" y="3.5" width="11" height="1.6" fill={GREY} />
          <path d="M6 7v5M9 7v5" stroke={GREY} strokeWidth="1" />
        </>
      )
    case 'globe':
    case 'maps':
      return (
        <>
          <circle cx="8" cy="8" r="5.6" fill={SKY} stroke="#2d5f92" strokeWidth="0.8" />
          <path d="M2.6 8h10.8M8 2.4c2 2 2 9.2 0 11.2M8 2.4c-2 2-2 9.2 0 11.2" stroke="#2d5f92" strokeWidth="0.7" fill="none" />
        </>
      )
    case 'crime':
      return (
        <>
          <rect x="2.5" y="3.5" width="11" height="9" fill={DOC} stroke={GREY} />
          <path d="M4 10l2.5-3 2 2L12 5.5" stroke={GREEN} strokeWidth="1.3" fill="none" />
        </>
      )
    case 'weather':
      return (
        <>
          <circle cx="6" cy="6" r="2.4" fill={FOLDER} />
          <path d="M5 11.6h6.2a2 2 0 0 0 0-4 3 3 0 0 0-5.8-0.6" fill={DOC} stroke={GREY} strokeWidth="0.8" />
        </>
      )
    case 'batman':
      return (
        <>
          <path d="M2 5.5c2.6 1 5 1 6 3.4 1-2.4 3.4-2.4 6-3.4-1.2 3.6-2.4 5.6-6 8-3.6-2.4-4.8-4.4-6-8z" fill={BLUE} stroke="#123a72" strokeWidth="0.7" />
        </>
      )
    case 'news':
      return (
        <>
          <rect x="2.5" y="3.5" width="11" height="9" fill={DOC} stroke={GREY} />
          <rect x="4" y="5" width="4" height="3" fill={SKY} />
          <path d="M9 5h3M9 7h3M4 9.5h8M4 11h6" stroke={GREY} strokeWidth="0.8" />
        </>
      )
    case 'bulletin':
      return (
        <>
          <rect x="3" y="2.5" width="10" height="11" fill={FACE} stroke={GREY} />
          <path d="M5 5h6M5 7.5h6M5 10h4" stroke={GREY} strokeWidth="0.9" />
        </>
      )
    case 'tools':
      return (
        <>
          <path d="M3 12l5-5" stroke={GREY} strokeWidth="1.4" />
          <circle cx="10.5" cy="5.5" r="2.8" fill="none" stroke={BLUE} strokeWidth="1.3" />
        </>
      )
    case 'resources':
    case 'folder':
      return (
        <>
          <path d="M2 4.5h4l1 1.4h7v7.6H2z" fill={FOLDER} stroke={FOLDER_EDGE} strokeWidth="0.8" />
        </>
      )
    case 'reports':
      return (
        <>
          <path d="M4 2.5h6l2.5 2.5v8.5H4z" fill={DOC} stroke={GREY} />
          <path d="M6 7h4M6 9h4M6 11h3" stroke={GREY} strokeWidth="0.8" />
        </>
      )
    case 'settings':
      return (
        <>
          <circle cx="8" cy="8" r="2.2" fill="none" stroke={GREY} strokeWidth="1.2" />
          <path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2M4.1 4.1l1.4 1.4M10.5 10.5l1.4 1.4M11.9 4.1l-1.4 1.4M5.5 10.5l-1.4 1.4" stroke={GREY} strokeWidth="1.1" />
        </>
      )
    case 'account':
      return (
        <>
          <circle cx="8" cy="6" r="2.4" fill={FACE} stroke={GREY} />
          <path d="M3.6 13c.6-2.4 2.4-3.6 4.4-3.6s3.8 1.2 4.4 3.6z" fill={FACE} stroke={GREY} />
        </>
      )
    case 'search':
      return (
        <>
          <circle cx="7" cy="7" r="3.6" fill="none" stroke={GREY} strokeWidth="1.4" />
          <path d="M9.6 9.6L13 13" stroke={GREY} strokeWidth="1.6" />
        </>
      )
    default:
      return <rect x="3" y="3" width="10" height="10" fill={FACE} stroke={GREY} />
  }
}

export default function XpIcon({ name, size = 16, className = '', title }) {
  const box = { width: size, height: size, display: 'block' }
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      className={`xp-icon ${className}`}
      style={box}
    >
      {title ? <title>{title}</title> : null}
      <Draw name={name} />
    </svg>
  )
}
