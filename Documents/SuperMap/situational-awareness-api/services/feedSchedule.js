/**
 * Shared 08:00 / 15:00 America/New_York schedule windows for
 * MediaStack-aligned batches (news RSS, OSINT publishers, threat summary).
 */

/** Hours (0–23) in America/New_York when a batch pull is allowed. */
const PULL_HOURS_ET = [8, 15]

/**
 * Current calendar hour key in America/New_York, e.g. "2026-09-26T08".
 */
function etHourKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type) => parts.find((p) => p.type === type)?.value
  const year = get('year')
  const month = get('month')
  const day = get('day')
  let hour = get('hour')
  // Some engines return "24" for midnight; normalize.
  if (hour === '24') hour = '00'
  return `${year}-${month}-${day}T${hour}`
}

function etHourNumber(date = new Date()) {
  const key = etHourKey(date)
  const hour = Number(key.slice(-2))
  return Number.isFinite(hour) ? hour : -1
}

function isPullWindowHour(date = new Date()) {
  return PULL_HOURS_ET.includes(etHourNumber(date))
}

/**
 * Most recent 08:00 or 15:00 ET window start as epoch ms (approximation via
 * stepping back hour-by-hour — fine for catch-up decisions).
 */
function lastPullWindowStartMs(date = new Date()) {
  const probe = new Date(date.getTime())
  for (let i = 0; i < 24; i++) {
    if (PULL_HOURS_ET.includes(etHourNumber(probe))) {
      // Floor to the start of this ET hour by finding the key and reconstructing.
      // We only need a timestamp for comparison; using probe is enough (within the hour).
      const hourStartApprox = new Date(probe)
      hourStartApprox.setUTCMinutes(0, 0, 0)
      return hourStartApprox.getTime()
    }
    probe.setTime(probe.getTime() - 60 * 60 * 1000)
  }
  return date.getTime() - 12 * 60 * 60 * 1000
}

/**
 * True when cache is empty or last fetch predates the most recent 8/15 ET window.
 * @param {number|string|null} lastFetchedAt — epoch ms or ISO string
 */
function needsCatchUp(lastFetchedAt, now = new Date()) {
  if (lastFetchedAt == null || lastFetchedAt === '') return true
  const ts = typeof lastFetchedAt === 'number' ? lastFetchedAt : Date.parse(lastFetchedAt)
  if (!Number.isFinite(ts) || ts <= 0) return true
  return ts < lastPullWindowStartMs(now)
}

/** In-memory once-per-hour guard for a named batch job. */
const lastDoneHourKeys = Object.create(null)

function isBatchDue(jobName, date = new Date()) {
  if (!isPullWindowHour(date)) return false
  const key = etHourKey(date)
  if (lastDoneHourKeys[jobName] === key) return false
  return true
}

function markBatchDone(jobName, date = new Date()) {
  lastDoneHourKeys[jobName] = etHourKey(date)
}

function getLastBatchHourKey(jobName) {
  return lastDoneHourKeys[jobName] || null
}

module.exports = {
  PULL_HOURS_ET,
  etHourKey,
  etHourNumber,
  isPullWindowHour,
  lastPullWindowStartMs,
  needsCatchUp,
  isBatchDue,
  markBatchDone,
  getLastBatchHourKey,
}
