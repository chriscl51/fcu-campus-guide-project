// Whether a 'YYYY-MM-DD' start/end date window (as entered via an admin
// <input type="date"> — no timezone attached) currently covers "today" in
// Asia/Taipei (GMT+8), the site's one true timezone (see dateFormat.js).
//
// Publish/unpublish rule (matches events' existing "day before start, through
// end" board window — see server/index.js's /api/events/upcoming, and the
// user's explicit spec for extending the same rule to announcements): an
// item goes live 24 hours before its startDate, and comes down 24 hours
// after its endDate, so a change scheduled a week in advance previews a day
// early and a change ending today stays visible through the next day rather
// than vanishing at the stroke of midnight. Setting startDate to today (i.e.
// not scheduling ahead) means the 24-hour lead window has already passed, so
// it publishes immediately. A missing bound is open-ended on that side; an
// announcement with neither bound is always active.
export function todayTaipei() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export function isWithinWindow(startDate, endDate, today = todayTaipei()) {
  if (startDate && today < addDays(startDate, -1)) return false
  if (endDate && today > addDays(endDate, 1)) return false
  return true
}
