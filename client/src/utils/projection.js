// Local equirectangular projection: converts real campus lat/lon into flat
// SVG plane coordinates. Good enough accuracy for an area this small (~600m
// across) — no need for a heavier map projection library.
import bounds from '../data/bounds.json'

const PADDING_M = 40 // meters of margin around the surveyed area
const R = 6371000

function metersPerDegLat() {
  return (Math.PI / 180) * R
}
function metersPerDegLon(atLat) {
  return (Math.PI / 180) * R * Math.cos((atLat * Math.PI) / 180)
}

const midLat = (bounds.minLat + bounds.maxLat) / 2
const mLat = metersPerDegLat()
const mLon = metersPerDegLon(midLat)

// world extent in meters
const westM = bounds.minLon * mLon
const eastM = bounds.maxLon * mLon
const southM = bounds.minLat * mLat
const northM = bounds.maxLat * mLat

export const WORLD = {
  width: eastM - westM + PADDING_M * 2,
  height: northM - southM + PADDING_M * 2,
}

/** Project real lat/lon -> {x, y} in the SVG plane (y grows downward, north = up). */
export function project(lat, lon) {
  const x = lon * mLon - westM + PADDING_M
  const y = northM - lat * mLat + PADDING_M
  return { x, y }
}

/** Inverse of project(), used when the user clicks/taps the map. */
export function unproject(x, y) {
  const lon = (x - PADDING_M + westM) / mLon
  const lat = (northM - (y - PADDING_M)) / mLat
  return { lat, lon }
}

/** Real-world distance in meters between two lat/lon points (haversine). */
export function haversine(a, b) {
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
