import { useEffect, useState } from 'react'
import {
  SNAPSHOT_STATE,
  getSnapshotState,
  startSnapshotPolling,
  subscribeSnapshot,
} from '../lib/snapshotClient'
import './DataFreshness.css'

/** An old manifest means the collector has not published for a while. */
const OLD_AFTER_MS = 8 * 60 * 60 * 1000

function formatWhen(iso) {
  const at = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(at)) return null
  return new Date(at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * "Data as of 26 Nov, 18:45 · updates every 4h" plus a marker when a source is
 * stale, so a quietly failing feed is visible instead of looking current.
 */
export default function DataFreshness({ className = '' }) {
  const [snapshot, setSnapshot] = useState(() => getSnapshotState())

  useEffect(() => {
    startSnapshotPolling()
    return subscribeSnapshot(setSnapshot)
  }, [])

  const manifest = snapshot.manifest
  const generatedAt = formatWhen(manifest?.generatedAt)
  const sources = manifest?.sources && typeof manifest.sources === 'object'
    ? Object.values(manifest.sources)
    : []
  const staleCount = sources.filter((source) => source && (source.stale || source.ok === false)).length
  // The client stamps the age when it reads the manifest, so this stays pure.
  const old = typeof snapshot.ageMs === 'number' && snapshot.ageMs > OLD_AFTER_MS

  // Nothing published (local dev, or the branch is not there yet): stay quiet.
  if (!manifest || !generatedAt) return null

  const detail = [
    `Published ${generatedAt}`,
    `${sources.length} sources`,
    staleCount ? `${staleCount} stale` : 'all fresh',
  ].join(' · ')

  const state = snapshot.state === SNAPSHOT_STATE.DEGRADED ? 'refresh failing' : 'every 4 hours'

  return (
    <p className={`data-freshness ${old || staleCount || snapshot.state === SNAPSHOT_STATE.DEGRADED ? 'data-freshness--stale' : ''} ${className}`.trim()} title={detail}>
      Data as of {generatedAt} · updates {state}
      {staleCount > 0 ? ` · ${staleCount} source${staleCount === 1 ? '' : 's'} stale` : ''}
      {old ? ' · overdue' : ''}
    </p>
  )
}
