// Express API server (Node.js + SQLite backend). This is a genuinely
// separate process from the Vite frontend — start it with `npm run server`
// (or `npm run dev:all` to run both together). See README's 「活動公告後端」
// section for how this fits into the project and what it does/doesn't
// change about deployment.
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { db, runInTransaction } from './db.js'
import { hashPassword, verifyPassword, makeToken, sessionExpiryFromNow, DUMMY_HASH } from './auth.js'

// Loads server/.env into process.env (see .env.example) — .env is gitignored
// so real secrets never end up in source control; try/catch because a
// hosting environment that injects env vars directly (no .env file present)
// is also valid.
try {
  process.loadEnvFile()
} catch {
  // no .env file — fine if env vars are set some other way
}

const PORT = process.env.PORT || 3001

const app = express()
app.disable('x-powered-by') // don't advertise the framework in every response header
app.use(cors())
app.use(express.json())

// Brute-force protection on the one endpoint that accepts a guessable secret
// (everything else requires an existing session token, which isn't
// guessable). 10 attempts per 15 minutes per IP is generous for a real
// admin who mistypes their password, but throttles automated guessing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many login attempts, please try again later' },
})

// ---- auth: real admin accounts, hashed passwords, session tokens --------
// Replaces the old single shared "ADMIN_PASSWORD" string that lived in
// front-end source. Each admin has their own username + password (hashed
// with node:crypto scrypt, see auth.js); logging in exchanges credentials
// for an opaque session token, sent back as "Authorization: Bearer <token>"
// on every write request instead of resending a password.
function requireSession(req, res, next) {
  const header = req.header('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'unauthorized' })

  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
  if (!session || session.expires_at < new Date().toISOString()) {
    if (session) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return res.status(401).json({ error: 'unauthorized' })
  }

  const admin = db.prepare('SELECT id, username FROM admins WHERE id = ?').get(session.admin_id)
  if (!admin) return res.status(401).json({ error: 'unauthorized' })

  req.admin = admin
  next()
}

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' })

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username)
  // Always run verifyPassword — against the real hash, or DUMMY_HASH when
  // there's no such admin — so a non-existent username takes exactly as
  // long to reject as a wrong password on a real one (see auth.js).
  const passwordOk = verifyPassword(password, admin ? admin.password_hash : DUMMY_HASH)
  if (!admin || !passwordOk) {
    return res.status(401).json({ error: 'invalid credentials' })
  }

  const token = makeToken()
  db.prepare('INSERT INTO sessions (token, admin_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    admin.id,
    sessionExpiryFromNow()
  )
  res.json({ token, username: admin.username })
})

app.post('/api/auth/logout', requireSession, (req, res) => {
  const header = req.header('authorization') || ''
  const token = header.slice(7)
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  res.status(204).end()
})

app.get('/api/auth/me', requireSession, (req, res) => {
  res.json(req.admin)
})

app.post('/api/auth/change-password', requireSession, (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' })
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'newPassword must be at least 8 characters' })
  }

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id)
  if (!verifyPassword(currentPassword, admin.password_hash)) {
    return res.status(401).json({ error: 'currentPassword is incorrect' })
  }

  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), admin.id)
  res.status(204).end()
})

// Any logged-in admin can see, add, and remove other admins — flat model, no
// separate "owner" role, since this is meant for small internal teams
// (系辦/社團) rather than a multi-tenant system.
app.get('/api/auth/admins', requireSession, (req, res) => {
  const rows = db.prepare('SELECT id, username, created_at AS createdAt FROM admins ORDER BY created_at').all()
  res.json(rows)
})

app.post('/api/auth/admins', requireSession, (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' })
  if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' })

  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username)
  if (existing) return res.status(409).json({ error: 'username already taken' })

  const info = db
    .prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)')
    .run(username, hashPassword(password))
  res.status(201).json({ id: info.lastInsertRowid, username })
})

app.delete('/api/auth/admins/:id', requireSession, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n
  if (count <= 1) return res.status(400).json({ error: 'cannot remove the last remaining admin' })

  const info = db.prepare('DELETE FROM admins WHERE id = ?').run(req.params.id)
  if (info.changes === 0) return res.status(404).json({ error: 'not found' })
  res.status(204).end()
})

// ---- health check -----------------------------------------------------
app.get('/api/health', (req, res) => res.json({ ok: true }))

// ---- shared input validation ------------------------------------------
// Checked explicitly (rather than left to the database) so a bad request
// comes back as a clean 400 instead of an unhandled FOREIGN KEY/constraint
// exception — an uncaught throw here would otherwise hit Express's default
// error handler, which (see the catch-all below) is exactly what that
// handler exists to also guard against, but it's cheaper and clearer to
// reject bad input up front.
const ANNOUNCEMENT_TYPES = new Set(['renovation', 'restroom', 'elevator', 'water', 'power', 'other'])
const EVENT_TYPES = new Set(['exam', 'lecture', 'symposium', 'other'])
const buildingExistsStmt = db.prepare('SELECT 1 FROM buildings WHERE id = ?')
function buildingExists(id) {
  return !!buildingExistsStmt.get(id)
}

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
// Uses '+8 hours' (not SQLite's 'localtime') so "today" is always Taipei's
// calendar day (GMT+8), regardless of what timezone the server host is
// actually running in.
app.get('/api/events/upcoming', (req, res) => {
  const rows = db.prepare(`
    SELECT e.* FROM events e
    WHERE date('now', '+8 hours') >= date(e.start_date, '-1 day')
      AND date('now', '+8 hours') <= date(e.end_date)
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
    WHERE date('now', '+8 hours') >= date(e.start_date, '-1 day')
      AND date('now', '+8 hours') <= date(e.end_date)
    ORDER BY b.name_zh
  `).all()
  res.json(rows)
})

app.get('/api/events', (req, res) => {
  const rows = db.prepare('SELECT * FROM events ORDER BY start_date DESC').all()
  res.json(attachLocations(rows))
})

app.post('/api/events', requireSession, (req, res) => {
  const { title, type, locationText, startDate, endDate, description, buildingIds } = req.body || {}
  if (!title || !type || !startDate || !endDate) {
    return res.status(400).json({ error: 'title, type, startDate, endDate are required' })
  }
  if (!EVENT_TYPES.has(type)) return res.status(400).json({ error: 'invalid type' })
  if (endDate < startDate) {
    return res.status(400).json({ error: 'endDate must be on or after startDate' })
  }
  if (Array.isArray(buildingIds) && !buildingIds.every(buildingExists)) {
    return res.status(400).json({ error: 'buildingIds contains an unknown building' })
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

app.put('/api/events/:id', requireSession, (req, res) => {
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not found' })

  const { title, type, locationText, startDate, endDate, description, buildingIds } = req.body || {}
  if (type !== undefined && !EVENT_TYPES.has(type)) {
    return res.status(400).json({ error: 'invalid type' })
  }
  const nextStart = startDate ?? existing.start_date
  const nextEnd = endDate ?? existing.end_date
  if (nextEnd < nextStart) {
    return res.status(400).json({ error: 'endDate must be on or after startDate' })
  }
  if (Array.isArray(buildingIds) && !buildingIds.every(buildingExists)) {
    return res.status(400).json({ error: 'buildingIds contains an unknown building' })
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

app.delete('/api/events/:id', requireSession, (req, res) => {
  // event_locations rows are also cleaned up via ON DELETE CASCADE
  // (PRAGMA foreign_keys = ON in db.js); deleting explicitly too so this
  // stays correct even if a future db connection forgets that pragma.
  db.prepare('DELETE FROM event_locations WHERE event_id = ?').run(req.params.id)
  const info = db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id)
  if (info.changes === 0) return res.status(404).json({ error: 'not found' })
  res.status(204).end()
})

// ---- building change notices (整修/廁所故障/停水停電…) --------------------
// Shared across every admin, same as events — previously lived in browser
// localStorage on whichever device the admin used.
function toAnnouncement(row) {
  return {
    id: row.id,
    buildingId: row.building_id,
    type: row.type,
    area: row.area || '',
    message: row.message,
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    createdAt: row.created_at,
  }
}

app.get('/api/announcements', (req, res) => {
  const rows = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all()
  res.json(rows.map(toAnnouncement))
})

app.post('/api/announcements', requireSession, (req, res) => {
  const { buildingId, type, area, message, startDate, endDate } = req.body || {}
  if (!buildingId || !type || !message) {
    return res.status(400).json({ error: 'buildingId, type, and message are required' })
  }
  if (!ANNOUNCEMENT_TYPES.has(type)) return res.status(400).json({ error: 'invalid type' })
  if (!buildingExists(buildingId)) return res.status(400).json({ error: 'unknown buildingId' })
  const info = db
    .prepare(
      `INSERT INTO announcements (building_id, type, area, message, start_date, end_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(buildingId, type, area || null, message, startDate || null, endDate || null, req.admin.id)
  const created = db.prepare('SELECT * FROM announcements WHERE id = ?').get(info.lastInsertRowid)
  res.status(201).json(toAnnouncement(created))
})

app.put('/api/announcements/:id', requireSession, (req, res) => {
  const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not found' })

  const { buildingId, type, area, message, startDate, endDate } = req.body || {}
  if (type !== undefined && !ANNOUNCEMENT_TYPES.has(type)) {
    return res.status(400).json({ error: 'invalid type' })
  }
  if (buildingId !== undefined && !buildingExists(buildingId)) {
    return res.status(400).json({ error: 'unknown buildingId' })
  }
  db.prepare(
    `UPDATE announcements SET building_id=?, type=?, area=?, message=?, start_date=?, end_date=?
     WHERE id=?`
  ).run(
    buildingId ?? existing.building_id,
    type ?? existing.type,
    area ?? existing.area,
    message ?? existing.message,
    startDate ?? existing.start_date,
    endDate ?? existing.end_date,
    req.params.id
  )
  const updated = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id)
  res.json(toAnnouncement(updated))
})

app.delete('/api/announcements/:id', requireSession, (req, res) => {
  const info = db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id)
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

// ---- fallback error handler --------------------------------------------
// Express's own default error handler echoes the exception message AND a
// full stack trace (including absolute server file paths) straight into
// the HTTP response — reachable by anyone, no auth needed, just by sending
// e.g. malformed JSON to any endpoint. Catches anything that slips past the
// explicit input validation above (a defense-in-depth backstop, not the
// primary defense) and any genuinely unexpected error. Must be registered
// last, and must keep all four arguments for Express to recognize it as an
// error handler rather than a normal middleware.
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'internal server error' })
})

app.listen(PORT, () => {
  console.log(`FCU campus guide API listening on http://localhost:${PORT}`)
  console.log(`SQLite database file: server/campus.db`)
})
