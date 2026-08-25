// Parking-lot lookup: the two curated campus parking lots.
// Kept as a hardcoded list — auto-suggest the nearest lot to the user's
// destination, then routing handles the actual directions.

const R = 6371000 // Earth radius in metres
function haversine(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

// Precise GPS coordinates from Google Maps survey
export const parkingLots = [
  {
    id: 'parking-kaixuan',
    nameZh: '逢甲大學凱旋停車場',
    nameEn: 'FCU Kaixuan Parking Lot',
    lat: 24.181978095015463,
    lon: 120.65077827545396,
  },
  {
    id: 'parking-gym',
    nameZh: '體育館地下停車場',
    nameEn: 'Gymnasium Underground Parking Lot',
    lat: 24.181894902343977,
    lon: 120.64820603701205,
  },
]

/** Nearest parking lot (straight-line) to a given building — used to suggest
 * where to park before walking to `destination`. */
export function nearestParkingTo(lat, lon) {
  let best = null
  let bestD = Infinity
  for (const lot of parkingLots) {
    const d = haversine({ lat, lon }, lot)
    if (d < bestD) {
      bestD = d
      best = lot
    }
  }
  return best ? { ...best, distanceMeters: Math.round(bestD) } : null
}
