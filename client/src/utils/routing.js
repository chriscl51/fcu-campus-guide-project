// Dijkstra shortest-path routing over the real campus walking-path graph
// (src/data/graph.json, built from the user's JOSM survey — see scripts/).
import graph from '../data/graph.json'
import { haversine, project } from './projection'

const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
const adjacency = new Map()
for (const n of graph.nodes) adjacency.set(n.id, [])
for (const e of graph.edges) {
  adjacency.get(e.a)?.push({ to: e.b, d: e.d })
  adjacency.get(e.b)?.push({ to: e.a, d: e.d })
}

/** Find the graph node nearest a given lat/lon (used to snap a building's
 * entrance coordinate onto the routable network). */
export function nearestNode(lat, lon) {
  let best = null
  let bestD = Infinity
  for (const n of graph.nodes) {
    const d = haversine({ lat, lon }, n)
    if (d < bestD) {
      bestD = d
      best = n.id
    }
  }
  return best
}

/** Classic array-based Dijkstra — the graph has ~1k nodes so an O(V^2) scan
 * is plenty fast and keeps the implementation simple/obviously-correct. */
export function shortestPath(startNodeId, endNodeId) {
  if (!nodeById.has(startNodeId) || !nodeById.has(endNodeId)) return null
  const dist = new Map()
  const prev = new Map()
  const visited = new Set()
  for (const id of nodeById.keys()) dist.set(id, Infinity)
  dist.set(startNodeId, 0)

  while (visited.size < nodeById.size) {
    let u = null
    let best = Infinity
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d
        u = id
      }
    }
    if (u === null) break // remaining nodes are unreachable
    if (u === endNodeId) break
    visited.add(u)
    for (const { to, d } of adjacency.get(u) || []) {
      if (visited.has(to)) continue
      const alt = dist.get(u) + d
      if (alt < dist.get(to)) {
        dist.set(to, alt)
        prev.set(to, u)
      }
    }
  }

  if (dist.get(endNodeId) === Infinity) return null

  const pathIds = [endNodeId]
  let cur = endNodeId
  while (cur !== startNodeId) {
    cur = prev.get(cur)
    if (cur === undefined) return null
    pathIds.push(cur)
  }
  pathIds.reverse()

  const points = pathIds.map((id) => {
    const n = nodeById.get(id)
    return { id, lat: n.lat, lon: n.lon }
  })

  return {
    nodeIds: pathIds,
    points,
    distanceMeters: dist.get(endNodeId),
  }
}

/** Average adult walking speed used for the ETA shown to the user. */
const WALK_SPEED_MPS = 1.2

export function estimateWalkMinutes(distanceMeters) {
  return Math.max(1, Math.round(distanceMeters / WALK_SPEED_MPS / 60))
}

function bearing(a, b) {
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180) / Math.PI // -180..180, 0 = north
}

/**
 * Douglas-Peucker simplification for lat/lon paths. The real surveyed
 * footpaths are made of many closely-spaced nodes (crossings, curb points),
 * which is great for the deer's smooth walking animation but produces
 * dozens of spurious sub-degree "turns" if fed directly into buildDirections.
 * Simplifying to a coarser polyline first gives turn-by-turn text that
 * matches how a person would actually describe the walk.
 */
function perpendicularDistanceMeters(point, lineStart, lineEnd) {
  // Local flat-earth approximation (fine at this scale) via projection.js's project()
  const a = project(lineStart.lat, lineStart.lon)
  const b = project(lineEnd.lat, lineEnd.lon)
  const p = project(point.lat, point.lon)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  const clampedT = Math.max(0, Math.min(1, t))
  const projX = a.x + clampedT * dx
  const projY = a.y + clampedT * dy
  return Math.hypot(p.x - projX, p.y - projY)
}

export function simplifyPath(points, toleranceMeters = 8) {
  if (points.length <= 2) return points
  let maxDist = 0
  let index = 0
  const end = points.length - 1
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistanceMeters(points[i], points[0], points[end])
    if (d > maxDist) {
      maxDist = d
      index = i
    }
  }
  if (maxDist > toleranceMeters) {
    const left = simplifyPath(points.slice(0, index + 1), toleranceMeters)
    const right = simplifyPath(points.slice(index), toleranceMeters)
    return left.slice(0, -1).concat(right)
  }
  return [points[0], points[end]]
}

/**
 * Collapse a raw point-by-point path into human-readable turn-by-turn steps:
 * [{ type: 'straight'|'left'|'right'|'arrive', distanceMeters }]
 * The path is simplified first (see simplifyPath) so narration reflects the
 * walk's real shape rather than every small wiggle in the surveyed geometry;
 * a turn is emitted only when the bearing changes by more than TURN_THRESHOLD
 * degrees between simplified segments.
 *
 * initialBearing (optional): the direction a walker is already facing at
 * points[0], e.g. a gate's `facingBearing` (see data/gates.json) — the
 * bearing of its own most direct/straight-through path, empirically measured
 * from survey data and confirmed against real walking directions. Without
 * it, the very first segment out of the start point can never register as a
 * turn (there's nothing to compare it against), so routes leaving a gate
 * whose real onward path immediately bends silently dropped that first turn.
 */
const TURN_THRESHOLD = 30
const TURN_CLUSTER_DISTANCE_METERS = 70

export function buildDirections(rawPoints, initialBearing = null) {
  let points = simplifyPath(rawPoints, 8)
  // Always keep the final raw approach point distinct from whatever precedes
  // it, so a short last-moment turn off a through-path into a destination's
  // actual door (e.g. a building set just a few metres off the main path) is
  // still described — Douglas-Peucker alone would fold anything under the 8m
  // tolerance into the preceding straight line and silently drop that turn.
  if (rawPoints.length >= 3) {
    const lastRaw = rawPoints[rawPoints.length - 1]
    const secondLastRaw = rawPoints[rawPoints.length - 2]
    if (points[points.length - 1] === lastRaw && points[points.length - 2] !== secondLastRaw) {
      points = [...points.slice(0, -1), secondLastRaw, lastRaw]
    }
  }
  if (points.length < 2) return [{ type: 'arrive', distanceMeters: 0 }]

  const steps = []
  let segStart = 0
  let lastTurnIndex = -1
  let lastTurnSign = 0
  let prevBearing = initialBearing ?? bearing(points[0], points[1])
  const startI = initialBearing === null ? 1 : 0

  const pushStep = (type, endIdx) => {
    let d = 0
    for (let i = segStart; i < endIdx; i++) d += haversine(points[i], points[i + 1])
    if (d >= 1) steps.push({ type, distanceMeters: Math.round(d) })
  }

  for (let i = startI; i < points.length - 1; i++) {
    const b = bearing(points[i], points[i + 1])
    let delta = b - prevBearing
    delta = ((delta + 540) % 360) - 180 // normalize to [-180,180]
    if (Math.abs(delta) > TURN_THRESHOLD) {
      const sign = delta > 0 ? 1 : -1
      let distanceSinceTurn = 0
      if (lastTurnIndex >= 0) {
        for (let j = lastTurnIndex; j < i; j++) {
          distanceSinceTurn += haversine(points[j], points[j + 1])
        }
      }
      // Only merge this turn into the previous one when they curve the SAME
      // way (continuing to round one corner/bend, which a walker perceives
      // as a single turn) and are close together. A nearby turn the OPPOSITE
      // way is a real jog/kink — e.g. left then shortly after right — that a
      // walker must navigate as two distinct turns, so it's always kept.
      if (lastTurnIndex >= 0 && distanceSinceTurn <= TURN_CLUSTER_DISTANCE_METERS && sign === lastTurnSign) {
        prevBearing = b
        continue
      }
      pushStep('straight', i)
      segStart = i
      lastTurnIndex = i
      lastTurnSign = sign
      steps.push({ type: sign > 0 ? 'right' : 'left', distanceMeters: 0 })
    }
    prevBearing = b
  }
  pushStep('straight', points.length - 1)
  steps.push({ type: 'arrive', distanceMeters: 0 })
  return steps
}
