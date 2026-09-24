#!/usr/bin/env node
/**
 * One-time (or rare) seed of CommunityGuardAPI nearby results for major US metros.
 * Writes data/sex-offenders/offenders-pack.json — runtime serves this file only.
 *
 * Usage (from situational-awareness-api):
 *   node scripts/seed-sex-offenders.js
 *   node scripts/seed-sex-offenders.js --force   # re-pull even if pack exists
 *   node scripts/seed-sex-offenders.js --dry-run
 *
 * Budget: ~1 call per metro. Free tier = 100 calls/month.
 */
require('dotenv').config()
const {
  readPack,
  writePack,
  fetchNearby,
  apiKey,
  PACK_FILE,
} = require('../services/sexOffenders')

/** ~35 major metros — one nearby call each. */
const METROS = [
  { id: 'new-york', name: 'New York, NY', lat: 40.7128, lon: -74.006 },
  { id: 'los-angeles', name: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437 },
  { id: 'chicago', name: 'Chicago, IL', lat: 41.8781, lon: -87.6298 },
  { id: 'houston', name: 'Houston, TX', lat: 29.7604, lon: -95.3698 },
  { id: 'phoenix', name: 'Phoenix, AZ', lat: 33.4484, lon: -112.074 },
  { id: 'philadelphia', name: 'Philadelphia, PA', lat: 39.9526, lon: -75.1652 },
  { id: 'san-antonio', name: 'San Antonio, TX', lat: 29.4241, lon: -98.4936 },
  { id: 'san-diego', name: 'San Diego, CA', lat: 32.7157, lon: -117.1611 },
  { id: 'dallas', name: 'Dallas, TX', lat: 32.7767, lon: -96.797 },
  { id: 'san-jose', name: 'San Jose, CA', lat: 37.3382, lon: -121.8863 },
  { id: 'austin', name: 'Austin, TX', lat: 30.2672, lon: -97.7431 },
  { id: 'jacksonville', name: 'Jacksonville, FL', lat: 30.3322, lon: -81.6557 },
  { id: 'fort-worth', name: 'Fort Worth, TX', lat: 32.7555, lon: -97.3308 },
  { id: 'columbus', name: 'Columbus, OH', lat: 39.9612, lon: -82.9988 },
  { id: 'charlotte', name: 'Charlotte, NC', lat: 35.2271, lon: -80.8431 },
  { id: 'indianapolis', name: 'Indianapolis, IN', lat: 39.7684, lon: -86.1581 },
  { id: 'san-francisco', name: 'San Francisco, CA', lat: 37.7749, lon: -122.4194 },
  { id: 'seattle', name: 'Seattle, WA', lat: 47.6062, lon: -122.3321 },
  { id: 'denver', name: 'Denver, CO', lat: 39.7392, lon: -104.9903 },
  { id: 'washington-dc', name: 'Washington, DC', lat: 38.9072, lon: -77.0369 },
  { id: 'boston', name: 'Boston, MA', lat: 42.3601, lon: -71.0589 },
  { id: 'nashville', name: 'Nashville, TN', lat: 36.1627, lon: -86.7816 },
  { id: 'detroit', name: 'Detroit, MI', lat: 42.3314, lon: -83.0458 },
  { id: 'oklahoma-city', name: 'Oklahoma City, OK', lat: 35.4676, lon: -97.5164 },
  { id: 'portland', name: 'Portland, OR', lat: 45.5152, lon: -122.6784 },
  { id: 'las-vegas', name: 'Las Vegas, NV', lat: 36.1699, lon: -115.1398 },
  { id: 'memphis', name: 'Memphis, TN', lat: 35.1495, lon: -90.049 },
  { id: 'louisville', name: 'Louisville, KY', lat: 38.2527, lon: -85.7585 },
  { id: 'baltimore', name: 'Baltimore, MD', lat: 39.2904, lon: -76.6122 },
  { id: 'milwaukee', name: 'Milwaukee, WI', lat: 43.0389, lon: -87.9065 },
  { id: 'albuquerque', name: 'Albuquerque, NM', lat: 35.0844, lon: -106.6504 },
  { id: 'atlanta', name: 'Atlanta, GA', lat: 33.749, lon: -84.388 },
  { id: 'miami', name: 'Miami, FL', lat: 25.7617, lon: -80.1918 },
  { id: 'minneapolis', name: 'Minneapolis, MN', lat: 44.9778, lon: -93.265 },
  { id: 'new-orleans', name: 'New Orleans, LA', lat: 29.9511, lon: -90.0715 },
]

const RADIUS_MILES = 10
const DELAY_MS = 1100

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const force = process.argv.includes('--force')
  const dryRun = process.argv.includes('--dry-run')
  const existing = readPack()

  if (!force && existing.seededAt && (existing.offenders || []).length > 0) {
    console.log(`Pack already seeded (${existing.offenders.length} offenders at ${existing.seededAt}).`)
    console.log(`File: ${PACK_FILE}`)
    console.log('Re-run with --force to spend API calls again.')
    process.exit(0)
  }

  if (!apiKey()) {
    console.error('Set COMMUNITYGUARD_API_KEY in .env before seeding.')
    process.exit(1)
  }

  console.log(`Seeding ${METROS.length} metros @ ${RADIUS_MILES} mi (dryRun=${dryRun})`)
  const byId = new Map()
  const metroMeta = []
  let lastUsage = null

  // Reuse prior DC probe sample if present in /tmp to save 1 call? Skip — keep script self-contained.
  for (let i = 0; i < METROS.length; i++) {
    const m = METROS[i]
    console.log(`[${i + 1}/${METROS.length}] ${m.name} …`)
    if (dryRun) {
      metroMeta.push({ ...m, count: 0, dryRun: true })
      continue
    }
    try {
      const { data, usage } = await fetchNearby(m.lat, m.lon, RADIUS_MILES)
      lastUsage = usage
      const rows = Array.isArray(data) ? data : []
      let added = 0
      for (const row of rows) {
        if (row?.id == null) continue
        const prev = byId.get(row.id)
        if (!prev) {
          byId.set(row.id, { ...row, _metros: [m.id] })
          added++
        } else {
          const metros = new Set(prev._metros || [])
          metros.add(m.id)
          byId.set(row.id, { ...prev, ...row, _metros: [...metros] })
        }
      }
      metroMeta.push({
        id: m.id,
        name: m.name,
        lat: m.lat,
        lon: m.lon,
        count: rows.length,
        added,
      })
      console.log(`  → ${rows.length} rows (${added} new) · remaining=${usage.remaining}`)
    } catch (err) {
      console.error(`  FAILED ${m.name}:`, err.message, err.usage || '')
      metroMeta.push({
        id: m.id,
        name: m.name,
        lat: m.lat,
        lon: m.lon,
        error: err.message,
        count: 0,
      })
    }
    if (i < METROS.length - 1 && !dryRun) await sleep(DELAY_MS)
  }

  if (dryRun) {
    console.log('Dry run done — no file written.')
    return
  }

  const offenders = [...byId.values()].map((o) => {
    const { distance_miles: _d, ...rest } = o
    return rest
  })

  const pack = {
    version: 1,
    source: 'CommunityGuardAPI',
    seededAt: new Date().toISOString(),
    radiusMiles: RADIUS_MILES,
    metros: metroMeta,
    apiUsage: lastUsage,
    offenders,
  }
  writePack(pack)
  console.log(`Wrote ${offenders.length} unique offenders → ${PACK_FILE}`)
  console.log(`API remaining (last response): ${lastUsage?.remaining ?? 'n/a'}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
