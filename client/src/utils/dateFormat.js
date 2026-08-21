// Campus events/facility announcements are all Taiwan-local. Two kinds of
// timestamps flow through this app:
//  - naive "wall clock" values (event start/end dates, from <input type=
//    date|datetime-local> — no timezone attached, meant as Taipei time as
//    typed) — formatted by reading back the exact same Y/M/D/H/M the admin
//    entered, never re-interpreted through the viewer's own browser
//    timezone (which would otherwise shift the date for a visitor whose
//    device isn't set to GMT+8).
//  - real UTC instants (announcement created_at, from SQLite's
//    datetime('now')) — genuinely converted to Asia/Taipei (GMT+8) for
//    display, since that's the one timezone this site presents in.
// Either way, non-Chinese locales spell the month out (English also gets an
// ordinal day, e.g. "August 22nd") instead of numeric M/D, which is a
// Taiwan-only date convention that reads as ambiguous/unreadable to a
// visitor from elsewhere.
const TAIPEI_TZ = 'Asia/Taipei'

function ordinalSuffix(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

function formatParts(d, locale, timeZone, { withTime = false, withYear = false } = {}) {
  const opts = {
    ...(withYear ? { year: 'numeric' } : {}),
    month: 'long',
    day: 'numeric',
    timeZone,
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }
  const parts = new Intl.DateTimeFormat(locale, opts).formatToParts(d)
  return parts
    .map((p) => (p.type === 'day' && locale === 'en' ? `${p.value}${ordinalSuffix(Number(p.value))}` : p.value))
    .join('')
}

/** Format a naive 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' wall-clock string
 * (event/announcement start-end dates) — shown exactly as entered, spelled
 * out per locale, never shifted by the viewer's own timezone. */
export function formatWallClock(value, locale, { withYear = false } = {}) {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value)
  if (!m) return value
  const [, y, mo, da, h, mi] = m
  const hasClock = h !== undefined
  const d = new Date(Date.UTC(+y, +mo - 1, +da, hasClock ? +h : 0, hasClock ? +mi : 0))
  return formatParts(d, locale, 'UTC', { withTime: hasClock, withYear })
}

/** Format a real UTC instant ISO string (e.g. announcement created_at) by
 * converting it to Asia/Taipei (GMT+8) — the site's one true timezone. */
export function formatTaipeiInstant(isoUtc, locale, { withYear = false } = {}) {
  const d = new Date(isoUtc)
  if (Number.isNaN(d.getTime())) return ''
  return formatParts(d, locale, TAIPEI_TZ, { withTime: true, withYear })
}
