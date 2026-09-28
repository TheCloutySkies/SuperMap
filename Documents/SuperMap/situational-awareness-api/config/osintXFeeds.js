/**
 * OSINT X (Twitter) feed configuration.
 * Handles are ingested via FxTwitter public profile API (no key):
 *   https://api.fxtwitter.com/2/profile/:handle/statuses
 */

/** Normalize handle: trim, strip @, allow only [a-zA-Z0-9_]. */
function normalizeHandle(handle) {
  if (handle == null) return ''
  const s = String(handle).trim().replace(/^@/, '')
  return s.replace(/[^a-zA-Z0-9_]/g, '')
}

/**
 * Merge feed entries by case-insensitive handle (first wins for name/priority).
 * @param {...Array<{name?: string, handle: string, priority?: string}>} lists
 */
function mergeOsintXFeeds(...lists) {
  const byKey = new Map()
  for (const list of lists) {
    for (const entry of list || []) {
      const handle = normalizeHandle(entry?.handle != null ? entry.handle : entry)
      if (!handle) continue
      const key = handle.toLowerCase()
      if (byKey.has(key)) continue
      byKey.set(key, {
        name: (entry && entry.name) || handle,
        handle,
        priority: (entry && entry.priority) || 'high',
      })
    }
  }
  return Array.from(byKey.values())
}

/** Legacy defaults — kept so existing accounts not in the expanded list remain. */
const OSINT_X_FEEDS_LEGACY = [
  { name: 'DefenceGeek', handle: 'DefenceGeek', priority: 'high' },
  { name: 'MATA OSINT', handle: 'MATA_osint', priority: 'high' },
  { name: 'The Osint Bunker', handle: 'TheOsintBunker', priority: 'high' },
  { name: 'UK Def Journal', handle: 'UKDefJournal', priority: 'high' },
  { name: 'Status-6', handle: 'Archer83Able', priority: 'high' },
  { name: 'Aurora Intel', handle: 'AuroraIntel', priority: 'high' },
  { name: 'Aleph א', handle: 'no_itsmyturn', priority: 'high' },
  { name: 'GMI', handle: 'Global_Mil_Info', priority: 'high' },
  { name: 'ELINT News', handle: 'ELINTNews', priority: 'high' },
  { name: 'OSINT Techniques', handle: 'OSINTtechniques', priority: 'high' },
  { name: 'TheIntelFrog', handle: 'TheIntelFrog', priority: 'high' },
  { name: 'Intel Crab', handle: 'IntelCrab', priority: 'high' },
  { name: 'Conflict News', handle: 'Conflicts', priority: 'high' },
  { name: 'MJ Cruickshank', handle: 'MJ_Cruickshank', priority: 'medium' },
  { name: 'Kyle Glen', handle: 'KyleJGlen', priority: 'medium' },
  { name: 'Luke Pierce', handle: 'lukepierce100', priority: 'medium' },
  { name: 'Liveuamap', handle: 'Liveuamap', priority: 'high' },
  { name: 'WarMonitor', handle: 'TheWarMonitor', priority: 'high' },
  { name: 'Jennifer Griffin', handle: 'JenGriffinFNC', priority: 'high' },
  { name: 'Fox News', handle: 'FoxNews', priority: 'high' },
  { name: 'DEFCON Warning System', handle: 'DEFCONWSALERTS', priority: 'high' },
  { name: 'BNO News', handle: 'BNONews', priority: 'high' },
  { name: 'BNO Desk', handle: 'BNODesk', priority: 'high' },
  { name: 'Institute for the Study of War', handle: 'TheStudyOfWar', priority: 'high' },
  { name: 'EndGameWW3', handle: 'EndGameWW3', priority: 'high' },
]

/** Expanded denser list (handles without @). */
const OSINT_X_FEEDS_EXPANDED = [
  { name: 'The Lookout', handle: 'The_Lookout_N', priority: 'high' },
  { name: 'JackStr', handle: 'JackStr42679640', priority: 'high' },
  { name: 'Michael Kofman', handle: 'KofmanMichael', priority: 'high' },
  { name: 'Preston Stewart', handle: 'prestonstew_', priority: 'high' },
  { name: 'OSINT Technical', handle: 'Osinttechnical', priority: 'high' },
  { name: 'Apex', handle: 'Apex_WW', priority: 'high' },
  { name: 'BRICS FA', handle: 'bricsfa', priority: 'high' },
  { name: 'Ukraine Map', handle: 'ukraine_map', priority: 'high' },
  { name: 'GeoConfirmed', handle: 'GeoConfirmed', priority: 'high' },
  { name: 'DefMon3', handle: 'DefMon3', priority: 'high' },
  { name: 'Sent Defender', handle: 'sentdefender', priority: 'high' },
  { name: 'TheIntelFrog', handle: 'TheIntelFrog', priority: 'high' },
  { name: 'Intel Crab', handle: 'IntelCrab', priority: 'high' },
  { name: 'Conflict News', handle: 'Conflicts', priority: 'high' },
  { name: 'Liveuamap', handle: 'Liveuamap', priority: 'high' },
  { name: 'WarMonitor', handle: 'TheWarMonitor', priority: 'high' },
  { name: 'Jennifer Griffin', handle: 'JenGriffinFNC', priority: 'high' },
  { name: 'DEFCON Warning System', handle: 'DEFCONWSALERTS', priority: 'high' },
  { name: 'BNO News', handle: 'BNONews', priority: 'high' },
  { name: 'Institute for the Study of War', handle: 'TheStudyOfWar', priority: 'high' },
  { name: 'EndGameWW3', handle: 'EndGameWW3', priority: 'high' },
  { name: 'Al Arabiya Breaking', handle: 'AlArabiya_Brk', priority: 'high' },
  { name: 'DefenceGeek', handle: 'DefenceGeek', priority: 'high' },
  { name: 'Status-6', handle: 'Archer83Able', priority: 'high' },
  { name: 'Aurora Intel', handle: 'AuroraIntel', priority: 'high' },
  { name: 'Aleph א', handle: 'no_itsmyturn', priority: 'high' },
  { name: 'AZ Intel', handle: 'AZ_Intel_', priority: 'high' },
  { name: 'GMI', handle: 'Global_Mil_Info', priority: 'high' },
  { name: 'ELINT News', handle: 'ELINTNews', priority: 'high' },
  { name: 'OSINT Techniques', handle: 'OSINTtechniques', priority: 'high' },
  { name: 'Max Geopolitics', handle: 'max4geopolitics', priority: 'high' },
  { name: 'OSINT Warfare', handle: 'OSINTWarfare', priority: 'high' },
  { name: 'Brian E6B', handle: 'BrianE6B', priority: 'high' },
  { name: 'War Mapper', handle: 'War_Mapper', priority: 'high' },
  { name: 'Armchair Admiral', handle: 'ArmchairAdml', priority: 'high' },
  { name: 'Kyiv Independent', handle: 'KyivIndependent', priority: 'high' },
  { name: 'OsintTV', handle: 'OsintTV', priority: 'high' },
  { name: 'MATA OSINT', handle: 'MATA_osint', priority: 'high' },
  { name: 'The Intel Hub', handle: 'The_IntelHub', priority: 'high' },
  { name: 'Visegrad24', handle: 'visegrad24', priority: 'high' },
  { name: 'Osint613', handle: 'Osint613', priority: 'high' },
]

/** Default feed entries (expanded + legacy extras, deduped). */
const OSINT_X_FEEDS_DEFAULT = mergeOsintXFeeds(OSINT_X_FEEDS_EXPANDED, OSINT_X_FEEDS_LEGACY)

module.exports = {
  OSINT_X_FEEDS_DEFAULT,
  OSINT_X_FEEDS_EXPANDED,
  OSINT_X_FEEDS_LEGACY,
  normalizeHandle,
  mergeOsintXFeeds,
}
