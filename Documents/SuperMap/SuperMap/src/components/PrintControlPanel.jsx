import { BASEMAPS } from '../constants'
import { PRINT_SCALES } from '../lib/printScale'
import { PRINT_MORE_GROUPS, PRINT_OPTIONAL_LAYERS } from '../lib/printLayers'
import { canRedo, canUndo } from '../lib/printHistory'
import { PRINT_QUALITIES } from '../lib/printRender'

function Seg({ label, value, options, onChange }) {
  return (
    <div className="print-seg">
      <span className="print-seg-label">{label}</span>
      <div className="print-seg-opts" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            className={`print-seg-btn ${value === opt.value ? 'is-on' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function PrintControlPanel({
  scaleId,
  onScaleId,
  orientation,
  onOrientation,
  units,
  onUnits,
  labels,
  onLabels,
  ink,
  onInk,
  hillshade,
  onHillshade,
  contours,
  onContours,
  secondary,
  onSecondary,
  layerToggles,
  onToggleLayer,
  moreLayers,
  onToggleMore,
  moreOpen,
  onMoreOpen,
  basemapId,
  onBasemapId,
  mapTitle,
  onMapTitle,
  qualityId,
  onQualityId,
  sheetExtra,
  pageCount,
  history,
  onUndo,
  onRedo,
  onDownload,
  onPrint,
  onShare,
  busy,
  status,
}) {
  return (
    <aside className="print-panel" aria-label="Print map controls">
      <header className="print-panel-head">
        <h2>Print</h2>
        <p className="print-panel-kicker">US Letter · actual scale</p>
      </header>

      <section className="print-panel-section">
        <h3>Sheet</h3>
        <label className="print-field">
          <span>Title</span>
          <input
            type="text"
            value={mapTitle}
            maxLength={64}
            placeholder="Good Palantir"
            onChange={(e) => onMapTitle(e.target.value)}
          />
        </label>
        <Seg
          label="Quality"
          value={qualityId}
          onChange={onQualityId}
          options={PRINT_QUALITIES.map((q) => ({ value: q.id, label: q.label }))}
        />
        <p className="print-help print-help--muted">
          Standard is sharper than the old 150 DPI sheets. High is 300 DPI — use it when the page count is small.
        </p>
        {sheetExtra}
      </section>

      <section className="print-panel-section">
        <h3>Pages</h3>
        <p className="print-help">
          Click the map to pick a page, click again to drop it. Shift-drag picks a whole area.
          Drag a picked page to move it: its edges snap to nearby pages, otherwise it moves in 1 km steps.
          Arrow keys nudge the last page you touched.
        </p>
        <p className="print-help print-help--muted">
          US Letter. Print at Actual size / 100%, then measure the km scale bar in the collar
          (100 mm at 1:25k). Keep this tab open while it renders.
        </p>
        <p className="print-page-count">{pageCount} page{pageCount === 1 ? '' : 's'} queued</p>
      </section>

      <section className="print-panel-section">
        <h3>Scale</h3>
        <div className="print-scale-list">
          {PRINT_SCALES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`print-scale-btn ${scaleId === s.id ? 'is-on' : ''}`}
              onClick={() => onScaleId(s.id)}
            >
              <span className="print-scale-name">{s.label}</span>
              <span className="print-scale-note">{s.note}</span>
            </button>
          ))}
        </div>
        <p className="print-help print-help--muted">
          Pages already picked keep their original scale when you switch.
        </p>
        <div className="print-orient">
          <button
            type="button"
            className={`print-seg-btn ${orientation === 'portrait' ? 'is-on' : ''}`}
            onClick={() => onOrientation('portrait')}
          >
            Portrait
          </button>
          <button
            type="button"
            className={`print-seg-btn ${orientation === 'landscape' ? 'is-on' : ''}`}
            onClick={() => onOrientation('landscape')}
          >
            Landscape
          </button>
        </div>
      </section>

      <section className="print-panel-section print-actions">
        <button type="button" className="btn-y2k" disabled={!canUndo(history) || busy} onClick={onUndo}>Undo</button>
        <button type="button" className="btn-y2k" disabled={!canRedo(history) || busy} onClick={onRedo}>Redo</button>
        <button type="button" className="btn-y2k print-actions-primary" disabled={!pageCount || busy} onClick={onDownload}>Download</button>
        <button type="button" className="btn-y2k print-actions-primary" disabled={!pageCount || busy} onClick={onPrint}>Print</button>
        <button type="button" className="btn-y2k" disabled={busy} onClick={onShare}>Share</button>
      </section>

      {status && <p className="print-status" role="status">{status}</p>}

      <section className="print-panel-section">
        <h3>Map</h3>
        <Seg
          label="Units"
          value={units}
          onChange={onUnits}
          options={[
            { value: 'metric', label: 'Metric' },
            { value: 'imperial', label: 'Imperial' },
          ]}
        />
        <Seg
          label="Labels"
          value={labels}
          onChange={onLabels}
          options={[
            { value: 'sparse', label: 'Sparse' },
            { value: 'full', label: 'Full' },
          ]}
        />
        <Seg
          label="Ink"
          value={ink}
          onChange={onInk}
          options={[
            { value: 'colour', label: 'Colour' },
            { value: 'bw', label: 'B&W' },
          ]}
        />
        <Seg
          label="Hillshade"
          value={hillshade}
          onChange={onHillshade}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'soft', label: 'Soft' },
            { value: 'sharp', label: 'Sharp' },
          ]}
        />
        <Seg
          label="Contours"
          value={contours}
          onChange={onContours}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'sparse', label: 'Sparse' },
            { value: 'full', label: 'Full' },
          ]}
        />
        <Seg
          label="Secondary"
          value={secondary}
          onChange={onSecondary}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'utm', label: 'UTM' },
            { value: 'latlong', label: 'LatLong' },
          ]}
        />
      </section>

      <section className="print-panel-section">
        <h3>Optional layers</h3>
        <div className="print-toggles">
          {PRINT_OPTIONAL_LAYERS.map((l) => (
            <label key={l.key} className="print-toggle">
              <input
                type="checkbox"
                checked={!!layerToggles[l.key]}
                onChange={(e) => onToggleLayer(l.key, e.target.checked)}
              />
              <span>{l.label}</span>
            </label>
          ))}
        </div>
        <button
          type="button"
          className="print-more-btn"
          onClick={() => onMoreOpen(!moreOpen)}
          aria-expanded={moreOpen}
        >
          {moreOpen ? 'Hide more layers' : 'More layers'}
        </button>
        {moreOpen && (
          <div className="print-more-groups">
            {PRINT_MORE_GROUPS.map((g) => (
              <div key={g.id} className="print-more-group">
                <h4>{g.label}</h4>
                {g.layers.map((l) => (
                  <label key={l.key} className="print-toggle">
                    <input
                      type="checkbox"
                      checked={!!moreLayers[l.key]}
                      onChange={(e) => onToggleMore(l.key, e.target.checked)}
                    />
                    <span>{l.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="print-panel-section">
        <h3>Basemap</h3>
        <p className="print-help print-help--muted">All SuperMap map types. Raster/hybrid tiles MapLibre can paint.</p>
        <div className="print-basemap-list">
          {BASEMAPS.filter((b) => b.type !== 'placeholder').map((b) => (
            <label key={b.id} className={`print-toggle ${basemapId === b.id ? 'is-on' : ''}`}>
              <input
                type="radio"
                name="print-basemap"
                checked={basemapId === b.id}
                onChange={() => onBasemapId(b.id)}
              />
              <span>{b.label}</span>
            </label>
          ))}
        </div>
      </section>
    </aside>
  )
}
