// Parking-lot lookup: real parking-area POIs surveyed in the campus OSM data.
import pois from '../data/pois.json'
import { haversine } from './projection'

const PARKING_KINDS = new Set(['parking', 'parking_space'])

// Feedback item: the raw OSM survey has 19 separate "parking" ways — mostly
// small unlabeled motorcycle bays and duplicate segments of the same lot —
// which cluttered the map with markers that don't correspond to a real,
// nameable car-parking destination. Trimmed down to the two lots that are
// actually usable as a "drive here, then walk" suggestion: 凱旋停車場 and the
// underground lot beside 體育館 (identified by proximity to the gym building
// in buildings.json — see README for how this was determined).
const ALLOWED_LOT_IDS = new Set(['w1473277897', '4075384390'])
const DISPLAY_NAMES = {
  w1473277897: '逢甲大學凱旋停車場',
  '4075384390': '體育館地下停車場',
}

export const parkingLots = pois
  .filter((p) => PARKING_KINDS.has(p.kind) && ALLOWED_LOT_IDS.has(String(p.id)))
  .map((p) => ({
    id: p.id,
    name: DISPLAY_NAMES[p.id] || p.name || '校內停車場',
    lat: p.lat,
    lon: p.lon,
  }))

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
