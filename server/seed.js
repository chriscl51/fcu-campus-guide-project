// One-time (idempotent) seed: imports the existing src/data/buildings.json
// (produced by scripts/run_all.sh from the real OSM survey data — see main
// README) into the SQLite buildings table, so the backend's SQL LIKE search
// endpoint has real data to query. This does NOT replace buildings.json as
// the source of truth for the map/routing (the frontend map still reads the
// JSON directly, unaffected by whether the server is running) — it's a
// read-only mirror for the search API. Re-run any time after buildings.json
// changes (`node server/seed.js`); it upserts by id so it's safe to re-run.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, runInTransaction } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// project/server/ and project/client/ are sibling folders (see /project
// restructuring note in the top-level README) — reach across to the
// client's data/ directory rather than duplicating these JSON files.
const buildingsPath = path.join(__dirname, '..', 'client', 'src', 'data', 'buildings.json')
const gatesPath = path.join(__dirname, '..', 'client', 'src', 'data', 'gates.json')

const buildings = JSON.parse(fs.readFileSync(buildingsPath, 'utf-8'))
const gates = JSON.parse(fs.readFileSync(gatesPath, 'utf-8'))

const upsert = db.prepare(`
  INSERT INTO buildings (id, name_zh, name_en, official_code, room_code, lat, lon, tier)
  VALUES (@id, @name_zh, @name_en, @official_code, @room_code, @lat, @lon, @tier)
  ON CONFLICT(id) DO UPDATE SET
    name_zh = excluded.name_zh,
    name_en = excluded.name_en,
    official_code = excluded.official_code,
    room_code = excluded.room_code,
    lat = excluded.lat,
    lon = excluded.lon,
    tier = excluded.tier
`)

function insertAll(rows) {
  runInTransaction(() => {
    for (const b of rows) {
      upsert.run({
        id: b.id,
        name_zh: b.nameZh,
        name_en: b.nameEn || null,
        official_code: b.officialCode || null,
        room_code: b.roomCode || null,
        lat: b.lat,
        lon: b.lon,
        tier: b.tier || null,
      })
    }
    for (const g of gates) {
      upsert.run({
        id: g.id,
        name_zh: g.nameZh,
        name_en: g.nameEn || null,
        official_code: null,
        room_code: null,
        lat: g.lat,
        lon: g.lon,
        tier: 'gate',
      })
    }
  })
}

insertAll(buildings)
console.log(`Seeded ${buildings.length} buildings + ${gates.length} gates into server/campus.db`)

// ---- test announcement data (per 考場.png the user provided) -------------
// This is the actual fix for "landing page 沒有公告" (announcement never
// appears): the events table used to be empty because nothing ever inserted
// a row into it — the admin API existed, but nobody had called it yet. This
// seeds 3 real exam announcements straight from the exam-schedule photo (考試
// 名稱 / 主要使用大樓), with the room-number detail left out as requested
// ("只要有考試日期時間...與大樓名稱，不要教室細節"). Exam date/time were not
// given in the photo, so they're filled in here (marked "測試公告，時間為示意"
// in the description) — dates are computed relative to whenever `npm run
// seed` is actually run, so the announcement is guaranteed to be showing
// (landing page surfaces events from the day before start_date through
// end_date) right after seeding, instead of only around one fixed calendar
// date. Idempotent by title, like the buildings/gates upsert above — safe to
// re-run.
function ymd(offsetDays) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const TEST_EVENTS = [
  {
    title: '碩士班考試入學（校內升學）',
    type: 'exam',
    dateOffset: 0,
    description: '考試時間：上午 9:00–12:00（測試公告，時間為示意）',
    buildingNames: ['工學館', '學思樓', '科學與航太館'],
  },
  {
    title: 'J.TEST（實用日本語檢定）',
    type: 'exam',
    dateOffset: -1,
    description: '考試時間：下午 13:30–15:30（測試公告，時間為示意）',
    buildingNames: ['行政大樓'],
  },
  {
    title: 'JLPT（日本語能力試驗）',
    type: 'exam',
    dateOffset: 1,
    description: '考試時間：上午 9:30–11:30（測試公告，時間為示意）',
    buildingNames: ['商學大樓'],
  },
]

const insertEvent = db.prepare(`
  INSERT INTO events (title, type, location_text, start_date, end_date, description)
  VALUES (@title, @type, NULL, @date, @date, @description)
`)
const insertEventLocation = db.prepare(
  'INSERT INTO event_locations (event_id, building_id) VALUES (?, ?)'
)
const findEventByTitle = db.prepare('SELECT id FROM events WHERE title = ?')
const nameToId = new Map(buildings.map((b) => [b.nameZh, b.id]))

let insertedEvents = 0
runInTransaction(() => {
  for (const ev of TEST_EVENTS) {
    if (findEventByTitle.get(ev.title)) continue // already seeded, skip
    const date = ymd(ev.dateOffset)
    const info = insertEvent.run({
      title: ev.title,
      type: ev.type,
      date,
      description: ev.description,
    })
    const eventId = info.lastInsertRowid
    for (const name of ev.buildingNames) {
      const buildingId = nameToId.get(name)
      if (buildingId) insertEventLocation.run(eventId, buildingId)
    }
    insertedEvents++
  }
})
console.log(
  insertedEvents
    ? `Seeded ${insertedEvents} test exam announcement(s) into server/campus.db`
    : 'Test exam announcements already present — skipped'
)
