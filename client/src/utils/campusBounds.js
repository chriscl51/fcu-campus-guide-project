import campusBoundary from '../data/campusBoundary.json'

// 6-point Polygon coordinates [[lat, lon], ...]
export const CAMPUS_POLYGON = campusBoundary.map((pt) => [pt.lat, pt.lon])

// Calculate Bounding Box with slight buffer for optimal panning bounds
const lats = campusBoundary.map((p) => p.lat)
const lons = campusBoundary.map((p) => p.lon)

export const CAMPUS_BOUNDS = {
  minLat: Math.min(...lats),
  maxLat: Math.max(...lats),
  minLon: Math.min(...lons),
  maxLon: Math.max(...lons),
}

// Generous viewing max bounds for Leaflet so users don't pan too far away
export const LEAFLET_MAX_BOUNDS = [
  [CAMPUS_BOUNDS.minLat - 0.003, CAMPUS_BOUNDS.minLon - 0.004], // South-West limit
  [CAMPUS_BOUNDS.maxLat + 0.003, CAMPUS_BOUNDS.maxLon + 0.004], // North-East limit
]

// Center coordinate of FCU campus
export const CAMPUS_CENTER = [
  (CAMPUS_BOUNDS.minLat + CAMPUS_BOUNDS.maxLat) / 2,
  (CAMPUS_BOUNDS.minLon + CAMPUS_BOUNDS.maxLon) / 2,
] // ~ [24.1800, 120.6490]

/**
 * Check if a coordinate is inside the FCU campus polygon (Ray-casting algorithm)
 */
export function isInsideCampus(lat, lon) {
  let inside = false
  for (let i = 0, j = CAMPUS_POLYGON.length - 1; i < CAMPUS_POLYGON.length; j = i++) {
    const xi = CAMPUS_POLYGON[i][0]
    const yi = CAMPUS_POLYGON[i][1]
    const xj = CAMPUS_POLYGON[j][0]
    const yj = CAMPUS_POLYGON[j][1]

    const intersect = yi > lon !== yj > lon && lat < ((xj - xi) * (lon - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}
