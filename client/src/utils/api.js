// Thin wrapper around the optional Node.js + SQLite backend (server/). This
// backend is NOT required for the site to work — the map, routing, and
// facility pages are still a pure static site with zero backend, per the
// project's original design (see README). Only the "campus activity
// announcements" feature (landing-page event banner + event-location
// dropdown + admin event management) talks to this API, and every call here
// fails soft: if the server isn't running (e.g. someone just did
// `npm run build` + hosted the static dist/ with no Node process behind it),
// these functions resolve to an empty/null result instead of throwing, so
// the rest of the app keeps working normally with that one feature simply
// not showing anything.
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

async function safeFetch(path, options) {
  try {
    const res = await fetch(`${API_BASE}${path}`, options)
    if (!res.ok) return null
    if (res.status === 204) return true
    return await res.json()
  } catch {
    // Server unreachable — expected when running as a pure static site.
    return null
  }
}

export function fetchUpcomingEvents() {
  return safeFetch('/api/events/upcoming')
}

export function fetchEventLocations() {
  return safeFetch('/api/events/locations')
}

export function fetchAllEvents() {
  return safeFetch('/api/events')
}

export function searchBuildings(query) {
  return safeFetch(`/api/buildings/search?q=${encodeURIComponent(query)}`)
}

export function createEvent(event, adminPassword) {
  return safeFetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
    body: JSON.stringify(event),
  })
}

export function updateEvent(id, event, adminPassword) {
  return safeFetch(`/api/events/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
    body: JSON.stringify(event),
  })
}

export function deleteEvent(id, adminPassword) {
  return safeFetch(`/api/events/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-password': adminPassword },
  })
}
