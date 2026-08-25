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
const API_BASE = import.meta?.env?.VITE_API_BASE || 'http://localhost:3001'

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

// Auth calls need to distinguish "wrong password" (server reachable, 401)
// from "server unreachable" (network error) so the login screen can show the
// right message — safeFetch collapses both to null, so auth uses its own
// wrapper that keeps the status code.
async function authFetch(path, options) {
  try {
    const res = await fetch(`${API_BASE}${path}`, options)
    let data = null
    try {
      data = await res.json()
    } catch {
      // no JSON body (e.g. 204) — fine
    }
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: null } // status 0 = network/server unreachable
  }
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` }
}

export function login(username, password) {
  return authFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

export function logout(token) {
  return authFetch('/api/auth/logout', { method: 'POST', headers: authHeaders(token) })
}

export function fetchMe(token) {
  return authFetch('/api/auth/me', { headers: authHeaders(token) })
}

export function changePassword(token, currentPassword, newPassword) {
  return authFetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export function fetchAdmins(token) {
  return authFetch('/api/auth/admins', { headers: authHeaders(token) })
}

export function createAdmin(token, username, password) {
  return authFetch('/api/auth/admins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ username, password }),
  })
}

export function deleteAdmin(token, id) {
  return authFetch(`/api/auth/admins/${id}`, { method: 'DELETE', headers: authHeaders(token) })
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

export function createEvent(event, token) {
  return safeFetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(event),
  })
}

export function updateEvent(id, event, token) {
  return safeFetch(`/api/events/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(event),
  })
}

export function deleteEvent(id, token) {
  return safeFetch(`/api/events/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
}
