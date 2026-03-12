import './AmbientBgLight.css'

/**
 * Light-mode-only background: grids, meshes, topographic lines,
 * flowing oil-style lines, and fake flight paths to reduce flat white.
 */
export default function AmbientBgLight() {
  return (
    <div className="ambient-bg-light" aria-hidden>
      <div className="ambient-bg-light-grid" />
      <div className="ambient-bg-light-mesh" />
      <div className="ambient-bg-light-topo" />
      <div className="ambient-bg-light-flow" />
      <div className="ambient-bg-light-paths" />
    </div>
  )
}
