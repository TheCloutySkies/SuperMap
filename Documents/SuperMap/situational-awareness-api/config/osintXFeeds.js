/**
 * OSINT X (Twitter) feed configuration.
 * Canonical list of OSINT handles; ingestion tries Nitter mirrors in order (see userConfig.getNitterMirrors).
 * RSS format: https://<mirror>/<handle>/rss
 *
 * Mirrors (backup if primary fails): nitter.net, nitter.poast.org, nitter.privacydev.net
 * Set NITTER_MIRRORS in .env (comma-separated) to override, or NITTER_BASE for a single mirror.
 */

const NITTER_MIRRORS_DEFAULT = [
  'https://nitter.net',
  'https://nitter.poast.org',
  'https://nitter.privacydev.net',
]

/** Canonical RSS URLs for all handles (primary mirror nitter.net). Backup mirrors used at fetch time. */
const CANONICAL_RSS_URLS = [
  'https://nitter.net/DefenceGeek/rss',
  'https://nitter.net/MATA_osint/rss',
  'https://nitter.net/TheOsintBunker/rss',
  'https://nitter.net/UKDefJournal/rss',
  'https://nitter.net/Archer83Able/rss',
  'https://nitter.net/AuroraIntel/rss',
  'https://nitter.net/no_itsmyturn/rss',
  'https://nitter.net/Global_Mil_Info/rss',
  'https://nitter.net/ELINTNews/rss',
  'https://nitter.net/OSINTtechniques/rss',
  'https://nitter.net/TheIntelFrog/rss',
  'https://nitter.net/IntelCrab/rss',
  'https://nitter.net/Conflicts/rss',
  'https://nitter.net/MJ_Cruickshank/rss',
  'https://nitter.net/KyleJGlen/rss',
  'https://nitter.net/lukepierce100/rss',
  'https://nitter.net/Liveuamap/rss',
  'https://nitter.net/TheWarMonitor/rss',
  'https://nitter.net/JenGriffinFNC/rss',
  'https://nitter.net/FoxNews/rss',
  'https://nitter.net/DEFCONWSALERTS/rss',
  'https://nitter.net/BNONews/rss',
  'https://nitter.net/BNODesk/rss',
  'https://nitter.net/TheStudyofWar/rss',
  'https://nitter.net/EndGameWW3/rss',
]

/** Default feed entries (handle + name + priority). Must match DEFAULT_OSINT_X in userConfig. */
const OSINT_X_FEEDS_DEFAULT = [
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
  { name: 'Institute for the Study of War', handle: 'TheStudyofWar', priority: 'high' },
  { name: 'EndGameWW3', handle: 'EndGameWW3', priority: 'high' },
]

module.exports = {
  CANONICAL_RSS_URLS,
  OSINT_X_FEEDS_DEFAULT,
  NITTER_MIRRORS_DEFAULT,
}
