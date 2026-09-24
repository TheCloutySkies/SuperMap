/**
 * OSINT X (Twitter) feed configuration.
 * Handles are ingested via FxTwitter public profile API (no key):
 *   https://api.fxtwitter.com/2/profile/:handle/statuses
 */

/** Default feed entries (handle + name + priority). */
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
  OSINT_X_FEEDS_DEFAULT,
}
