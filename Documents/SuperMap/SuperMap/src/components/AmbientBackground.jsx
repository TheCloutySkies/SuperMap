import './AmbientBackground.css'

/**
 * Full-viewport ambient background: flowy dark blue gradient,
 * animated liquid blobs (oil-on-water), and subtle mesh/grid.
 * Purely decorative; no interaction.
 */
export default function AmbientBackground() {
  return (
    <div className="ambient-bg" aria-hidden>
      <div className="ambient-bg-gradient" />
      <div className="ambient-bg-liquid">
        <div className="ambient-bg-blob ambient-bg-blob--1" />
        <div className="ambient-bg-blob ambient-bg-blob--2" />
        <div className="ambient-bg-blob ambient-bg-blob--3" />
        <div className="ambient-bg-blob ambient-bg-blob--4" />
        <div className="ambient-bg-blob ambient-bg-blob--5" />
      </div>
      <div className="ambient-bg-mesh" />
      <div className="ambient-bg-grid" />
    </div>
  )
}
