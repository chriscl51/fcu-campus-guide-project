// SQLite database setup using Node's BUILT-IN `node:sqlite` module (stable
// since Node 22.5, no native compilation, no external dependency) — this is
// the ONLY part of the project that requires a running Node.js process;
// everything else (map/routing/buildings/facility data) still works as a
// pure static site with zero backend, per the project's original design
// (see README). This backend exists specifically to satisfy the school
// assignment's Node.js + SQLite requirement, and to back the one feature
// that genuinely benefits from persistent, centrally-editable data: campus
// activity/event announcements (見 README 「活動公告後端」章節).
//
// NOTE: this used to run on `better-sqlite3`, which needs to compile a
// native addon on `npm install` (node-gyp downloading platform-specific
// headers). That's a real portability trap for a project people will clone
// onto their own machines — it can silently fail on a machine without Xcode
// Command Line Tools / a matching Python / working network access to
// nodejs.org, and the server then just never starts, with no obvious error
// surfaced to the person running `npm run dev:all`. Switched to `node:sqlite`
// specifically to remove that failure mode: it ships inside Node itself, so
// `npm install` in server/ no longer needs to build anything.
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, 'campus.db')

export const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    name_zh TEXT NOT NULL,
    name_en TEXT,
    official_code TEXT,
    room_code TEXT,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    tier TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL,            -- exam / lecture / symposium / other
    location_text TEXT,            -- free-text extra detail (room number, etc.), independent of building links
    start_date TEXT NOT NULL,      -- ISO date 'YYYY-MM-DD'
    end_date TEXT NOT NULL,        -- ISO date 'YYYY-MM-DD', >= start_date
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One event can span MULTIPLE buildings (e.g. 學測 held across 3 exam
  -- buildings at once) — feedback item: clicking such an event should offer
  -- a dropdown scoped to just its buildings. Many-to-many join table rather
  -- than a single building_id column on events.
  CREATE TABLE IF NOT EXISTS event_locations (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    building_id TEXT NOT NULL REFERENCES buildings(id),
    PRIMARY KEY (event_id, building_id)
  );

  CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_date, end_date);
  CREATE INDEX IF NOT EXISTS idx_buildings_name ON buildings(name_zh, name_en);
  CREATE INDEX IF NOT EXISTS idx_event_locations_event ON event_locations(event_id);
`)

// node:sqlite has no built-in `db.transaction(fn)` helper (unlike
// better-sqlite3) — this is the manual equivalent, used anywhere multiple
// writes need to be atomic (see index.js's replaceEventLocations, seed.js's
// insertAll).
export function runInTransaction(fn) {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export default db
