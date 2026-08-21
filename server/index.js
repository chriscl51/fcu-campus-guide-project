// Express API server (Node.js + SQLite backend). This is a genuinely
// separate process from the Vite frontend — start it with `npm run server`
// (or `npm run dev:all` to run both together). See README's 「活動公告後端」
// section for how this fits into the project and what it does/doesn't
// change about deployment.
import express from 'express'
import cors from 'cors'
import { db, runInTransaction } from './db.js'

const PORT = process.env.PORT || 3001

// Same "front-end lock, not real security" caveat as AdminView.vue's
// ADMIN_PASSWORD — this gates the write endpoints so a casual visitor can't
// hit them, but it is not a substitute for real auth. Change before any
// real deployment (see README).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'fcu2026'

const app = express()
app.use(cors())
app.use(express.json())

function requireAdmin(req, res, next) {
  if (req.header('x-admin-password') !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}

// ---- health check -----------------------------------------------------
app.get('/api/health', (req, res) => res.json({ ok: true }))

// ---- helpers: one event can span MULTIPLE buildings (e.g. 學測 held in 3
// exam buildings at once) — see event_locations join table in db.js -------
const locationsForEventStmt = db.prepare(`
  SELECT b.id AS buildingId, b.name_zh AS nameZh, b.name_en AS nameEn,
         b.official_code AS officialCode, b.lat AS lat, b.lon AS lon
  FROM event_locations el
  JOIN buildings b ON b.id = el.building_id
  WHERE el.event_id = ?
  ORDER BY b.name_zh
`)

function attachLocations(events) {
  return events.map((e) => ({ ...e, locations: locationsForEventStmt.all(e.id) }))
}

function replaceEventLocations(eventId, buildingIds) {
  runInTransaction(() => {
    db.prepare('DELETE FROM event_locations WHERE event_id = ?').run(eventId)
    const insert = db.prepare('INSERT INTO event_locations (event_id, building_id) VALUES (?, ?)')
    for (const buildingId of buildingIds) {
      insert.run(eventId, buildingId)
    }
  })
}

// ---- events (activity/announcement) ------------------------------------
// "Upcoming" = auto-surfaces starting the day before start_date, through
// end_date — matches the feature request: admin enters an event, it
// automatically appears on the landing page starting the day before.
app.get('/api/events/upcoming', (req, res) => {
  const rows = db.prepare(`
    SELECT e.* FROM events e
    WHERE date('now', 'localtime') >= date(e.start_date, '-1 day')
      AND date('now', 'localtime') <= date(e.end_date)
    ORDER BY e.start_date ASC
  `).all()
  res.json(attachLocations(rows))
})

// Distinct event locations for the sitewide "查詢活動地點" quick-pick dropdown
// (SelectForm.vue) — every upcoming event's buildings, deduped. Output shape
// unchanged from before the multi-location redesign, so SelectForm.vue needs
// no changes.
app.get('/api/events/locations', (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT b.id AS building_id, b.name_zh, b.name_en, b.official_code, b.lat, b.lon
    FROM events e
    JOIN event_locations el ON el.event_id = e.id
    JOIN buildings b ON b.id = el.building_id
    WHERE date('now', 'localtime') >= date(e.start_date, '-1 day')
      AND date('now', 'localtime') <= date(e.end_date)
    ORDER BY b.name_zh
  `).all()
  res.json(rows)
})

app.get('/api/events', (req, res) => {
  const rows = db.prepare('SELECT * FROM events ORDER BY start_date DESC').all()
  res.json(attachLocations(rows))
})

app.post('/api/events', requireAdmin, (req, res) => {
  const { title, type, locationText, startDate, endDate, description, buildingIds } = req.body || {}
  if (!title || !type || !startDate || !endDate) {
    return res.status(400).json({ error: 'title, type, startDate, endDate are required' })
  }
  if (endDate < startDate) {
    return res.status(400).json({ error: 'endDate must be on or after startDate' })
  }
  const info = db.prepare(`
    INSERT INTO events (title, type, location_text, start_date, end_date, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, type, locationText || null, startDate, endDate, description || null)

  const eventId = info.lastInsertRowid
  replaceEventLocations(eventId, Array.isArray(buildingIds) ? buildingIds : [])

  const created = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId)
  res.status(201).json(attachLocations([created])[0])
})

app.put('/api/events/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not found' })

  const { title, type, locationText, startDate, endDate, description, buildingIds } = req.body || {}
  const nextStart = startDate ?? existing.start_date
  const nextEnd = endDate ?? existing.end_date
  if (nextEnd < nextStart) {
    return res.status(400).json({ error: 'endDate must be on or after startDate' })
  }

  db.prepare(`
    UPDATE events SET title=?, type=?, location_text=?, start_date=?, end_date=?, description=?
    WHERE id=?
  `).run(
    title ?? existing.title,
    type ?? existing.type,
    locationText ?? existing.location_text,
    nextStart,
    nextEnd,
    description ?? existing.description,
    req.params.id
  )

  if (Array.isArray(buildingIds)) {
    replaceEventLocations(Number(req.params.id), buildingIds)
  }

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id)
  res.json(attachLocations([updated])[0])
})

app.delete('/api/events/:id', requireAdmin, (req, res) => {
  // event_locations rows are also cleaned up via ON DELETE CASCADE
  // (PRAGMA foreign_keys = ON in db.js); deleting explicitly too so this
  // stays correct even if a future db connection forgets that pragma.
  db.prepare('DELETE FROM event_locations WHERE event_id = ?').run(req.params.id)
  const info = db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id)
  if (info.changes === 0) return res.status(404).json({ error: 'not found' })
  res.status(204).end()
})

// ---- buildings search (SQL LIKE demo — feedback item "地標搜尋") ---------
app.get('/api/buildings/search', (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.json([])
  const like = `%${q}%`
  const rows = db
    .prepare(
      `SELECT * FROM buildings
       WHERE name_zh LIKE ? OR name_en LIKE ? OR official_code LIKE ? OR room_code LIKE ?
       ORDER BY name_zh LIMIT 20`
    )
    .all(like, like, like, like)
  res.json(rows)
})

app.listen(PORT, () => {
  console.log(`FCU campus guide API listening on http://localhost:${PORT}`)
  console.log(`SQLite database file: server/campus.db`)
})
