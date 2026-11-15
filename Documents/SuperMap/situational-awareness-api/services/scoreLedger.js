/**
 * Datasheet of scored news and X items.
 * Later scores are compared with the last few days of similar records.
 */

const fs = require('fs')
const { resolveData } = require('./dataPaths')

const WINDOW_MS = 3 * 24 * 60 * 60 * 1000
const KEEP_MS = 14 * 24 * 60 * 60 * 1000
const MAX_ROWS = 1500
const STOP = new Set(['with', 'from', 'that', 'this', 'have', 'were', 'been', 'their', 'about', 'after', 'before', 'into', 'over', 'under', 'than', 'then', 'them', 'they', 'will', 'would', 'could', 'should', 'said', 'says', 'news', 'report'])

function sheetPath() {
  return resolveData('threat-score-sheet.json')
}

function csvPath() {
  return resolveData('threat-score-sheet.csv')
}

function reportsPath() {
  return resolveData('threat-score-reports.json')
}

function clampScore(n) {
  const s = Math.round(Number(n))
  if (!Number.isFinite(s)) return null
  return Math.min(5, Math.max(1, s))
}

function loadRows() {
  try {
    const parsed = JSON.parse(fs.readFileSync(sheetPath(), 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

function topicKeys(text) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP.has(word))
  return [...new Set(words)].slice(0, 24)
}

function overlap(a, b) {
  if (!a?.length || !b?.length) return 0
  const set = new Set(a)
  let n = 0
  for (const word of b) if (set.has(word)) n += 1
  return n
}

function csvCell(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function writeSheet(rows) {
  fs.writeFileSync(sheetPath(), JSON.stringify(rows))
  const lines = ['scored_at,kind,source,title,score,baseline_avg,delta,rationale']
  for (const row of rows) {
    lines.push([
      new Date(row.at).toISOString(),
      row.kind,
      row.source,
      row.title,
      row.score,
      row.baseline == null ? '' : row.baseline,
      row.delta == null ? '' : row.delta,
      row.rationale,
    ].map(csvCell).join(','))
  }
  fs.writeFileSync(csvPath(), `${lines.join('\n')}\n`)
}

function rememberScore(entry) {
  const title = String(entry.title || '').trim().slice(0, 180)
  if (!title || entry.score == null) return null
  const now = Date.now()
  const key = `${String(entry.source || '').toLowerCase()}|${title.toLowerCase()}`
  const row = {
    at: now,
    key,
    kind: entry.kind === 'x' ? 'x' : 'news',
    source: String(entry.source || '').slice(0, 80),
    title,
    score: clampScore(entry.score),
    baseline: entry.baseline == null ? null : Math.round(Number(entry.baseline) * 10) / 10,
    delta: entry.delta == null ? null : Math.round(Number(entry.delta) * 10) / 10,
    rationale: String(entry.rationale || '').slice(0, 320),
    keys: topicKeys(`${title} ${entry.text || ''}`),
  }
  const rows = loadRows().filter((item) => item.key !== key && now - Number(item.at || 0) < KEEP_MS)
  rows.push(row)
  rows.sort((a, b) => (b.at || 0) - (a.at || 0))
  writeSheet(rows.slice(0, MAX_ROWS))
  return row
}

function baselineFor(text, { now = Date.now() } = {}) {
  const keys = topicKeys(text)
  const rows = loadRows().filter((row) => now - Number(row.at || 0) < WINDOW_MS && row.score != null)
  const related = keys.length
    ? rows.filter((row) => overlap(row.keys, keys) >= 2)
    : []
  const pool = related.length >= 3 ? related : rows
  if (!pool.length) {
    return { count: 0, related: related.length, average: null, keys }
  }
  const average = Math.round((pool.reduce((sum, row) => sum + Number(row.score), 0) / pool.length) * 10) / 10
  return { count: pool.length, related: related.length, average, keys }
}

function reconcileScore(rawScore, baseline) {
  const raw = clampScore(rawScore) || 1
  if (!baseline || baseline.average == null || baseline.count < 3) {
    const count = baseline?.count || 0
    return {
      score: raw,
      baseline: baseline?.average ?? null,
      delta: null,
      note: count
        ? `Only ${count} comparable record${count === 1 ? '' : 's'} in the last few days, so this stays with the article.`
        : 'No comparable records from the last few days, so this is read from the article.',
    }
  }
  const avg = baseline.average
  let score = raw
  let note = `Similar items over the last few days averaged ${avg}/5 across ${baseline.count} records.`
  if (raw >= avg + 2) {
    note = `${note} This one is a step up from that norm (text read ${raw}/5).`
  } else if (raw + 1.5 <= avg) {
    score = clampScore(Math.round((raw + avg) / 2))
    note = `${note} The text read ${raw}/5, under that norm, so the score moves toward the recent average.`
  } else {
    score = clampScore(Math.round((raw * 0.45) + (avg * 0.55)))
    note = `${note} The text read ${raw}/5 and looks like a continuation, so the score stays near that average.`
  }
  return {
    score,
    baseline: avg,
    delta: Math.round((score - avg) * 10) / 10,
    note,
  }
}

function sheetSummary() {
  const rows = loadRows().filter((row) => Date.now() - Number(row.at || 0) < WINDOW_MS && row.score != null)
  if (!rows.length) return { count: 0, average: null, highs: [] }
  const average = Math.round((rows.reduce((sum, row) => sum + Number(row.score), 0) / rows.length) * 10) / 10
  const highs = rows
    .filter((row) => row.score >= 4)
    .slice(0, 6)
    .map((row) => ({ title: row.title, score: row.score, source: row.source, kind: row.kind }))
  return { count: rows.length, average, highs }
}

function addScoreReport(body) {
  const suggested = clampScore(body.suggestedScore)
  if (!suggested) {
    const err = new Error('suggestedScore must be 1–5')
    err.code = 'BAD_REQUEST'
    throw err
  }
  const row = {
    at: Date.now(),
    id: String(body.id || '').slice(0, 120),
    title: String(body.title || '').slice(0, 180),
    url: String(body.url || '').slice(0, 500),
    source: String(body.source || '').slice(0, 80),
    kind: body.kind === 'x' ? 'x' : 'news',
    currentScore: clampScore(body.currentScore),
    suggestedScore: suggested,
    note: String(body.note || '').trim().slice(0, 500),
    reporter: String(body.reporter || 'signed-out').slice(0, 80),
  }
  let rows = []
  try {
    const parsed = JSON.parse(fs.readFileSync(reportsPath(), 'utf8'))
    if (Array.isArray(parsed)) rows = parsed
  } catch (_) { /* new sheet */ }
  rows.unshift(row)
  fs.writeFileSync(reportsPath(), JSON.stringify(rows.slice(0, 500)))
  return row
}

module.exports = {
  topicKeys,
  baselineFor,
  reconcileScore,
  rememberScore,
  sheetSummary,
  addScoreReport,
  sheetPath,
  csvPath,
  reportsPath,
}
