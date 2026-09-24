/** Ratio bands vs a reference rate (national average or long-run mean). */
export const LEVEL_THRESHOLDS = Object.freeze({
  low: 0.75,
  medium: 1.25,
  high: 1.75,
})

/**
 * Compare rate to a reference.
 * Low < 0.75× · Medium < 1.25× · High < 1.75× · Extreme ≥ 1.75×
 */
export function levelFromRatio(rate, reference) {
  const r = Number(rate)
  const ref = Number(reference)
  if (!Number.isFinite(r) || !Number.isFinite(ref) || ref <= 0) {
    return { id: 'unknown', label: '—', ratio: null }
  }
  const ratio = r / ref
  if (ratio < LEVEL_THRESHOLDS.low) return { id: 'low', label: 'Low', ratio }
  if (ratio < LEVEL_THRESHOLDS.medium) return { id: 'medium', label: 'Medium', ratio }
  if (ratio < LEVEL_THRESHOLDS.high) return { id: 'high', label: 'High', ratio }
  return { id: 'extreme', label: 'Extreme', ratio }
}
