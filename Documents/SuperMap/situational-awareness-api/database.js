const Database = require('better-sqlite3')
const path = require('path')
const crypto = require('crypto')

const dbPath = path.join(__dirname, 'osint.db')
const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    lat REAL,
    lon REAL,
    timestamp INTEGER,
    source TEXT,
    raw_data TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);

  CREATE TABLE IF NOT EXISTS tags (
    name TEXT PRIMARY KEY
  );
  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    aliases TEXT,
    metadata TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
  CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);

  CREATE TABLE IF NOT EXISTS event_tags (
    event_id TEXT NOT NULL,
    tag_name TEXT NOT NULL,
    PRIMARY KEY (event_id, tag_name),
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (tag_name) REFERENCES tags(name)
  );
  CREATE INDEX IF NOT EXISTS idx_event_tags_tag ON event_tags(tag_name);

  CREATE TABLE IF NOT EXISTS event_entities (
    event_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    PRIMARY KEY (event_id, entity_id),
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (entity_id) REFERENCES entities(id)
  );
  CREATE INDEX IF NOT EXISTS idx_event_entities_entity ON event_entities(entity_id);
`)

function insertOrIgnore(row) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO events (id, type, title, description, lat, lon, timestamp, source, raw_data)
    VALUES (@id, @type, @title, @description, @lat, @lon, @timestamp, @source, @raw_data)
  `)
  return stmt.run(row)
}

function ensureTag(name) {
  if (!name || typeof name !== 'string') return
  const n = name.trim().toLowerCase()
  if (!n) return
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(n)
}

function ensureEntity(name, type = 'place', aliases = null) {
  if (!name || typeof name !== 'string') return null
  const n = name.trim()
  if (!n) return null
  const id = crypto.createHash('sha256').update(`${type}:${n.toLowerCase()}`).digest('hex').slice(0, 24)
  db.prepare(
    'INSERT OR IGNORE INTO entities (id, name, type, aliases) VALUES (?, ?, ?, ?)'
  ).run(id, n, type, aliases ? JSON.stringify(aliases) : null)
  return id
}

function linkEventTag(eventId, tagName) {
  if (!eventId || !tagName) return
  ensureTag(tagName)
  const n = tagName.trim().toLowerCase()
  db.prepare('INSERT OR IGNORE INTO event_tags (event_id, tag_name) VALUES (?, ?)').run(eventId, n)
}

function linkEventEntity(eventId, entityId) {
  if (!eventId || !entityId) return
  db.prepare('INSERT OR IGNORE INTO event_entities (event_id, entity_id) VALUES (?, ?)').run(eventId, entityId)
}

function getEventTagNames(eventId) {
  const rows = db.prepare('SELECT tag_name FROM event_tags WHERE event_id = ?').all(eventId)
  return rows.map((r) => r.tag_name)
}

function getEventEntityIds(eventId) {
  const rows = db.prepare('SELECT entity_id FROM event_entities WHERE event_id = ?').all(eventId)
  return rows.map((r) => r.entity_id)
}

function getEventsWithTag(tagName, limit = 100) {
  const rows = db.prepare(`
    SELECT e.id, e.type, e.title, e.description, e.lat, e.lon, e.timestamp, e.source, e.raw_data
    FROM events e
    JOIN event_tags et ON e.id = et.event_id
    WHERE et.tag_name = ?
    ORDER BY e.timestamp DESC
    LIMIT ?
  `).all(tagName.trim().toLowerCase(), limit)
  return rows
}

function parseRawData(rawData) {
  if (!rawData) return {}
  try {
    return typeof rawData === 'string' ? JSON.parse(rawData) : rawData
  } catch (_) {
    return {}
  }
}

function getEvents(limit = 100, startTime = null, endTime = null, type = null, bbox = null, sources = null, country = null, highConfidenceOnly = false) {
  let sql = 'SELECT id, type, title, description, lat, lon, timestamp, source, raw_data FROM events WHERE 1=1'
  const params = []
  if (startTime != null) {
    sql += ' AND timestamp >= ?'
    params.push(startTime)
  }
  if (endTime != null) {
    sql += ' AND timestamp <= ?'
    params.push(endTime)
  }
  if (type && typeof type === 'string') {
    sql += ' AND type = ?'
    params.push(type.trim())
  }
  if (bbox && Array.isArray(bbox) && bbox.length >= 4) {
    const [minLon, minLat, maxLon, maxLat] = bbox
    sql += ' AND lon >= ? AND lon <= ? AND lat >= ? AND lat <= ?'
    params.push(minLon, maxLon, minLat, maxLat)
  }
  if (sources && Array.isArray(sources) && sources.length > 0) {
    sql += ` AND source IN (${sources.map(() => '?').join(',')})`
    params.push(...sources)
  }
  sql += ' ORDER BY timestamp DESC LIMIT ?'
  params.push(limit)
  let rows = db.prepare(sql).all(...params)
  if (country && typeof country === 'string') {
    const c = country.trim().toUpperCase()
    rows = rows.filter((r) => {
      const raw = parseRawData(r.raw_data)
      const rawCountry = (raw.countryCode || raw.country || '').toString().toUpperCase()
      return rawCountry === c || rawCountry === country.trim()
    })
  }
  if (highConfidenceOnly) {
    rows = rows.filter((r) => parseRawData(r.raw_data).confidence === 'high')
  }
  return rows
}

function getSignalEvents(limit = 100) {
  const rows = db.prepare(`
    SELECT id, type, title, description, lat, lon, timestamp, source, raw_data
    FROM events WHERE type = 'signal'
    ORDER BY timestamp DESC LIMIT ?
  `).all(limit)
  return rows.map((r) => {
    const tags = getEventTagNames(r.id)
    const entityIds = getEventEntityIds(r.id)
    const entities = entityIds.map((id) => {
      const row = db.prepare('SELECT name FROM entities WHERE id = ?').get(id)
      return row ? row.name : ''
    }).filter(Boolean)
    return {
      id: r.id,
      title: r.title,
      type: r.type,
      description: r.description,
      lat: r.lat,
      lon: r.lon,
      timestamp: r.timestamp,
      source: r.source,
      raw_data: r.raw_data,
      tagsStr: tags.join(' '),
      entitiesStr: entities.join(' '),
    }
  })
}

function getEventsForSearch(options = {}) {
  const { tag, startTime, endTime, type, bbox, limit = 80, country = null, highConfidenceOnly = false } = options
  let rows
  if (tag && tag.trim()) {
    rows = getEventsWithTag(tag.trim(), limit)
    if (type || bbox) {
      rows = rows.filter((r) => {
        if (type && r.type !== type.trim()) return false
        if (bbox && bbox.length >= 4 && (r.lon == null || r.lat == null)) return false
        if (bbox && bbox.length >= 4) {
          const [minLon, minLat, maxLon, maxLat] = bbox
          if (r.lon < minLon || r.lon > maxLon || r.lat < minLat || r.lat > maxLat) return false
        }
        return true
      })
    }
    if (country && typeof country === 'string') {
      const c = country.trim().toUpperCase()
      rows = rows.filter((r) => {
        const raw = parseRawData(r.raw_data)
        const rawCountry = (raw.countryCode || raw.country || '').toString().toUpperCase()
        return rawCountry === c || rawCountry === country.trim()
      })
    }
    if (highConfidenceOnly) {
      rows = rows.filter((r) => parseRawData(r.raw_data).confidence === 'high')
    }
  } else {
    rows = getEvents(limit, startTime, endTime, type, bbox, null, country, highConfidenceOnly)
  }
  return rows.map((r) => {
    const tags = getEventTagNames(r.id)
    const entityIds = getEventEntityIds(r.id)
    const entities = entityIds.map((id) => {
      const row = db.prepare('SELECT name FROM entities WHERE id = ?').get(id)
      return row ? row.name : ''
    }).filter(Boolean)
    return {
      id: r.id,
      title: r.title,
      type: r.type,
      description: r.description,
      lat: r.lat,
      lon: r.lon,
      timestamp: r.timestamp,
      source: r.source,
      tagsStr: tags.join(' '),
      entitiesStr: entities.join(' '),
    }
  })
}

function getDb() {
  return db
}

module.exports = {
  getDb,
  insertOrIgnore,
  ensureTag,
  ensureEntity,
  linkEventTag,
  linkEventEntity,
  getEventTagNames,
  getEventEntityIds,
  getEventsWithTag,
  getEvents,
  getSignalEvents,
  getEventsForSearch,
}
